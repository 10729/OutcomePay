"use client";

import { useEffect, useState } from "react";
import { Meter, type MeterState } from "./Meter";

// One orchestrated moment on the home page: a job is held, measured, and split.
export function HeroMeter() {
  const [state, setState] = useState<MeterState>("awaiting");
  const [reading, setReading] = useState(6.8);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setReading(2.21);
      setState("settled");
      return;
    }
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setState("held"), 500));
    timers.push(
      window.setTimeout(() => {
        setState("measuring");
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / 1600);
          setReading(6.8 - (6.8 - 2.21) * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
          else window.setTimeout(() => setState("settled"), 350);
        };
        requestAnimationFrame(tick);
      }, 1500),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const settled = state === "settled";
  return (
    <div className="panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted">Maya&apos;s Bakery hires Leo</div>
          <div className="mt-0.5 font-semibold">&ldquo;Homepage loads in 2 s or less on mobile&rdquo;</div>
        </div>
        <div className="readout text-lg font-semibold">$300.00</div>
      </div>

      <div className="my-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-muted">Measured load time</div>
          <div className="readout text-5xl font-semibold tracking-tight">
            {state === "awaiting" || state === "held" ? "6.80" : reading.toFixed(2)}
            <span className="ml-1 text-2xl text-muted">s</span>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-muted">Contract pays</div>
          <div className="readout text-2xl font-semibold">{settled ? "60%" : "–"}</div>
        </div>
      </div>

      <Meter total={300} state={state} earned={180} />

      <p className="mt-4 min-h-[2.5rem] text-sm text-muted">
        {state === "awaiting" && "Waiting for the buyer to pay."}
        {state === "held" && "PayPal holds $300. Leo can see the money is real."}
        {state === "measuring" && "Leo deploys his fix. An independent test measures the homepage."}
        {settled && "2.21 s is inside the 2.4 s band, which pays 60%. PayPal captures $180 and releases $120 to Maya."}
      </p>
    </div>
  );
}
