import { NextResponse } from "next/server";
import { z } from "zod";
import { compileContract } from "@/lib/contract/compile";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["web", "service"]),
  promise: z.string().min(5).max(600),
  url: z.string().url().optional().or(z.literal("")),
  checkoutUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const result = await compileContract({
      kind: b.kind,
      promise: b.promise,
      url: b.url || undefined,
      checkoutUrl: b.checkoutUrl || undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}
