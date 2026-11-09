import { PageHeader, Card, PhaseNotice, EmptyState } from "@/components/ui";

const TABS = ["Sve", "Na čekanju", "Uživo", "Prošlo", "Palo", "Odloženo", "Potrebna provera"];
const COLS = ["Datum/vreme", "Takmičenje", "Utakmica", "Tip", "Kvota", "Rezultat", "Status", "Izvor"];

export default function ActivePage() {
  return (
    <>
      <PageHeader title="Aktivne selekcije" subtitle="Praćenje tipova na čekanju, uživo i završenih." />
      <PhaseNotice phase={4}>Automatsko praćenje rezultata i obračun tipova.</PhaseNotice>
      <Card className="mt-6">
        <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1">
          {TABS.map((t, i) => (
            <span key={t} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${i === 0 ? "bg-accent/15 text-accent" : "text-muted"}`}>{t}</span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-muted"><tr>{COLS.map((c) => <th key={c} className="border-b border-line px-3 py-2 font-medium">{c}</th>)}</tr></thead>
          </table>
        </div>
        <div className="mt-4"><EmptyState title="Nema selekcija" text="Kada dodate tipove u filter, ovde ćete pratiti njihov status." /></div>
      </Card>
    </>
  );
}
