// Tiny JSON-file store. Good enough for the hackathon demo; swap for Postgres later.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Job } from "./types";

export type DemoMode = "slow" | "partial" | "fast" | "gamed" | "broken";

export type PasskeyCredential = {
  id: string; // base64url credential id
  publicKey: string; // base64url
  counter: number;
  transports?: string[];
  createdAt: string;
};

export type Proposal = {
  id: string;
  createdAt: string;
  goal: string;
  reasoning: string;
  engine: string;
  sellerId: string;
  amount: string;
  buyer: string;
  contract: unknown; // full ContractT; its hash is what the passkey signs
  hash: string;
  challenge?: string; // base64url, set when approval starts
  used?: boolean;
};

type Data = {
  jobs: Record<string, Job>;
  demo: { mode: DemoMode };
  passkeys: PasskeyCredential[];
  regChallenge?: string;
  proposals: Record<string, Proposal>;
};

const DIR = path.join(process.cwd(), "data");
const FILE = path.join(DIR, "store.json");
export const UPLOAD_DIR = path.join(DIR, "uploads");

// One shared copy for the whole server process. Next.js bundles pages and API routes separately,
// so a module-level variable would give each its own stale copy; globalThis is shared by all of them.
type Shared = { cache: Data | null; mtimeMs: number; writing: Promise<void> };
const g = globalThis as unknown as { __outcomepayStore?: Shared };
const shared: Shared = (g.__outcomepayStore ??= { cache: null, mtimeMs: 0, writing: Promise.resolve() });

async function load(): Promise<Data> {
  await shared.writing;
  let mtimeMs = 0;
  try {
    mtimeMs = (await fs.stat(FILE)).mtimeMs;
  } catch {
    /* no file yet */
  }
  if (shared.cache && mtimeMs === shared.mtimeMs) return shared.cache;
  try {
    shared.cache = JSON.parse(await fs.readFile(FILE, "utf8")) as Data;
  } catch {
    shared.cache ??= { jobs: {}, demo: { mode: "slow" }, passkeys: [], proposals: {} };
  }
  shared.mtimeMs = mtimeMs;
  const c = shared.cache!;
  c.jobs ??= {};
  c.demo ??= { mode: "slow" };
  c.passkeys ??= [];
  c.proposals ??= {};
  return c;
}

async function save(): Promise<void> {
  const snapshot = JSON.stringify(shared.cache, null, 2);
  shared.writing = shared.writing.then(async () => {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(FILE, snapshot);
    try {
      shared.mtimeMs = (await fs.stat(FILE)).mtimeMs;
    } catch {
      /* ignore */
    }
  });
  return shared.writing;
}

export async function listJobs(): Promise<Job[]> {
  const d = await load();
  return Object.values(d.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJob(id: string): Promise<Job | null> {
  return (await load()).jobs[id] ?? null;
}

export async function putJob(job: Job): Promise<Job> {
  const d = await load();
  d.jobs[job.id] = job;
  await save();
  return job;
}

export function addEvent(job: Job, type: string, detail: string) {
  job.events.push({ at: new Date().toISOString(), type, detail });
}

export async function getDemoMode(): Promise<DemoMode> {
  return (await load()).demo.mode;
}

export async function setDemoMode(mode: DemoMode): Promise<void> {
  (await load()).demo.mode = mode;
  await save();
}

export async function getPasskeys(): Promise<PasskeyCredential[]> {
  return (await load()).passkeys;
}

export async function addPasskey(c: PasskeyCredential): Promise<void> {
  (await load()).passkeys.push(c);
  await save();
}

export async function updatePasskeyCounter(id: string, counter: number): Promise<void> {
  const k = (await load()).passkeys.find((p) => p.id === id);
  if (k) k.counter = counter;
  await save();
}

export async function setRegChallenge(ch: string | undefined): Promise<void> {
  (await load()).regChallenge = ch;
  await save();
}

export async function getRegChallenge(): Promise<string | undefined> {
  return (await load()).regChallenge;
}

export async function putProposal(p: Proposal): Promise<void> {
  (await load()).proposals[p.id] = p;
  await save();
}

export async function getProposal(id: string): Promise<Proposal | null> {
  return (await load()).proposals[id] ?? null;
}
