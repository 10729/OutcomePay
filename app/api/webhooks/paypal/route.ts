// PayPal webhooks: verify the signature with PayPal, then record the event on the matching job.
// Set PAYPAL_WEBHOOK_ID (from the sandbox app's Webhooks section) to enable verification.
import { NextResponse } from "next/server";
import { paypalRequest } from "@/lib/paypal/client";
import { addEvent, listJobs, putJob } from "@/lib/store";

export const dynamic = "force-dynamic";

type WebhookEvent = {
  id: string;
  event_type: string;
  resource?: { id?: string; custom_id?: string; supplementary_data?: { related_ids?: Record<string, string> } };
};

export async function POST(req: Request) {
  const raw = await req.text();
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return NextResponse.json({ ignored: "PAYPAL_WEBHOOK_ID not set" });

  try {
    const check = await paypalRequest<{ verification_status: string }>("verify webhook", "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        auth_algo: req.headers.get("paypal-auth-algo"),
        cert_url: req.headers.get("paypal-cert-url"),
        transmission_id: req.headers.get("paypal-transmission-id"),
        transmission_sig: req.headers.get("paypal-transmission-sig"),
        transmission_time: req.headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: event,
      },
    });
    if (check.verification_status !== "SUCCESS") return NextResponse.json({ error: "Signature not verified" }, { status: 400 });
  } catch {
    // Reply 500 so PayPal retries later.
    return NextResponse.json({ error: "Verification unavailable" }, { status: 500 });
  }

  const r = event.resource ?? {};
  const ids = new Set([r.id, r.custom_id, ...Object.values(r.supplementary_data?.related_ids ?? {})].filter(Boolean));
  const job = (await listJobs()).find(
    (j) => ids.has(j.contractHash) || ids.has(j.paypal.orderId) || ids.has(j.paypal.authorizationId) || ids.has(j.paypal.captureId),
  );
  if (job && !job.events.some((e) => e.detail.includes(event.id))) {
    addEvent(job, "webhook", `PayPal confirmed ${event.event_type} (${event.id}), signature verified.`);
    await putJob(job);
  }
  return NextResponse.json({ received: true });
}
