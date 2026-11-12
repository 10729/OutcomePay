// vision.checklist: AI vision judges each checklist item from the photos of ONE side.
// Run once on the seller's photos (self-submitted) and once on the buyer's (counterparty).
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateObject } from "ai";
import { z } from "zod";
import { hasAI, limits, withModels } from "../ai";
import type { ChecklistOutcomeT } from "../contract/schema";
import type { Evidence, Photo } from "../types";
import { newId, sha256 } from "../hash";
import { UPLOAD_DIR } from "../store";

const VisionResult = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      done: z.boolean().nullable(), // null = not visible in the photos
      confidence: z.number().min(0).max(1),
      observation: z.string(),
    }),
  ),
});

const SYSTEM = `You are an impartial inspector checking whether a job was done, using only the photos provided.
For each checklist item: done = true if the photos clearly show it completed, false if they clearly show it is not, null if it is not visible.
Visible stains, grime, debris, dirty dishes or clutter mean the item is not done.
confidence is 0..1. observation is one short factual sentence about what you see. Never guess beyond the photos.`;

export async function judgeSide(
  jobId: string,
  outcome: ChecklistOutcomeT,
  photos: Photo[],
  side: "seller" | "buyer",
): Promise<Evidence[]> {
  const after = photos.filter((p) => p.side === side && p.stage === "after");
  const provenance = side === "seller" ? "self_submitted" : "counterparty_submitted";
  const who = side === "seller" ? "Seller's photos" : "Buyer's photos";

  const missing = (note: string): Evidence[] =>
    outcome.items.map((it) => ({
      id: newId("ev"),
      checks: `${outcome.id}:${it.id}:${side}`,
      verifier: "vision.checklist",
      source: `${who}, AI vision`,
      provenance,
      capturedAt: new Date().toISOString(),
      value: null,
      unit: "done",
      confidence: 0,
      note,
      hash: sha256(note),
    }));

  if (!after.length) return missing(`No "after" photos from the ${side}.`);
  if (!hasAI()) return missing("AI vision is not configured (set GOOGLE_GENERATIVE_AI_API_KEY).");

  try {
    const images = await Promise.all(
      after.map(async (p) => ({ type: "image" as const, image: await fs.readFile(path.join(UPLOAD_DIR, jobId, p.file)) })),
    );
    const list = outcome.items.map((it) => `- ${it.id}: ${it.label}`).join("\n");
    const { result: { object }, name: usedModel } = await withModels((m) => generateObject({ ...limits(30_000),
      model: m,
      schema: VisionResult,
      system: SYSTEM,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `Checklist:\n${list}\n\nThe photos below were taken after the job.` }, ...images],
        },
      ],
    }));
    const photoHashes = after.map((p) => p.hash).join(",");
    return outcome.items.map((it) => {
      const r = object.items.find((x) => x.id === it.id);
      const value = r?.done === true ? 1 : r?.done === false ? 0 : null;
      return {
        id: newId("ev"),
        checks: `${outcome.id}:${it.id}:${side}`,
        verifier: "vision.checklist",
        source: `${who}, AI vision (${usedModel})`,
        provenance,
        capturedAt: new Date().toISOString(),
        value,
        unit: "done",
        confidence: r?.confidence ?? 0,
        note: r?.observation ?? "Item not assessed.",
        hash: sha256(`${photoHashes}|${JSON.stringify(r ?? null)}`),
      } satisfies Evidence;
    });
  } catch (err) {
    return missing(`AI vision failed: ${(err as Error).message}`);
  }
}
