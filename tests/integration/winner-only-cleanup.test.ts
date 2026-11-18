import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { winnerOnlyCleanup } from "@/lib/results/winner-only-cleanup";

const db = new PrismaClient();
async function wipe() {
  await db.$transaction([
    db.filterSetSelection.deleteMany(), db.filterSet.deleteMany(), db.trackedSelection.deleteMany(), db.resultUpdate.deleteMany(),
    db.marketSelection.deleteMany(), db.robotScan.deleteMany(), db.match.deleteMany(), db.auditLog.deleteMany(), db.jobState.deleteMany(),
  ]);
}
beforeEach(wipe);
afterAll(async () => { await wipe(); await db.$disconnect(); });

type T = "HOME" | "AWAY" | "OVER_1_5" | "UNDER_3_5" | "HOME_OVER_1_5";
async function world() {
  const scan = await db.robotScan.create({ data: { provider: "oddspapi:admiralbet.rs", periodLabel: "T", startDate: new Date(0), endDate: new Date(), maxOddsUsed: 1.3, status: "COMPLETED" } });
  const set13 = (await db.filterSet.create({ data: { name: "Filter za utakmice 13. 11.", stakePerSelection: 1000 } })).id;
  const set14 = (await db.filterSet.create({ data: { name: "Filter za utakmice 14. 11.", stakePerSelection: 1000 } })).id;
  const match = (home: string, away: string, score: [number, number], competition = "Liga") =>
    db.match.create({ data: { provider: "oddspapi", externalId: `x${Math.random()}`, homeTeam: home, awayTeam: away, competition, kickoffTime: new Date("2026-11-14T13:00:00Z"), finalHomeScore: score[0], finalAwayScore: score[1] } });
  const ms = (matchId: string, t: T, odds: number) => db.marketSelection.create({ data: { matchId, scanId: scan.id, marketType: t, odds, oddsTimestamp: new Date(), source: "AdmiralBet", manualOdds: t.includes("_") } });
  async function entry(setId: string, matchId: string, t: T, odds: number, status: "WON" | "LOST" | "PENDING", removedAt: Date | null = null) {
    const m = await ms(matchId, t, odds);
    const tr = await db.trackedSelection.upsert({ where: { matchId_marketType: { matchId, marketType: t } }, update: {}, create: { matchId, marketSelectionId: m.id, marketType: t, selection: t, originalOdds: odds, status } });
    return db.filterSetSelection.create({ data: { filterSetId: setId, trackedSelectionId: tr.id, marketSelectionId: m.id, oddsSnapshot: odds, stake: 1000, settlementStatus: status, removedAt } });
  }
  return { set13, set14, match, ms, entry };
}
const active = async (setId: string) => (await db.filterSetSelection.findMany({ where: { filterSetId: setId, removedAt: null }, include: { trackedSelection: { include: { match: true } } } }))
  .map((e) => `${e.trackedSelection.match.homeTeam}:${e.trackedSelection.marketType}:${e.settlementStatus}:${Number(e.oddsSnapshot)}`).sort();

describe("u filterima samo 1 i 2", () => {
  it("izbacuje 2+ i 0–3 (i završene), spojeni postaje pobednik po kvoti iz skeniranja", async () => {
    const w = await world();
    const a = await w.match("A", "B", [2, 0]);
    await w.entry(w.set14, a.id, "HOME", 1.2, "WON");
    await w.entry(w.set14, a.id, "OVER_1_5", 1.1, "WON");
    await w.entry(w.set14, a.id, "UNDER_3_5", 1.15, "WON");
    const c = await w.match("C", "D", [1, 0]);
    await w.ms(c.id, "HOME", 1.27); // kvota pobednika iz skeniranja
    await w.entry(w.set14, c.id, "HOME_OVER_1_5", 1.39, "LOST");
    const r = await winnerOnlyCleanup(db);
    expect(r).toMatchObject({ combosConverted: 1, removed: { "2+": 1, "0–3": 1 } });
    expect(await active(w.set14)).toEqual(["A:HOME:WON:1.2", "C:HOME:WON:1.27"]);
    expect(await winnerOnlyCleanup(db)).toBeNull(); // samo jednom
  });

  it("vraća slučajno uklonjenu Severnu Irsku – Maltu u filter za 13.11.", async () => {
    const w = await world();
    const ni = await w.match("Northern Ireland", "Malta", [3, 1], "U19 UEFA European Championship, Qualification");
    await w.entry(w.set13, ni.id, "HOME", 1.2, "WON", new Date());
    const r = await winnerOnlyCleanup(db);
    expect(r!.restored).toEqual(["Northern Ireland – Malta"]);
    expect(await active(w.set13)).toEqual(["Northern Ireland:HOME:WON:1.2"]);
  });

  it("ako postoji samo uklonjen spojeni tip, pravi pobednika", async () => {
    const w = await world();
    const ni = await w.match("Northern Ireland", "Malta", [3, 1], "U19 UEFA European Championship, Qualification");
    await w.ms(ni.id, "HOME", 1.2);
    await w.entry(w.set13, ni.id, "HOME_OVER_1_5", 1.29, "WON", new Date("2026-11-13T10:00:00Z"));
    const r = await winnerOnlyCleanup(db);
    expect(r!.restored).toEqual(["Northern Ireland – Malta"]);
    expect(await active(w.set13)).toEqual(["Northern Ireland:HOME:WON:1.2"]);
  });
});
