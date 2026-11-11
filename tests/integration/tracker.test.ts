import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addEntry, createFilterSet } from "@/lib/filter/service";
import { applyDecision } from "@/lib/results/apply";
import type { AfFixture } from "@/lib/results/apifootball";
import { runTracker, type TrackerDeps } from "@/lib/results/tracker";

const db = new PrismaClient();
const MIN = 60_000;
const KICK = new Date("2026-11-10T18:00:00Z"); // 19:00 u Beogradu

async function wipe() {
  await db.$transaction([
    db.filterSetSelection.deleteMany(), db.filterSet.deleteMany(), db.trackedSelection.deleteMany(), db.resultUpdate.deleteMany(),
    db.marketSelection.deleteMany(), db.robotScan.deleteMany(), db.match.deleteMany(), db.auditLog.deleteMany(), db.jobState.deleteMany(),
  ]);
}
beforeEach(wipe);
afterAll(async () => { await wipe(); await db.$disconnect(); });

type Types = ("HOME" | "AWAY" | "OVER_1_5" | "UNDER_3_5")[];
async function setup(opts: { home?: string; away?: string; kickoff?: Date; isDemo?: boolean; types?: Types; odds?: number } = {}) {
  const kickoff = opts.kickoff ?? KICK;
  const scan = await db.robotScan.create({ data: { provider: "oddspapi:admiralbet.rs", periodLabel: "T", startDate: new Date(0), endDate: new Date(kickoff.getTime() + 86400000), maxOddsUsed: 1.3, status: "COMPLETED" } });
  const match = await db.match.create({
    data: { provider: "oddspapi", externalId: `id${Math.random()}`, homeTeam: opts.home ?? "Leicester City", awayTeam: opts.away ?? "Walsall FC", competition: "EFL Trophy", country: "England", kickoffTime: kickoff, isDemo: !!opts.isDemo },
  });
  const set = await createFilterSet(db, { name: "F", userId: null, stake: 1000 });
  const ids: Record<string, string> = {};
  for (const t of opts.types ?? ["HOME", "OVER_1_5", "UNDER_3_5"]) {
    const ms = await db.marketSelection.create({ data: { matchId: match.id, scanId: scan.id, marketType: t, odds: opts.odds ?? 1.25, oddsTimestamp: new Date(), source: "AdmiralBet · OddsPapi" } });
    await addEntry(db, { filterSetId: set, marketSelectionId: ms.id, maxOdds: 1.3, now: new Date(kickoff.getTime() - 60 * MIN) });
    ids[t] = (await db.trackedSelection.findFirstOrThrow({ where: { marketSelectionId: ms.id } })).id;
  }
  return { match, set, ids };
}

const fx = (over: Partial<AfFixture> = {}): AfFixture => ({
  id: 777, home: "Leicester", away: "Walsall", kickoff: KICK, league: "EFL Trophy", country: "England",
  status: "FINISHED", statusShort: "FT", score90: { home: 2, away: 1 }, ...over,
});

function deps(over: Partial<TrackerDeps> & { at: number; day?: AfFixture[] | (() => AfFixture[]) }): TrackerDeps {
  const day = over.day ?? [fx()];
  return {
    db, now: new Date(KICK.getTime() + over.at * MIN),
    apiFootball: over.apiFootball !== undefined ? over.apiFootball : vi.fn(async () => (typeof day === "function" ? day() : day)),
    oddsPapi: over.oddsPapi ?? null,
    resultCheckMinutes: over.resultCheckMinutes ?? 15,
    oddsPapiChecksPerDay: over.oddsPapiChecksPerDay ?? 10,
  };
}

const status = async (id: string) => (await db.trackedSelection.findUniqueOrThrow({ where: { id } })).status;
const entry = async (trackedId: string) => db.filterSetSelection.findFirstOrThrow({ where: { trackedSelectionId: trackedId } });

describe("Result Tracker", () => {
  it("pre početka ne troši zahteve; posle početka LIVE", async () => {
    const { ids } = await setup();
    const d = deps({ at: -30 });
    await runTracker(d);
    expect(d.apiFootball).not.toHaveBeenCalled();
    expect(await status(ids.HOME)).toBe("PENDING");
    const r = await runTracker(deps({ at: 30 }));
    expect(r.apiFootballCalls).toBe(0);
    expect(await status(ids.HOME)).toBe("LIVE");
  });

  it("završena utakmica (2:1): tačan obračun, isplata i profit; drugi prolaz ne obračunava ponovo", async () => {
    const { ids, match } = await setup();
    const r = await runTracker(deps({ at: 120 }));
    expect(r.settled).toBe(3);
    expect(await status(ids.HOME)).toBe("WON");
    expect(await status(ids.OVER_1_5)).toBe("WON");
    expect(await status(ids.UNDER_3_5)).toBe("WON"); // 3 gola
    const e = await entry(ids.HOME);
    expect([Number(e.grossReturn), Number(e.netProfit), e.settlementStatus]).toEqual([1250, 250, "WON"]);
    const m = await db.match.findUniqueOrThrow({ where: { id: match.id } });
    expect([m.apiFootballId, m.resultMatchConfidence, m.finalHomeScore, m.finalAwayScore]).toEqual([777, "HIGH", 2, 1]);

    const audits = await db.auditLog.count();
    const again = await runTracker(deps({ at: 200, resultCheckMinutes: 0 }));
    expect(again.settled).toBe(0);
    expect(await db.auditLog.count()).toBe(audits);
    expect(await db.resultUpdate.count({ where: { source: "API-Football" } })).toBe(1);
  });

  it("produžeci: računa se samo 90 minuta", async () => {
    const { ids } = await setup();
    await runTracker(deps({ at: 150, day: [fx({ statusShort: "AET", score90: { home: 1, away: 1 } })] }));
    expect(await status(ids.HOME)).toBe("LOST");
    expect(await status(ids.OVER_1_5)).toBe("WON");
    const e = await entry(ids.HOME);
    expect([Number(e.grossReturn), Number(e.netProfit)]).toEqual([0, -1000]);
  });

  it("odložena → POSTPONED, otkazana → VOID (ulog vraćen)", async () => {
    const a = await setup();
    await runTracker(deps({ at: 120, day: [fx({ status: "POSTPONED", statusShort: "PST", score90: null })] }));
    expect(await status(a.ids.HOME)).toBe("POSTPONED");
    await wipe();
    const b = await setup();
    await runTracker(deps({ at: 120, day: [fx({ status: "CANCELLED", statusShort: "CANC", score90: null })] }));
    expect(await status(b.ids.HOME)).toBe("VOID");
    const e = await entry(b.ids.HOME);
    expect([Number(e.grossReturn), Number(e.netProfit)]).toEqual([1000, 0]);
  });

  it("prekinuta utakmica → NEEDS_REVIEW (nema automatskog obračuna)", async () => {
    const { ids } = await setup();
    await runTracker(deps({ at: 120, day: [fx({ status: "ABANDONED", statusShort: "ABD", score90: null })] }));
    expect(await status(ids.HOME)).toBe("NEEDS_REVIEW");
    expect(await entry(ids.HOME)).toMatchObject({ grossReturn: null, netProfit: null });
  });

  it("nesigurno poklapanje (vreme pomereno): obračun tek kad OddsPapi potvrdi", async () => {
    const { ids } = await setup();
    const day = [fx({ kickoff: new Date(KICK.getTime() + 60 * MIN) })];
    await runTracker(deps({ at: 130, day, oddsPapi: null }));
    expect(await status(ids.HOME)).toBe("PENDING"); // čeka potvrdu
    const op = vi.fn(async () => ({ result: { HOME: "WON" as const, OVER_1_5: "WON" as const, UNDER_3_5: "WON" as const }, rawMarketIds: ["101"] }));
    await runTracker(deps({ at: 140, day, oddsPapi: op, resultCheckMinutes: 0 }));
    expect(op).toHaveBeenCalledTimes(1);
    expect(await status(ids.HOME)).toBe("WON");
    expect((await db.trackedSelection.findUniqueOrThrow({ where: { id: ids.HOME } })).resultSource).toBe("API-Football + OddsPapi");
  });

  it("izvori se ne slažu → NEEDS_REVIEW", async () => {
    const { ids } = await setup();
    const day = [fx({ kickoff: new Date(KICK.getTime() + 60 * MIN) })];
    const op = vi.fn(async () => ({ result: { HOME: "LOST" as const, OVER_1_5: "WON" as const, UNDER_3_5: "WON" as const }, rawMarketIds: ["101"] }));
    await runTracker(deps({ at: 130, day, oddsPapi: op }));
    expect(await status(ids.HOME)).toBe("NEEDS_REVIEW");
    expect(await status(ids.OVER_1_5)).toBe("NEEDS_REVIEW");
  });

  it("nema utakmice u API-Football-u → OddsPapi posle 150 min (tačan ID)", async () => {
    const { ids } = await setup({ home: "Neki Tim", away: "Drugi Tim" });
    const op = vi.fn(async () => ({ result: { HOME: "LOST" as const, OVER_1_5: "WON" as const, UNDER_3_5: "LOST" as const }, rawMarketIds: ["101"] }));
    await runTracker(deps({ at: 120, oddsPapi: op }));
    expect(op).not.toHaveBeenCalled();
    await runTracker(deps({ at: 160, oddsPapi: op, resultCheckMinutes: 0 }));
    expect(await status(ids.HOME)).toBe("LOST");
    expect(await status(ids.OVER_1_5)).toBe("WON");
    expect(await status(ids.UNDER_3_5)).toBe("LOST");
  });

  it("poštuje dnevni limit OddsPapi provera", async () => {
    await setup({ home: "Neki Tim", away: "Drugi Tim" });
    const op = vi.fn(async () => ({ result: {}, rawMarketIds: [] }));
    await runTracker(deps({ at: 160, oddsPapi: op, oddsPapiChecksPerDay: 0 }));
    expect(op).not.toHaveBeenCalled();
  });

  it("isti dan se ne traži ponovo pre isteka intervala", async () => {
    await setup();
    await setup({ home: "Oxford United", away: "Cheltenham Town" });
    const d = deps({ at: 120, day: [fx({ status: "LIVE", statusShort: "2H", score90: null }), fx({ id: 778, home: "Oxford United", away: "Cheltenham", status: "LIVE", statusShort: "2H", score90: null })] });
    await runTracker(d);
    await runTracker({ ...d, now: new Date(d.now!.getTime() + 5 * MIN) });
    expect(d.apiFootball).toHaveBeenCalledTimes(1); // jedan zahtev za ceo dan, keširan 15 min
  });

  it("DEMO utakmice dobijaju izmišljen rezultat sa oznakom DEMO", async () => {
    const { ids } = await setup({ isDemo: true });
    const d = deps({ at: 120 });
    await runTracker(d);
    expect(d.apiFootball).not.toHaveBeenCalled();
    const t = await db.trackedSelection.findUniqueOrThrow({ where: { id: ids.HOME } });
    expect(["WON", "LOST"]).toContain(t.status);
    expect(t.resultSource).toContain("DEMO");
  });

  it("ručna ispravka: obavezno obrazloženje, audit log i ponovni obračun", async () => {
    const { ids } = await setup();
    await runTracker(deps({ at: 120 }));
    await expect(applyDecision(db, ids.HOME, { status: "LOST", source: "Ručno", manual: { userId: "u" } })).rejects.toThrow(/Obrazloženje/);
    const user = await db.user.create({ data: { email: `a${Math.random()}@x.rs`, passwordHash: "x" } });
    await applyDecision(db, ids.HOME, { status: "LOST", home: 1, away: 1, source: "Ručno", reason: "Gol poništen naknadno", manual: { userId: user.id } });
    expect(await status(ids.HOME)).toBe("LOST");
    const e = await entry(ids.HOME);
    expect(Number(e.netProfit)).toBe(-1000);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "MANUAL_OVERRIDE" } });
    expect(log.reason).toBe("Gol poništen naknadno");
    expect(log.oldValue).toMatchObject({ status: "WON" });
  });

  it("greška API-Football-a (suspendovan nalog): ne pokušava ponovo svakih 5 min, prelazi na OddsPapi", async () => {
    const { ids } = await setup();
    const af = vi.fn(async () => { throw new Error("API-Football: Your account is suspended"); });
    const op = vi.fn(async () => ({ result: { HOME: "WON" as const, OVER_1_5: "WON" as const, UNDER_3_5: "WON" as const }, rawMarketIds: ["101"] }));
    const r1 = await runTracker(deps({ at: 120, apiFootball: af, oddsPapi: op }));
    expect(r1.sources?.apiFootball.blockedUntil).not.toBeNull();
    await runTracker(deps({ at: 125, apiFootball: af, oddsPapi: op, resultCheckMinutes: 0 }));
    await runTracker(deps({ at: 160, apiFootball: af, oddsPapi: op, resultCheckMinutes: 0 }));
    expect(af).toHaveBeenCalledTimes(1);
    expect(await status(ids.HOME)).toBe("WON");
    expect((await db.trackedSelection.findUniqueOrThrow({ where: { id: ids.HOME } })).resultSource).toBe("OddsPapi");
    const log = await db.jobState.findUniqueOrThrow({ where: { key: "tracker:log" } });
    expect(JSON.stringify(log.value)).toContain("suspended");
  });

  it("OddsPapi bez podataka za tip: upisuje šta nedostaje", async () => {
    await setup({ home: "Neki Tim", away: "Drugi Tim" });
    const op = vi.fn(async () => ({ result: { HOME: "WON" as const }, rawMarketIds: ["101", "104"] }));
    await runTracker(deps({ at: 160, oddsPapi: op }));
    const u = await db.resultUpdate.findFirstOrThrow({ where: { source: "OddsPapi" } });
    expect(u.matchStatus).toBe("PARTIAL");
    expect(u.detail).toMatchObject({ missing: ["OVER_1_5", "UNDER_3_5"], marketsInResponse: ["101", "104"] });
  });

  it("dve istovremene provere ne obračunavaju dvaput", async () => {
    await setup();
    const [a, b] = await Promise.all([runTracker(deps({ at: 120 })), runTracker(deps({ at: 120 }))]);
    expect(a.settled + b.settled).toBe(3);
    expect(await db.auditLog.count({ where: { entityType: "TrackedSelection" } })).toBe(3);
  });
});
