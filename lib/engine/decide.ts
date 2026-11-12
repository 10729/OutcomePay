// Deterministic decision engine. No AI here: same contract + same evidence = same decision.
import type { ChecklistOutcomeT, ContractT, CurveStepT } from "../contract/schema";
import type { Decision, Evidence, GuardResult, ItemStatus, OutcomeResult } from "../types";

export const POLICY_VERSION = "policy/0.2";
const MIN_VISION_CONFIDENCE = 0.6;

export function payForValue(curve: CurveStepT[], value: number): number {
  for (const step of curve) if (step.maxValue === null || value <= step.maxValue) return step.pay;
  return 0;
}

function fresh(e: Evidence, maxAgeMinutes: number, now: number): boolean {
  return now - Date.parse(e.capturedAt) <= maxAgeMinutes * 60_000;
}

// One checklist item, judged from both sides.
// The buyer's photo is counterparty evidence: if it shows the item done, that is strong.
// The seller's photo alone is never enough. Disagreement is a conflict, never silently resolved.
function itemStatus(seller: Evidence | undefined, buyer: Evidence | undefined): { status: ItemStatus; detail: string } {
  const b = buyer && buyer.value !== null && buyer.confidence >= MIN_VISION_CONFIDENCE ? buyer.value : null;
  const s = seller && seller.value !== null && seller.confidence >= MIN_VISION_CONFIDENCE ? seller.value : null;
  if (b === 1) return { status: "verified", detail: `Buyer's photo confirms: ${buyer!.note}` };
  if (b === 0 && s === 1)
    return { status: "conflict", detail: `Seller's photo: ${seller!.note} Buyer's photo: ${buyer!.note}` };
  if (b === 0) return { status: "not_done", detail: `Buyer's photo: ${buyer!.note}` };
  if (s === 1) return { status: "unverified", detail: "Only the seller's photo shows it done; that alone can't release money." };
  if (s === 0) return { status: "not_done", detail: `Seller's own photo: ${seller!.note}` };
  return { status: "unverified", detail: buyer?.note ?? seller?.note ?? "Not visible in any photo." };
}

function checklistResult(o: ChecklistOutcomeT, byCheck: Map<string, Evidence>): OutcomeResult {
  const items = o.items.map((it) => {
    const r = itemStatus(byCheck.get(`${o.id}:${it.id}:seller`), byCheck.get(`${o.id}:${it.id}:buyer`));
    return { id: it.id, label: it.label, ...r };
  });
  const verified = items.filter((i) => i.status === "verified").length;
  return { id: o.id, label: o.label, value: verified, pay: verified / items.length, weight: o.weight, items };
}

export type DecideOptions = { excludeConflicts?: boolean; acceptUnverifiedAsNotDone?: boolean };

export function decide(contract: ContractT, evidence: Evidence[], baseline: Evidence[], opts: DecideOptions = {}): Decision {
  const now = Date.now();
  const reasons: string[] = [];
  const conflicts: string[] = [];
  const byCheck = new Map(evidence.map((e) => [e.checks, e]));
  const baseByCheck = new Map(baseline.map((e) => [e.checks, e]));
  let missing = false;

  const guards: GuardResult[] = contract.guards.map((g) => {
    const e = byCheck.get(g.id);
    if (!e || e.value === null || !fresh(e, contract.maxEvidenceAgeMinutes, now)) {
      missing = true;
      return { id: g.id, label: g.label, passed: null, detail: e?.note ?? "No evidence collected." };
    }
    if (g.verifier === "web.http") {
      const ok = e.value === (g.expectStatus ?? 200);
      return { id: g.id, label: g.label, passed: ok, detail: `Expected HTTP ${g.expectStatus ?? 200}, got ${e.value}.` };
    }
    const base = baseByCheck.get(g.id)?.value;
    if (typeof base !== "number" || base === 0) return { id: g.id, label: g.label, passed: true, detail: "No baseline; content guard skipped." };
    const drop = Math.max(0, (base - e.value) / base);
    const allowed = g.maxWordDrop ?? 0.1;
    return {
      id: g.id,
      label: g.label,
      passed: drop <= allowed,
      detail: `${e.value} words now vs ${base} before: ${Math.round(drop * 100)}% removed, ${Math.round(allowed * 100)}% allowed.`,
    };
  });

  const outcomes: OutcomeResult[] = contract.outcomes.map((o) => {
    if (o.verifier === "web.speed") {
      const e = byCheck.get(o.id);
      if (!e || e.value === null || !fresh(e, contract.maxEvidenceAgeMinutes, now)) {
        missing = true;
        return { id: o.id, label: o.label, value: null, pay: 0, weight: o.weight };
      }
      const pay = payForValue(o.curve, e.value);
      reasons.push(`${o.label}: measured ${e.value} s, which pays ${Math.round(pay * 100)}%.`);
      return { id: o.id, label: o.label, value: e.value, pay, weight: o.weight };
    }
    const r = checklistResult(o, byCheck);
    for (const it of r.items!) {
      if (it.status === "conflict") {
        if (opts.excludeConflicts) it.detail = `Disputed and excluded by the buyer's decision. ${it.detail}`;
        else conflicts.push(`${it.label}: ${it.detail}`);
      }
      if (it.status === "unverified" && !opts.acceptUnverifiedAsNotDone) missing = true;
    }
    const verified = r.items!.filter((i) => i.status === "verified").length;
    reasons.push(`${verified} of ${r.items!.length} checklist items verified, which pays ${Math.round(r.pay * 100)}%.`);
    return r;
  });

  const base = { outcomes, guards, conflicts, policyVersion: POLICY_VERSION, decidedAt: new Date().toISOString() };

  if (conflicts.length) {
    reasons.unshift("The seller's and buyer's photos disagree. Money stays held until the buyer decides how to resolve it.");
    return { ...base, status: "hold", payFraction: 0, reasons };
  }
  if (missing) {
    reasons.unshift("Some required evidence is missing, stale or not confident enough. Money stays held; verify again after adding it.");
    return { ...base, status: "hold", payFraction: 0, reasons };
  }

  const totalWeight = outcomes.reduce((s, o) => s + o.weight, 0);
  let pay = outcomes.reduce((s, o) => s + o.pay * o.weight, 0) / totalWeight;
  const failed = guards.filter((g) => g.passed === false);
  if (failed.length) {
    reasons.push(`Guard failed: ${failed.map((g) => g.label).join("; ")}. Payout capped at ${Math.round(contract.guardFailPay * 100)}%.`);
    pay = Math.min(pay, contract.guardFailPay);
  }
  return { ...base, status: "settle", payFraction: Math.round(pay * 10_000) / 10_000, reasons };
}

export function splitAmount(totalValue: string, payFraction: number) {
  const totalCents = Math.round(Number(totalValue) * 100);
  const earnedCents = Math.floor(totalCents * payFraction);
  return { earned: (earnedCents / 100).toFixed(2), released: ((totalCents - earnedCents) / 100).toFixed(2), earnedCents, totalCents };
}
