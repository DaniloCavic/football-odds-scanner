import "server-only";
import { prisma } from "@/lib/db";
import { MARKET_LABELS, type MarketTypeCode } from "@/lib/odds";
import { providerName } from "./providers";

export async function getScanStatus(id: string) {
  const s = await prisma.robotScan.findUnique({ where: { id } });
  if (!s) return null;
  return {
    id: s.id,
    provider: s.provider,
    providerName: providerName(s.provider),
    isDemo: s.isDemo,
    periodLabel: s.periodLabel,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    startedAt: s.startedAt.toISOString(),
    finishedAt: s.finishedAt?.toISOString() ?? null,
    status: s.status,
    stopRequested: s.stopRequested,
    maxOddsUsed: s.maxOddsUsed.toNumber(),
    fixturesTotal: s.fixturesTotal,
    fixturesScanned: s.fixturesScanned,
    fixturesExcluded: s.fixturesExcluded,
    pairsExcluded: s.pairsExcluded,
    selectionsFound: s.selectionsFound,
    requestsUsed: s.requestsUsed,
    errors: Array.isArray(s.errors) ? (s.errors as string[]) : [],
    diagnostics: (s.diagnostics ?? {}) as {
      priceCounts?: Record<string, { total: number; valid: number; min: number | null }>;
      soccerbetMarkets?: { id: string; count: number; name: string }[];
      bookmakerMarkets?: { id: string; count: number; name: string }[];
      marketMap?: Record<string, string[]>;
      rawSamples?: Record<string, unknown>;
      comboCatalog?: { id: number; name: string; outcomes: string[]; offeredByBookmaker: number }[];
    },
  };
}
export type ScanStatusDto = NonNullable<Awaited<ReturnType<typeof getScanStatus>>>;

export async function getScanSelections(scanId: string) {
  const rows = await prisma.marketSelection.findMany({
    where: { scanId, excludedReason: null },
    include: { match: true },
    orderBy: [{ match: { kickoffTime: "asc" } }, { marketType: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    matchId: r.matchId,
    marketType: r.marketType as MarketTypeCode,
    label: MARKET_LABELS[r.marketType as MarketTypeCode],
    odds: r.odds.toNumber(),
    oddsTimestamp: r.oddsTimestamp.toISOString(),
    source: r.source,
    isDemo: r.isDemo,
    homeTeam: r.match.homeTeam,
    awayTeam: r.match.awayTeam,
    competition: r.match.competition,
    country: r.match.country,
    kickoffTime: r.match.kickoffTime.toISOString(),
  }));
}
export type SelectionDto = Awaited<ReturnType<typeof getScanSelections>>[number];

export async function recentScans(limit = 5) {
  const ids = await prisma.robotScan.findMany({ orderBy: { startedAt: "desc" }, take: limit, select: { id: true } });
  return (await Promise.all(ids.map((i) => getScanStatus(i.id)))).filter(Boolean) as ScanStatusDto[];
}
