import { SELLERS } from "@/lib/sellers";
import NewJobForm from "./NewJobForm";

export const dynamic = "force-dynamic";

export default function NewJobPage({ searchParams }: { searchParams: { kind?: string } }) {
  const kind = searchParams.kind === "service" ? "service" : "web";
  return <NewJobForm initialKind={kind} sellers={SELLERS.map(({ id, name, skill, speciality, priceFrom }) => ({ id, name, skill, speciality, priceFrom }))} />;
}
