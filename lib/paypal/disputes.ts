// PayPal Disputes: find disputes on a capture and answer them with OutcomePay's evidence report.
import { getAccessToken, paypalRequest, PayPalError } from "./client";

export type DisputeSummary = { dispute_id: string; status: string; reason: string; dispute_amount?: { value: string } };

export async function listDisputesForCapture(captureId: string) {
  const res = await paypalRequest<{ items?: DisputeSummary[] }>(
    "list disputes",
    `/v1/customer/disputes?disputed_transaction_id=${encodeURIComponent(captureId)}`,
  );
  return res.items ?? [];
}

// provide-evidence takes multipart form data with an "input" JSON part.
export async function provideEvidence(disputeId: string, notes: string) {
  const token = await getAccessToken();
  const base = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";
  const form = new FormData();
  form.append(
    "input",
    new Blob([JSON.stringify({ evidences: [{ evidence_type: "PROOF_OF_FULFILLMENT", notes: notes.slice(0, 2000) }] })], { type: "application/json" }),
  );
  const res = await fetch(`${base}/v1/customer/disputes/${disputeId}/provide-evidence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new PayPalError("provide evidence", res.status, text ? JSON.parse(text) : undefined);
  return { ok: true };
}
