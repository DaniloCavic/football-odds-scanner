import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { COMBO_TO_WINNER_KEY, convertCombosToWinner } from "@/lib/results/combo-to-winner";

const db = new PrismaClient();

async function wipe() {
  await db.$transaction([
    db.filterSetSelection.deleteMany(), db.filterSet.deleteMany(), db.trackedSelection.deleteMany(), db.resultUpdate.deleteMany(),
    db.marketSelection.deleteMany(), db.robotScan.deleteMany(), db.match.deleteMany(), db.auditLog.deleteMany(), db.jobState.deleteMany(),
  ]);
}
beforeEach(wipe);
afterAll(async () => { await wipe(); await db.$disconnect(); });

/** Utakmica sa rezultatom, spojeni tip u filteru i (opciono) kvota pobednika iz istog skeniranja. */
async function combo(opts: { score: [number, number] | null; type?: "HOME_OVER_1_5" | "AWAY_OVER_1_5"; winnerOdds?: number | null; comboStatus?: "WON" | "LOST" | "PENDING"; removed?: boolean; setId?: string }) {
  const scan = await db.robotScan.create({ data: { provider: "oddspapi:admiralbet.rs", periodLabel: "T", startDate: new Date(0), endDate: new Date(), maxOddsUsed: 1.3, status: "COMPLETED" } });
  const [h, a] = opts.score ?? [null, null];
  const match = await db.match.create({ data: { provider: "oddspapi", externalId: `x${Math.random()}`, homeTeam: "A", awayTeam: "B", competition: "L", kickoffTime: new Date("2026-11-14T15:00:00Z"), finalHomeScore: h, finalAwayScore: a } });
  const type = opts.type ?? "HOME_OVER_1_5";
  const winner = type.startsWith("HOME") ? "HOME" : "AWAY";
  if (opts.winnerOdds !== null) await db.marketSelection.create({ data: { matchId: match.id, scanId: scan.id, marketType: winner, odds: opts.winnerOdds ?? 1.22, oddsTimestamp: new Date(), source: "AdmiralBet" } });
  const ms = await db.marketSelection.create({ data: { matchId: match.id, scanId: scan.id, marketType: type, odds: 1.4, oddsTimestamp: new Date(), source: "ručni unos", manualOdds: true } });
  const tr = await db.trackedSelection.create({ data: { matchId: match.id, marketSelectionId: ms.id, marketType: type, selection: "1&2+", originalOdds: 1.4, status: opts.comboStatus ?? "LOST", finalHomeScore: h, finalAwayScore: a, resultSource: "API-Football" } });
  const setId = opts.setId ?? (await db.filterSet.create({ data: { name: "F", stakePerSelection: 1000 } })).id;
  await db.filterSetSelection.create({ data: { filterSetId: setId, trackedSelectionId: tr.id, marketSelectionId: ms.id, oddsSnapshot: 1.4, stake: 1000, settlementStatus: opts.comboStatus ?? "LOST", removedAt: opts.removed ? new Date("2026-11-10T00:00:00Z") : null } });
  return { match, setId };
}

const active = (setId: string) => db.filterSetSelection.findMany({ where: { filterSetId: setId, removedAt: null }, include: { trackedSelection: true } });

describe("spojeni tip → samo pobednik", () => {
  it("1:0 – spojeni je pao, pobednik prolazi po kvoti pobednika", async () => {
    const { setId } = await combo({ score: [1, 0], winnerOdds: 1.22 });
    const r = await convertCombosToWinner(db);
    expect(r).toMatchObject({ combos: 1, converted: 1, settled: 1, noWinnerOdds: [] });
    const [e] = await active(setId);
    expect(e.trackedSelection.marketType).toBe("HOME");
    expect([e.settlementStatus, Number(e.oddsSnapshot), Number(e.grossReturn), Number(e.netProfit)]).toEqual(["WON", 1.22, 1220, 220]);
    expect(e.trackedSelection.status).toBe("WON");
    expect(await db.auditLog.count({ where: { action: "COMBO_TO_WINNER" } })).toBe(1);
  });

  it("1:1 – gost/domaćin nije pobedio → gubitak; 2&2+ postaje 2", async () => {
    const { setId } = await combo({ score: [1, 1], type: "AWAY_OVER_1_5", winnerOdds: 1.19 });
    await convertCombosToWinner(db);
    const [e] = await active(setId);
    expect([e.trackedSelection.marketType, e.settlementStatus, Number(e.netProfit)]).toEqual(["AWAY", "LOST", -1000]);
  });

  it("nema kvote pobednika → ne izmišlja, prijavljuje i ostavlja kako je", async () => {
    const { setId } = await combo({ score: [2, 0], winnerOdds: null });
    const r = await convertCombosToWinner(db);
    expect(r!.noWinnerOdds).toHaveLength(1);
    expect((await active(setId))[0].trackedSelection.marketType).toBe("HOME_OVER_1_5");
  });

  it("utakmica bez rezultata → pobednik čeka obračun (PENDING)", async () => {
    const { setId } = await combo({ score: null, comboStatus: "PENDING" });
    const r = await convertCombosToWinner(db);
    expect(r).toMatchObject({ converted: 1, pending: 1 });
    const [e] = await active(setId);
    expect([e.trackedSelection.marketType, e.settlementStatus, e.grossReturn]).toEqual(["HOME", "PENDING", null]);
  });

  it("ranije ručno uklonjen spojeni tip se ne vraća; drugi prolaz ne radi ništa", async () => {
    await combo({ score: [2, 0], removed: true });
    expect((await convertCombosToWinner(db))!.combos).toBe(0);
    expect(await convertCombosToWinner(db)).toBeNull();
    expect(await db.jobState.findUnique({ where: { key: COMBO_TO_WINNER_KEY } })).not.toBeNull();
  });
});
