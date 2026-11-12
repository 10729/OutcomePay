// Sellers and their verified track record.
// Live stats come from settled OutcomePay jobs; each seller also has clearly labelled seeded demo history.
import type { Job } from "./types";

export type Seller = {
  id: string;
  name: string;
  skill: "web" | "service";
  speciality: string;
  priceFrom: number;
  seeded: { jobs: number; payoutSum: number; fullDeliveries: number; guardFails: number };
};

export const SELLERS: Seller[] = [
  { id: "leo", name: "Leo Martins", skill: "web", speciality: "Web performance for small shops", priceFrom: 250, seeded: { jobs: 41, payoutSum: 38.6, fullDeliveries: 36, guardFails: 0 } },
  { id: "ava", name: "Ava Speedworks", skill: "web", speciality: "Core Web Vitals and image optimisation", priceFrom: 180, seeded: { jobs: 18, payoutSum: 14.1, fullDeliveries: 11, guardFails: 1 } },
  { id: "quickfix", name: "QuickFix Digital", skill: "web", speciality: "Fast turnaround site fixes", priceFrom: 90, seeded: { jobs: 27, payoutSum: 13.2, fullDeliveries: 8, guardFails: 6 } },
  { id: "sparkle", name: "Sparkle & Co Cleaning", skill: "service", speciality: "Move-out and deep cleans", priceFrom: 120, seeded: { jobs: 63, payoutSum: 57.3, fullDeliveries: 49, guardFails: 0 } },
  { id: "brightmaid", name: "BrightMaid", skill: "service", speciality: "Weekly home cleaning", priceFrom: 80, seeded: { jobs: 22, payoutSum: 16.9, fullDeliveries: 12, guardFails: 0 } },
];

export function getSeller(id: string): Seller | undefined {
  return SELLERS.find((s) => s.id === id);
}

export type Reputation = {
  seller: Seller;
  jobs: number;
  liveJobs: number;
  avgPayout: number; // 0..1
  fullRate: number; // share of jobs paid 100%
  guardFails: number;
};

export function reputation(seller: Seller, jobs: Job[]): Reputation {
  const live = jobs.filter((j) => j.contract.sellerId === seller.id && j.decision?.status === "settle");
  const livePay = live.reduce((s, j) => s + (j.decision?.payFraction ?? 0), 0);
  const liveFull = live.filter((j) => j.decision?.payFraction === 1).length;
  const liveGuard = live.filter((j) => j.decision?.guards.some((g) => g.passed === false)).length;
  const total = seller.seeded.jobs + live.length;
  return {
    seller,
    jobs: total,
    liveJobs: live.length,
    avgPayout: total ? (seller.seeded.payoutSum + livePay) / total : 0,
    fullRate: total ? (seller.seeded.fullDeliveries + liveFull) / total : 0,
    guardFails: seller.seeded.guardFails + liveGuard,
  };
}
