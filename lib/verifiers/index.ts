// Verifiers collect evidence. Each returns Evidence records with source, provenance and confidence.
import type { Evidence, Photo } from "../types";
import type { ContractT, GuardT, SpeedOutcomeT } from "../contract/schema";
import { newId, sha256 } from "../hash";
import { judgeSide } from "./vision";

const UA = "OutcomePay-Verifier/0.2";

// Timed directly (median of 3 loads) instead of Google PageSpeed: local URLs, and the built-in demo site,
// whose speed is simulated on our own server and would be distorted by PageSpeed's network throttling.
function isLocal(url: string): boolean {
  const u = new URL(url);
  const host = u.hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local") || u.pathname.startsWith("/demo/bakery");
}

function evidence(e: Omit<Evidence, "id" | "capturedAt" | "hash">, raw: unknown): Evidence {
  return { ...e, id: newId("ev"), capturedAt: new Date().toISOString(), hash: sha256(JSON.stringify(raw ?? null)) };
}

async function timedFetch(url: string, timeoutMs = 30_000) {
  const started = performance.now();
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Cache-Control": "no-cache" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  return { status: res.status, text, seconds: (performance.now() - started) / 1000 };
}

function bust(url: string): string {
  const u = new URL(url);
  u.searchParams.set("_op", Date.now().toString(36));
  return u.toString();
}

// web.speed — public URLs: Google PageSpeed Insights (mobile LCP). localhost: median of 3 timed loads.
export async function verifySpeed(o: SpeedOutcomeT): Promise<Evidence> {
  try {
    if (isLocal(o.url)) {
      const runs: number[] = [];
      for (let i = 0; i < 3; i++) runs.push((await timedFetch(bust(o.url))).seconds);
      runs.sort((a, b) => a - b);
      return evidence(
        {
          checks: o.id,
          verifier: "web.speed",
          source: "OutcomePay timing, median of 3 full page loads",
          provenance: "independent_measurement",
          value: Math.round(runs[1] * 100) / 100,
          unit: "s",
          confidence: 0.7,
          note: `Runs: ${runs.map((r) => r.toFixed(2)).join(", ")} s. Local timing; deploy publicly for the Google mobile test.`,
        },
        runs,
      );
    }
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", bust(o.url));
    api.searchParams.set("strategy", "mobile");
    api.searchParams.set("category", "performance");
    if (process.env.PAGESPEED_API_KEY) api.searchParams.set("key", process.env.PAGESPEED_API_KEY);
    const res = await fetch(api, { signal: AbortSignal.timeout(90_000), cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `PageSpeed returned ${res.status}`);
    const lcpMs = json?.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
    if (typeof lcpMs !== "number") throw new Error("PageSpeed response had no LCP value");
    const score = json?.lighthouseResult?.categories?.performance?.score;
    return evidence(
      {
        checks: o.id,
        verifier: "web.speed",
        source: "Google PageSpeed Insights, mobile lab test",
        provenance: "independent_measurement",
        value: Math.round(lcpMs / 10) / 100,
        unit: "s",
        confidence: 0.9,
        note: `Largest Contentful Paint ${(lcpMs / 1000).toFixed(2)} s; performance score ${typeof score === "number" ? Math.round(score * 100) : "n/a"}.`,
      },
      { lcpMs, score, fetchTime: json?.lighthouseResult?.fetchTime },
    );
  } catch (err) {
    return evidence(
      { checks: o.id, verifier: "web.speed", source: "web.speed", provenance: "independent_measurement", value: null, unit: "s", confidence: 0, note: `Could not measure: ${(err as Error).message}` },
      String(err),
    );
  }
}

export async function verifyHttp(g: GuardT): Promise<Evidence> {
  try {
    const { status } = await timedFetch(bust(g.url));
    return evidence(
      { checks: g.id, verifier: "web.http", source: `HTTP check of ${new URL(g.url).pathname}`, provenance: "independent_measurement", value: status, unit: "status", confidence: 1, note: `Returned HTTP ${status}.` },
      { status },
    );
  } catch (err) {
    return evidence(
      { checks: g.id, verifier: "web.http", source: `HTTP check of ${g.url}`, provenance: "independent_measurement", value: null, unit: "status", confidence: 0, note: `Could not reach page: ${(err as Error).message}` },
      String(err),
    );
  }
}

export function countWords(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  return text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

export async function verifyContent(g: GuardT): Promise<Evidence> {
  try {
    const { text } = await timedFetch(bust(g.url));
    const words = countWords(text);
    return evidence(
      { checks: g.id, verifier: "web.content", source: `Word count of ${new URL(g.url).pathname}`, provenance: "independent_measurement", value: words, unit: "words", confidence: 0.95, note: `${words} visible words.` },
      { words, sample: text.slice(0, 2000) },
    );
  } catch (err) {
    return evidence(
      { checks: g.id, verifier: "web.content", source: `Word count of ${g.url}`, provenance: "independent_measurement", value: null, unit: "words", confidence: 0, note: `Could not read page: ${(err as Error).message}` },
      String(err),
    );
  }
}

// Run every outcome and guard, reporting each piece of evidence as soon as it's ready.
export async function collectEvidence(
  contract: ContractT,
  ctx: { jobId: string; photos: Photo[] },
  onEvidence?: (e: Evidence) => void | Promise<void>,
): Promise<Evidence[]> {
  const all: Evidence[] = [];
  const emit = async (items: Evidence | Evidence[]) => {
    for (const e of Array.isArray(items) ? items : [items]) {
      all.push(e);
      await onEvidence?.(e);
    }
  };
  const tasks: Promise<void>[] = [];
  for (const o of contract.outcomes) {
    if (o.verifier === "web.speed") tasks.push(verifySpeed(o).then(emit));
    else {
      tasks.push(judgeSide(ctx.jobId, o, ctx.photos, "seller").then(emit));
      tasks.push(judgeSide(ctx.jobId, o, ctx.photos, "buyer").then(emit));
    }
  }
  for (const g of contract.guards) tasks.push((g.verifier === "web.http" ? verifyHttp(g) : verifyContent(g)).then(emit));
  await Promise.all(tasks);
  return all;
}

// Baseline: only web measurements make sense before work starts.
export async function collectBaseline(contract: ContractT): Promise<Evidence[]> {
  const tasks: Promise<Evidence>[] = [];
  for (const o of contract.outcomes) if (o.verifier === "web.speed") tasks.push(verifySpeed(o));
  for (const g of contract.guards) tasks.push(g.verifier === "web.http" ? verifyHttp(g) : verifyContent(g));
  return Promise.all(tasks);
}
