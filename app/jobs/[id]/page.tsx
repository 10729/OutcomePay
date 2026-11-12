import { notFound } from "next/navigation";
import { getJob } from "@/lib/store";
import JobView from "./JobView";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: { id: string } }) {
  const job = await getJob(params.id);
  if (!job) notFound();
  return <JobView initial={job} paypalClientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""} />;
}
