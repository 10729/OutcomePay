// GET: look up PayPal disputes on this job's capture. POST { disputeId }: answer with the evidence report.
import { NextResponse } from "next/server";
import { z } from "zod";
import { addEvent, getJob, putJob } from "@/lib/store";
import { listDisputesForCapture, provideEvidence } from "@/lib/paypal/disputes";
import { templateReport } from "@/lib/report";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (!job.paypal.captureId) throw new Error("Only captured payments can be disputed.");
    const items = await listDisputesForCapture(job.paypal.captureId);
    const previous = new Map((job.disputes ?? []).map((d) => [d.id, d]));
    job.disputes = items.map((d) => ({
      id: d.dispute_id,
      status: d.status,
      reason: d.reason,
      amount: d.dispute_amount?.value ?? "",
      evidenceSentAt: previous.get(d.dispute_id)?.evidenceSentAt,
    }));
    addEvent(job, "disputes", items.length ? `${items.length} PayPal dispute(s) found on capture ${job.paypal.captureId}.` : "No PayPal disputes on this payment.");
    await putJob(job);
    return NextResponse.json(job);
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { disputeId } = z.object({ disputeId: z.string() }).parse(await req.json());
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const d = job.disputes?.find((x) => x.id === disputeId);
    if (!d) throw new Error("Dispute not found on this job. Refresh disputes first.");

    const evidence = [
      `OutcomePay evidence for contract ${job.contract.id} (sha256 ${job.contractHash}).`,
      `Decision ${job.decision?.policyVersion ?? ""}: paid ${Math.round((job.decision?.payFraction ?? 0) * 100)}% of $${job.contract.amount.value}.`,
      templateReport(job),
    ].join("\n");
    await provideEvidence(disputeId, evidence);
    d.evidenceSentAt = new Date().toISOString();
    addEvent(job, "dispute_evidence", `Evidence report sent to PayPal dispute ${disputeId}.`);
    await putJob(job);
    return NextResponse.json(job);
  } catch (err) {
    return fail(err);
  }
}
