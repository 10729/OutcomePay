import { createHash, randomBytes } from "node:crypto";

// Stable JSON: sorted keys, so the same contract always hashes the same.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}
