import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { recentScans } from "@/lib/robot/scans";
import { HistoryClient } from "./HistoryClient";

export default async function HistoryPage() {
  const [scans, audit] = await Promise.all([
    recentScans(200),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { email: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Istorija skeniranja" subtitle="Sva pokretanja robota i dnevnik promena (audit log)." />
      <HistoryClient
        scans={scans}
        audit={audit.map((a) => ({
          id: a.id, at: a.createdAt.toISOString(), by: a.user?.email ?? "Sistem", entityType: a.entityType, entityId: a.entityId,
          action: a.action, old: a.oldValue, new: a.newValue, reason: a.reason,
        }))}
      />
    </>
  );
}
