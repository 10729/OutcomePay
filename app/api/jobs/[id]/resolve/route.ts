// The photos disagreed. The buyer decides: pay only the items both sides' evidence supports,
// or release the whole hold. Either way, the money moves only for verified work.
import { NextResponse } from "next/server";
import { z } from "zod";
import { addEvent, getJob, putJob } from "@/lib/store";
import { decide } from "@/lib/engine/decide";
import { settle } from "@/lib/settle";
import { writeReport } from "@/lib/report";
import { voidAuthorization } from "@/lib/paypal/orders";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { action } = z.object({ action: z.enum(["pay_verified", "release_all"]) }).parse(await req.json());
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.status !== "held" || job.decision?.status !== "hold") throw new Error("This job has nothing to resolve.");

    if (action === "release_all") {
      await voidAuthorization(job.paypal.authorizationId!, `${job.id}-void-resolve`);
      job.status = "voided";
      job.paypal.releasedValue = job.contract.amount.value;
      addEvent(job, "resolved", "Buyer released the whole hold after disputed evidence. Buyer never charged.");
    } else {
      job.decision = decide(job.contract, job.evidence, job.baseline, { excludeConflicts: true, acceptUnverifiedAsNotDone: true });
      addEvent(job, "resolved", `Buyer chose to pay only verified items: ${Math.round(job.decision.payFraction * 100)}%.`);
      await settle(job);
    }
    job.report = await writeReport(job);
    await putJob(job);
    return NextResponse.json(job);
  } catch (err) {
    return fail(err);
  }
}
