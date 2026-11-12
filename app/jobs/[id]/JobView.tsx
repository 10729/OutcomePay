"use client";

import { useEffect, useRef, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import type { Decision, Evidence, Job, Photo } from "@/lib/types";
import { CurveView } from "@/components/CurveView";
import { StatusBadge } from "@/components/StatusBadge";
import { Meter, type MeterState } from "@/components/Meter";

type DemoMode = "slow" | "partial" | "fast" | "gamed" | "broken";
const DEMO: { mode: DemoMode; label: string }[] = [
  { mode: "fast", label: "Honest fix" },
  { mode: "partial", label: "Half-done fix" },
  { mode: "gamed", label: "Cheat: delete content" },
  { mode: "broken", label: "Fix that breaks checkout" },
  { mode: "slow", label: "Nothing changed" },
];

type Phase = "evidence" | "decision" | "paypal" | "report";
const PHASES: { id: Phase; label: string }[] = [
  { id: "evidence", label: "Collect independent evidence" },
  { id: "decision", label: "Apply the contract in code" },
  { id: "paypal", label: "Settle on PayPal" },
  { id: "report", label: "Write the settlement report" },
];

const PROVENANCE: Record<Evidence["provenance"], string> = {
  independent_measurement: "Measured by OutcomePay",
  authoritative_third_party: "Trusted third party",
  counterparty_submitted: "Buyer's own evidence",
  self_submitted: "Seller's own evidence",
};

const money = (v?: string | number) => Number(v ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function JobView({ initial, paypalClientId }: { initial: Job; paypalClientId: string }) {
  const [job, setJob] = useState<Job>(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState<DemoMode | null>(null);
  const [run, setRun] = useState<{ phase: Phase | "done" | null; evidence: Evidence[]; decision: Decision | null }>({ phase: null, evidence: [], decision: null });

  const c = job.contract;
  const total = Number(c.amount.value);
  const speed = c.outcomes.find((o) => o.verifier === "web.speed");
  const checklist = c.outcomes.find((o) => o.verifier === "vision.checklist");
  const isDemoSite = speed?.url.includes("/demo/bakery") ?? false;
  const running = run.phase !== null && run.phase !== "done";

  useEffect(() => {
    if (!isDemoSite) return;
    fetch("/api/demo").then((r) => r.json()).then((j) => setDemoMode(j.mode)).catch(() => {});
  }, [isDemoSite]);

  // If the buyer approved in PayPal but this page missed it (tab reloaded or closed), pick the payment up from PayPal.
  useEffect(() => {
    if (job.status !== "awaiting_payment" || !job.paypal.orderId) return;
    fetch(`/api/jobs/${job.id}/authorize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderID: job.paypal.orderId }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.status) setJob(j); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(path: string, label: string, body?: unknown) {
    setBusy(label);
    setError("");
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That didn't work.");
      return json;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function verify() {
    setError("");
    setRun({ phase: "evidence", evidence: [], decision: null });
    try {
      const res = await fetch(`/api/jobs/${job.id}/verify`, { method: "POST" });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Verification couldn't start.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "phase") setRun((r) => ({ ...r, phase: ev.phase }));
          if (ev.type === "evidence") setRun((r) => ({ ...r, evidence: [...r.evidence, ev.evidence] }));
          if (ev.type === "decision") setRun((r) => ({ ...r, decision: ev.decision }));
          if (ev.type === "done") {
            setRun((r) => ({ ...r, phase: "done" }));
            setJob(ev.job);
          }
          if (ev.type === "error") throw new Error(ev.message);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setRun((r) => ({ ...r, phase: "done" }));
      const fresh = await fetch(`/api/jobs/${job.id}`).then((r) => r.json()).catch(() => null);
      if (fresh?.id) setJob(fresh);
    }
  }

  async function setDemo(mode: DemoMode) {
    const r = await post("/api/demo", "demo", { mode });
    if (r) setDemoMode(r.mode);
  }

  const meterState: MeterState =
    job.status === "awaiting_payment" ? "awaiting" : running ? "measuring" : job.status === "held" ? "held" : job.status === "settled" ? "settled" : "voided";
  const earned = job.status === "settled" ? Number(job.paypal.capturedValue ?? 0) : 0;
  const decision = job.decision;
  const evidenceShown = running ? run.evidence : job.evidence;
  const measured = evidenceShown.find((e) => e.checks === speed?.id)?.value ?? null;
  const baselineSpeed = job.baseline.find((e) => e.checks === speed?.id)?.value ?? null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{c.kind === "web" ? "Website speed" : "Photo-verified service"}</span>
            {job.origin === "agent" && <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">Hired by AI agent</span>}
          </div>
          <h1 className="display mt-1 text-4xl font-extrabold">{c.title}</h1>
          <p className="mt-2 text-lg text-muted">&ldquo;{c.promise}&rdquo;</p>
          <p className="mt-2 text-sm">
            <b>{c.seller}</b> for <b>{c.buyer}</b>, due {new Date(c.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </header>

      {error && <div className="rounded-lg border border-alert/30 bg-wash-alert p-3 text-sm text-alert">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* Money first: the meter is the story. */}
          <section className="panel">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">The money</h2>
              <span className="readout text-sm text-muted">{money(total)} contract</span>
            </div>
            <Meter total={total} state={meterState} earned={earned} />
            {decision?.status === "settle" && !running && (job.status === "settled" || job.status === "voided") && (
              <p className="mt-4 text-sm">
                The contract paid <b className="readout">{Math.round(decision.payFraction * 100)}%</b>. {job.status === "voided" ? "PayPal released the whole hold; the buyer was never charged." : `PayPal captured ${money(job.paypal.capturedValue)} for ${c.seller}${Number(job.paypal.releasedValue) > 0 ? ` and released ${money(job.paypal.releasedValue)} to ${c.buyer}` : ""}.`}
              </p>
            )}
          </section>

          {/* Live verification run */}
          {(running || run.phase === "done") && (
            <section className="panel rise" aria-live="polite">
              <h2 className="mb-4 text-lg font-semibold">Verification run</h2>
              <ol className="space-y-2">
                {PHASES.map((p) => {
                  const idx = PHASES.findIndex((x) => x.id === p.id);
                  const cur = run.phase === "done" ? PHASES.length : PHASES.findIndex((x) => x.id === run.phase);
                  const skipped = p.id === "paypal" && run.phase === "done" && run.decision?.status === "hold";
                  const state = skipped ? "skipped" : idx < cur ? "done" : idx === cur ? "now" : "todo";
                  return (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <StepDot state={state} />
                      <span className={state === "todo" || state === "skipped" ? "text-muted" : "font-medium"}>
                        {p.label}
                        {skipped && " (skipped: money stays held)"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {run.evidence.length > 0 && (
                <ul className="mt-5 space-y-2 border-t border-line pt-4">
                  {run.evidence.map((e) => (
                    <li key={e.id} className="rise flex items-start justify-between gap-4 text-sm">
                      <span>
                        <span className="font-medium">{labelFor(job, e.checks)}</span>
                        <span className="block text-xs text-muted">{e.source}</span>
                      </span>
                      <span className="readout shrink-0 text-right">{formatValue(e)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Contract */}
          <section className="panel space-y-5">
            <h2 className="text-lg font-semibold">The contract</h2>
            {speed && (
              <div>
                <div className="font-medium">{speed.label}</div>
                <p className="mb-3 text-sm text-muted">
                  Before the work: <span className="readout">{baselineSpeed ?? "–"} s</span>
                  {measured !== null && <> &middot; after: <span className="readout font-semibold text-ink">{measured} s</span></>}
                </p>
                <CurveView curve={speed.curve} highlight={measured} />
              </div>
            )}
            {checklist && (
              <div>
                <div className="mb-2 font-medium">Checklist, each item pays {Math.round(100 / checklist.items.length)}%</div>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {checklist.items.map((it) => {
                    const r = decision?.outcomes.find((o) => o.id === checklist.id)?.items?.find((x) => x.id === it.id);
                    return (
                      <li key={it.id} className="px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{it.label}</span>
                          {r && <ItemBadge status={r.status} />}
                        </div>
                        {r && <p className="mt-1 text-xs text-muted">{r.detail}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {c.guards.length > 0 && (
              <div>
                <div className="mb-2 font-medium">Anti-cheating checks</div>
                <ul className="space-y-2 text-sm">
                  {c.guards.map((g) => {
                    const r = decision?.guards.find((x) => x.id === g.id);
                    return (
                      <li key={g.id} className="flex items-start gap-2">
                        <GuardDot passed={r ? r.passed : undefined} />
                        <span>
                          {g.label}
                          {r && <span className="block text-xs text-muted">{r.detail}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {decision && decision.reasons.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-paper p-3 text-sm">
                {decision.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            {c.team && c.team.length > 0 && (
              <div className="text-sm">
                <div className="mb-1 font-medium">Team split of earnings</div>
                <ul className="space-y-0.5 text-muted">
                  {c.team.map((m) => <li key={m.email}>{m.name}: {Math.round(m.share * 100)}%</li>)}
                </ul>
              </div>
            )}
          </section>

          {/* Photos for service jobs */}
          {checklist && job.status !== "awaiting_payment" && (
            <PhotoPanel job={job} disabled={job.status !== "held" || busy !== "" || running} onJob={setJob} onError={setError} />
          )}

          {job.evidence.length > 0 && !running && (
            <section className="panel">
              <h2 className="mb-3 text-lg font-semibold">Evidence</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Checks</th>
                      <th className="py-2 pr-4 font-medium">Result</th>
                      <th className="py-2 pr-4 font-medium">Where it came from</th>
                      <th className="py-2 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.evidence.map((e) => (
                      <tr key={e.id} className="border-t border-line align-top">
                        <td className="py-2.5 pr-4 font-medium">{labelFor(job, e.checks)}</td>
                        <td className="readout py-2.5 pr-4">{formatValue(e)}</td>
                        <td className="py-2.5 pr-4">
                          {PROVENANCE[e.provenance]}
                          <span className="block text-xs text-muted">{e.note}</span>
                        </td>
                        <td className="readout py-2.5">{Math.round(e.confidence * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {job.report && !running && (
            <section className="panel">
              <h2 className="mb-2 text-lg font-semibold">Settlement report</h2>
              <p className="whitespace-pre-line leading-relaxed">{job.report}</p>
            </section>
          )}

          <section className="panel">
            <h2 className="mb-3 text-lg font-semibold">Audit trail</h2>
            <ol className="space-y-2 text-sm">
              {job.events.map((e, i) => (
                <li key={i} className="grid grid-cols-[4.5rem_6.5rem_1fr] gap-3">
                  <span className="readout text-xs text-muted">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
                  <span className="text-xs font-semibold text-muted">{e.type.replace(/_/g, " ")}</span>
                  <span>{e.detail}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Actions */}
        <aside className="space-y-6">
          <section className="panel space-y-4">
            {job.status === "awaiting_payment" && (
              <>
                <h2 className="text-lg font-semibold">Buyer: fund the hold</h2>
                <p className="text-sm text-muted">Paying approves this contract. PayPal holds {money(total)}; nothing reaches the seller until the result is checked.</p>
                {paypalClientId ? (
                  <PayPalScriptProvider options={{ clientId: paypalClientId, intent: "authorize", currency: "USD" }}>
                    <PayPalButtons
                      style={{ layout: "vertical", label: "pay", shape: "rect" }}
                      createOrder={async () => {
                        const r = await post(`/api/jobs/${job.id}/order`, "order");
                        if (!r) throw new Error("Could not create the PayPal order");
                        return r.id as string;
                      }}
                      onApprove={async (data) => {
                        const j = await post(`/api/jobs/${job.id}/authorize`, "authorize", { orderID: data.orderID });
                        if (j) setJob(j);
                      }}
                      onError={(err) => setError(String(err))}
                    />
                  </PayPalScriptProvider>
                ) : (
                  <p className="text-sm text-alert">Add NEXT_PUBLIC_PAYPAL_CLIENT_ID to .env.local to show the PayPal button.</p>
                )}
                {job.paypal.orderId && (
                  <button
                    className="w-full text-sm font-medium text-muted hover:text-ink"
                    disabled={busy !== ""}
                    onClick={async () => { const j = await post(`/api/jobs/${job.id}/authorize`, "authorize", { orderID: job.paypal.orderId }); if (j) setJob(j); }}
                  >
                    {busy === "authorize" ? "Checking with PayPal…" : "Already approved in PayPal? Check the payment"}
                  </button>
                )}
              </>
            )}

            {job.status === "held" && (
              <>
                <h2 className="text-lg font-semibold">Seller: deliver, then verify</h2>
                {isDemoSite && (
                  <div>
                    <p className="mb-2 text-sm text-muted">Demo: choose what the seller deploys to Maya&apos;s Bakery.</p>
                    <div className="grid gap-1.5">
                      {DEMO.map((d) => (
                        <button
                          key={d.mode}
                          onClick={() => setDemo(d.mode)}
                          disabled={busy !== "" || running}
                          aria-pressed={demoMode === d.mode}
                          className={`btn-quiet !justify-start ${demoMode === d.mode ? "border-ink bg-paper" : ""}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${demoMode === d.mode ? "bg-ink" : "bg-line"}`} />
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <a href="/demo/bakery" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-returned hover:underline">Open the bakery site</a>
                  </div>
                )}
                {checklist && <p className="text-sm text-muted">Add the seller&apos;s and the buyer&apos;s photos, then verify.</p>}
                <button className="btn-earned w-full" onClick={verify} disabled={busy !== "" || running}>
                  {running ? "Verifying…" : "Verify the result and settle"}
                </button>
                {decision?.status === "hold" && decision.conflicts.length > 0 && !running && (
                  <div className="space-y-2 rounded-lg bg-wash-held p-3 text-sm">
                    <p className="font-semibold">The photos disagree.</p>
                    <ul className="list-disc pl-5 text-xs">
                      {decision.conflicts.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                    <p className="text-xs">Buyer decides. The money stays held until you choose.</p>
                    <button className="btn-quiet w-full" disabled={busy !== ""} onClick={async () => { const j = await post(`/api/jobs/${job.id}/resolve`, "resolve", { action: "pay_verified" }); if (j) setJob(j); }}>
                      Pay only the verified items
                    </button>
                    <button className="btn-quiet w-full" disabled={busy !== ""} onClick={async () => { const j = await post(`/api/jobs/${job.id}/resolve`, "resolve", { action: "release_all" }); if (j) setJob(j); }}>
                      Release the whole hold
                    </button>
                  </div>
                )}
                <button
                  className="w-full text-sm font-medium text-muted hover:text-alert"
                  disabled={busy !== "" || running}
                  onClick={async () => { const j = await post(`/api/jobs/${job.id}/void`, "void"); if (j) setJob(j); }}
                >
                  Deadline missed: release the hold
                </button>
              </>
            )}

            {(job.status === "settled" || job.status === "voided") && (
              <>
                <h2 className="text-lg font-semibold">{job.status === "settled" ? "Settled on PayPal" : "Hold released"}</h2>
                <dl className="space-y-1 text-sm">
                  {job.paypal.captureId && <Row k="Capture" v={job.paypal.captureId} />}
                  {job.paypal.refundId && <Row k="Refund" v={job.paypal.refundId} />}
                  {job.paypal.authorizationId && <Row k="Authorization" v={job.paypal.authorizationId} />}
                </dl>
              </>
            )}
          </section>

          {job.status === "settled" && c.team && c.team.length > 0 && (
            <section className="panel space-y-3">
              <h2 className="text-lg font-semibold">Team payouts</h2>
              {job.paypal.payouts?.length ? (
                <>
                  <ul className="space-y-1 text-sm">
                    {job.paypal.payouts.map((p) => (
                      <li key={p.email} className="flex justify-between gap-2"><span>{p.name}</span><span className="readout">{money(p.amount)}</span></li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted">PayPal Payouts batch {job.paypal.payoutBatchId}, {job.paypal.payoutStatus?.toLowerCase()}.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">The team payout hasn&apos;t gone through. Turn on Payouts for the sandbox app, then try again.</p>
                  <button className="btn-quiet w-full" disabled={busy !== ""} onClick={async () => { const j = await post(`/api/jobs/${job.id}/payout`, "payout"); if (j) setJob(j); }}>
                    Send team payouts
                  </button>
                </>
              )}
            </section>
          )}

          {job.paypal.captureId && (
            <section className="panel space-y-3">
              <h2 className="text-lg font-semibold">Disputes</h2>
              <p className="text-sm text-muted">If the buyer opens a PayPal dispute, answer it with this job&apos;s evidence.</p>
              <button
                className="btn-quiet w-full"
                disabled={busy !== ""}
                onClick={async () => {
                  setBusy("disputes");
                  setError("");
                  const res = await fetch(`/api/jobs/${job.id}/disputes`);
                  const j = await res.json();
                  setBusy("");
                  if (!res.ok) setError(j.error ?? "Couldn't check disputes.");
                  else setJob(j);
                }}
              >
                {busy === "disputes" ? "Checking PayPal…" : "Check for disputes"}
              </button>
              {job.disputes?.map((d) => (
                <div key={d.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex justify-between gap-2"><span className="font-medium">{d.reason.replace(/_/g, " ").toLowerCase()}</span><span className="readout">{money(d.amount)}</span></div>
                  <div className="text-xs text-muted">{d.id}, {d.status.replace(/_/g, " ").toLowerCase()}</div>
                  {d.evidenceSentAt ? (
                    <p className="mt-2 text-xs text-earned">Evidence sent {new Date(d.evidenceSentAt).toLocaleString()}</p>
                  ) : (
                    <button className="btn-primary mt-2 w-full" disabled={busy !== ""} onClick={async () => { const j = await post(`/api/jobs/${job.id}/disputes`, "evidence", { disputeId: d.id }); if (j) setJob(j); }}>
                      Send the evidence report
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}

          {job.agent && (
            <section className="panel space-y-2 text-sm">
              <h2 className="text-lg font-semibold">Approved with a passkey</h2>
              <p className="text-muted">Goal: &ldquo;{job.agent.goal}&rdquo;</p>
              <p>{job.agent.reasoning}</p>
              <p className="text-xs text-muted">Signed {new Date(job.agent.approvedAt).toLocaleString()} by passkey {job.agent.credentialId.slice(0, 10)}…, over the exact contract hash below. Agent: {job.agent.engine}.</p>
            </section>
          )}

          <section className="panel space-y-2 text-xs text-muted">
            <div className="text-sm font-semibold text-ink">Contract fingerprint</div>
            <p className="readout break-all">{job.contractHash}</p>
            <p>SHA-256 of the contract, stored in the PayPal order. Any change to the contract changes this value.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function labelFor(job: Job, checks: string): string {
  const [oid, iid, side] = checks.split(":");
  const o = job.contract.outcomes.find((x) => x.id === oid);
  if (o?.verifier === "vision.checklist" && iid) {
    const it = o.items.find((x) => x.id === iid);
    return `${it?.label ?? iid}, ${side === "buyer" ? "buyer's photo" : "seller's photo"}`;
  }
  if (o) return "Mobile load time";
  return job.contract.guards.find((g) => g.id === checks)?.label ?? checks;
}

function formatValue(e: Evidence): string {
  if (e.value === null) return "not measured";
  if (e.unit === "done") return e.value === 1 ? "done" : "not done";
  if (e.unit === "status") return `HTTP ${e.value}`;
  if (e.unit === "words") return `${e.value} words`;
  return `${e.value} ${e.unit}`;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="readout truncate">{v}</dd>
    </div>
  );
}

function StepDot({ state }: { state: "done" | "now" | "todo" | "skipped" }) {
  if (state === "done") return <span className="grid h-5 w-5 place-items-center rounded-full bg-earned text-[11px] text-white">✓</span>;
  if (state === "now") return <span className="h-5 w-5 animate-spin rounded-full border-2 border-held border-t-transparent" />;
  return <span className="h-5 w-5 rounded-full border-2 border-line" />;
}

function GuardDot({ passed }: { passed?: boolean | null }) {
  const cls = passed === undefined ? "bg-line" : passed === null ? "bg-held" : passed ? "bg-earned" : "bg-alert";
  return <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} aria-label={passed === undefined ? "not checked yet" : passed ? "passed" : passed === null ? "not checked" : "failed"} />;
}

function ItemBadge({ status }: { status: "verified" | "not_done" | "conflict" | "unverified" }) {
  const map = {
    verified: ["Verified", "bg-wash-earned text-earned"],
    not_done: ["Not done", "bg-wash-alert text-alert"],
    conflict: ["Photos disagree", "bg-wash-held text-[#8a5f08]"],
    unverified: ["Not confirmed", "bg-[#E9ECEF] text-muted"],
  } as const;
  const [label, cls] = map[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function PhotoPanel({ job, disabled, onJob, onError }: { job: Job; disabled: boolean; onJob: (j: Job) => void; onError: (m: string) => void }) {
  const [uploading, setUploading] = useState("");
  const sellerRef = useRef<HTMLInputElement>(null);
  const buyerRef = useRef<HTMLInputElement>(null);

  async function sendDemo(demo: string) {
    setUploading(demo);
    try {
      const res = await fetch(`/api/jobs/${job.id}/photos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      onJob(j);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading("");
    }
  }

  async function sendFiles(side: "seller" | "buyer", files: FileList | null) {
    if (!files?.length) return;
    setUploading(side);
    try {
      const form = new FormData();
      form.set("side", side);
      form.set("stage", "after");
      Array.from(files).forEach((f) => form.append("files", f));
      const res = await fetch(`/api/jobs/${job.id}/photos`, { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      onJob(j);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading("");
    }
  }

  const side = (s: Photo["side"]) => job.photos.filter((p) => p.side === s);

  return (
    <section className="panel space-y-5">
      <h2 className="text-lg font-semibold">Photos</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {(["seller", "buyer"] as const).map((s) => (
          <div key={s} className="space-y-3">
            <div>
              <div className="font-medium">{s === "seller" ? "Seller's photos" : "Buyer's photos"}</div>
              <p className="text-xs text-muted">{s === "seller" ? "Self-submitted: never enough on its own." : "The buyer's own check of the finished work."}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {side(s).map((p) => (
                <figure key={p.id} className="overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`${s === "seller" ? "Seller" : "Buyer"} photo, ${p.stage}`} className="aspect-[3/2] w-full object-cover" />
                  <figcaption className="px-2 py-1 text-xs text-muted">{p.stage}</figcaption>
                </figure>
              ))}
              {side(s).length === 0 && <div className="col-span-2 rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">No photos yet</div>}
            </div>
            <input ref={s === "seller" ? sellerRef : buyerRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => sendFiles(s, e.target.files)} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-quiet" disabled={disabled || uploading !== ""} onClick={() => (s === "seller" ? sellerRef : buyerRef).current?.click()}>
                {uploading === s ? "Uploading…" : "Upload photos"}
              </button>
              {s === "seller" ? (
                <>
                  <button className="btn-quiet" disabled={disabled || uploading !== ""} onClick={() => sendDemo("seller-honest")}>Demo: honest photos</button>
                  <button className="btn-quiet" disabled={disabled || uploading !== ""} onClick={() => sendDemo("seller-claims-all")}>Demo: claims all done</button>
                </>
              ) : (
                <button className="btn-quiet" disabled={disabled || uploading !== ""} onClick={() => sendDemo("buyer")}>Demo: buyer&apos;s photo</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Demo photos are labelled illustrations. Photo hashes are recorded in the audit trail.</p>
    </section>
  );
}
