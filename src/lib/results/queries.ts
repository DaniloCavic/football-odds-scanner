import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MARKET_LABELS, type MarketTypeCode } from "@/lib/odds";
import { getState } from "./job-state";
import type { TrackerReport } from "./tracker";

/** Tipovi koji su u bar jednom (neobrisanom) filteru. */
const inActiveFilter: Prisma.TrackedSelectionWhereInput = {
  filterEntries: { some: { removedAt: null, filterSet: { status: { not: "DELETED" } } } },
};

export const TABS = {
  all: { label: "Sve", statuses: null },
  pending: { label: "Na čekanju", statuses: ["PENDING"] },
  live: { label: "Uživo", statuses: ["LIVE"] },
  won: { label: "Prošlo", statuses: ["WON"] },
  lost: { label: "Palo", statuses: ["LOST"] },
  postponed: { label: "Odloženo", statuses: ["POSTPONED", "VOID"] },
  review: { label: "Potrebna provera", statuses: ["NEEDS_REVIEW"] },
} as const;
export type TabKey = keyof typeof TABS;

export async function trackedCounts() {
  const g = await prisma.trackedSelection.groupBy({ by: ["status"], where: inActiveFilter, _count: true });
  const by = Object.fromEntries(g.map((x) => [x.status, x._count])) as Record<string, number>;
  const out = {} as Record<TabKey, number>;
  for (const [k, t] of Object.entries(TABS) as [TabKey, (typeof TABS)[TabKey]][]) {
    out[k] = t.statuses ? t.statuses.reduce((a, s) => a + (by[s] ?? 0), 0) : Object.values(by).reduce((a, b) => a + b, 0);
  }
  return out;
}

export async function listTracked(tab: TabKey) {
  const statuses = TABS[tab].statuses;
  const rows = await prisma.trackedSelection.findMany({
    where: { ...inActiveFilter, ...(statuses ? { status: { in: [...statuses] } } : {}) },
    include: { match: true, marketSelection: true, filterEntries: { where: { removedAt: null }, include: { filterSet: true } } },
    orderBy: [{ match: { kickoffTime: tab === "won" || tab === "lost" ? "desc" : "asc" } }],
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    kickoffTime: r.match.kickoffTime.toISOString(),
    competition: r.match.competition,
    country: r.match.country,
    homeTeam: r.match.homeTeam,
    awayTeam: r.match.awayTeam,
    label: MARKET_LABELS[r.marketType as MarketTypeCode],
    odds: r.originalOdds.toNumber(),
    status: r.status,
    home: r.finalHomeScore,
    away: r.finalAwayScore,
    resultSource: r.resultSource,
    oddsSource: r.marketSelection.source,
    isDemo: r.marketSelection.isDemo,
    filters: [...new Set(r.filterEntries.filter((e) => e.filterSet.status !== "DELETED").map((e) => e.filterSet.name))],
  }));
}
export type TrackedRow = Awaited<ReturnType<typeof listTracked>>[number];

export async function trackedDetail(id: string) {
  const t = await prisma.trackedSelection.findUnique({
    where: { id },
    include: {
      match: { include: { resultUpdates: { orderBy: { fetchedAt: "asc" } } } },
      marketSelection: { include: { scan: true } },
      filterEntries: { include: { filterSet: true }, orderBy: { addedAt: "asc" } },
    },
  });
  if (!t) return null;
  const history = await prisma.auditLog.findMany({ where: { entityType: "TrackedSelection", entityId: id }, orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } } } });
  return {
    id: t.id,
    status: t.status,
    label: MARKET_LABELS[t.marketType as MarketTypeCode],
    marketType: t.marketType,
    originalOdds: t.originalOdds.toNumber(),
    home: t.finalHomeScore,
    away: t.finalAwayScore,
    resultSource: t.resultSource,
    settledAt: t.settledAt?.toISOString() ?? null,
    match: {
      homeTeam: t.match.homeTeam, awayTeam: t.match.awayTeam, competition: t.match.competition, country: t.match.country,
      kickoffTime: t.match.kickoffTime.toISOString(), apiFootballId: t.match.apiFootballId, confidence: t.match.resultMatchConfidence,
    },
    oddsSource: t.marketSelection.source,
    oddsTimestamp: t.marketSelection.oddsTimestamp.toISOString(),
    scanStartedAt: t.marketSelection.scan.startedAt.toISOString(),
    isDemo: t.marketSelection.isDemo,
    results: t.match.resultUpdates.map((u) => ({ source: u.source, status: u.matchStatus, home: u.homeScore, away: u.awayScore, at: u.fetchedAt.toISOString(), detail: u.detail })),
    history: history.map((h) => ({ action: h.action, old: h.oldValue, new: h.newValue, reason: h.reason, by: h.user?.email ?? "Result Tracker", at: h.createdAt.toISOString() })),
    entries: t.filterEntries.map((e) => ({
      filter: e.filterSet.name, deleted: e.filterSet.status === "DELETED", removed: !!e.removedAt,
      odds: e.oddsSnapshot.toNumber(), stake: e.stake.toNumber(), status: e.settlementStatus,
      gross: e.grossReturn?.toNumber() ?? null, net: e.netProfit?.toNumber() ?? null,
    })),
  };
}
export type TrackedDetail = NonNullable<Awaited<ReturnType<typeof trackedDetail>>>;

/** Finansijski i statistički sažetak za skup zapisa u filterima. */
export async function entrySummary(where: Prisma.FilterSetSelectionWhereInput) {
  const g = await prisma.filterSetSelection.groupBy({ by: ["settlementStatus"], where, _count: true, _sum: { stake: true, grossReturn: true, netProfit: true } });
  const get = (s: string) => g.find((x) => x.settlementStatus === s);
  const n = (s: string) => get(s)?._count ?? 0;
  const won = n("WON"), lost = n("LOST"), voided = n("VOID");
  const settled = g.filter((x) => ["WON", "LOST", "VOID"].includes(x.settlementStatus));
  const sum = (k: "stake" | "grossReturn" | "netProfit", rows = settled) => rows.reduce((a, x) => a + (x._sum[k]?.toNumber() ?? 0), 0);
  return {
    total: g.reduce((a, x) => a + x._count, 0),
    won, lost, void: voided,
    pending: n("PENDING"), live: n("LIVE"), postponed: n("POSTPONED"), review: n("NEEDS_REVIEW"),
    passRate: won + lost > 0 ? (won / (won + lost)) * 100 : null,
    settledStake: sum("stake"),
    grossReturn: sum("grossReturn"),
    netProfit: sum("netProfit"),
    plannedStake: sum("stake", g),
  };
}
export type EntrySummary = Awaited<ReturnType<typeof entrySummary>>;

export const activeEntriesWhere: Prisma.FilterSetSelectionWhereInput = { removedAt: null, filterSet: { status: { not: "DELETED" } } };

export async function lastTrackerReport() {
  return getState<TrackerReport | null>(prisma, "tracker:last", null);
}
