// Retry the team payout (e.g. after enabling Payouts on the sandbox app).
import { NextResponse } from "next/server";
import { getJob, putJob } from "@/lib/store";
import { retryTeamPayout } from "@/lib/settle";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.status !== "settled") throw new Error("Team payouts run after the job is settled.");
    await retryTeamPayout(job);
    await putJob(job);
    return NextResponse.json(job);
  } catch (err) {
    return fail(err);
  }
}
