import { NextResponse } from "next/server";
import { z } from "zod";
import { listJobs } from "@/lib/store";
import { buildContract, createJob } from "@/lib/jobs";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  draft: z.unknown(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  buyer: z.string().min(1),
  sellerId: z.string().min(1),
  deadlineDays: z.number().int().min(1).max(29),
});

export async function GET() {
  return NextResponse.json(await listJobs());
}

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const contract = buildContract({ ...b, draft: b.draft as never });
    const job = await createJob(contract, "manual");
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
