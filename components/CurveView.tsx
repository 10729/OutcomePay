import type { CurveStepT } from "@/lib/contract/schema";

// The payout curve: each row is a result band and what it pays. The measured band is marked.
export function CurveView({ curve, highlight }: { curve: CurveStepT[]; highlight?: number | null }) {
  const hit = typeof highlight === "number" ? curve.findIndex((s) => s.maxValue === null || highlight <= s.maxValue) : -1;
  return (
    <div className="space-y-1.5">
      {curve.map((s, i) => (
        <div key={i} className={`grid grid-cols-[8.5rem_1fr_3rem] items-center gap-3 rounded-md px-2 py-1.5 text-sm ${i === hit ? "bg-wash-earned" : ""}`}>
          <span className={i === hit ? "font-semibold" : "text-muted"}>{s.maxValue === null ? "Slower than that" : `${s.maxValue} s or less`}</span>
          <div className="h-2 rounded-full bg-[#E4E9E3]">
            <div className={`h-2 rounded-full ${i === hit ? "bg-earned" : "bg-ink/70"}`} style={{ width: `${s.pay * 100}%` }} />
          </div>
          <span className="readout text-right">{Math.round(s.pay * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
