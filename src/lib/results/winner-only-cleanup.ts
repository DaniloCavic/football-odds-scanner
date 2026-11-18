import type { PrismaClient } from "@prisma/client";
import { MARKET_LABELS, MARKET_TYPES } from "@/lib/odds";
import { COMBO_ENTRY_INCLUDE, convertEntry, type ComboToWinnerReport } from "./combo-to-winner";
import { getState, setState } from "./job-state";

export const WINNER_ONLY_CLEANUP_KEY = "migrate:winner-only-cleanup:v1";
const COMBOS = ["HOME_OVER_1_5", "HOME_UNDER_3_5", "AWAY_OVER_1_5", "AWAY_UNDER_3_5"];

export type CleanupReport = {
  combosConverted: number;
  combosWithoutWinnerOdds: { match: string; type: string }[];
  removed: Record<string, number>;
  restored: string[];
};

/** Utakmice koje je korisnik slučajno uklonio – vraćaju se kao tip pobednika (ime filtera sadrži `filterHint`). */
export const RESTORE = [{ home: "Northern Ireland", away: "Malta", competition: "U19", filterHint: "13" }];

/**
 * Jednokratno čišćenje: u svim filterima ostaju samo tipovi 1 i 2.
 * 1) spojeni tipovi koji su još u filteru postaju pobednik (kvota pobednika iz skeniranja);
 * 2) svi ostali tipovi (2+, 0–3, X, spojeni bez kvote pobednika) se uklanjaju iz filtera – i završeni i otvoreni;
 * 3) slučajno uklonjene utakmice iz RESTORE se vraćaju.
 * Zapisi ostaju u bazi (meko uklanjanje), svaka promena ide u audit log. Idempotentno.
 */
export async function winnerOnlyCleanup(db: PrismaClient, now = new Date()): Promise<CleanupReport | null> {
  if (await getState<CleanupReport | null>(db, WINNER_ONLY_CLEANUP_KEY, null)) return null;
  const conv: ComboToWinnerReport = { combos: 0, converted: 0, alreadyInFilter: 0, noWinnerOdds: [], settled: 0, pending: 0 };
  const report: CleanupReport = { combosConverted: 0, combosWithoutWinnerOdds: [], removed: {}, restored: [] };
  const liveSets = { status: { not: "DELETED" as const } };

  // 1) spojeni tipovi u filterima → pobednik
  const combos = await db.filterSetSelection.findMany({
    where: { removedAt: null, filterSet: liveSets, trackedSelection: { marketType: { in: COMBOS as never[] } } },
    include: COMBO_ENTRY_INCLUDE,
  });
  for (const e of combos) await convertEntry(db, e, now, conv);
  report.combosConverted = conv.converted + conv.alreadyInFilter;
  report.combosWithoutWinnerOdds = conv.noWinnerOdds;

  // 2) sve što nije 1 ili 2 izlazi iz filtera
  const rest = await db.filterSetSelection.findMany({
    where: { removedAt: null, filterSet: liveSets, trackedSelection: { marketType: { notIn: [...MARKET_TYPES] } } },
    select: { id: true, filterSetId: true, trackedSelection: { select: { marketType: true } } },
  });
  for (const e of rest) {
    const label = MARKET_LABELS[e.trackedSelection.marketType];
    report.removed[label] = (report.removed[label] ?? 0) + 1;
  }
  if (rest.length) {
    await db.$transaction([
      db.filterSetSelection.updateMany({ where: { id: { in: rest.map((e) => e.id) } }, data: { removedAt: now } }),
      db.auditLog.create({ data: { entityType: "FilterSetSelection", entityId: "*", action: "WINNER_ONLY_CLEANUP", newValue: report.removed, reason: "U filterima ostaju samo tipovi 1 i 2" } }),
    ]);
  }

  // 3) vraćanje slučajno uklonjenih utakmica
  for (const r of RESTORE) {
    const sets = await db.filterSet.findMany({ where: { ...liveSets, name: { contains: r.filterHint } }, select: { id: true } });
    const where = {
      filterSetId: { in: sets.map((s) => s.id) },
      trackedSelection: { match: { homeTeam: { startsWith: r.home }, awayTeam: { startsWith: r.away }, competition: { contains: r.competition } } },
    };
    const name = `${r.home} – ${r.away}`;
    // a) pobednik već postoji kao uklonjen zapis → vrati ga
    const winner = await db.filterSetSelection.findFirst({ where: { ...where, removedAt: { not: null }, trackedSelection: { ...where.trackedSelection, marketType: { in: [...MARKET_TYPES] } } }, orderBy: { removedAt: "desc" } });
    if (winner) {
      const active = await db.filterSetSelection.findFirst({ where: { ...where, removedAt: null, trackedSelection: { ...where.trackedSelection, marketType: { in: [...MARKET_TYPES] } } } });
      if (!active) {
        await db.$transaction([
          db.filterSetSelection.update({ where: { id: winner.id }, data: { removedAt: null } }),
          db.auditLog.create({ data: { entityType: "FilterSetSelection", entityId: winner.id, action: "RESTORE", reason: `Slučajno uklonjeno: ${name}` } }),
        ]);
        report.restored.push(name);
      }
      continue;
    }
    // b) postoji samo spojeni tip → pretvori ga u pobednika
    const combo = await db.filterSetSelection.findFirst({ where: { ...where, trackedSelection: { ...where.trackedSelection, marketType: { in: COMBOS as never[] } } }, include: COMBO_ENTRY_INCLUDE, orderBy: { addedAt: "desc" } });
    if (combo && (await convertEntry(db, combo, now, conv))) report.restored.push(name);
  }

  await setState(db, WINNER_ONLY_CLEANUP_KEY, { ...report, at: now.toISOString() });
  return report;
}
