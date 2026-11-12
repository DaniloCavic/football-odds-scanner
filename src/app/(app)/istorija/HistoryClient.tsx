"use client";

import { useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import type { ScanStatusDto, SelectionDto } from "@/lib/robot/scans";

const fmt = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, [string, string]> = {
  RUNNING: ["Radi", "bg-live/15 text-live"], COMPLETED: ["Završeno", "bg-won/15 text-won"],
  STOPPED: ["Zaustavljeno", "bg-pending/15 text-pending"], FAILED: ["Greška", "bg-lost/15 text-lost"],
};
const ENTITY: Record<string, string> = { Settings: "Podešavanja", FilterSet: "Filter", TrackedSelection: "Tip" };
const ACTION: Record<string, string> = { UPDATE: "izmena", DELETE: "brisanje", CLEAR: "čišćenje", STATUS: "status", MANUAL_OVERRIDE: "ručna ispravka" };

type Audit = { id: string; at: string; by: string; entityType: string; entityId: string; action: string; old: unknown; new: unknown; reason: string | null };

export function HistoryClient({ scans, audit }: { scans: ScanStatusDto[]; audit: Audit[] }) {
  const [tab, setTab] = useState<"scans" | "audit">("scans");
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, SelectionDto[]>>({});
  const [auditFilter, setAuditFilter] = useState("all");

  async function toggle(id: string) {
    setOpen(open === id ? null : id);
    if (!sel[id]) {
      const r = await fetch(`/api/robot/scans/${id}/selections`, { cache: "no-store" });
      if (r.ok) { const rows: SelectionDto[] = await r.json(); setSel((s) => ({ ...s, [id]: rows })); }
    }
  }

  const auditRows = audit.filter((a) => auditFilter === "all" || (auditFilter === "manual" ? a.action === "MANUAL_OVERRIDE" : a.entityType === auditFilter));

  return (
    <div className="space-y-4">
      <div className="flex gap-1" role="tablist">
        {([["scans", `Skeniranja (${scans.length})`], ["audit", `Audit log (${audit.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}>{l}</button>
        ))}
      </div>

      {tab === "scans" && (
        <Card>
          {scans.length === 0 ? <EmptyState title="Nema skeniranja" text="Svako ručno pokretanje robota biće zabeleženo ovde." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm" data-testid="scans-table">
                <thead className="text-muted">
                  <tr>{["Pokrenuto", "Period", "Kladionica", "Status", "Pregledano", "Izbačeno", "Selekcija", "API zahteva", "Trajanje"].map((h) => <th key={h} className="border-b border-line py-2 pr-3 text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {scans.map((s) => (
                    <ScanRow key={s.id} s={s} open={open === s.id} onToggle={() => toggle(s.id)} selections={sel[s.id]} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "audit" && (
        <Card>
          <div className="mb-3 flex flex-wrap gap-1 text-sm">
            {([["all", "Sve"], ["TrackedSelection", "Tipovi (statusi)"], ["manual", "Ručne ispravke"], ["FilterSet", "Filteri"], ["Settings", "Podešavanja"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={auditFilter === k} onClick={() => setAuditFilter(k)} className={`rounded-lg px-2.5 py-1 ${auditFilter === k ? "bg-accent/15 text-accent" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          {auditRows.length === 0 ? <p className="text-sm text-muted">Nema zapisa.</p> : (
            <ul className="space-y-1.5 text-xs" data-testid="audit-list">
              {auditRows.map((a) => (
                <li key={a.id} className="rounded-lg bg-panel-2/60 px-3 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span><b>{ENTITY[a.entityType] ?? a.entityType}</b> · {ACTION[a.action] ?? a.action}{a.action === "MANUAL_OVERRIDE" && <span className="ml-1 text-live">(ručno)</span>}</span>
                    <span className="text-muted">{fmt.format(new Date(a.at))} · {a.by}</span>
                  </div>
                  {(a.old != null || a.new != null) && <p className="mt-1 break-all text-muted">{JSON.stringify(a.old)} → {JSON.stringify(a.new)}</p>}
                  {a.reason && <p className="mt-1">Obrazloženje: {a.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function ScanRow({ s, open, onToggle, selections }: { s: ScanStatusDto; open: boolean; onToggle: () => void; selections?: SelectionDto[] }) {
  const dur = s.finishedAt ? Math.round((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000) : null;
  return (
    <>
      <tr className="cursor-pointer border-b border-line/50 hover:bg-panel-2/60" onClick={onToggle}>
        <td className="py-2 pr-3 whitespace-nowrap">{open ? "▾" : "▸"} {fmt.format(new Date(s.startedAt))}</td>
        <td className="py-2 pr-3">{s.periodLabel}</td>
        <td className="py-2 pr-3">{s.providerName}{s.isDemo && <span className="ml-1 rounded bg-live/20 px-1 text-[10px] font-bold text-live">DEMO</span>}</td>
        <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span></td>
        <td className="py-2 pr-3 tabular-nums">{s.fixturesScanned}{s.fixturesTotal != null ? ` / ${s.fixturesTotal}` : ""}</td>
        <td className="py-2 pr-3 tabular-nums">{s.fixturesExcluded}</td>
        <td className="py-2 pr-3 tabular-nums font-semibold">{s.selectionsFound}</td>
        <td className="py-2 pr-3 tabular-nums">{s.isDemo ? "—" : s.requestsUsed}</td>
        <td className="py-2 pr-3 tabular-nums text-muted">{dur == null ? "—" : `${dur}s`}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} className="bg-panel-2/40 px-4 py-3 text-xs">
            <p className="text-muted">Period: {fmt.format(new Date(s.startDate))} – {fmt.format(new Date(s.endDate))} · maks. kvota {s.maxOddsUsed.toFixed(2)}{s.pairsExcluded ? ` · izbačeno ${s.pairsExcluded} utakmica sa 2+ i 0–3` : ""}</p>
            {s.errors.length > 0 && <ul className="mt-2 space-y-0.5 text-lost">{s.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            {!selections ? <p className="mt-2 text-muted">Učitavam…</p> : selections.length === 0 ? <p className="mt-2 text-muted">Nema selekcija.</p> : (
              <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {selections.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2">
                    <span className="truncate">{x.homeTeam} – {x.awayTeam}</span>
                    <span className="shrink-0 tabular-nums"><b>{x.label}</b> {x.odds.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
