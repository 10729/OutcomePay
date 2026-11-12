"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import type { ContractT } from "@/lib/contract/schema";
import { CurveView } from "@/components/CurveView";

type Candidate = { id: string; name: string; speciality: string; priceFrom: number; jobs: number; avgPayoutPct: number; fullDeliveryPct: number; guardFails: number };
type Proposal = { id: string; goal: string; reasoning: string; engine: string; sellerId: string; amount: string; contract: ContractT; hash: string };

export default function AgentPage() {
  const router = useRouter();
  const [goal, setGoal] = useState("Get my bakery's homepage loading in under 2 seconds on mobile. Only pay if it actually works.");
  const [budget, setBudget] = useState(300);
  const [url, setUrl] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState<"" | "plan" | "register" | "approve">("");
  const [error, setError] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/demo/bakery`);
    setSupported(browserSupportsWebAuthn());
    fetch("/api/passkey/register").then((r) => r.json()).then((j) => setRegistered(j.registered)).catch(() => setRegistered(false));
  }, []);

  async function plan() {
    setBusy("plan");
    setError("");
    setProposal(null);
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, budget, buyer: "Maya's Bakery", url, checkoutUrl: url.replace(/\/?$/, "/checkout") }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "The agent couldn't make a plan.");
      setProposal(j.proposal);
      setCandidates(j.candidates);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function register() {
    setBusy("register");
    setError("");
    try {
      const options = await fetch("/api/passkey/register", { method: "POST" }).then((r) => r.json());
      if (options.error) throw new Error(options.error);
      const response = await startRegistration({ optionsJSON: options });
      const res = await fetch("/api/passkey/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setRegistered(true);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy("");
    }
  }

  async function approve() {
    if (!proposal) return;
    setBusy("approve");
    setError("");
    try {
      const optRes = await fetch("/api/passkey/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId: proposal.id }) });
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error);
      const response = await startAuthentication({ optionsJSON: options });
      const res = await fetch("/api/passkey/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId: proposal.id, response }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      router.push(`/jobs/${j.jobId}`);
    } catch (e) {
      setError(friendly(e));
      setBusy("");
    }
  }

  const speed = proposal?.contract.outcomes.find((o) => o.verifier === "web.speed");
  const chosen = candidates.find((c) => c.id === proposal?.sellerId);

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <h1 className="display text-4xl font-extrabold">Let an agent hire for you</h1>
        <p className="mt-2 text-muted">
          The agent chooses a seller by their verified track record and writes the contract. It can&apos;t spend anything: you approve the exact contract with your
          fingerprint, Face ID or device PIN, then fund it with PayPal. And even then, money only moves for verified results.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="panel space-y-4">
          <h2 className="text-lg font-semibold">Your goal</h2>
          <div>
            <label className="field-label" htmlFor="goal">What you want done</label>
            <textarea id="goal" className="input min-h-[96px]" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div>
              <label className="field-label" htmlFor="budget">Budget (USD)</label>
              <input id="budget" className="input readout" type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
            <div>
              <label className="field-label" htmlFor="site">Website</label>
              <input id="site" className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary w-full" onClick={plan} disabled={busy !== "" || !url}>
            {busy === "plan" ? "The agent is comparing sellers…" : "Ask the agent"}
          </button>
          {error && <p className="rounded-lg bg-wash-alert p-3 text-sm text-alert">{error}</p>}
        </section>

        <section className="panel space-y-5">
          <h2 className="text-lg font-semibold">The agent&apos;s proposal</h2>
          {!proposal ? (
            <p className="text-muted">The agent&apos;s choice, its reasons, and the contract it drafted appear here.</p>
          ) : (
            <>
              <div className="rise">
                <div className="text-sm text-muted">Recommended seller</div>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="display text-2xl font-bold">{chosen?.name}</div>
                  <div className="readout text-xl font-semibold">${proposal.amount}</div>
                </div>
                <p className="mt-2">{proposal.reasoning}</p>
                <p className="mt-1 text-xs text-muted">Chosen by {proposal.engine}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Seller</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Avg. earned</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Full deliveries</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Cheating caught</th>
                      <th className="py-1.5 text-right font-medium">From</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.id} className={`border-t border-line ${c.id === proposal.sellerId ? "font-semibold" : ""}`}>
                        <td className="py-2 pr-3">{c.name}</td>
                        <td className="readout py-2 pr-3 text-right">{c.avgPayoutPct}%</td>
                        <td className="readout py-2 pr-3 text-right">{c.fullDeliveryPct}%</td>
                        <td className="readout py-2 pr-3 text-right">{c.guardFails}</td>
                        <td className="readout py-2 text-right">${c.priceFrom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {speed && speed.verifier === "web.speed" && (
                <div>
                  <div className="mb-2 font-medium">{speed.label}</div>
                  <CurveView curve={speed.curve} />
                </div>
              )}

              <div className="rounded-lg bg-paper p-3 text-xs text-muted">
                <div className="mb-1 font-semibold text-ink">You are signing this contract fingerprint</div>
                <p className="readout break-all">{proposal.hash}</p>
              </div>

              {!supported ? (
                <p className="text-sm text-alert">This browser doesn&apos;t support passkeys. Try Chrome, Edge or Safari.</p>
              ) : registered ? (
                <button className="btn-earned w-full" onClick={approve} disabled={busy !== ""}>
                  {busy === "approve" ? "Waiting for your fingerprint…" : "Approve with passkey"}
                </button>
              ) : (
                <button className="btn-primary w-full" onClick={register} disabled={busy !== ""}>
                  {busy === "register" ? "Waiting for your device…" : "Set up a passkey to approve"}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function friendly(e: unknown): string {
  const err = e as Error;
  if (err?.name === "NotAllowedError") return "The passkey prompt was closed or timed out. Try again.";
  return err?.message ?? String(e);
}
