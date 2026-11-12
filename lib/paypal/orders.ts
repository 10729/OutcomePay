// PayPal money engine: hold, capture (full or partial), void, refund.
import { randomUUID } from "node:crypto";
import { paypalRequest } from "./client";

type Link = { href: string; rel: string };
export type Order = {
  id: string;
  status: string;
  links?: Link[];
  purchase_units?: Array<{
    custom_id?: string;
    payments?: { authorizations?: Array<{ id: string; status: string; expiration_time?: string }> };
  }>;
};

export type CreateHoldOrderInput = {
  amount: string;
  currency?: string;
  description: string;
  proofHash: string; // contract hash, stored in custom_id (max 127 chars)
  // Redirect flow (scripts) needs return/cancel URLs; the JS SDK button flow does not.
  returnUrl?: string;
  cancelUrl?: string;
};

export async function createHoldOrder(input: CreateHoldOrderInput) {
  const body: Record<string, unknown> = {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        description: input.description.slice(0, 127),
        custom_id: input.proofHash.slice(0, 127),
        amount: { currency_code: input.currency ?? "USD", value: input.amount },
      },
    ],
  };
  if (input.returnUrl && input.cancelUrl) {
    body.payment_source = {
      paypal: {
        experience_context: {
          brand_name: "OutcomePay",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    };
  }

  const order = await paypalRequest<Order>("create order", "/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body,
  });
  const approveUrl = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return { orderId: order.id, status: order.status, approveUrl };
}

export function getOrder(orderId: string) {
  return paypalRequest<Order>("get order", `/v2/checkout/orders/${orderId}`);
}

export async function authorizeOrder(orderId: string) {
  const order = await paypalRequest<Order>("authorize order", `/v2/checkout/orders/${orderId}/authorize`, {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: {},
  });
  const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`No authorization returned for order ${orderId}`);
  return { authorizationId: auth.id, status: auth.status, expiresAt: auth.expiration_time };
}

// final_capture: true closes the authorization, releasing any uncaptured remainder.
export async function captureAuthorization(
  authorizationId: string,
  amount?: { value: string; currency: string },
  idempotencyKey: string = randomUUID(),
) {
  const body: Record<string, unknown> = { final_capture: true };
  if (amount) body.amount = { value: amount.value, currency_code: amount.currency };
  const capture = await paypalRequest<{ id: string; status: string; amount?: { value: string } }>(
    "capture authorization",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { method: "POST", idempotencyKey, body },
  );
  return { captureId: capture.id, status: capture.status, captured: capture.amount?.value };
}

export function getAuthorization(authorizationId: string) {
  return paypalRequest<{ id: string; status: string; amount: { value: string } }>(
    "get authorization",
    `/v2/payments/authorizations/${authorizationId}`,
  );
}

export async function voidAuthorization(authorizationId: string, idempotencyKey: string = randomUUID()) {
  await paypalRequest<void>("void authorization", `/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    idempotencyKey,
  });
  return { status: "VOIDED" };
}

export async function refundCapture(
  captureId: string,
  reason: string,
  amount?: { value: string; currency: string },
  idempotencyKey: string = randomUUID(),
) {
  const body: Record<string, unknown> = { note_to_payer: reason.slice(0, 255) };
  if (amount) body.amount = { value: amount.value, currency_code: amount.currency };
  const refund = await paypalRequest<{ id: string; status: string }>(
    "refund capture",
    `/v2/payments/captures/${captureId}/refund`,
    { method: "POST", idempotencyKey, body },
  );
  return { refundId: refund.id, status: refund.status };
}
