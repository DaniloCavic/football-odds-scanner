import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { listFilterSets } from "@/lib/filter/service";
import { recentScans } from "@/lib/robot/scans";
import { FilterClient } from "./FilterClient";
import { getSettings } from "@/lib/settings-repo";

export default async function FilterPage() {
  const [sets, scans, settings] = await Promise.all([listFilterSets(prisma), recentScans(15), getSettings()]);
  return (
    <>
      <PageHeader title="Filter" subtitle="Prevucite pojedinačne tipove iz leve kolone u svoj filter. Sve se čuva odmah." />
      <FilterClient
        initialSets={sets}
        scans={scans.filter((s) => s.status !== "RUNNING" && s.selectionsFound > 0)}
        combineEnabled={settings.combineResultGoals}
      />
    </>
  );
}
