"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import type { Metrics, Stats } from "@/lib/stats/compute";
import { CumulativeLine, WonLostColumns, type PeriodPoint } from "./charts";

const TZ = "Europe/Belgrade";
const todayYmd = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const shift = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const rsd = (n: number) => new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 }).format(n) + " RSD";
const signed = (n: number) => (n > 0 ? "+" : "") + rsd(n);
const pct = (n: number | null, d = 1) => (n == null ? "—" : `${n.toFixed(d)}%`);
const tone = (n: number) => (n > 0 ? "text-won" : n < 0 ? "text-lost" : "");

const PRESETS = [
  ["today", "Danas"], ["7", "7 dana"], ["30", "30 dana"], ["month", "Ovaj mesec"], ["all", "Sve"], ["custom", "Prilagođeno"],
] as const;
type Preset = (typeof PRESETS)[number][0];

function rangeFor(p: Preset, custom: { from: string; to: string }) {
  const t = todayYmd();
  switch (p) {
    case "today": return { from: t, to: t };
    case "7": return { from: shift(t, -6), to: t };
    case "30": return { from: shift(t, -29), to: t };
    case "month": return { from: `${t.slice(0, 8)}01`, to: t };
    case "all": return { from: "", to: "" };
    case "custom": return custom;
  }
}

function labelFor(key: string, g: string) {
  if (g === "month") { const [y, m] = key.split("-"); return `${m}.${y.slice(2)}`; }
  const [, m, d] = key.split("-");
  return g === "week" ? `od ${d}.${m}.` : `${d}.${m}.`;
}

export function StatsClient({ sets }: { sets: { id: string; name: string; deleted: boolean }[] }) {
  const [preset, setPreset] = useState<Preset>("30");
  const [custom, setCustom] = useState({ from: shift(todayYmd(), -6), to: todayYmd() });
  const [filterSet, setFilterSet] = useState("");
  const [scope, setScope] = useState<"active" | "all">("active");
  const [demo, setDemo] = useState(false);
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [oddsMode, setOddsMode] = useState<"fine" | "spec">("fine");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const range = rangeFor(preset, custom);
  useEffect(() => {
    const qs = new URLSearchParams({ scope, demo: demo ? "1" : "0", granularity });
    if (range.from) qs.set("from", range.from);
    if (range.to) qs.set("to", range.to);
    if (filterSet) qs.set("filterSet", filterSet);
    setLoading(true);
    fetch(`/api/stats?${qs}`, { cache: "no-store" }).then((r) => r.json()).then(setStats).finally(() => setLoading(false));
  }, [range.from, range.to, filterSet, scope, demo, granularity]);

  const timeline: PeriodPoint[] = useMemo(() => (stats?.timeline ?? []).map((t) => ({ ...t, label: labelFor(t.key, granularity) })), [stats, granularity]);
  const control = "rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
  const o = stats?.overall;

  return (
    <div className="space-y-4">
      {/* Filteri – jedan red iznad svega */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Period">
            {PRESETS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={preset === k} onClick={() => setPreset(k)}
                className={`rounded-lg px-3 py-1.5 text-sm ${preset === k ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}>{l}</button>
            ))}
          </div>
          {preset === "custom" && (
            <span className="flex items-center gap-1 text-sm text-muted">
              <input type="date" aria-label="Od" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={`${control} [color-scheme:dark]`} />
              –
              <input type="date" aria-label="Do" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={`${control} [color-scheme:dark]`} />
            </span>
          )}
          <select aria-label="Filter" value={filterSet} onChange={(e) => setFilterSet(e.target.value)} className={`${control} ml-auto max-w-56`}>
            <option value="">Svi filteri</option>
            {sets.map((s) => <option key={s.id} value={s.id}>{s.name}{s.deleted ? " (obrisan)" : ""}</option>)}
          </select>
          <select aria-label="Obuhvat" value={scope} onChange={(e) => setScope(e.target.value as "active" | "all")} className={control}>
            <option value="active">Aktivni filteri</option>
            <option value="all">Sa uklonjenim i obrisanim</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="accent-[var(--color-accent)]" />DEMO</label>
        </div>
      </Card>

      {!stats || !o ? <Card><p className="text-sm text-muted">Učitavam…</p></Card> : o.total === 0 ? (
        <Card><EmptyState title="Nema podataka za izabrani period" text="Dodajte tipove u filter – statistika se puni kako se utakmice obračunavaju." /></Card>
      ) : (
        <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          {/* Glavne brojke */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis">
            <Kpi label="Prolaznost" value={pct(o.passRate)} hint={`potrebno za nulu: ${pct(o.breakEven)}`} valueClass={o.passRate != null && o.breakEven != null ? (o.passRate >= o.breakEven ? "text-won" : "text-lost") : ""} />
            <Kpi label="Neto profit / gubitak" value={signed(o.net)} hint={`ROI ${pct(o.roi)} · uloženo ${rsd(o.stake)}`} valueClass={tone(o.net)} testId="kpi-net" />
            <Kpi label="Prošlo / palo" value={`${o.won} / ${o.lost}`} hint={`${o.settled} obračunato${o.void ? ` · ${o.void} vraćeno` : ""}`} />
            <Kpi label="Prosečna kvota" value={o.avgOdds == null ? "—" : o.avgOdds.toFixed(3)} hint={`isplata ${rsd(o.gross)}`} />
          </div>
          {(o.open > 0 || o.review > 0) && (
            <p className="text-xs text-muted">Nije u obračunu: {o.open} na čekanju/uživo/odloženo{o.review ? `, ${o.review} potrebna provera` : ""} – ne ulaze u prolaznost ni profit.</p>
          )}
          <Insight m={o} />

          <div className="grid gap-4">
            <Card>
              <h2 className="mb-1 font-semibold">Golovi ili konačan ishod?</h2>
              <p className="mb-4 text-xs text-muted">Traka = prolaznost, bela crta = prolaznost potrebna za nulu kod tih kvota.</p>
              <BarTable rows={stats.byGroup} testId="by-group" />
            </Card>
            <Card>
              <h2 className="mb-1 font-semibold">Po tipu</h2>
              <p className="mb-4 text-xs text-muted">Koji tip najviše prolazi i da li donosi plus.</p>
              <BarTable rows={stats.byType} testId="by-type" />
            </Card>
          </div>

          <Card>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Po kvoti – koje kvote najčešće padaju</h2>
              <div className="flex gap-1 text-xs">
                {([["fine", "Na 0.05"], ["spec", "1.01–1.10 / 1.11–1.20 / 1.21–1.30"]] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={oddsMode === k} onClick={() => setOddsMode(k)} className={`rounded-lg px-2.5 py-1 ${oddsMode === k ? "bg-accent/15 text-accent" : "text-muted"}`}>{l}</button>
                ))}
              </div>
            </div>
            <p className="mb-4 text-xs text-muted">Kolona „Palo“ pokazuje u kom opsegu kvota tipovi najčešće padaju.</p>
            <BarTable rows={oddsMode === "fine" ? stats.byOdds : stats.bySpecOdds} testId="by-odds" />
          </Card>

          <Card>
            <h2 className="mb-1 font-semibold">Tip × kvota</h2>
            <p className="mb-4 text-xs text-muted">Prolaznost u svakoj kombinaciji (prošlo/palo). Prazno = nema obračunatih tipova.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" data-testid="matrix">
                <thead className="text-muted"><tr><th className="py-2 text-left font-medium">Tip</th>{stats.byOdds.map((b) => <th key={b.key} className="py-2 text-right font-medium">{b.label}</th>)}</tr></thead>
                <tbody>
                  {stats.matrix.map((r) => (
                    <tr key={r.key} className="border-t border-line/60">
                      <td className="py-2 font-semibold">{r.label}</td>
                      {r.cells.map((c) => (
                        <td key={c.bucket} className="py-2 text-right tabular-nums">
                          {c.won + c.lost === 0 ? <span className="text-muted">·</span> : <>{pct(c.passRate, 0)} <span className="text-xs text-muted">{c.won}/{c.lost}</span></>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Kroz vreme</h2>
              <div className="flex gap-1 text-xs" role="group" aria-label="Prikaz">
                {([["day", "Dnevno"], ["week", "Nedeljno"], ["month", "Mesečno"]] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={granularity === k} onClick={() => setGranularity(k)} className={`rounded-lg px-2.5 py-1 ${granularity === k ? "bg-accent/15 text-accent" : "text-muted"}`}>{l}</button>
                ))}
              </div>
            </div>
            {timeline.length === 0 ? <p className="text-sm text-muted">Još nema obračunatih tipova u periodu.</p> : (
              <div className="grid gap-6 xl:grid-cols-2">
                <div><p className="mb-2 text-sm text-muted">Prošli i pali tipovi</p><WonLostColumns data={timeline} /></div>
                <div><p className="mb-2 text-sm text-muted">Kumulativni neto (RSD)</p><CumulativeLine data={timeline} /></div>
              </div>
            )}
            {timeline.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-xs text-muted">Tabela po periodima</summary>
                <table className="mt-2 w-full text-sm" data-testid="timeline-table">
                  <thead className="text-muted"><tr>{["Period", "Prošlo", "Palo", "Prolaznost", "Neto", "Ukupno"].map((h) => <th key={h} className="py-1.5 text-right font-medium first:text-left">{h}</th>)}</tr></thead>
                  <tbody>{timeline.map((t) => (
                    <tr key={t.key} className="border-t border-line/60 tabular-nums">
                      <td className="py-1.5">{t.label}</td><td className="text-right">{t.won}</td><td className="text-right">{t.lost}</td>
                      <td className="text-right">{pct(t.passRate)}</td><td className={`text-right ${tone(t.net)}`}>{signed(t.net)}</td><td className={`text-right ${tone(t.cumulative)}`}>{signed(t.cumulative)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </details>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 font-semibold">Po filteru</h2>
            <p className="mb-4 text-xs text-muted">Svaki tip je zasebna opklada sa svojim ulogom i kvotom iz trenutka dodavanja – bez dublova i kombinacija.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm" data-testid="by-filter">
                <thead className="text-muted"><tr>{["Filter", "Tipova", "Prošlo / palo", "Vraćeno", "Prolaznost", "Uloženo", "Isplata", "Neto", "ROI"].map((h) => <th key={h} className="py-2 text-right font-medium first:text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {stats.byFilterSet.map((f) => (
                    <FilterRow key={f.key} f={f} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <h2 className="mb-4 font-semibold">Po takmičenju</h2>
              <BarTable rows={stats.byCompetition.slice(0, 15)} compact testId="by-competition" />
              {stats.byCompetition.length > 15 && <p className="mt-2 text-xs text-muted">Prikazano 15 od {stats.byCompetition.length} takmičenja (po broju obračunatih tipova).</p>}
            </Card>
            <Card>
              <h2 className="mb-4 font-semibold">Poslednji pali tipovi</h2>
              {stats.recentLost.length === 0 ? <p className="text-sm text-muted">Nema palih tipova. 🎉</p> : (
                <ul className="space-y-1.5 text-sm">
                  {stats.recentLost.slice(0, 10).map((r, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-lg bg-panel-2/60 px-3 py-2">
                      <span className="w-10 font-semibold">{({ HOME: "1", AWAY: "2", OVER_1_5: "2+", UNDER_3_5: "0–3", DRAW: "X" } as Record<string, string>)[r.marketType]}</span>
                      <span className="min-w-0 flex-1 truncate">{r.match}<span className="block truncate text-xs text-muted">{r.country ? `${r.country} · ` : ""}{r.competition}</span></span>
                      <span className="tabular-nums text-muted">{r.odds.toFixed(2)}</span>
                      <span className="w-10 text-right tabular-nums">{r.home != null ? `${r.home}:${r.away}` : "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, valueClass = "", testId }: { label: string; value: string; hint?: string; valueClass?: string; testId?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`} data-testid={testId}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function Insight({ m }: { m: Metrics }) {
  if (m.passRate == null || m.breakEven == null || m.won + m.lost < 1) return null;
  const diff = m.passRate - m.breakEven;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${diff >= 0 ? "border-won/40 bg-won/5" : "border-lost/40 bg-lost/5"}`} data-testid="insight">
      Kod prosečne kvote <b>{m.avgOdds!.toFixed(2)}</b> treba <b>{m.breakEven.toFixed(1)}%</b> prolaznosti da bi se bilo na nuli.
      {" "}Trenutno je <b>{m.passRate.toFixed(1)}%</b> – {diff >= 0 ? <>to je <b className="text-won">{diff.toFixed(1)} poena iznad</b> granice.</> : <>to je <b className="text-lost">{Math.abs(diff).toFixed(1)} poena ispod</b> granice.</>}
      {m.won + m.lost < 100 && <span className="text-muted"> (Uzorak od {m.won + m.lost} tipova je još mali – zaključci postaju pouzdaniji posle nekoliko stotina.)</span>}
    </div>
  );
}

type BarRow = Metrics & { key: string; label: string };

/** Tabela sa trakom prolaznosti i oznakom granice isplativosti u svakom redu. */
function BarTable({ rows, compact = false, testId }: { rows: BarRow[]; compact?: boolean; testId?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm" data-testid={testId}>
        <thead className="text-muted">
          <tr>
            <th className="py-1.5 text-left font-medium">{compact ? "Takmičenje" : ""}</th>
            <th className="w-[34%] py-1.5 text-left font-medium">Prolaznost</th>
            <th className="py-1.5 text-right font-medium">Prošlo</th>
            <th className="py-1.5 text-right font-medium">Palo</th>
            {!compact && <th className="py-1.5 text-right font-medium">Pros. kvota</th>}
            <th className="py-1.5 text-right font-medium">Neto</th>
            {!compact && <th className="py-1.5 text-right font-medium">ROI</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const decided = r.won + r.lost;
            return (
              <tr key={r.key} className="border-t border-line/60" title={`Prolaznost ${pct(r.passRate)} · potrebno za nulu ${pct(r.breakEven)}`}>
                <td className={`py-2 pr-3 ${compact ? "max-w-48 truncate" : "font-semibold"}`}>{r.label}</td>
                <td className="py-2 pr-3">
                  {decided === 0 ? <span className="text-xs text-muted">nema obračunatih</span> : (
                    <div className="flex items-center gap-2">
                      <div className="relative h-2.5 flex-1 rounded-full bg-panel-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${r.passRate}%` }} />
                        {r.breakEven != null && <div className="absolute -top-1 w-0.5 rounded bg-text" style={{ left: `calc(${Math.min(r.breakEven, 100)}% - 1px)`, height: 18 }} aria-hidden />}
                      </div>
                      <span className="w-12 text-right tabular-nums">{pct(r.passRate, 0)}</span>
                    </div>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{r.won}</td>
                <td className="py-2 text-right tabular-nums">{r.lost}</td>
                {!compact && <td className="py-2 text-right tabular-nums">{r.avgOdds == null ? "—" : r.avgOdds.toFixed(2)}</td>}
                <td className={`py-2 text-right tabular-nums ${tone(r.net)}`}>{decided ? signed(r.net) : "—"}</td>
                {!compact && <td className={`py-2 text-right tabular-nums ${tone(r.net)}`}>{pct(r.roi)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilterRow({ f }: { f: Stats["byFilterSet"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-t border-line/60 tabular-nums hover:bg-panel-2/50" onClick={() => setOpen(!open)}>
        <td className="py-2 text-left font-medium">{open ? "▾" : "▸"} {f.label}</td>
        <td className="text-right">{f.total}</td>
        <td className="text-right"><span className="text-won">{f.won}</span> / <span className="text-lost">{f.lost}</span></td>
        <td className="text-right">{f.void}</td>
        <td className="text-right">{pct(f.passRate)}</td>
        <td className="text-right">{rsd(f.stake)}</td>
        <td className="text-right">{rsd(f.gross)}</td>
        <td className={`text-right font-semibold ${tone(f.net)}`}>{signed(f.net)}</td>
        <td className={`text-right ${tone(f.net)}`}>{pct(f.roi)}</td>
      </tr>
      {open && f.byType.map((t) => (
        <tr key={t.key} className="text-xs tabular-nums text-muted">
          <td className="py-1 pl-6 text-left">tip {t.label}</td>
          <td className="text-right">{t.total}</td>
          <td className="text-right">{t.won} / {t.lost}</td>
          <td className="text-right">{t.void}</td>
          <td className="text-right">{pct(t.passRate)}</td>
          <td className="text-right">{rsd(t.stake)}</td>
          <td className="text-right">{rsd(t.gross)}</td>
          <td className={`text-right ${tone(t.net)}`}>{signed(t.net)}</td>
          <td className="text-right">{pct(t.roi)}</td>
        </tr>
      ))}
    </>
  );
}
