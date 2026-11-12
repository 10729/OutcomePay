import { listJobs } from "@/lib/store";
import { reputation, SELLERS } from "@/lib/sellers";

export const dynamic = "force-dynamic";

export default async function SellersPage() {
  const jobs = await listJobs();
  const reps = SELLERS.map((s) => reputation(s, jobs)).sort((a, b) => b.avgPayout - a.avgPayout);
  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <h1 className="display text-4xl font-extrabold">Sellers, ranked by results</h1>
        <p className="mt-2 text-muted">
          Reputation here is built only from verified outcomes: how much of the held money each seller actually earned, how often they delivered in full, and how often
          an anti-cheating check caught them. No star ratings.
        </p>
      </div>

      <div className="overflow-x-auto rounded-panel border border-line bg-panel">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Seller</th>
              <th className="px-4 py-3 font-medium">Average earned</th>
              <th className="px-4 py-3 text-right font-medium">Full deliveries</th>
              <th className="px-4 py-3 text-right font-medium">Cheating caught</th>
              <th className="px-4 py-3 text-right font-medium">Verified jobs</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.seller.id} className="border-t border-line first:border-t-0">
                <td className="px-4 py-4">
                  <div className="font-semibold">{r.seller.name}</div>
                  <div className="text-xs text-muted">{r.seller.speciality}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-40 rounded-full bg-[#E4E9E3]">
                      <div className="h-2 rounded-full bg-earned" style={{ width: `${r.avgPayout * 100}%` }} />
                    </div>
                    <span className="readout">{Math.round(r.avgPayout * 100)}%</span>
                  </div>
                </td>
                <td className="readout px-4 py-4 text-right">{Math.round(r.fullRate * 100)}%</td>
                <td className={`readout px-4 py-4 text-right ${r.guardFails > 0 ? "text-alert" : ""}`}>{r.guardFails}</td>
                <td className="readout px-4 py-4 text-right">
                  {r.jobs}
                  {r.liveJobs > 0 && <span className="block text-xs text-muted">{r.liveJobs} live</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Counts include seeded demo history for each seller, plus every job settled in this app.</p>
    </div>
  );
}
