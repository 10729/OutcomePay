import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Tried in order. If one model fails (free-tier quota, unavailable, timeout), the next one takes over.
const FALLBACKS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
export const MODEL_CHAIN = [MODEL_NAME, ...FALLBACKS].filter((m, i, a) => a.indexOf(m) === i);

export function hasAI(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function model(name: string = MODEL_NAME) {
  return google(name);
}

/** Every AI call gets a time limit, so a slow model falls back instead of hanging the page. */
export function limits(ms = 20_000) {
  return { maxRetries: 0, abortSignal: AbortSignal.timeout(ms) };
}

/** Runs an AI call on the first model in the chain that succeeds. Throws the last error if all fail. */
export async function withModels<T>(run: (m: LanguageModel) => Promise<T>): Promise<{ result: T; name: string }> {
  let last: unknown;
  for (const name of MODEL_CHAIN) {
    try {
      return { result: await run(google(name)), name };
    } catch (err) {
      last = err;
      console.error(`Gemini model ${name} failed:`, (err as Error)?.message ?? err);
    }
  }
  throw last;
}
