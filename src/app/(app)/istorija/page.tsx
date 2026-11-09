import { PageHeader, Card, PhaseNotice, EmptyState } from "@/components/ui";

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="Istorija skeniranja" subtitle="Prethodna skeniranja robota i njihovi rezultati." />
      <PhaseNotice phase={5}>Pregled svih skeniranja i audit log.</PhaseNotice>
      <Card className="mt-6"><EmptyState title="Nema skeniranja" text="Svako ručno pokretanje robota biće zabeleženo ovde." /></Card>
    </>
  );
}
