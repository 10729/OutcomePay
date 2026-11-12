// The Outcome Contract: what was promised, how it's measured, how much each result pays.
import { z } from "zod";

// A payout step: if the measured value is <= maxValue, pay this fraction.
// maxValue null means "anything else" and must be the last step.
export const CurveStep = z.object({
  maxValue: z.number().nullable(),
  pay: z.number().min(0).max(1),
});

export const SpeedOutcome = z.object({
  verifier: z.literal("web.speed"),
  id: z.string(),
  label: z.string(),
  url: z.string().url(),
  metric: z.literal("load_time_s"),
  weight: z.number().positive(),
  curve: z.array(CurveStep).min(1),
});

export const ChecklistItem = z.object({ id: z.string(), label: z.string() });

// Photo-verified work. Each item is checked by AI vision on photos from BOTH sides.
// The seller's photos alone can never release money.
export const ChecklistOutcome = z.object({
  verifier: z.literal("vision.checklist"),
  id: z.string(),
  label: z.string(),
  weight: z.number().positive(),
  items: z.array(ChecklistItem).min(1).max(12),
});

export const Outcome = z.discriminatedUnion("verifier", [SpeedOutcome, ChecklistOutcome]);

export const Guard = z.object({
  id: z.string(),
  label: z.string(),
  verifier: z.enum(["web.http", "web.content"]),
  url: z.string().url(),
  expectStatus: z.number().int().nullable(),
  maxWordDrop: z.number().min(0).max(1).nullable(),
});

// Optional team: after capture, the earned money is split among members with PayPal Payouts.
export const TeamMember = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  share: z.number().min(0).max(1), // fraction of the earned amount
});

export const ContractDraft = z.object({
  kind: z.enum(["web", "service"]),
  team: z.array(TeamMember).max(10).optional(),
  title: z.string(),
  promise: z.string(),
  outcomes: z.array(Outcome).min(1),
  guards: z.array(Guard),
  guardFailPay: z.number().min(0).max(1),
  maxEvidenceAgeMinutes: z.number().int().positive(),
});

export const Contract = ContractDraft.extend({
  spec: z.literal("outcome-contract/0.2"),
  id: z.string(),
  buyer: z.string(),
  seller: z.string(),
  sellerId: z.string(),
  amount: z.object({ value: z.string(), currency: z.literal("USD") }),
  deadline: z.string(),
});

// Schemas the AI fills in (one per job kind; simpler for structured output).
export const WebDraftAI = z.object({
  title: z.string(),
  promise: z.string(),
  target_seconds: z.number(),
  soft_steps: z.array(z.object({ seconds: z.number(), pay: z.number() })).max(3),
  guards_suggested: z.array(z.object({ kind: z.enum(["checkout_works", "content_kept"]), why: z.string() })),
});

export const ServiceDraftAI = z.object({
  title: z.string(),
  promise: z.string(),
  items: z.array(z.string()).min(1).max(12),
  unmeasurable: z.array(z.string()),
});

export type CurveStepT = z.infer<typeof CurveStep>;
export type SpeedOutcomeT = z.infer<typeof SpeedOutcome>;
export type ChecklistOutcomeT = z.infer<typeof ChecklistOutcome>;
export type OutcomeT = z.infer<typeof Outcome>;
export type GuardT = z.infer<typeof Guard>;
export type ContractDraftT = z.infer<typeof ContractDraft>;
export type ContractT = z.infer<typeof Contract>;

export function validateCurve(curve: CurveStepT[]): string | null {
  if (curve[curve.length - 1].maxValue !== null) return "The last payout step must cover everything else.";
  for (let i = 1; i < curve.length - 1; i++) {
    if (curve[i].maxValue! <= curve[i - 1].maxValue!) return "Payout thresholds must increase.";
    if (curve[i].pay > curve[i - 1].pay) return "A worse result can't pay more than a better one.";
  }
  return null;
}

export function validateDraft(d: ContractDraftT): string | null {
  if (d.team?.length) {
    const total = d.team.reduce((x, m) => x + m.share, 0);
    if (total > 1.0001) return "Team shares can't add up to more than 100%.";
  }
  for (const o of d.outcomes) {
    if (o.verifier === "web.speed") {
      const p = validateCurve(o.curve);
      if (p) return p;
    }
  }
  return null;
}
