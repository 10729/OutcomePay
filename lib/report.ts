// Evidence writer: explains a decision in plain English. It can never change the decision.
import { generateText } from "ai";
import { hasAI, limits, withModels } from "./ai";
import type { Job } from "./types";
import { splitAmount } from "./engine/decide";

export async function writeReport(job: Job): Promise<string> {
  const facts = templateReport(job);
  if (!hasAI() || !job.decision) return facts;
  try {
    const { result: { text } } = await withModels((m) => generateText({ ...limits(),
      model: m,
      temperature: 0,
      system:
        "Write a short, neutral settlement report for a buyer and a seller: 4 to 6 sentences, plain English, no headings. " +
        "Say what was promised, what was checked and by which source, what passed or failed, and the payout. " +
        "Use only the facts given. Never change a number or add opinions.",
      prompt: facts,
    }));
    return text.trim() || facts;
  } catch {
    return facts;
  }
}

export function templateReport(job: Job): string {
  const d = job.decision;
  if (!d) return job.status === "voided" ? "The hold was released before verification. The buyer was never charged." : "No decision yet.";
  const { earned, released } = splitAmount(job.contract.amount.value, d.payFraction);
  const lines: string[] = [`Promise: ${job.contract.promise}`];
  for (const o of d.outcomes) {
    if (o.items) for (const it of o.items) lines.push(`${it.label}: ${it.status.replace("_", " ")}. ${it.detail}`);
  }
  for (const e of job.evidence.filter((x) => x.verifier.startsWith("web."))) lines.push(`${e.source}: ${e.note}`);
  for (const g of d.guards) lines.push(`Check "${g.label}": ${g.passed === null ? "not checked" : g.passed ? "passed" : "failed"}. ${g.detail}`);
  lines.push(...d.reasons);
  lines.push(
    d.status === "settle"
      ? `Payout: ${Math.round(d.payFraction * 100)}%, so $${earned} to the seller and $${released} back to the buyer.`
      : "Payout: none yet. The money stays held.",
  );
  return lines.join("\n");
}
