// Deadline missed or job cancelled before delivery: void the hold, buyer never charged.
import { NextResponse } from "next/server";
import { addEvent, getJob, putJob } from "@/lib/store";
import { voidAuthorization } from "@/lib/paypal/orders";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.status !== "held" || !job.paypal.authorizationId) throw new Error("Only a held job can be voided.");
    await voidAuthorization(job.paypal.authorizationId, `${job.id}-void`);
    job.status = "voided";
    job.paypal.releasedValue = job.contract.amount.value;
    addEvent(job, "voided", `Hold voided. Buyer never charged ($${job.contract.amount.value} released).`);
    await putJob(job);
    return NextResponse.json(job);
  } catch (err) {
    return fail(err);
  }
}
