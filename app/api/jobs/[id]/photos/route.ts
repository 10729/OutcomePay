// Upload photos for a photo-verified job: real files (multipart) or a demo photo set.
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { addEvent, getJob, putJob, UPLOAD_DIR } from "@/lib/store";
import { newId, sha256 } from "@/lib/hash";
import type { Photo } from "@/lib/types";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const DEMO_SETS: Record<string, { side: Photo["side"]; stage: Photo["stage"]; file: string }[]> = {
  "seller-honest": [
    { side: "seller", stage: "before", file: "clean-before.png" },
    { side: "seller", stage: "after", file: "clean-after-seller.png" },
  ],
  "seller-claims-all": [
    { side: "seller", stage: "before", file: "clean-before.png" },
    { side: "seller", stage: "after", file: "clean-after-seller-claims-all.png" },
  ],
  buyer: [{ side: "buyer", stage: "after", file: "clean-after-buyer.png" }],
};

async function store(jobId: string, bytes: Buffer, ext: string, side: Photo["side"], stage: Photo["stage"]): Promise<Photo> {
  const dir = path.join(UPLOAD_DIR, jobId);
  await fs.mkdir(dir, { recursive: true });
  const id = newId("ph");
  const file = `${id}.${ext}`;
  await fs.writeFile(path.join(dir, file), bytes);
  return { id, file, url: `/api/files/${jobId}/${file}`, side, stage, uploadedAt: new Date().toISOString(), hash: sha256(bytes.toString("base64")) };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.contract.kind !== "service") throw new Error("Photos are only used for photo-verified jobs.");
    if (job.status !== "held") throw new Error("Photos can be added once the payment is held.");

    const added: Photo[] = [];
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const { demo } = (await req.json()) as { demo?: string };
      const set = demo ? DEMO_SETS[demo] : undefined;
      if (!set) throw new Error("Unknown demo photo set.");
      for (const s of set) {
        const bytes = await fs.readFile(path.join(process.cwd(), "public", "demo", s.file));
        added.push(await store(job.id, bytes, "png", s.side, s.stage));
      }
    } else {
      const form = await req.formData();
      const side = form.get("side") === "buyer" ? "buyer" : "seller";
      const stage = form.get("stage") === "before" ? "before" : "after";
      for (const f of form.getAll("files")) {
        if (!(f instanceof File)) continue;
        const ext = TYPES[f.type];
        if (!ext) throw new Error(`${f.name}: use a PNG, JPEG or WebP image.`);
        if (f.size > MAX_BYTES) throw new Error(`${f.name}: images must be under 6 MB.`);
        added.push(await store(job.id, Buffer.from(await f.arrayBuffer()), ext, side, stage));
      }
    }
    if (!added.length) throw new Error("No photos received.");

    // A new upload from a side replaces that side's earlier photos for the same stage.
    for (const p of added) job.photos = job.photos.filter((x) => !(x.side === p.side && x.stage === p.stage && !added.includes(x)));
    job.photos.push(...added);
    const side = added[0].side === "seller" ? "Seller" : "Buyer";
    addEvent(job, "photos", `${side} added ${added.length} photo${added.length > 1 ? "s" : ""} (${added.map((p) => p.stage).join(", ")}). Hashes recorded.`);
    await putJob(job);
    return NextResponse.json(job);
  } catch (err) {
    return fail(err);
  }
}
