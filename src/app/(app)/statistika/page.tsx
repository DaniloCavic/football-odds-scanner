import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { StatsClient } from "./StatsClient";

export default async function StatsPage() {
  const sets = await prisma.filterSet.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, status: true } });
  return (
    <>
      <PageHeader title="Statistika" subtitle="Prolaznost i simulirani profit po tipovima, kvotama, takmičenjima i periodima – iz obračunatih tipova u filterima." />
      <StatsClient sets={sets.map((s) => ({ id: s.id, name: s.name, deleted: s.status === "DELETED" }))} />
    </>
  );
}
