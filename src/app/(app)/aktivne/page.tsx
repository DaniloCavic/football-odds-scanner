import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { lastTrackerReport, listTracked, trackedCounts, trackerLog } from "@/lib/results/queries";
import { apiFootballKey, apiFootballSimilarNames } from "@/lib/results/apifootball";
import { ActiveClient } from "./ActiveClient";

export default async function ActivePage() {
  const [rows, counts, report, user, log] = await Promise.all([listTracked("all"), trackedCounts(), lastTrackerReport(), getCurrentUser(), trackerLog()]);
  return (
    <>
      <PageHeader title="Aktivne selekcije" subtitle="Tipovi iz vaših filtera – rezultati se proveravaju automatski, i kada je browser zatvoren." />
      <ActiveClient initialRows={rows} initialCounts={counts} report={report} isAdmin={user?.role === "ADMIN"} hasApiFootball={!!apiFootballKey()} similarNames={apiFootballKey() ? [] : apiFootballSimilarNames()} log={log} />
    </>
  );
}
