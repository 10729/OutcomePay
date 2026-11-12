import { promises as fs } from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/store";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: { job: string; file: string } }) {
  if (!/^job_[a-f0-9]+$/.test(params.job) || !/^ph_[a-f0-9]+\.(png|jpg|webp)$/.test(params.file)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const bytes = await fs.readFile(path.join(UPLOAD_DIR, params.job, params.file));
    const ext = params.file.split(".").pop()!;
    return new Response(bytes, { headers: { "Content-Type": MIME[ext], "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
