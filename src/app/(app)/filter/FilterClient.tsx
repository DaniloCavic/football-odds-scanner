"use client";

import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import { IconGrip } from "@/components/icons";
import type { FilterEntryDto, FilterSetDto } from "@/lib/filter/service";
import type { ScanStatusDto, SelectionDto } from "@/lib/robot/scans";

const TZ = "Europe/Belgrade";
const fmt = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtShort = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const fmtDay = (key: string) => new Intl.DateTimeFormat("sr-Latn-RS", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${key}T12:00:00Z`));
const rsd = (n: number) => new Intl.NumberFormat("sr-Latn-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " RSD";
const TYPES = ["1", "2", "2+", "0–3"] as const;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

function DemoBadge() {
  return <span className="rounded bg-live/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-live">DEMO</span>;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Greška.");
  return j as T;
}

export function FilterClient({ initialSets, scans }: { initialSets: FilterSetDto[]; scans: ScanStatusDto[] }) {
  const [sets, setSets] = useState(initialSets);
  const [setId, setSetId] = useState<string | null>(initialSets[0]?.id ?? null);
  const [entries, setEntries] = useState<FilterEntryDto[]>([]);
  const [scanId, setScanId] = useState<string | null>(scans[0]?.id ?? null);
  const [selections, setSelections] = useState<SelectionDto[]>([]);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [dragging, setDragging] = useState<SelectionDto | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // filteri leve kolone
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [day, setDay] = useState("all");
  const [minOdds, setMinOdds] = useState("");
  const [maxOdds, setMaxOdds] = useState("");
  const [sort, setSort] = useState<"time" | "odds">("time");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const savedSet = store.get("fos.filter.set");
    if (savedSet && initialSets.some((s) => s.id === savedSet)) setSetId(savedSet);
    const savedScan = store.get("fos.filter.scan");
    if (savedScan && scans.some((s) => s.id === savedScan)) setScanId(savedScan);
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, [initialSets, scans]);

  const flash = (text: string, tone: "ok" | "err" = "ok") => {
    setMsg({ text, tone });
    setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 3500);
  };

  const refreshSets = useCallback(async () => setSets(await api<FilterSetDto[]>("/api/filter-sets")), []);
  const refreshEntries = useCallback(async (id: string | null) => {
    if (!id) return setEntries([]);
    try { setEntries(await api<FilterEntryDto[]>(`/api/filter-sets/${id}/entries`)); } catch { setEntries([]); }
  }, []);

  useEffect(() => { refreshEntries(setId); if (setId) store.set("fos.filter.set", setId); }, [setId, refreshEntries]);
  useEffect(() => {
    if (!scanId) return setSelections([]);
    store.set("fos.filter.scan", scanId);
    api<SelectionDto[]>(`/api/robot/scans/${scanId}/selections`).then(setSelections).catch(() => setSelections([]));
  }, [scanId]);

  const inFilter = useMemo(() => new Set(entries.map((e) => `${e.matchId}|${e.marketType}`)), [entries]);
  const activeSet = sets.find((s) => s.id === setId) ?? null;

  async function add(sel: SelectionDto) {
    if (!setId) return flash("Prvo napravite ili izaberite filter (desno).", "err");
    try {
      await api(`/api/filter-sets/${setId}/entries`, { method: "POST", body: JSON.stringify({ marketSelectionId: sel.id }) });
      flash(`Dodato: ${sel.homeTeam} – ${sel.awayTeam}, ${sel.label} @ ${sel.odds.toFixed(2)}`);
      await Promise.all([refreshEntries(setId), refreshSets()]);
    } catch (e) { flash((e as Error).message, "err"); }
  }

  async function remove(entry: FilterEntryDto) {
    if (!setId) return;
    try {
      await api(`/api/filter-sets/${setId}/entries/${entry.id}`, { method: "DELETE" });
      await Promise.all([refreshEntries(setId), refreshSets()]);
    } catch (e) { flash((e as Error).message, "err"); }
  }

  async function clearAll() {
    if (!setId || !activeSet) return;
    if (!window.confirm(`Ukloniti svih ${entries.length} tipova iz filtera „${activeSet.name}“?`)) return;
    try {
      await api(`/api/filter-sets/${setId}/clear`, { method: "POST" });
      flash("Filter je očišćen.");
      await Promise.all([refreshEntries(setId), refreshSets()]);
    } catch (e) { flash((e as Error).message, "err"); }
  }

  async function createSet(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { id } = await api<{ id: string }>("/api/filter-sets", { method: "POST", body: JSON.stringify({ name: newName }) });
      setNewName(null);
      await refreshSets();
      setSetId(id);
      flash("Filter je napravljen.");
    } catch (err) { flash((err as Error).message, "err"); }
  }

  async function renameSet(e: React.FormEvent) {
    e.preventDefault();
    if (!setId) return;
    try {
      await api(`/api/filter-sets/${setId}`, { method: "PATCH", body: JSON.stringify({ name: renaming }) });
      setRenaming(null);
      await refreshSets();
    } catch (err) { flash((err as Error).message, "err"); }
  }

  async function deleteSet() {
    if (!activeSet) return;
    if (!window.confirm(`Obrisati filter „${activeSet.name}“? Istorija ostaje sačuvana za statistiku.`)) return;
    try {
      await api(`/api/filter-sets/${activeSet.id}`, { method: "DELETE" });
      const list = await api<FilterSetDto[]>("/api/filter-sets");
      setSets(list);
      setSetId(list[0]?.id ?? null);
      flash("Filter je obrisan.");
    } catch (err) { flash((err as Error).message, "err"); }
  }

  // ---------- leva kolona: filtriranje ----------
  const days = useMemo(() => [...new Set(selections.map((s) => dayKey(s.kickoffTime)))].sort(), [selections]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const lo = parseFloat(minOdds.replace(",", "."));
    const hi = parseFloat(maxOdds.replace(",", "."));
    const rows = selections.filter((s) =>
      (!needle || [s.homeTeam, s.awayTeam, s.competition, s.country ?? ""].some((f) => f.toLowerCase().includes(needle))) &&
      (types.length === 0 || types.includes(s.label)) &&
      (day === "all" || dayKey(s.kickoffTime) === day) &&
      (Number.isNaN(lo) || s.odds >= lo - 1e-9) &&
      (Number.isNaN(hi) || s.odds <= hi + 1e-9));
    return rows.sort((a, b) => (sort === "odds" ? a.odds - b.odds || a.kickoffTime.localeCompare(b.kickoffTime) : a.kickoffTime.localeCompare(b.kickoffTime)));
  }, [selections, q, types, day, minOdds, maxOdds, sort]);

  const groups = useMemo(() => {
    if (sort === "odds") return filtered.map((s) => [s]);
    const m = new Map<string, SelectionDto[]>();
    for (const s of filtered) m.set(s.matchId, [...(m.get(s.matchId) ?? []), s]);
    return [...m.values()];
  }, [filtered, sort]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as { sel: SelectionDto }).sel);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (e.over?.id === "filter-drop") add((e.active.data.current as { sel: SelectionDto }).sel);
  };

  const plannedStake = entries.reduce((a, e) => a + e.stake, 0);
  const inputCls = "rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      {msg && (
        <div role={msg.tone === "err" ? "alert" : "status"}
          className={`fixed bottom-20 left-1/2 z-50 lg:bottom-4 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-lg ${msg.tone === "err" ? "bg-lost text-white" : "bg-accent text-bg"}`}>
          {msg.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEVA KOLONA */}
        <Card className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Pronađene selekcije</h2>
            <select aria-label="Skeniranje" value={scanId ?? ""} onChange={(e) => setScanId(e.target.value || null)} className={`${inputCls} max-w-full`}>
              {scans.length === 0 && <option value="">Nema skeniranja</option>}
              {scans.map((s) => (
                <option key={s.id} value={s.id}>{fmtShort.format(new Date(s.startedAt))} · {s.periodLabel} · {s.providerName}{s.isDemo ? " (DEMO)" : ""} · {s.selectionsFound}</option>
              ))}
            </select>
          </div>

          {scans.length === 0 ? (
            <EmptyState title="Nema skeniranja" text="Pokrenite robota (stranica Robot), pa se vratite ovde." />
          ) : (
            <>
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pretraga tima ili lige" aria-label="Pretraga" className={inputCls} />
                <div className="flex gap-2">
                  <select aria-label="Dan" value={day} onChange={(e) => setDay(e.target.value)} className={`${inputCls} flex-1`}>
                    <option value="all">Svi dani</option>
                    {days.map((d) => <option key={d} value={d}>{fmtDay(d)}</option>)}
                  </select>
                  <select aria-label="Sortiranje" value={sort} onChange={(e) => setSort(e.target.value as "time" | "odds")} className={inputCls}>
                    <option value="time">Po vremenu</option>
                    <option value="odds">Po kvoti</option>
                  </select>
                </div>
                <div className="flex gap-1">
                  {TYPES.map((t) => (
                    <button key={t} type="button" aria-pressed={types.includes(t)} onClick={() => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                      className={`min-w-11 flex-1 rounded-lg border px-2 py-2 text-sm ${types.includes(t) ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted"}`}>{t}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted">
                  Kvota
                  <input value={minOdds} onChange={(e) => setMinOdds(e.target.value)} placeholder="od" aria-label="Kvota od" inputMode="decimal" className={`${inputCls} w-full`} />
                  <input value={maxOdds} onChange={(e) => setMaxOdds(e.target.value)} placeholder="do" aria-label="Kvota do" inputMode="decimal" className={`${inputCls} w-full`} />
                </div>
              </div>
              <p className="mb-3 text-xs text-muted">{filtered.length} tipova · prevucite tip u filter ili kliknite <b>+</b></p>
              {filtered.length === 0 ? <EmptyState title="Nema tipova" text="Promenite pretragu ili filtere." /> : (
                <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1" data-testid="left-list">
                  {groups.map((rows) => {
                    const s = rows[0];
                    const started = new Date(s.kickoffTime).getTime() <= now;
                    return (
                      <li key={rows.map((r) => r.id).join()} className="rounded-xl border border-line bg-panel-2/60 p-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted">
                          <span className="truncate">{s.country ? `${s.country} · ` : ""}{s.competition}</span>
                          <span className="shrink-0">{started ? <span className="text-live">počela</span> : fmt.format(new Date(s.kickoffTime))}</span>
                        </div>
                        <p className="mt-1 font-medium">{s.homeTeam} – {s.awayTeam}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {rows.map((r) => (
                            <TipChip key={r.id} sel={r} added={inFilter.has(`${r.matchId}|${r.marketType}`)} disabled={started} onAdd={() => add(r)} />
                          ))}
                        </div>
                        <p className="mt-2 flex items-center gap-2 text-[11px] text-muted">Izvor: {s.source} {s.isDemo && <DemoBadge />}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Card>

        {/* DESNA KOLONA */}
        <Card className="min-w-0 scroll-mt-20 lg:sticky lg:top-6 lg:self-start">
          <span id="moj-filter" />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-semibold">Moj filter</h2>
            {sets.length > 0 && (
              <select aria-label="Izabrani filter" value={setId ?? ""} onChange={(e) => setSetId(e.target.value)} className={`${inputCls} max-w-[60%]`}>
                {sets.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
              </select>
            )}
            <button type="button" onClick={() => setNewName(`Filter ${new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: TZ, day: "numeric", month: "numeric" }).format(new Date())}`)}
              className="rounded-xl border border-accent/50 px-3 py-2 text-sm text-accent hover:bg-accent/10">+ Novi filter</button>
          </div>

          {newName !== null && (
            <form onSubmit={createSet} className="mb-3 flex gap-2">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Naziv novog filtera" maxLength={80} className={`${inputCls} flex-1`} />
              <button type="submit" className="rounded-xl bg-accent px-4 text-sm font-semibold text-bg">Napravi</button>
              <button type="button" onClick={() => setNewName(null)} className="px-2 text-sm text-muted">Otkaži</button>
            </form>
          )}

          {!activeSet ? (
            <EmptyState title="Nemate filter" text="Kliknite „+ Novi filter“, dajte mu naziv (npr. „Vikend – 50 tipova“) i prevucite tipove ovde." />
          ) : (
            <>
              {renaming !== null ? (
                <form onSubmit={renameSet} className="mb-3 flex gap-2">
                  <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label="Novi naziv" maxLength={80} className={`${inputCls} flex-1`} />
                  <button type="submit" className="rounded-xl bg-accent px-4 text-sm font-semibold text-bg">Sačuvaj</button>
                  <button type="button" onClick={() => setRenaming(null)} className="px-2 text-sm text-muted">Otkaži</button>
                </form>
              ) : (
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span>Napravljen {fmtShort.format(new Date(activeSet.createdAt))}</span>
                  <button type="button" onClick={() => setRenaming(activeSet.name)} className="hover:text-text">Preimenuj</button>
                  <button type="button" onClick={deleteSet} className="hover:text-lost">Obriši filter</button>
                </div>
              )}

              <dl className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-panel-2/60 p-3 text-sm">
                <div><dt className="text-xs text-muted">Tipova</dt><dd className="font-semibold tabular-nums" data-testid="filter-count">{entries.length}</dd></div>
                <div><dt className="text-xs text-muted">Ulog po tipu</dt><dd className="font-semibold tabular-nums">{rsd(activeSet.stakePerSelection)}</dd></div>
                <div><dt className="text-xs text-muted">Planirani ulog</dt><dd className="font-semibold tabular-nums">{rsd(plannedStake)}</dd></div>
              </dl>

              <DropZone active={!!dragging}>
                {entries.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted">Prevucite tip ovde<br /><span className="text-xs">ili kliknite + pored tipa</span></p>
                ) : (
                  <ul className="space-y-2" data-testid="filter-list">
                    {entries.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 text-sm">
                        <span className="grid h-9 min-w-12 place-items-center rounded-lg bg-accent/10 px-2 font-semibold text-accent">{e.label}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{e.homeTeam} – {e.awayTeam}</p>
                          <p className="truncate text-xs text-muted">{fmt.format(new Date(e.kickoffTime))} · {e.competition} · {e.source} {e.isDemo && <DemoBadge />}</p>
                        </div>
                        <span className="tabular-nums text-accent" data-odds={e.odds}>{e.odds.toFixed(2)}</span>
                        <span className="hidden rounded-full bg-pending/15 px-2 py-0.5 text-xs text-pending sm:inline">Na čekanju</span>
                        <button type="button" onClick={() => remove(e)} aria-label={`Ukloni ${e.homeTeam} – ${e.awayTeam} ${e.label}`}
                          className="rounded-lg p-1.5 text-muted hover:bg-lost/10 hover:text-lost">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </DropZone>

              {entries.length > 0 && (
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={clearAll} className="text-sm text-muted hover:text-lost">Očisti filter</button>
                </div>
              )}
              <p className="mt-3 text-xs text-muted">Svaki tip je zasebna simulirana opklada od {rsd(activeSet.stakePerSelection)}, bez dublova i kombinacija. Kvota i ulog se zaključavaju pri dodavanju. Obračun stiže u fazi 4.</p>
            </>
          )}
        </Card>
      </div>

      {activeSet && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur lg:hidden" data-testid="mobile-bar">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{activeSet.name}</p>
            <p className="text-xs text-muted">{entries.length} tipova · {rsd(plannedStake)}</p>
          </div>
          <a href="#moj-filter" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg">Moj filter</a>
        </div>
      )}
      {activeSet && <div className="h-16 lg:hidden" />}

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <span className="inline-flex items-center gap-2 rounded-lg border border-accent bg-panel px-3 py-1.5 text-sm shadow-xl">
            <b>{dragging.label}</b> <span className="text-accent">{dragging.odds.toFixed(2)}</span>
            <span className="max-w-48 truncate text-xs text-muted">{dragging.homeTeam} – {dragging.awayTeam}</span>
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function TipChip({ sel, added, disabled, onAdd }: { sel: SelectionDto; added: boolean; disabled: boolean; onAdd: () => void }) {
  const locked = added || disabled;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `sel-${sel.id}`, data: { sel }, disabled: locked });
  return (
    <span className={`inline-flex items-center overflow-hidden rounded-lg border text-sm ${added ? "border-accent bg-accent/20" : "border-accent/30 bg-accent/10"} ${isDragging ? "opacity-40" : ""} ${disabled && !added ? "opacity-40" : ""}`}>
      <span ref={setNodeRef} {...listeners} {...attributes} data-testid={`chip-${sel.id}`} data-odds={sel.odds}
        aria-label={`Tip ${sel.label} @ ${sel.odds.toFixed(2)}, ${sel.homeTeam} – ${sel.awayTeam}${locked ? "" : ", prevuci u filter"}`}
        className={`flex touch-none items-center gap-1.5 px-2.5 py-1.5 ${locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}>
        {!locked && <IconGrip className="h-3.5 w-3.5 text-muted" />}
        <b>{sel.label}</b> <span className="tabular-nums text-accent">{sel.odds.toFixed(2)}</span>
      </span>
      {added ? (
        <span className="border-l border-accent/40 px-2 py-1.5 text-accent" title="Već u filteru" aria-label="Već u filteru">✓</span>
      ) : (
        <button type="button" onClick={onAdd} disabled={disabled} aria-label={`Dodaj ${sel.label} ${sel.homeTeam} – ${sel.awayTeam} u filter`}
          className="border-l border-accent/30 px-2.5 py-1.5 font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed">+</button>
      )}
    </span>
  );
}

function DropZone({ active, children }: { active: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "filter-drop" });
  return (
    <div ref={setNodeRef} data-testid="drop-zone"
      className={`min-h-40 rounded-xl border-2 border-dashed p-2 transition-colors ${isOver ? "border-accent bg-accent/15" : active ? "border-accent/60 bg-accent/5" : "border-line"}`}>
      {children}
    </div>
  );
}
