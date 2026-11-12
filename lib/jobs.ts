import { Contract, ContractDraft, validateDraft, type ContractDraftT, type ContractT } from "./contract/schema";
import { canonicalJson, newId, sha256 } from "./hash";
import { collectBaseline } from "./verifiers";
import { addEvent, putJob } from "./store";
import { getSeller } from "./sellers";
import type { AgentInfo, Job } from "./types";

export type NewJobInput = {
  draft: ContractDraftT;
  amount: string;
  buyer: string;
  sellerId: string;
  deadlineDays: number;
  contractId?: string;
};

// Builds the final contract. Agent proposals pass a fixed contractId so the hash the
// buyer signed is exactly the hash of the contract that gets created.
export function buildContract(input: NewJobInput, deadlineFrom = Date.now()): ContractT {
  const draft = ContractDraft.parse(input.draft);
  const bad = validateDraft(draft);
  if (bad) throw new Error(bad);
  const seller = getSeller(input.sellerId);
  if (!seller) throw new Error("Unknown seller.");
  return Contract.parse({
    ...draft,
    spec: "outcome-contract/0.2",
    id: input.contractId ?? newId("oc"),
    buyer: input.buyer,
    seller: seller.name,
    sellerId: seller.id,
    amount: { value: Number(input.amount).toFixed(2), currency: "USD" },
    deadline: new Date(deadlineFrom + input.deadlineDays * 86_400_000).toISOString(),
  });
}

export function hashContract(c: ContractT): string {
  return sha256(canonicalJson(c));
}

export async function createJob(contract: ContractT, origin: "manual" | "agent", agent?: AgentInfo): Promise<Job> {
  const job: Job = {
    id: newId("job"),
    contract,
    contractHash: hashContract(contract),
    status: "awaiting_payment",
    createdAt: new Date().toISOString(),
    origin,
    agent,
    baseline: [],
    evidence: [],
    photos: [],
    decision: null,
    paypal: {},
    report: null,
    events: [],
  };
  if (origin === "agent" && agent) {
    addEvent(job, "agent", `AI agent proposed ${contract.seller} for "${agent.goal}". Approved by the buyer's passkey over contract hash ${job.contractHash.slice(0, 12)}…`);
  } else {
    addEvent(job, "contract", `Contract ${contract.id} approved by ${contract.seller}. Hash ${job.contractHash.slice(0, 12)}…`);
  }
  job.baseline = await collectBaseline(contract);
  if (job.baseline.length) addEvent(job, "baseline", job.baseline.map((e) => `${e.checks}: ${e.value ?? "n/a"} ${e.unit}`).join("; "));
  await putJob(job);
  return job;
}
