// Turns a decision into exactly one PayPal settlement, then pays the team (if any). Idempotent per job.
import type { Job } from "./types";
import { splitAmount } from "./engine/decide";
import { captureAuthorization, getAuthorization, refundCapture, voidAuthorization } from "./paypal/orders";
import { createPayout } from "./paypal/payouts";
import { addEvent } from "./store";
import { PayPalError } from "./paypal/client";

export async function settle(job: Job): Promise<Job> {
  const d = job.decision;
  const authId = job.paypal.authorizationId;
  if (!d || d.status !== "settle") throw new Error("No settle decision for this job.");
  if (!authId) throw new Error("No PayPal authorization to settle.");
  if (job.status === "settled" || job.status === "voided") return job;

  const currency = job.contract.amount.currency;
  const { earned, released, earnedCents, totalCents } = splitAmount(job.contract.amount.value, d.payFraction);
  const key = (action: string) => `${job.id}-${action}`;

  if (earnedCents === 0) {
    await voidAuthorization(authId, key("void"));
    job.status = "voided";
    job.paypal.releasedValue = released;
    addEvent(job, "voided", `Nothing earned. Hold voided, so the buyer was never charged ($${released} released).`);
    return confirm(job);
  }

  if (earnedCents === totalCents) {
    const c = await captureAuthorization(authId, undefined, key("capture"));
    job.paypal.captureId = c.captureId;
    job.paypal.capturedValue = c.captured ?? earned;
    job.paypal.releasedValue = "0.00";
    addEvent(job, "captured", `Full result. Captured $${job.paypal.capturedValue} to ${job.contract.seller}.`);
  } else {
    try {
      const c = await captureAuthorization(authId, { value: earned, currency }, key("capture-partial"));
      job.paypal.captureId = c.captureId;
      job.paypal.capturedValue = c.captured ?? earned;
      job.paypal.releasedValue = released;
      addEvent(job, "captured", `Partial result. Captured $${earned}; $${released} released back to the buyer.`);
    } catch (err) {
      if (!(err instanceof PayPalError)) throw err;
      addEvent(job, "fallback", `Partial capture refused (${err.status}). Capturing in full and refunding the unearned $${released}.`);
      const c = await captureAuthorization(authId, undefined, key("capture-full-fallback"));
      const r = await refundCapture(c.captureId, "OutcomePay: refund of the unearned share under your outcome contract.", { value: released, currency }, key("refund-fallback"));
      job.paypal.captureId = c.captureId;
      job.paypal.capturedValue = earned;
      job.paypal.releasedValue = released;
      job.paypal.refundId = r.refundId;
      addEvent(job, "refunded", `Refunded $${released} to the buyer.`);
    }
  }
  job.status = "settled";
  await payTeam(job);
  return confirm(job);
}

// Split the earned amount among team members with one PayPal Payouts batch.
async function payTeam(job: Job) {
  const team = job.contract.team ?? [];
  const captured = Math.round(Number(job.paypal.capturedValue ?? "0") * 100);
  if (!team.length || !captured || job.paypal.payoutBatchId) return;
  const items = team
    .map((m, i) => ({ m, cents: Math.floor(captured * m.share), ref: `${job.id}-m${i}` }))
    .filter((x) => x.cents > 0);
  if (!items.length) return;
  try {
    const res = await createPayout(
      `${job.id}-team`,
      `Your share of "${job.contract.title}"`,
      items.map((x) => ({ email: x.m.email, amount: (x.cents / 100).toFixed(2), note: `${Math.round(x.m.share * 100)}% of $${job.paypal.capturedValue} earned on a verified job.`, ref: x.ref })),
    );
    job.paypal.payoutBatchId = res.batchId;
    job.paypal.payoutStatus = res.status;
    job.paypal.payouts = items.map((x) => ({ name: x.m.name, email: x.m.email, amount: (x.cents / 100).toFixed(2) }));
    addEvent(job, "payout", `PayPal Payouts batch ${res.batchId} (${res.status}): ${job.paypal.payouts.map((p) => `${p.name} $${p.amount}`).join(", ")}.`);
  } catch (err) {
    addEvent(job, "payout_failed", `Team payout failed: ${(err as Error).message}. Enable Payouts on the sandbox app and retry from the job page.`);
  }
}

export async function retryTeamPayout(job: Job) {
  await payTeam(job);
  return job;
}

async function confirm(job: Job): Promise<Job> {
  try {
    const auth = await getAuthorization(job.paypal.authorizationId!);
    addEvent(job, "confirmed", `PayPal reports authorization ${auth.id} as ${auth.status}.`);
  } catch (err) {
    addEvent(job, "confirm_failed", `Could not confirm with PayPal: ${(err as Error).message}`);
  }
  return job;
}
