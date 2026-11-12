import type { ContractT } from "./contract/schema";

export type Provenance =
  | "independent_measurement" // we measured it ourselves
  | "authoritative_third_party" // a trusted system reported it
  | "counterparty_submitted" // the side that benefits from "no" provided it
  | "self_submitted"; // the side that gets paid provided it

export type Evidence = {
  id: string;
  checks: string; // outcome id, guard id, or "outcomeId:itemId"
  verifier: string;
  source: string;
  provenance: Provenance;
  capturedAt: string;
  value: number | null; // null = could not measure
  unit: string;
  confidence: number; // 0..1
  note: string;
  hash: string; // sha256 of the raw evidence
};

export type ItemStatus = "verified" | "not_done" | "conflict" | "unverified";

export type OutcomeResult = {
  id: string;
  label: string;
  value: number | null;
  pay: number;
  weight: number;
  items?: { id: string; label: string; status: ItemStatus; detail: string }[];
};
export type GuardResult = { id: string; label: string; passed: boolean | null; detail: string };

export type Decision = {
  status: "settle" | "hold";
  payFraction: number;
  outcomes: OutcomeResult[];
  guards: GuardResult[];
  reasons: string[];
  conflicts: string[];
  policyVersion: string;
  decidedAt: string;
};

export type Photo = {
  id: string;
  file: string; // stored file name
  url: string; // where the browser loads it
  side: "seller" | "buyer";
  stage: "before" | "after";
  uploadedAt: string;
  hash: string;
};

export type JobStatus = "awaiting_payment" | "held" | "settled" | "voided";
export type JobEvent = { at: string; type: string; detail: string };

export type AgentInfo = {
  goal: string;
  reasoning: string;
  engine: string;
  approvedWith: "passkey";
  credentialId: string;
  signedHash: string;
  approvedAt: string;
};

export type Job = {
  id: string;
  contract: ContractT;
  contractHash: string;
  status: JobStatus;
  createdAt: string;
  origin: "manual" | "agent";
  agent?: AgentInfo;
  baseline: Evidence[];
  evidence: Evidence[];
  photos: Photo[];
  decision: Decision | null;
  paypal: {
    orderId?: string;
    authorizationId?: string;
    captureId?: string;
    capturedValue?: string;
    releasedValue?: string;
    refundId?: string;
    payoutBatchId?: string;
    payoutStatus?: string;
    payouts?: { name: string; email: string; amount: string }[];
  };
  disputes?: { id: string; status: string; reason: string; amount: string; evidenceSentAt?: string }[];
  report: string | null;
  events: JobEvent[];
};
