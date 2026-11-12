import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addEntry, createFilterSet, listEntries } from "@/lib/filter/service";
import { retroExcludeGoalsPairs } from "@/lib/robot/retro";

const db = new PrismaClient();
const HOUR = 3600_000;

async function wipe() {
  await db.$transaction([
    db.filterSetSelection.deleteMany(), db.filterSet.deleteMany(), db.trackedSelection.deleteMany(), db.resultUpdate.deleteMany(),
    db.marketSelection.deleteMany(), db.robotScan.deleteMany(), db.match.deleteMany(), db.auditLog.deleteMany(), db.jobState.deleteMany(),
  ]);
}
beforeEach(wipe);
afterAll(async () => { await wipe(); await db.$disconnect(); });

async function scanWith(matches: { name: string; types: ("HOME" | "OVER_1_5" | "UNDER_3_5")[] }[]) {
  const scan = await db.robotScan.create({ data: { provider: "t", periodLabel: "T", startDate: new Date(), endDate: new Date(Date.now() + 9 * HOUR), maxOddsUsed: 1.3, status: "COMPLETED", selectionsFound: 99 } });
  const out: Record<string, Record<string, string>> = {};
  for (const m of matches) {
    const match = await db.match.create({ data: { provider: "t", externalId: `${m.name}-${Math.random()}`, homeTeam: m.name, awayTeam: "B", competition: "L", kickoffTime: new Date(Date.now() + 5 * HOUR) } });
    out[m.name] = {};
    for (const t of m.types) {
      const ms = await db.marketSelection.create({ data: { matchId: match.id, scanId: scan.id, marketType: t, odds: 1.2, oddsTimestamp: new Date(), source: "T" } });
      out[m.name][t] = ms.id;
    }
  }
  return { scan, ids: out };
}

describe("pravilo 2+ i 0–3 – stari podaci", () => {
  it("izbacuje oba tipa iz skeniranja i filtera, ostalo ostaje; idempotentno", async () => {
    const { scan, ids } = await scanWith([
      { name: "Par", types: ["HOME", "OVER_1_5", "UNDER_3_5"] },
      { name: "Samo2plus", types: ["OVER_1_5"] },
    ]);
    const set = await createFilterSet(db, { name: "F", userId: null, stake: 1000 });
    // stari podaci: ubačeni pre pravila (excludeGoalsPair: false)
    for (const id of [ids.Par.HOME, ids.Par.OVER_1_5, ids.Par.UNDER_3_5, ids.Samo2plus.OVER_1_5]) {
      await addEntry(db, { filterSetId: set, marketSelectionId: id, maxOdds: 1.3, excludeGoalsPair: false });
    }
    const r = await retroExcludeGoalsPairs(db);
    expect(r).toEqual({ selectionsExcluded: 2, filterEntriesRemoved: 2 });
    const left = await listEntries(db, set);
    expect(left.map((e) => `${e.homeTeam}:${e.marketType}`).sort()).toEqual(["Par:HOME", "Samo2plus:OVER_1_5"]);
    const s = await db.robotScan.findUniqueOrThrow({ where: { id: scan.id } });
    expect([s.selectionsFound, s.pairsExcluded]).toEqual([2, 1]);
    expect(await db.auditLog.count({ where: { action: "RETRO_EXCLUDE" } })).toBe(1);

    expect(await retroExcludeGoalsPairs(db)).toEqual({ selectionsExcluded: 0, filterEntriesRemoved: 0 });
    expect(await db.auditLog.count({ where: { action: "RETRO_EXCLUDE" } })).toBe(1);
  });

  it("izbačen tip ne može da se doda; suprotan tip golova iste utakmice u filteru se odbija", async () => {
    const { ids } = await scanWith([{ name: "Par", types: ["OVER_1_5", "UNDER_3_5"] }]);
    const set = await createFilterSet(db, { name: "F", userId: null, stake: 1000 });
    await addEntry(db, { filterSetId: set, marketSelectionId: ids.Par.OVER_1_5, maxOdds: 1.3 });
    await expect(addEntry(db, { filterSetId: set, marketSelectionId: ids.Par.UNDER_3_5, maxOdds: 1.3 })).rejects.toThrow(/suprotan tip golova/);
    await retroExcludeGoalsPairs(db);
    const set2 = await createFilterSet(db, { name: "G", userId: null, stake: 1000 });
    await expect(addEntry(db, { filterSetId: set2, marketSelectionId: ids.Par.OVER_1_5, maxOdds: 1.3 })).rejects.toThrow(/izbačen pravilom/);
  });
});

describe("spojeni tip u filteru", () => {
  it("kvota spojenog tipa iznad 1.30 se prihvata, pojedinačni tip iznad 1.30 ne", async () => {
    const scan = await db.robotScan.create({ data: { provider: "t", periodLabel: "T", startDate: new Date(), endDate: new Date(Date.now() + 9 * HOUR), maxOddsUsed: 1.3, status: "COMPLETED" } });
    const match = await db.match.create({ data: { provider: "t", externalId: `c-${Math.random()}`, homeTeam: "A", awayTeam: "B", competition: "L", kickoffTime: new Date(Date.now() + 5 * HOUR) } });
    const combo = await db.marketSelection.create({ data: { matchId: match.id, scanId: scan.id, marketType: "HOME_OVER_1_5", odds: 1.62, oddsTimestamp: new Date(), source: "T" } });
    const single = await db.marketSelection.create({ data: { matchId: match.id, scanId: scan.id, marketType: "AWAY", odds: 1.45, oddsTimestamp: new Date(), source: "T" } });
    const set = await createFilterSet(db, { name: "F", userId: null, stake: 1000 });
    await addEntry(db, { filterSetId: set, marketSelectionId: combo.id, maxOdds: 1.3 });
    await expect(addEntry(db, { filterSetId: set, marketSelectionId: single.id, maxOdds: 1.3 })).rejects.toThrow(/iznad/);
    const e = await listEntries(db, set);
    expect(e.map((x) => [x.label, x.odds])).toEqual([["1&2+", 1.62]]);
  });
});
