import Link from "next/link";
import { listJobs } from "@/lib/store";
import { StatusBadge } from "@/components/StatusBadge";
import { HeroMeter } from "@/components/HeroMeter";

export const dynamic = "force-dynamic";

const WAYS = [
  {
    href: "/new?kind=web",
    title: "Website speed",
    body: "A developer promises a load time. The homepage is measured independently before and after, and anti-cheating checks make sure nothing was deleted or broken to get there.",
    action: "Create a speed job",
  },
  {
    href: "/new?kind=service",
    title: "Photo-verified service",
    body: "A cleaner, painter or repairer works from a checklist. AI vision checks every item in photos from both sides, so partial work earns partial pay and a seller's photo alone never releases money.",
    action: "Create a service job",
  },
  {
    href: "/agent",
    title: "Let an AI agent hire for you",
    body: "Describe the result you want and a budget. The agent picks a seller by verified track record and drafts the contract. Nothing is funded until you approve with your fingerprint.",
    action: "Ask the agent",
  },
];

export default async function Home() {
  const jobs = (await listJobs()).slice(0, 8);
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="display text-5xl font-extrabold sm:text-6xl lg:text-7xl">Pay for what works.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            OutcomePay turns a seller&apos;s promise into a measurable contract. PayPal holds the buyer&apos;s money, independent checks measure the result,
            and the seller is paid exactly the share they delivered. The rest goes back to the buyer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/new" className="btn-primary">Create a job</Link>
            <Link href="/agent" className="btn-quiet">Let an agent hire for you</Link>
          </div>
        </div>
        <HeroMeter />
      </section>

      <section>
        <h2 className="display text-2xl font-bold">Three ways to use it</h2>
        <div className="mt-5 divide-y divide-line border-y border-line">
          {WAYS.map((w) => (
            <div key={w.href} className="grid gap-4 py-6 md:grid-cols-[14rem_1fr_auto] md:items-center">
              <h3 className="text-lg font-semibold">{w.title}</h3>
              <p className="max-w-2xl text-muted">{w.body}</p>
              <Link href={w.href} className="btn-quiet justify-self-start">{w.action}</Link>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="display text-2xl font-bold">Recent jobs</h2>
          <Link href="/dashboard" className="text-sm font-medium text-muted hover:text-ink">Open the dashboard</Link>
        </div>
        {jobs.length === 0 ? (
          <p className="mt-4 text-muted">No jobs yet. Create the first one to see money held, measured and split.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-panel border border-line bg-panel">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Job</th>
                  <th className="px-4 py-3 font-medium">Seller</th>
                  <th className="px-4 py-3 text-right font-medium">Held</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t border-line first:border-t-0 hover:bg-paper">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${j.id}`} className="font-semibold hover:underline">{j.contract.title}</Link>
                      <div className="text-xs text-muted">{j.origin === "agent" ? "Hired by AI agent" : j.contract.kind === "web" ? "Website speed" : "Photo-verified service"}</div>
                    </td>
                    <td className="px-4 py-3">{j.contract.seller}</td>
                    <td className="readout px-4 py-3 text-right">${j.contract.amount.value}</td>
                    <td className="readout px-4 py-3 text-right">{j.decision?.status === "settle" ? `${Math.round(j.decision.payFraction * 100)}%` : "–"}</td>
                    <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
