// Called by the PayPal button's createOrder: creates an AUTHORIZE (hold) order bound to the contract hash.
import { NextResponse } from "next/server";
import { addEvent, getJob, putJob } from "@/lib/store";
import { createHoldOrder } from "@/lib/paypal/orders";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.status !== "awaiting_payment") throw new Error(`Job is ${job.status}; it can't be paid again.`);

    const { orderId } = await createHoldOrder({
      amount: job.contract.amount.value,
      currency: job.contract.amount.currency,
      description: `OutcomePay: ${job.contract.title}`,
      proofHash: job.contractHash,
    });
    job.paypal.orderId = orderId;
    addEvent(job, "order", `PayPal order ${orderId} created (intent AUTHORIZE, contract hash in custom_id).`);
    await putJob(job);
    return NextResponse.json({ id: orderId });
  } catch (err) {
    return fail(err);
  }
}
