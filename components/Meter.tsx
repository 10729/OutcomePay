// The settlement meter: the held amount as one bar that splits into "to seller" and "back to buyer".
export type MeterState = "awaiting" | "held" | "measuring" | "settled" | "voided";

export function Meter({
  total,
  state,
  earned = 0,
  size = "lg",
}: {
  total: number;
  state: MeterState;
  earned?: number;
  size?: "lg" | "sm";
}) {
  const settled = state === "settled" || state === "voided";
  const earnedPct = settled && total > 0 ? (earned / total) * 100 : 0;
  const returned = Math.max(0, total - earned);
  const h = size === "lg" ? "h-10" : "h-3";
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div>
      <div className={`relative ${h} w-full overflow-hidden rounded-lg bg-[#E4E9E3]`} role="img" aria-label={label(state, earned, returned, fmt)}>
        {/* held layer */}
        <div
          className={`absolute inset-y-0 left-0 rounded-lg bg-held transition-all duration-700 ${state === "awaiting" ? "w-0" : "w-full"} ${
            state === "measuring" ? "animate-pulse" : ""
          } ${settled ? "opacity-0" : "opacity-100"}`}
        />
        {/* settled layers */}
        <div className="absolute inset-y-0 left-0 flex w-full gap-[3px]">
          <div className="h-full rounded-l-lg bg-earned transition-[width] duration-1000 ease-out" style={{ width: settled ? `${earnedPct}%` : "0%" }} />
          <div
            className="h-full flex-1 rounded-r-lg bg-returned transition-opacity duration-1000"
            style={{ opacity: settled && earnedPct < 100 ? 1 : 0, borderTopLeftRadius: earnedPct === 0 ? 8 : 0, borderBottomLeftRadius: earnedPct === 0 ? 8 : 0 }}
          />
        </div>
      </div>
      {size === "lg" && (
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <Readout tone="held" label="Held by PayPal" value={state === "held" || state === "measuring" ? fmt(total) : fmt(0)} />
          <Readout tone="earned" label="To seller" value={fmt(settled ? earned : 0)} />
          <Readout tone="returned" label="Back to buyer" value={fmt(settled ? returned : 0)} />
        </div>
      )}
    </div>
  );
}

function label(state: MeterState, earned: number, returned: number, fmt: (n: number) => string) {
  if (state === "awaiting") return "Not paid yet";
  if (state === "held" || state === "measuring") return "Money held by PayPal";
  return `${fmt(earned)} to seller, ${fmt(returned)} back to buyer`;
}

function Readout({ tone, label, value }: { tone: "held" | "earned" | "returned"; label: string; value: string }) {
  const dot = { held: "bg-held", earned: "bg-earned", returned: "bg-returned" }[tone];
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="readout mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}
