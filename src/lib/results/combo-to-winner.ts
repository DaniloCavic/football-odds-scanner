import { Prisma, type PrismaClient } from "@prisma/client";
import { MARKET_LABELS } from "@/lib/odds";
import { amountsFor, outcomeFor, type TrackStatus } from "./settle-math";
import { getState, setState } from "./job-state";

export const COMBO_TO_WINNER_KEY = "migrate:combo-to-winner:v1";
const COMBOS = ["HOME_OVER_1_5", "HOME_UNDER_3_5", "AWAY_OVER_1_5", "AWAY_UNDER_3_5"] as const;
const winnerOf = (t: string) => (t.startsWith("HOME") ? "HOME" : "AWAY") as "HOME" | "AWAY";

export type ComboToWinnerReport = {
  combos: number;
  converted: number;
  alreadyInFilter: number;
  noWinnerOdds: { match: string; type: string }[];
  settled: number;
  pending: number;
};

/**
 * Jednokratno: svaki stari spojeni tip u filteru („1&2+“ …) postaje samo pobednik (1 ili 2)
 * po kvoti pobednika koju je robot sačuvao, i obračunava se po rezultatu posle 90 minuta.
 * Spojeni tip se uklanja iz filtera (zapis ostaje u bazi). Idempotentno – posle prvog prolaza ne radi ništa.
 *
 * Obuhvata spojene tipove koji su još u filteru i one koje je migracija „samo_pobednik“ uklonila.
 */
export async function convertCombosToWinner(db: PrismaClient, now = new Date()): Promise<ComboToWinnerReport | null> {
  if (await getState<ComboToWinnerReport | null>(db, COMBO_TO_WINNER_KEY, null)) return null;

  const mig = await db.$queryRaw<{ started_at: Date }[]>`
    SELECT started_at FROM "_prisma_migrations" WHERE migration_name LIKE '%samo_pobednik' AND finished_at IS NOT NULL LIMIT 1`;
  const removedByMigrationFrom = mig[0]?.started_at ?? now;

  const entries = await db.filterSetSelection.findMany({
    where: {
      filterSet: { status: { not: "DELETED" } },
      trackedSelection: { marketType: { in: [...COMBOS] } },
      OR: [{ removedAt: null }, { removedAt: { gte: removedByMigrationFrom } }],
    },
    include: { trackedSelection: { include: { match: true } }, marketSelection: true },
    orderBy: { addedAt: "asc" },
  });

  const report: ComboToWinnerReport = { combos: entries.length, converted: 0, alreadyInFilter: 0, noWinnerOdds: [], settled: 0, pending: 0 };

  for (const e of entries) {
    const combo = e.trackedSelection;
    const match = combo.match;
    const winner = winnerOf(combo.marketType);
    await db.$transaction(async (tx) => {
      // kvota pobednika: isto skeniranje → već praćen tip → najnovije drugo skeniranje
      const sameScan = await tx.marketSelection.findUnique({
        where: { scanId_matchId_marketType: { scanId: e.marketSelection.scanId, matchId: match.id, marketType: winner } },
      });
      let tracked = await tx.trackedSelection.findUnique({ where: { matchId_marketType: { matchId: match.id, marketType: winner } } });
      const anyScan = sameScan ?? (tracked ? null : await tx.marketSelection.findFirst({
        where: { matchId: match.id, marketType: winner, manualOdds: false },
        orderBy: { createdAt: "desc" },
      }));
      const ms = sameScan ?? (tracked ? await tx.marketSelection.findUniqueOrThrow({ where: { id: tracked.marketSelectionId } }) : anyScan);
      const odds = sameScan?.odds ?? tracked?.originalOdds ?? anyScan?.odds ?? null;
      if (!ms || !odds) {
        report.noWinnerOdds.push({ match: `${match.homeTeam} – ${match.awayTeam}`, type: MARKET_LABELS[combo.marketType] });
        return;
      }

      // ishod pobednika
      const home = match.finalHomeScore ?? combo.finalHomeScore;
      const away = match.finalAwayScore ?? combo.finalAwayScore;
      let status: TrackStatus;
      if (e.settlementStatus === "VOID") status = "VOID";
      else if (home != null && away != null) status = outcomeFor(winner, home, away);
      else status = (tracked?.status as TrackStatus | undefined) ?? "PENDING";
      const final = status === "WON" || status === "LOST" || status === "VOID";

      if (!tracked) {
        tracked = await tx.trackedSelection.create({
          data: { matchId: match.id, marketSelectionId: ms.id, marketType: winner, selection: MARKET_LABELS[winner], originalOdds: odds },
        });
      }
      if (final && tracked.status !== status) {
        tracked = await tx.trackedSelection.update({
          where: { id: tracked.id },
          data: { status, finalHomeScore: home, finalAwayScore: away, resultSource: combo.resultSource ?? "Konverzija spojenog tipa", settledAt: combo.settledAt ?? now },
        });
      }

      const amounts = final ? amountsFor(status, e.stake, odds) : { grossReturn: null, netProfit: null };
      const existing = await tx.filterSetSelection.findUnique({
        where: { filterSetId_trackedSelectionId: { filterSetId: e.filterSetId, trackedSelectionId: tracked.id } },
      });
      if (existing && !existing.removedAt) {
        report.alreadyInFilter += 1; // pobednik je već u filteru – samo se uklanja spojeni tip
      } else {
        const data = {
          marketSelectionId: ms.id, oddsSnapshot: odds, stake: e.stake, addedAt: e.addedAt, removedAt: null,
          settlementStatus: status, grossReturn: amounts.grossReturn, netProfit: amounts.netProfit,
        };
        if (existing) await tx.filterSetSelection.update({ where: { id: existing.id }, data });
        else await tx.filterSetSelection.create({ data: { ...data, filterSetId: e.filterSetId, trackedSelectionId: tracked.id } });
        report.converted += 1;
        if (final) report.settled += 1; else report.pending += 1;
      }
      if (!e.removedAt) await tx.filterSetSelection.update({ where: { id: e.id }, data: { removedAt: now } });
      await tx.auditLog.create({
        data: {
          entityType: "FilterSetSelection", entityId: e.id, action: "COMBO_TO_WINNER",
          oldValue: { type: MARKET_LABELS[combo.marketType], odds: Number(e.oddsSnapshot), status: e.settlementStatus },
          newValue: { type: MARKET_LABELS[winner], odds: Number(odds), status },
          reason: "Spojeni tip vraćen kao samo pobednik meča",
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  await setState(db, COMBO_TO_WINNER_KEY, { ...report, at: now.toISOString() });
  return report;
}
