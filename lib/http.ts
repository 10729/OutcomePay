import { NextResponse } from "next/server";
import { PayPalError } from "./paypal/client";

export function fail(err: unknown, status = 400) {
  if (err instanceof PayPalError) {
    return NextResponse.json({ error: err.message, step: err.step, details: err.details }, { status: 502 });
  }
  return NextResponse.json({ error: (err as Error).message ?? String(err) }, { status });
}
