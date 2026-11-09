import Link from "next/link";
import { PageHeader, StatCard, Card, EmptyState } from "@/components/ui";
import { IconRobot } from "@/components/icons";
import { getSettings } from "@/lib/settings-repo";
import { formatDateTime, formatOdds, formatRsd } from "@/lib/format";
import { recentScans } from "@/lib/robot/scans";

export default async function DashboardPage() {
  const [settings, [last]] = await Promise.all([getSettings(), recentScans(1)]);
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Pregled sistema, poslednjeg skeniranja i tipova.">
        <Link href="/robot" className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-bg hover:bg-accent-strong">
          <IconRobot /> START ROBOT
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Aktivne selekcije" value="0" hint="Na čekanju i uživo" tone="live" />
        <StatCard label="Završeni tipovi" value="0" hint="Prošlo / palo: 0 / 0" />
        <StatCard label="Prolaznost" value="—" hint="WON / (WON + LOST)" tone="won" />
        <StatCard label="Neto profit / gubitak" value={formatRsd(0)} hint={`Simulacija, ${formatRsd(settings.stakePerSelection)} po tipu`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-semibold">Poslednje skeniranje</h2>
          {last ? (
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div><dt className="text-muted">Vreme</dt><dd className="mt-1 font-medium">{formatDateTime(new Date(last.startedAt))}</dd></div>
              <div><dt className="text-muted">Period</dt><dd className="mt-1 font-medium">{last.periodLabel}{last.isDemo && <span className="ml-2 rounded bg-live/20 px-1.5 text-[10px] font-bold text-live">DEMO</span>}</dd></div>
              <div><dt className="text-muted">Pregledano utakmica</dt><dd className="mt-1 font-medium tabular-nums">{last.fixturesScanned}</dd></div>
              <div><dt className="text-muted">Pronađeno selekcija</dt><dd className="mt-1 font-medium tabular-nums">{last.selectionsFound}</dd></div>
            </dl>
          ) : (
            <EmptyState title="Još nema skeniranja" text="Robot se pokreće isključivo ručno, dugmetom START ROBOT." />
          )}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Pravila</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Maksimalna kvota</dt><dd className="font-medium tabular-nums">{formatOdds(settings.maxOdds)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Ulog po tipu</dt><dd className="font-medium tabular-nums">{formatRsd(settings.stakePerSelection)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Tipovi</dt><dd className="font-medium">1, X, 2, 2+, 0–3</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Sport</dt><dd className="font-medium">Samo pravi fudbal</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Vremenska zona</dt><dd className="font-medium">{settings.timezone}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
