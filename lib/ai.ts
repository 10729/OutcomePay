import { google } from "@ai-sdk/google";

export const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export function hasAI(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function model() {
  return google(MODEL_NAME);
}

/** Every AI call gets a time limit and one retry, so a slow model falls back instead of hanging the page. */
export function limits(ms = 25_000) {
  return { maxRetries: 1, abortSignal: AbortSignal.timeout(ms) };
}
