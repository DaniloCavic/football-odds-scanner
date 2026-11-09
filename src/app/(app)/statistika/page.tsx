import { PageHeader, PhaseNotice, StatCard } from "@/components/ui";
import { formatRsd } from "@/lib/format";

export default function StatsPage() {
  return (
    <>
      <PageHeader title="Statistika" subtitle="Prolaznost i simulirani profit/gubitak po tipovima, kvotama i periodima." />
      <PhaseNotice phase={5}>Grafikoni, periodi, prolaznost po tipu i opsegu kvota, profit po filteru.</PhaseNotice>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Završeno" value="0" />
        <StatCard label="Prošlo" value="0" tone="won" />
        <StatCard label="Palo" value="0" tone="lost" />
        <StatCard label="Neto rezultat" value={formatRsd(0)} />
      </div>
    </>
  );
}
