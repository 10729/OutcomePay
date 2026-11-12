// PayPal Payouts: split a seller's earned money among team members in one batch.
// Sandbox note: the app needs the Payouts feature enabled (Apps & Credentials > your app > Features).
import { paypalRequest } from "./client";

export type PayoutItem = { email: string; amount: string; note: string; ref: string };

export async function createPayout(batchId: string, subject: string, items: PayoutItem[]) {
  const res = await paypalRequest<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "create payout",
    "/v1/payments/payouts",
    {
      method: "POST",
      idempotencyKey: batchId,
      body: {
        sender_batch_header: { sender_batch_id: batchId, email_subject: subject, email_message: "Your share of a verified OutcomePay job." },
        items: items.map((i) => ({
          recipient_type: "EMAIL",
          receiver: i.email,
          amount: { value: i.amount, currency: "USD" },
          note: i.note.slice(0, 4000),
          sender_item_id: i.ref,
        })),
      },
    },
  );
  return { batchId: res.batch_header.payout_batch_id, status: res.batch_header.batch_status };
}

export async function getPayout(batchId: string) {
  const res = await paypalRequest<{ batch_header: { batch_status: string } }>("get payout", `/v1/payments/payouts/${batchId}`);
  return { status: res.batch_header.batch_status };
}
