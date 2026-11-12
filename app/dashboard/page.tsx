import { listJobs } from "@/lib/store";
import JobsGrid, { type GridRow } from "./JobsGrid";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const jobs = await listJobs();
  const sum = (f: (j: (typeof jobs)[number]) => number) => jobs.reduce((s, j) => s + f(j), 0);
  const held = sum((j) => (j.status === "held" ? Number(j.contract.amount.value) : 0));
  const captured = sum((j) => Number(j.paypal.capturedValue ?? 0));
  const returned = sum((j) => (j.status === "settled" || j.status === "voided" ? Number(j.paypal.releasedValue ?? 0) : 0));
  const settled = jobs.filter((j) => j.decision?.status === "settle");
  const avg = settled.length ? settled.reduce((s, j) => s + j.decision!.payFraction, 0) / settled.length : 0;
  const caught = jobs.filter((j) => j.decision?.guards.some((g) => g.passed === false)).length;
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const rows: GridRow[] = jobs.map((j) => ({
    id: j.id,
    title: j.contract.title,
    type: j.origin === "agent" ? "Agent hire" : j.contract.kind === "web" ? "Website speed" : "Photo service",
    seller: j.contract.seller,
    buyer: j.contract.buyer,
    amount: Number(j.contract.amount.value),
    paid: j.decision?.status === "settle" ? Math.round(j.decision.payFraction * 100) : null,
    captured: Number(j.paypal.capturedValue ?? 0),
    returned: j.status === "settled" || j.status === "voided" ? Number(j.paypal.releasedValue ?? 0) : 0,
    checks: j.decision ? (j.decision.guards.some((g) => g.passed === false) ? "Caught" : j.decision.conflicts.length ? "Disputed" : "Clean") : "",
    status: j.status.replace("_", " "),
    created: j.createdAt,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="display text-4xl font-extrabold">Dashboard</h1>
        <p className="mt-2 text-muted">Every outcome job, what PayPal holds, and where the money went.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Held right now" value={fmt(held)} tone="bg-held" />
        <Stat label="Paid to sellers" value={fmt(captured)} tone="bg-earned" />
        <Stat label="Back to buyers" value={fmt(returned)} tone="bg-returned" />
        <Stat label="Average payout" value={`${Math.round(avg * 100)}%`} tone="bg-ink" />
        <Stat label="Cheating caught" value={String(caught)} tone="bg-alert" />
      </div>
      <JobsGrid rows={rows} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="panel">
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <span className={`h-2 w-2 rounded-full ${tone}`} />
        {label}
      </div>
      <div className="readout mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
