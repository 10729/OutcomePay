// Approve an agent's proposal with a passkey.
// POST { proposalId } -> options whose challenge contains the contract hash.
// POST { proposalId, response } -> verify signature, then create the job.
import { NextResponse } from "next/server";
import { z } from "zod";
import { approvalOptions, verifyApproval } from "@/lib/passkey";
import { getProposal, putProposal } from "@/lib/store";
import { createJob, hashContract } from "@/lib/jobs";
import { Contract } from "@/lib/contract/schema";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = z.object({ proposalId: z.string(), response: z.any().optional() }).parse(await req.json());
    const p = await getProposal(body.proposalId);
    if (!p) throw new Error("Proposal not found.");
    if (p.used) throw new Error("This proposal was already approved.");
    const contract = Contract.parse(p.contract);
    if (hashContract(contract) !== p.hash) throw new Error("Proposal was modified after it was drafted.");

    if (!body.response) {
      const options = await approvalOptions(req, p.hash);
      p.challenge = options.challenge;
      await putProposal(p);
      return NextResponse.json(options);
    }

    if (!p.challenge) throw new Error("Start the approval first.");
    const { credentialId } = await verifyApproval(req, body.response, p.challenge, p.hash);
    p.used = true;
    await putProposal(p);

    const job = await createJob(contract, "agent", {
      goal: p.goal,
      reasoning: p.reasoning,
      engine: p.engine,
      approvedWith: "passkey",
      credentialId,
      signedHash: p.hash,
      approvedAt: new Date().toISOString(),
    });
    return NextResponse.json({ jobId: job.id });
  } catch (err) {
    return fail(err);
  }
}
