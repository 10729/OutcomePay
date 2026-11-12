"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContractDraftT } from "@/lib/contract/schema";
import { CurveView } from "@/components/CurveView";

type SellerLite = { id: string; name: string; skill: "web" | "service"; speciality: string; priceFrom: number };
type Kind = "web" | "service";
type Member = { name: string; email: string; share: number };

const DEFAULTS: Record<Kind, { promise: string; amount: string; buyer: string; seller: string }> = {
  web: { promise: "I'll make your homepage load in 2 seconds or less on mobile.", amount: "300", buyer: "Maya's Bakery", seller: "leo" },
  service: {
    promise: "Move-out clean of the kitchen: clean the oven inside, clear and scrub the sink, wipe the countertop, mop the floor and clean the window. Friendly service guaranteed.",
    amount: "200",
    buyer: "Sam Patel",
    seller: "sparkle",
  },
};

const DEFAULT_TEAM: Member[] = [
  { name: "Rosa (lead cleaner)", email: "rosa.team@example.com", share: 0.5 },
  { name: "Dev (cleaner)", email: "dev.team@example.com", share: 0.3 },
];

export default function NewJobForm({ initialKind, sellers }: { initialKind: Kind; sellers: SellerLite[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [promise, setPromise] = useState(DEFAULTS[initialKind].promise);
  const [url, setUrl] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [draft, setDraft] = useState<ContractDraftT | null>(null);
  const [engine, setEngine] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [amount, setAmount] = useState(DEFAULTS[initialKind].amount);
  const [sellerId, setSellerId] = useState(DEFAULTS[initialKind].seller);
  const [buyer, setBuyer] = useState(DEFAULTS[initialKind].buyer);
  const [deadlineDays, setDeadlineDays] = useState(3);
  const [useTeam, setUseTeam] = useState(initialKind === "service");
  const [team, setTeam] = useState<Member[]>(DEFAULT_TEAM);
  const [busy, setBusy] = useState<"" | "compile" | "create">("");
  const [error, setError] = useState("");

  const options = useMemo(() => sellers.filter((s) => s.skill === kind), [sellers, kind]);
  const teamTotal = team.reduce((s, m) => s + m.share, 0);

  function switchKind(k: Kind) {
    setKind(k);
    setPromise(DEFAULTS[k].promise);
    setAmount(DEFAULTS[k].amount);
    setBuyer(DEFAULTS[k].buyer);
    setSellerId(DEFAULTS[k].seller);
    setUseTeam(k === "service");
    setDraft(null);
    setNotes([]);
    setError("");
  }

  function useDemoSite() {
    setUrl(`${window.location.origin}/demo/bakery`);
    setCheckoutUrl(`${window.location.origin}/demo/bakery/checkout`);
  }

  async function compile() {
    setBusy("compile");
    setError("");
    try {
      const res = await fetch("/api/contracts/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, promise, url, checkoutUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The contract couldn't be written.");
      setDraft(json.draft);
      setEngine(json.engine);
      setNotes(json.notes ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function create() {
    if (!draft) return;
    setBusy("create");
    setError("");
    try {
      const finalDraft = { ...draft, team: useTeam && kind === "service" ? team : undefined };
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: finalDraft, amount, sellerId, buyer, deadlineDays }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The job couldn't be created.");
      router.push(`/jobs/${json.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }

  const removeItem = (id: string) =>
    setDraft((d) =>
      d
        ? { ...d, outcomes: d.outcomes.map((o) => (o.verifier === "vision.checklist" ? { ...o, items: o.items.filter((i) => i.id !== id) } : o)) }
        : d,
    );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="display text-4xl font-extrabold">New outcome job</h1>
        <p className="mt-2 max-w-2xl text-muted">The seller writes a promise. The AI turns it into something that can be measured. Both sides see exactly what each result pays before any money moves.</p>
      </div>

      <div className="inline-flex rounded-lg border border-line bg-panel p-1" role="tablist">
        {(["web", "service"] as Kind[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => switchKind(k)}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${kind === k ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
          >
            {k === "web" ? "Website speed" : "Photo-verified service"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="panel space-y-5">
          <h2 className="text-lg font-semibold">The promise</h2>
          <div>
            <label className="field-label" htmlFor="promise">What the seller will deliver</label>
            <textarea id="promise" className="input min-h-[96px]" value={promise} onChange={(e) => setPromise(e.target.value)} />
          </div>
          {kind === "web" && (
            <>
              <div>
                <label className="field-label" htmlFor="url">Website to improve</label>
                <input id="url" className="input" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
                <button type="button" onClick={useDemoSite} className="mt-2 text-sm font-medium text-returned hover:underline">
                  Use the demo site, Maya&apos;s Bakery
                </button>
              </div>
              <div>
                <label className="field-label" htmlFor="checkout">Checkout page that must keep working</label>
                <input id="checkout" className="input" placeholder="https:// (optional)" value={checkoutUrl} onChange={(e) => setCheckoutUrl(e.target.value)} />
              </div>
            </>
          )}
          <button className="btn-primary w-full" onClick={compile} disabled={busy !== "" || (kind === "web" && !url)}>
            {busy === "compile" ? "Writing the contract…" : "Write the contract"}
          </button>
          {error && <p className="rounded-lg bg-wash-alert p-3 text-sm text-alert">{error}</p>}
        </section>

        <section className="panel space-y-5">
          <h2 className="text-lg font-semibold">The contract</h2>
          {!draft ? (
            <p className="text-muted">The measurable version of the promise appears here: what gets checked, what counts as cheating, and what each result pays.</p>
          ) : (
            <>
              <p className="text-xs text-muted">Written by {engine}</p>
              {draft.outcomes.map((o) =>
                o.verifier === "web.speed" ? (
                  <div key={o.id}>
                    <div className="font-semibold">{o.label}</div>
                    <p className="mb-3 text-sm text-muted">Checked by an independent mobile load test, before and after the work.</p>
                    <CurveView curve={o.curve} />
                  </div>
                ) : (
                  <div key={o.id}>
                    <div className="font-semibold">Checklist, each item pays an equal share</div>
                    <p className="mb-3 text-sm text-muted">AI vision checks each item in photos from the seller and the buyer. The seller&apos;s photos alone can&apos;t release money.</p>
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {o.items.map((it) => (
                        <li key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span>{it.label}</span>
                          <span className="flex items-center gap-3">
                            <span className="readout text-muted">{Math.round(100 / o.items.length)}%</span>
                            {o.items.length > 1 && (
                              <button onClick={() => removeItem(it.id)} className="text-xs text-muted hover:text-alert" aria-label={`Remove ${it.label}`}>Remove</button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
              {draft.guards.length > 0 && (
                <div>
                  <div className="mb-1 font-semibold">Anti-cheating checks</div>
                  <ul className="space-y-1 text-sm">
                    {draft.guards.map((g) => <li key={g.id}>{g.label}</li>)}
                  </ul>
                  <p className="mt-1 text-xs text-muted">If any check fails, the payout drops to {Math.round(draft.guardFailPay * 100)}%.</p>
                </div>
              )}
              {notes.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-paper p-3 text-xs text-muted">
                  {notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="amount">Amount (USD)</label>
                  <input id="amount" className="input readout" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="deadline">Deadline in days</label>
                  <input id="deadline" className="input readout" type="number" min={1} max={29} value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))} />
                </div>
                <div>
                  <label className="field-label" htmlFor="seller">Seller</label>
                  <select id="seller" className="input" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                    {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="buyer">Buyer</label>
                  <input id="buyer" className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
                </div>
              </div>

              {kind === "service" && (
                <div className="rounded-lg border border-line p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={useTeam} onChange={(e) => setUseTeam(e.target.checked)} />
                    Split the earnings with the team through PayPal Payouts
                  </label>
                  {useTeam && (
                    <div className="mt-3 space-y-2">
                      {team.map((m, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_4.5rem] gap-2">
                          <input className="input" value={m.name} aria-label="Name" onChange={(e) => setTeam(team.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                          <input className="input" value={m.email} aria-label="PayPal email" onChange={(e) => setTeam(team.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                          <input
                            className="input readout"
                            aria-label="Share in percent"
                            value={Math.round(m.share * 100)}
                            onChange={(e) => setTeam(team.map((x, j) => (j === i ? { ...x, share: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 } : x)))}
                          />
                        </div>
                      ))}
                      <p className={`text-xs ${teamTotal > 1 ? "text-alert" : "text-muted"}`}>
                        Team gets {Math.round(teamTotal * 100)}% of whatever is earned; the business keeps {Math.max(0, 100 - Math.round(teamTotal * 100))}%.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {deadlineDays > 3 && (
                <p className="rounded-lg bg-wash-held p-3 text-xs text-[#8a5f08]">
                  PayPal honours a hold for 3 days. After that, capturing may need a new authorization, so keep jobs short or split them into milestones.
                </p>
              )}
              <button className="btn-primary w-full" onClick={create} disabled={busy !== "" || (useTeam && teamTotal > 1)}>
                {busy === "create" ? (kind === "web" ? "Measuring the starting point…" : "Creating the job…") : "Approve the contract and create the job"}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
