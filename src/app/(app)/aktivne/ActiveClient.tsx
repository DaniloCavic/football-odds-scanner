"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import { StatusPill, STATUS_LABELS, rsd, signedRsd } from "@/components/status";
import type { TabKey, TrackedDetail, TrackedRow } from "@/lib/results/queries";
import type { TrackerLogEntry, TrackerReport } from "@/lib/results/tracker";

const TABS: [TabKey, string][] = [
  ["all", "Sve"], ["pending", "Na čekanju"], ["live", "Uživo"], ["won", "Prošlo"], ["lost", "Palo"], ["postponed", "Odloženo"], ["review", "Potrebna provera"],
];
const TZ = "Europe/Belgrade";
const fmt = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtFull = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function DemoBadge() {
  return <span className="rounded bg-live/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-live">DEMO</span>;
}

export function ActiveClient({ initialRows, initialCounts, report, isAdmin, hasApiFootball, similarNames = [], log = [] }: {
  initialRows: TrackedRow[]; initialCounts: Record<TabKey, number>; report: TrackerReport | null; isAdmin: boolean; hasApiFootball: boolean; similarNames?: string[]; log?: TrackerLogEntry[];
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [rows, setRows] = useState(initialRows);
  const [counts, setCounts] = useState(initialCounts);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState(report);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [opTest, setOpTest] = useState<unknown>(null);
  async function testOddsPapi() {
    if (!window.confirm("Test troši 3 OddsPapi zahteva. Nastaviti?")) return;
    setRunning(true);
    try {
      const r = await fetch("/api/tracker/test-oddspapi", { method: "POST" });
      setOpTest(await r.json());
    } finally { setRunning(false); }
  }

  const load = useCallback(async (t: TabKey) => {
    const r = await fetch(`/api/tracked?tab=${t}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setRows(j.rows);
    setCounts(j.counts);
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);
  useEffect(() => { const iv = setInterval(() => load(tab), 60_000); return () => clearInterval(iv); }, [tab, load]);

  async function runNow(url = "/api/tracker/run") {
    setRunning(true); setMsg(null);
    try {
      const r = await fetch(url, { method: "POST" });
      const j = await r.json();
      if (!r.ok) setMsg(j.error ?? "Greška.");
      else {
        setLastReport(j);
        setMsg(j.skipped ?? `Provereno ${j.matches} utakmica · obračunato ${j.settled} · API zahteva: API-Football ${j.apiFootballCalls}, OddsPapi ${j.oddsPapiCalls}${j.errors.length ? ` · greške: ${j.errors.join("; ")}` : ""}`);
        await load(tab);
      }
    } finally { setRunning(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="mr-auto">
            <p className="font-medium">Result Tracker</p>
            <p className="text-xs text-muted">
              {hasApiFootball ? "Primarni izvor: API-Football · rezervni: OddsPapi" : "API-Football ključ nije podešen – koristi se samo OddsPapi (štedljivo)"}
              {lastReport && <> · poslednja provera {fmt.format(new Date(lastReport.at))}{lastReport.errors.length > 0 && <span className="text-lost"> · {lastReport.errors.length} greška</span>}</>}
            </p>
          </div>
          {isAdmin && (
            <button type="button" onClick={() => runNow()} disabled={running} className="rounded-xl bg-accent px-4 py-2 font-semibold text-bg hover:bg-accent-strong disabled:opacity-50">
              {running ? "Proveravam…" : "Proveri rezultate sada"}
            </button>
          )}
        </div>
        {!hasApiFootball && (
          <p role="alert" className="mt-3 rounded-lg bg-lost/10 px-3 py-2 text-xs text-lost">
            Server ne vidi API-Football ključ. Na Railway-u (kockica aplikacije → Variables) promenljiva mora da se zove <b>APIFOOTBALL_API_KEY</b>.
            {" "}Slične promenljive na serveru: {similarNames.length ? <b>{similarNames.join(", ")}</b> : "nema nijedne"}.
          </p>
        )}
        {lastReport?.sources && (
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2" data-testid="sources">
            <div className="rounded-lg bg-panel-2/60 px-3 py-2">
              <dt className="font-medium">API-Football (primarni)</dt>
              <dd className="text-muted">
                {!lastReport.sources.apiFootball.configured ? "nije podešen" : <>danas {lastReport.sources.apiFootball.usedToday}/{lastReport.sources.apiFootball.cap} zahteva</>}
                {lastReport.sources.apiFootball.blockedUntil && (
                  <span className="block text-lost">
                    Pauziran do {fmt.format(new Date(lastReport.sources.apiFootball.blockedUntil))}: {lastReport.sources.apiFootball.lastError}
                    {isAdmin && <button type="button" onClick={() => runNow("/api/tracker/retry-af")} disabled={running} className="ml-2 rounded-lg border border-lost/50 px-2 py-0.5 text-lost hover:bg-lost/10 disabled:opacity-50">Pokušaj ponovo odmah</button>}
                  </span>
                )}
              </dd>
            </div>
            <div className="rounded-lg bg-panel-2/60 px-3 py-2">
              <dt className="font-medium">OddsPapi (rezervni)</dt>
              <dd className="text-muted">{!lastReport.sources.oddsPapi.configured ? "nije podešen" : <>danas {lastReport.sources.oddsPapi.usedToday}/{lastReport.sources.oddsPapi.budget} provera (limit u Podešavanjima)</>}</dd>
            </div>
          </dl>
        )}
        {log.length > 0 && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted">Poslednje greške izvora ({log.length})</summary>
            <ul className="mt-2 space-y-1">
              {log.slice(0, 15).map((l, i) => <li key={i} className="rounded bg-panel-2/60 px-3 py-1.5"><span className="text-muted">{fmt.format(new Date(l.at))} · {l.source}:</span> {l.message}</li>)}
            </ul>
          </details>
        )}
        {isAdmin && (
          <div className="mt-3 text-xs">
            <button type="button" onClick={testOddsPapi} disabled={running} className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-text disabled:opacity-50">Test OddsPapi rezultata (3 zahteva)</button>
            {opTest != null && (
              <pre data-testid="op-test" className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg p-3 text-[11px] text-muted">{JSON.stringify(opTest, null, 1)}</pre>
            )}
          </div>
        )}
        {msg && <p role="status" className="mt-3 rounded-lg bg-panel-2 px-3 py-2 text-xs text-muted">{msg}</p>}
      </Card>

      <Card>
        <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}>
              {label} <span className="ml-1 text-xs opacity-70">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Nema selekcija" text="Dodajte tipove u filter – ovde pratite njihov status i rezultat." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm" data-testid="tracked-table">
              <thead className="text-muted">
                <tr>{["Datum/vreme", "Takmičenje", "Utakmica", "Tip", "Kvota", "Rezultat", "Status", "Izvor"].map((c) => <th key={c} className="border-b border-line px-3 py-2 font-medium">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-b border-line/50 hover:bg-panel-2/60">
                    <td className="whitespace-nowrap px-3 py-2.5">{fmt.format(new Date(r.kickoffTime))}</td>
                    <td className="max-w-48 truncate px-3 py-2.5 text-muted">{r.country ? `${r.country} · ` : ""}{r.competition}</td>
                    <td className="px-3 py-2.5"><span className="font-medium">{r.homeTeam} – {r.awayTeam}</span> {r.isDemo && <DemoBadge />}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.label}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.odds.toFixed(2)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.home != null && r.away != null ? `${r.home}:${r.away}` : "—"}</td>
                    <td className="px-3 py-2.5">
                      {r.status === "LIVE" && Date.now() - new Date(r.kickoffTime).getTime() > 110 * 60_000
                        ? <span data-status="LIVE" className="inline-flex whitespace-nowrap rounded-full bg-pending/15 px-2.5 py-0.5 text-xs font-medium text-pending">Čeka rezultat</span>
                        : <StatusPill status={r.status} />}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">{r.resultSource ?? r.oddsSource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openId && <DetailDrawer id={openId} isAdmin={isAdmin} onClose={() => setOpenId(null)} onChanged={() => load(tab)} />}
    </div>
  );
}

function DetailDrawer({ id, isAdmin, onClose, onChanged }: { id: string; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<TrackedDetail | null>(null);
  const [form, setForm] = useState({ status: "AUTO", home: "", away: "", reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/tracked/${id}`, { cache: "no-store" });
    if (r.ok) setD(await r.json());
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      const r = await fetch(`/api/tracked/${id}/override`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: form.status, reason: form.reason, ...(form.home !== "" ? { home: form.home } : {}), ...(form.away !== "" ? { away: form.away } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) return setErr(j.error ?? "Greška.");
      setForm({ status: "AUTO", home: "", away: "", reason: "" });
      await load();
      onChanged();
    } finally { setSaving(false); }
  }

  const input = "rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-line bg-panel p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Detalji selekcije">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{d ? `${d.match.homeTeam} – ${d.match.awayTeam}` : "Učitavam…"}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-text" aria-label="Zatvori">✕</button>
        </div>
        {d && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-accent/10 px-3 py-1.5 font-semibold text-accent">{d.label} @ {d.originalOdds.toFixed(2)}</span>
              <StatusPill status={d.status} />
              {d.home != null && <span className="text-lg font-semibold tabular-nums">{d.home}:{d.away}</span>}
              {d.isDemo && <DemoBadge />}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-muted">Takmičenje</dt><dd>{d.match.country ? `${d.match.country} · ` : ""}{d.match.competition}</dd>
              <dt className="text-muted">Početak</dt><dd>{fmtFull.format(new Date(d.match.kickoffTime))}</dd>
              <dt className="text-muted">Izvor kvote</dt><dd>{d.oddsSource}</dd>
              <dt className="text-muted">Kvota preuzeta</dt><dd>{fmtFull.format(new Date(d.oddsTimestamp))}</dd>
              <dt className="text-muted">Skeniranje</dt><dd>{fmtFull.format(new Date(d.scanStartedAt))}</dd>
              <dt className="text-muted">Izvor rezultata</dt><dd>{d.resultSource ?? "—"}</dd>
              <dt className="text-muted">API-Football utakmica</dt><dd>{d.match.apiFootballId ? `#${d.match.apiFootballId} (${d.match.confidence === "HIGH" ? "sigurno" : "uz potvrdu"})` : "—"}</dd>
              <dt className="text-muted">Obračunato</dt><dd>{d.settledAt ? fmtFull.format(new Date(d.settledAt)) : "—"}</dd>
            </dl>

            <section>
              <h3 className="mb-2 font-semibold">U filterima</h3>
              <ul className="space-y-1">
                {d.entries.map((e, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 rounded-lg bg-panel-2/60 px-3 py-2">
                    <span>{e.filter}{e.deleted ? " (obrisan)" : e.removed ? " (uklonjen)" : ""}</span>
                    <span className="tabular-nums text-muted">{e.odds.toFixed(2)} × {rsd(e.stake)} → {e.net == null ? "—" : <b className={e.net > 0 ? "text-won" : e.net < 0 ? "text-lost" : ""}>{signedRsd(e.net)}</b>}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 font-semibold">Rezultati iz izvora</h3>
              {d.results.length === 0 ? <p className="text-muted">Još nema podataka.</p> : (
                <ul className="space-y-1 text-xs">
                  {d.results.map((r, i) => (
                    <li key={i} className="flex justify-between gap-2 rounded bg-panel-2/60 px-3 py-1.5">
                      <span><b>{r.source}</b> · {r.status}{r.home != null ? ` · ${r.home}:${r.away}` : ""}</span>
                      <span className="text-muted">{fmtFull.format(new Date(r.at))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 font-semibold">Istorija statusa</h3>
              <ul className="space-y-1 text-xs">
                {d.history.map((h, i) => {
                  const o = h.old as { status?: string } | null, n = h.new as { status?: string; source?: string } | null;
                  return (
                    <li key={i} className="rounded bg-panel-2/60 px-3 py-1.5">
                      <div className="flex justify-between gap-2">
                        <span>{STATUS_LABELS[o?.status ?? ""] ?? o?.status} → <b>{STATUS_LABELS[n?.status ?? ""] ?? n?.status}</b>{h.action === "MANUAL_OVERRIDE" && <span className="ml-1 text-live">(ručno)</span>}</span>
                        <span className="text-muted">{fmtFull.format(new Date(h.at))}</span>
                      </div>
                      <div className="text-muted">{h.by}{n?.source ? ` · ${n.source}` : ""}{h.reason ? ` · ${h.reason}` : ""}</div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {isAdmin && (
              <form onSubmit={save} className="space-y-3 rounded-xl border border-line p-4">
                <h3 className="font-semibold">Ručna ispravka (administrator)</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Novi status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
                    <option value="AUTO">Izračunaj iz rezultata</option>
                    <option value="WON">Prošlo</option>
                    <option value="LOST">Palo</option>
                    <option value="VOID">Poništeno (vraćen ulog)</option>
                    <option value="POSTPONED">Odloženo</option>
                    <option value="PENDING">Na čekanju (ponovo prati)</option>
                    <option value="NEEDS_REVIEW">Potrebna provera</option>
                  </select>
                  <input aria-label="Golovi domaćin" inputMode="numeric" placeholder="dom." value={form.home} onChange={(e) => setForm({ ...form, home: e.target.value })} className={`${input} w-16`} />
                  <span>:</span>
                  <input aria-label="Golovi gost" inputMode="numeric" placeholder="gost" value={form.away} onChange={(e) => setForm({ ...form, away: e.target.value })} className={`${input} w-16`} />
                </div>
                <textarea aria-label="Obrazloženje" required minLength={5} placeholder="Obrazloženje (obavezno) – npr. proveren rezultat na zvaničnom sajtu lige" value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })} className={`${input} h-20 w-full`} />
                {err && <p role="alert" className="text-xs text-lost">{err}</p>}
                <button type="submit" disabled={saving} className="rounded-xl bg-accent px-4 py-2 font-semibold text-bg disabled:opacity-50">{saving ? "Čuvam…" : "Sačuvaj ispravku"}</button>
              </form>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
