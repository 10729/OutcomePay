// Demo controls for the sample bakery site: simulate the seller deploying a fix, a cheat, or a break.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDemoMode, setDemoMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ mode: await getDemoMode() });
}

export async function POST(req: Request) {
  const { mode } = z.object({ mode: z.enum(["slow", "partial", "fast", "gamed", "broken"]) }).parse(await req.json());
  await setDemoMode(mode);
  return NextResponse.json({ mode });
}
