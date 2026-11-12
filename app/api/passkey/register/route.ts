// Register the buyer's passkey (fingerprint / Face ID / device PIN).
// POST with no body -> options. POST { response } -> verify and save.
import { NextResponse } from "next/server";
import { registrationOptions, verifyRegistration } from "@/lib/passkey";
import { getPasskeys } from "@/lib/store";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ registered: (await getPasskeys()).length > 0 });
}

export async function POST(req: Request) {
  try {
    const text = await req.text();
    const body = text ? JSON.parse(text) : {};
    if (!body.response) return NextResponse.json(await registrationOptions(req));
    return NextResponse.json(await verifyRegistration(req, body.response));
  } catch (err) {
    return fail(err);
  }
}
