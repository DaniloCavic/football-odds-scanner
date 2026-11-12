import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addEntries, addEntry, clearFilterSet, createFilterSet, deleteFilterSet, listEntries, listFilterSets, removeEntry } from "@/lib/filter/service";

const db = new PrismaClient();
const HOUR = 3600_000;

async function wipe() {
  await db.$transaction([
    db.filterSetSelection.deleteMany(), db.filterSet.deleteMany(), db.trackedSelection.deleteMany(), db.resultUpdate.deleteMany(), db.jobState.deleteMany(),
    db.marketSelection.deleteMany(), db.robotScan.deleteMany(), db.match.deleteMany(), db.auditLog.deleteMany(),
  ]);
}

async function seed(kickoffInHours = 5) {
  const scan = await db.robotScan.create({
    data: { provider: "test", periodLabel: "Test", startDate: new Date(), endDate: new Date(Date.now() + 48 * HOUR), maxOddsUsed: 1.3, status: "COMPLETED" },
  });
  const match = await db.match.create({
    data: { provider: "test", externalId: `m-${Math.random()}`, homeTeam: "Arsenal", awayTeam: "Chelsea", competition: "PL", kickoffTime: new Date(Date.now() + kickoffInHours * HOUR) },
  });
  const mk = (marketType: "HOME" | "OVER_1_5" | "UNDER_3_5", odds: number) =>
    db.marketSelection.create({ data: { matchId: match.id, scanId: scan.id, marketType, odds, oddsTimestamp: new Date(), source: "Test" } });
  return { scan, match, home: await mk("HOME", 1.25), over: await mk("OVER_1_5", 1.18), under: await mk("UNDER_3_5", 1.3) };
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await db.$disconnect(); });

describe("filter – trajno čuvanje i pravila", () => {
  it("dodaje pojedinačne tipove, isti tip ne može dvaput, različiti tipovi iste utakmice mogu", async () => {
    const { home, over } = await seed();
    const setId = await createFilterSet(db, { name: "  Vikend   – 50 tipova ", userId: null, stake: 1000 });
    await addEntry(db, { filterSetId: setId, marketSelectionId: home.id, maxOdds: 1.3 });
    await addEntry(db, { filterSetId: setId, marketSelectionId: over.id, maxOdds: 1.3 });
    await expect(addEntry(db, { filterSetId: setId, marketSelectionId: home.id, maxOdds: 1.3 })).rejects.toThrow(/već u filteru/);

    const entries = await listEntries(db, setId);
    expect(entries.map((e) => `${e.label}@${e.odds}`).sort()).toEqual(["1@1.25", "2+@1.18"]);
    expect(entries.every((e) => e.stake === 1000 && e.status === "PENDING")).toBe(true);
    const [set] = await listFilterSets(db);
    expect(set.name).toBe("Vikend – 50 tipova");
    expect(set.count).toBe(2);
  });

  it("kvota i ulog su snimak: promena uloga u podešavanjima ne menja postojeći filter", async () => {
    const { home, under } = await seed();
    const a = await createFilterSet(db, { name: "A", userId: null, stake: 1000 });
    await addEntry(db, { filterSetId: a, marketSelectionId: home.id, maxOdds: 1.3 });
    const b = await createFilterSet(db, { name: "B", userId: null, stake: 500 });
    await addEntry(db, { filterSetId: b, marketSelectionId: under.id, maxOdds: 1.3 });
    expect((await listEntries(db, a))[0].stake).toBe(1000);
    expect((await listEntries(db, b))[0].stake).toBe(500);
  });

  it("isti tip u dva različita filtera deli jedan praćeni tip (jedan obračun)", async () => {
    const { home } = await seed();
    const a = await createFilterSet(db, { name: "A", userId: null, stake: 1000 });
    const b = await createFilterSet(db, { name: "B", userId: null, stake: 1000 });
    await addEntry(db, { filterSetId: a, marketSelectionId: home.id, maxOdds: 1.3 });
    await addEntry(db, { filterSetId: b, marketSelectionId: home.id, maxOdds: 1.3 });
    expect(await db.trackedSelection.count()).toBe(1);
  });

  it("odbija utakmicu koja je počela i kvotu iznad limita", async () => {
    const { home } = await seed(-1);
    const setId = await createFilterSet(db, { name: "X", userId: null, stake: 1000 });
    await expect(addEntry(db, { filterSetId: setId, marketSelectionId: home.id, maxOdds: 1.3 })).rejects.toThrow(/počela/);
    const fresh = await seed();
    await expect(addEntry(db, { filterSetId: setId, marketSelectionId: fresh.home.id, maxOdds: 1.2 })).rejects.toThrow(/iznad/);
  });

  it("uklanjanje i čišćenje ne brišu istoriju; ponovno dodavanje vraća tip", async () => {
    const { home, over, under } = await seed();
    const setId = await createFilterSet(db, { name: "X", userId: null, stake: 1000 });
    const e1 = await addEntry(db, { filterSetId: setId, marketSelectionId: home.id, maxOdds: 1.3 });
    await addEntry(db, { filterSetId: setId, marketSelectionId: over.id, maxOdds: 1.3, excludeGoalsPair: false });
    await addEntry(db, { filterSetId: setId, marketSelectionId: under.id, maxOdds: 1.3, excludeGoalsPair: false });

    await removeEntry(db, setId, e1);
    expect(await listEntries(db, setId)).toHaveLength(2);
    expect(await db.filterSetSelection.count()).toBe(3); // zapis ostaje

    await addEntry(db, { filterSetId: setId, marketSelectionId: home.id, maxOdds: 1.3 });
    expect(await listEntries(db, setId)).toHaveLength(3);

    expect(await clearFilterSet(db, setId, null)).toBe(3);
    expect(await listEntries(db, setId)).toHaveLength(0);
    expect(await db.filterSetSelection.count()).toBe(3);
    expect(await db.auditLog.count({ where: { action: "CLEAR" } })).toBe(1);
  });

  it("obrisan filter nestaje iz liste, ali zapisi ostaju", async () => {
    const { home } = await seed();
    const setId = await createFilterSet(db, { name: "X", userId: null, stake: 1000 });
    await addEntry(db, { filterSetId: setId, marketSelectionId: home.id, maxOdds: 1.3 });
    await deleteFilterSet(db, setId, null);
    expect(await listFilterSets(db)).toHaveLength(0);
    expect(await db.filterSetSelection.count()).toBe(1);
    await expect(listEntries(db, setId)).rejects.toThrow(/ne postoji/);
  });

  it("naziv je obavezan i ograničen", async () => {
    await expect(createFilterSet(db, { name: "   ", userId: null, stake: 1000 })).rejects.toThrow(/naziv/);
    await expect(createFilterSet(db, { name: "x".repeat(81), userId: null, stake: 1000 })).rejects.toThrow(/80/);
  });

  it("dodaj sve: dodaje nove, preskače duplikate, počele i neispravne", async () => {
    const a = await seed();
    const old = await seed(-1);
    const setId = await createFilterSet(db, { name: "Sve", userId: null, stake: 1000 });
    await addEntry(db, { filterSetId: setId, marketSelectionId: a.home.id, maxOdds: 1.3 });
    const r = await addEntries(db, { filterSetId: setId, marketSelectionIds: [a.home.id, a.over.id, a.under.id, old.home.id, a.over.id], maxOdds: 1.25, excludeGoalsPair: false });
    // a.under ima kvotu 1.30 > 1.25
    expect(r).toEqual({ added: 1, duplicate: 1, started: 1, invalid: 1 });
    expect(await listEntries(db, setId)).toHaveLength(2);
  });

  it("istovremeno dodavanje istog tipa ne pravi duplikat", async () => {
    const { home } = await seed();
    const setId = await createFilterSet(db, { name: "X", userId: null, stake: 1000 });
    const results = await Promise.allSettled([1, 2, 3].map(() => addEntry(db, { filterSetId: setId, marketSelectionId: home.id, maxOdds: 1.3 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.filterSetSelection.count()).toBe(1);
  });
});
