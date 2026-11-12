// Seller clicks Verify. The response is a live stream (one JSON event per line) so the
// screen can show each check as it finishes: evidence -> decision -> PayPal -> report.
import { addEvent, getJob, putJob } from "@/lib/store";
import { collectEvidence } from "@/lib/verifiers";
import { decide } from "@/lib/engine/decide";
import { settle } from "@/lib/settle";
import { writeReport } from "@/lib/report";
import { PayPalError } from "@/lib/paypal/client";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const job = await getJob(params.id);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "held") return Response.json({ error: `Job is ${job.status}; only held jobs can be verified.` }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        send({ type: "phase", phase: "evidence" });
        job.evidence = await collectEvidence(job.contract, { jobId: job.id, photos: job.photos }, (e) => send({ type: "evidence", evidence: e }));
        addEvent(job, "evidence", `${job.evidence.length} evidence records collected.`);

        send({ type: "phase", phase: "decision" });
        job.decision = decide(job.contract, job.evidence, job.baseline);
        addEvent(job, "decision", job.decision.status === "settle" ? `Pay ${Math.round(job.decision.payFraction * 100)}% (${job.decision.policyVersion}).` : "Hold: " + job.decision.reasons[0]);
        send({ type: "decision", decision: job.decision });

        if (job.decision.status === "settle") {
          send({ type: "phase", phase: "paypal" });
          await settle(job);
          send({ type: "paypal", paypal: job.paypal, status: job.status });
        }

        send({ type: "phase", phase: "report" });
        job.report = await writeReport(job);
        await putJob(job);
        send({ type: "done", job });
      } catch (err) {
        const message = err instanceof PayPalError ? `PayPal ${err.step} failed: ${JSON.stringify(err.details)}` : (err as Error).message;
        addEvent(job, "error", message);
        await putJob(job);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
