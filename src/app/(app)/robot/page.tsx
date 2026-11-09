import { PageHeader, Card, PhaseNotice } from "@/components/ui";
import { IconRobot } from "@/components/icons";

const PERIODS = ["Danas", "Sutra", "Naredna 3 dana", "Narednih 7 dana", "Prilagođeni period"];

export default function RobotPage() {
  return (
    <>
      <PageHeader title="Robot" subtitle="Ručno skeniranje ponude: samo pravi fudbal, kvote do 1.30." />
      <PhaseNotice phase={2}>Prvo proveravamo dozvoljen izvor kvota, pa pravimo skeniranje.</PhaseNotice>
      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Period</h2>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p, i) => (
            <span key={p} className={`rounded-xl border px-4 py-2 text-sm ${i === 0 ? "border-accent/50 bg-accent/10 text-accent" : "border-line text-muted"}`}>{p}</span>
          ))}
        </div>
        <button type="button" disabled
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-accent py-5 text-xl font-bold tracking-wide text-bg opacity-40 sm:w-auto sm:px-14">
          <IconRobot className="h-7 w-7" /> START ROBOT
        </button>
        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {["Početak", "Kraj", "Pregledano utakmica", "Pronađeno selekcija"].map((l) => (
            <div key={l}><dt className="text-muted">{l}</dt><dd className="mt-1 font-medium">—</dd></div>
          ))}
        </dl>
      </Card>
    </>
  );
}
