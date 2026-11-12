// Called after the buyer approves in the PayPal popup. Server-side checks, then authorize = money held.
import { NextResponse } from "next/server";
import { z } from "zod";
import { addEvent, getJob, putJob } from "@/lib/store";
import { authorizeOrder, getOrder } from "@/lib/paypal/orders";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { orderID } = z.object({ orderID: z.string() }).parse(await req.json());
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.paypal.orderId !== orderID) throw new Error("Order does not belong to this job.");
    if (job.status === "held") return NextResponse.json(job);

    // Never trust the browser: confirm with PayPal that the order is approved and bound to this contract.
    const order = await getOrder(orderID);
    if (order.status !== "APPROVED") throw new Error(`Order status is ${order.status}, expected APPROVED.`);
    if (order.purchase_units?.[0]?.custom_id !== job.contractHash) throw new Error("Order is not bound to this contract.");

    const { authorizationId, expiresAt } = await authorizeOrder(orderID);
    job.paypal.authorizationId = authorizationId;
    job.status = "held";
    addEvent(job, "held", `$${job.contract.amount.value} held by PayPal. Authorization ${authorizationId}, valid until ${expiresAt ?? "n/a"}.`);
    await putJob(job);
    return NextResponse.json(job);
  } catch (err) {
    return fail(err);
  }
}
