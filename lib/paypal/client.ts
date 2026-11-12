// ProofPay — PayPal REST client (sandbox by default)
// Handles: access token (cached), JSON requests, idempotency keys, readable errors.

export class PayPalError extends Error {
  step: string;
  status: number;
  details: unknown;

  constructor(step: string, status: number, details: unknown) {
    super(`PayPal ${step} failed (${status}): ${JSON.stringify(details)}`);
    this.step = step;
    this.status = status;
    this.details = details;
  }
}

// Read env lazily so scripts can load .env.local before the first call.
function baseUrl(): string {
  return process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  // Reuse the token until 1 minute before it expires (tokens last ~9 hours).
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env.local");
  }

  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json();
  if (!res.ok) throw new PayPalError("get access token", res.status, data);

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  idempotencyKey?: string;
};

export async function paypalRequest<T>(
  step: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (options.idempotencyKey) headers["PayPal-Request-Id"] = options.idempotencyKey;

  const res = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T; // e.g. void returns no body

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new PayPalError(step, res.status, data);
  return data as T;
}
