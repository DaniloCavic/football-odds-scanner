import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { StatRow } from "./compute";

export type StatQuery = {
  from?: Date | null;
  to?: Date | null;
  /** active = samo tipovi u aktivnim filterima; all = i uklonjeni/obrisani (istorija) */
  scope: "active" | "all";
  includeDemo: boolean;
  filterSetId?: string | null;
};

export async function loadStatRows(q: StatQuery): Promise<StatRow[]> {
  const where: Prisma.FilterSetSelectionWhereInput = {
    ...(q.scope === "active" ? { removedAt: null, filterSet: { status: { not: "DELETED" } } } : {}),
    ...(q.filterSetId ? { filterSetId: q.filterSetId } : {}),
    ...(q.includeDemo ? {} : { marketSelection: { isDemo: false } }),
    trackedSelection: {
      match: {
        kickoffTime: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) },
      },
    },
  };
  const rows = await prisma.filterSetSelection.findMany({
    where,
    include: { filterSet: { select: { id: true, name: true } }, trackedSelection: { include: { match: true } } },
  });
  return rows.map((r) => ({
    status: r.settlementStatus,
    marketType: r.trackedSelection.marketType,
    odds: r.oddsSnapshot.toNumber(),
    stake: r.stake.toNumber(),
    gross: r.grossReturn?.toNumber() ?? null,
    net: r.netProfit?.toNumber() ?? null,
    kickoff: r.trackedSelection.match.kickoffTime.toISOString(),
    competition: r.trackedSelection.match.competition,
    country: r.trackedSelection.match.country,
    filterSetId: r.filterSet.id,
    filterSetName: r.filterSet.name,
    match: `${r.trackedSelection.match.homeTeam} – ${r.trackedSelection.match.awayTeam}`,
    home: r.trackedSelection.finalHomeScore,
    away: r.trackedSelection.finalAwayScore,
  }));
}
