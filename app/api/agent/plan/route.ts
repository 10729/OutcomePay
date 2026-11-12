// The AI agent: reads the buyer's goal, picks a seller from verified track records,
// and drafts the contract. It cannot fund anything: the buyer must sign with a passkey.
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { hasAI, limits, withModels } from "@/lib/ai";
import { compileContract } from "@/lib/contract/compile";
import { buildContract, hashContract } from "@/lib/jobs";
import { listJobs, putProposal } from "@/lib/store";
import { reputation, SELLERS } from "@/lib/sellers";
import { newId } from "@/lib/hash";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  goal: z.string().min(5).max(500),
  budget: z.number().positive().max(10_000),
  buyer: z.string().min(1),
  url: z.string().url(),
  checkoutUrl: z.string().url().optional(),
});

const Choice = z.object({
  sellerId: z.string(),
  price: z.number(),
  promise: z.string(),
  reasoning: z.string(),
});

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const jobs = await listJobs();
    const candidates = SELLERS.filter((s) => s.skill === "web" && s.priceFrom <= b.budget).map((s) => {
      const r = reputation(s, jobs);
      return {
        id: s.id,
        name: s.name,
        speciality: s.speciality,
        priceFrom: s.priceFrom,
        jobs: r.jobs,
        avgPayoutPct: Math.round(r.avgPayout * 100),
        fullDeliveryPct: Math.round(r.fullRate * 100),
        guardFails: r.guardFails,
      };
    });
    if (!candidates.length) throw new Error("No seller offers this within your budget.");

    let choice: z.infer<typeof Choice> | null = null;
    let engine = "rule-based ranking (no AI key set)";
    if (hasAI()) {
      try {
      const { result: { object }, name: usedModel } = await withModels((m) => generateObject({ ...limits(),
        model: m,
        schema: Choice,
        temperature: 0,
        system:
          "You are a buyer's purchasing agent. Choose the seller most likely to deliver the verified outcome within budget. " +
          "Weigh verified track record (average payout earned, full deliveries, guard failures from attempts to game checks) over price. " +
          "price must be within budget and at least the seller's priceFrom. promise is the outcome the seller should commit to, with a measurable number. " +
          "reasoning: 2 to 3 sentences citing the numbers.",
        prompt: `Buyer goal: ${b.goal}\nBudget: $${b.budget}\nCandidates:\n${JSON.stringify(candidates, null, 2)}`,
      }));
      choice = object;
      engine = `Gemini (${usedModel})`;
      } catch (err) {
        engine = `rule-based ranking (Gemini unavailable: ${((err as Error)?.message ?? "error").slice(0, 120)})`;
      }
    }
    if (!choice) {
      const best = [...candidates].sort((x, y) => y.avgPayoutPct - x.avgPayoutPct || x.guardFails - y.guardFails)[0];
      choice = {
        sellerId: best.id,
        price: Math.min(b.budget, Math.max(best.priceFrom, b.budget)),
        promise: b.goal,
        reasoning: `${best.name} has earned an average of ${best.avgPayoutPct}% of held payments across ${best.jobs} verified jobs, with ${best.guardFails} guard failures. Highest verified delivery within your budget.`,
      };
    }

    const seller = candidates.find((c) => c.id === choice.sellerId);
    if (!seller) throw new Error("The agent picked an unknown seller.");
    const price = Math.min(b.budget, Math.max(seller.priceFrom, Math.round(choice.price)));

    const compiled = await compileContract({ kind: "web", promise: choice.promise, url: b.url, checkoutUrl: b.checkoutUrl });
    const contract = buildContract({ draft: compiled.draft, amount: String(price), buyer: b.buyer, sellerId: seller.id, deadlineDays: 3 });
    const hash = hashContract(contract);

    const proposal = {
      id: newId("prop"),
      createdAt: new Date().toISOString(),
      goal: b.goal,
      reasoning: choice.reasoning,
      engine,
      sellerId: seller.id,
      amount: contract.amount.value,
      buyer: b.buyer,
      contract,
      hash,
    };
    await putProposal(proposal);
    return NextResponse.json({ proposal, candidates, notes: compiled.notes });
  } catch (err) {
    return fail(err);
  }
}
