import { PageHeader, Card, PhaseNotice } from "@/components/ui";
import { IconGrip } from "@/components/icons";

export default function FilterPage() {
  return (
    <>
      <PageHeader title="Filter" subtitle="Prevucite pojedinačne tipove iz leve kolone u svoj trajni filter." />
      <PhaseNotice phase={3}>Prevlačenje, trajno čuvanje, filter setovi i deduplikacija.</PhaseNotice>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Pronađene selekcije</h2>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3 text-sm text-muted opacity-60">
            <IconGrip /> <span>Ovde će se pojaviti tipovi koje robot pronađe.</span>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Moj filter</h2>
          <div className="grid min-h-40 place-items-center rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 p-6 text-center text-sm text-muted">
            Prevucite tip ovde
          </div>
        </Card>
      </div>
    </>
  );
}
