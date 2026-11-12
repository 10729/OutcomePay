// Contract compiler: plain-English promise -> measurable Outcome Contract.
// The AI extracts intent; code builds the contract, so its structure is always valid.
// Without an AI key, a deterministic template is used so the app always works.
import { generateObject } from "ai";
import { hasAI, model, MODEL_NAME , limits } from "../ai";
import { type ContractDraftT, ServiceDraftAI, validateDraft, WebDraftAI } from "./schema";

export type CompileInput = {
  kind: "web" | "service";
  promise: string;
  url?: string;
  checkoutUrl?: string;
};

export type CompileResult = { draft: ContractDraftT; engine: string; notes: string[] };

const WEB_SYSTEM = `You turn a web developer's promise into a measurable speed contract.
Return:
- target_seconds: the promised mobile load time in seconds (if none is stated, 2.5).
- soft_steps: up to 2 softer thresholds above the target that pay less (e.g. target*1.2 pays 0.6, target*1.6 pays 0.3). Seconds must increase and pay must decrease.
- guards_suggested: ways the seller could fake the result and the guard that blocks it. Use "checkout_works" (the checkout page must still load) and "content_kept" (the homepage must keep its content), each with a one-sentence why.
- title: a short job name. promise: the promise, cleaned up.`;

const SERVICE_SYSTEM = `You turn a service provider's promise into a checklist that can be verified from photos.
Return:
- items: short, concrete, visually checkable items (e.g. "Oven interior clean", "Sink clear of dishes"). 1 to 8 items.
- unmeasurable: any part of the promise that cannot be verified from a photo (e.g. "friendly service"), so it is left out.
- title: a short job name. promise: the promise, cleaned up.`;

export async function compileContract(input: CompileInput): Promise<CompileResult> {
  if (input.kind === "web" && !input.url) throw new Error("A website URL is required for a speed job.");
  if (hasAI()) {
    try {
      return input.kind === "web" ? await compileWebAI(input) : await compileServiceAI(input);
    } catch (err) {
      console.error("AI compile failed, using template:", (err as Error).message);
    }
  }
  const draft = input.kind === "web" ? webTemplate(input, null) : serviceTemplate(input);
  return { draft, engine: "template (no AI key set)", notes: [] };
}

async function compileWebAI(input: CompileInput): Promise<CompileResult> {
  const { object } = await generateObject({ ...limits(),
    model: model(),
    schema: WebDraftAI,
    system: WEB_SYSTEM,
    prompt: `Promise: ${input.promise}`,
    temperature: 0,
  });
  const target = clamp(object.target_seconds, 0.5, 10);
  const steps = object.soft_steps
    .filter((s) => s.seconds > target)
    .sort((a, b) => a.seconds - b.seconds)
    .slice(0, 2);
  const draft = webTemplate({ ...input, promise: object.promise || input.promise }, { target, steps });
  draft.title = object.title || draft.title;
  const err = validateDraft(draft);
  if (err) throw new Error(err);
  const notes = object.guards_suggested.map((g) => `Guard "${g.kind === "checkout_works" ? "checkout still works" : "content kept"}": ${g.why}`);
  return { draft, engine: `Gemini (${MODEL_NAME})`, notes };
}

async function compileServiceAI(input: CompileInput): Promise<CompileResult> {
  const { object } = await generateObject({ ...limits(),
    model: model(),
    schema: ServiceDraftAI,
    system: SERVICE_SYSTEM,
    prompt: `Promise: ${input.promise}`,
    temperature: 0,
  });
  const draft = serviceDraft(object.title || "Photo-verified service", object.promise || input.promise, object.items);
  const notes = object.unmeasurable.map((u) => `Left out (can't be verified from a photo): ${u}`);
  return { draft, engine: `Gemini (${MODEL_NAME})`, notes };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 2.5));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function webTemplate(
  input: CompileInput,
  ai: { target: number; steps: { seconds: number; pay: number }[] } | null,
): ContractDraftT {
  const match = input.promise.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/i);
  const target = ai?.target ?? (match ? Number(match[1]) : 2.5);
  const steps =
    ai && ai.steps.length
      ? ai.steps.map((s) => ({ maxValue: r1(s.seconds), pay: clamp(s.pay, 0, 0.95) }))
      : [
          { maxValue: r1(target * 1.2), pay: 0.6 },
          { maxValue: r1(target * 1.6), pay: 0.3 },
        ];
  const url = input.url!;
  return {
    kind: "web",
    title: "Website speed fix",
    promise: input.promise.trim(),
    outcomes: [
      {
        verifier: "web.speed",
        id: "speed",
        label: `Homepage loads in ${target} s or less on mobile`,
        url,
        metric: "load_time_s",
        weight: 1,
        curve: [{ maxValue: target, pay: 1 }, ...steps, { maxValue: null, pay: 0 }],
      },
    ],
    guards: [
      { id: "checkout", label: "Checkout page still works", verifier: "web.http", url: input.checkoutUrl || url, expectStatus: 200, maxWordDrop: null },
      { id: "content", label: "Homepage keeps its content", verifier: "web.content", url, expectStatus: null, maxWordDrop: 0.1 },
    ],
    guardFailPay: 0,
    maxEvidenceAgeMinutes: 30,
  };
}

function serviceDraft(title: string, promise: string, items: string[]): ContractDraftT {
  const clean = items.map((s) => s.trim()).filter(Boolean).slice(0, 12);
  return {
    kind: "service",
    title,
    promise: promise.trim(),
    outcomes: [
      {
        verifier: "vision.checklist",
        id: "checklist",
        label: "Every checklist item done, confirmed by photos from both sides",
        weight: 1,
        items: clean.map((label, i) => ({ id: `item${i + 1}`, label })),
      },
    ],
    guards: [],
    guardFailPay: 0,
    maxEvidenceAgeMinutes: 1440,
  };
}

export function serviceTemplate(input: CompileInput): ContractDraftT {
  const body = input.promise.includes(":") ? input.promise.slice(input.promise.indexOf(":") + 1) : input.promise;
  const raw = body
    .split(/[,;\n]|\.\s/)
    .flatMap((s) => s.split(/\s+and\s+(?=(?:then\s+)?(?:clean|wipe|mop|scrub|wash|vacuum|dust|polish|empty|remove|tidy|paint|fix|replace|install)\b)/i))
    .map((s) => s.replace(/^\s*(and|then|i'?ll|we'?ll|will)\s+/i, "").replace(/\.$/, "").trim())
    .filter((s) => s.length > 2 && !/guarantee|friendly|promise/i.test(s));
  // A one-word fragment ("clear") belongs to the next clause ("scrub the sink").
  const parts: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].split(/\s+/).length === 1 && raw[i + 1]) raw[i + 1] = `${raw[i]} and ${raw[i + 1]}`;
    else parts.push(raw[i]);
  }
  const items = parts.length ? parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)) : ["Job completed as described"];
  return serviceDraft("Photo-verified service", input.promise, items);
}
