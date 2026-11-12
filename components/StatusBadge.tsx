import type { JobStatus } from "@/lib/types";

const STYLES: Record<JobStatus, [string, string]> = {
  awaiting_payment: ["Waiting for payment", "bg-[#E9ECEF] text-muted"],
  held: ["Money held", "bg-wash-held text-[#8a5f08]"],
  settled: ["Settled", "bg-wash-earned text-earned"],
  voided: ["Hold released", "bg-wash-returned text-returned"],
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const [label, cls] = STYLES[status];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}
