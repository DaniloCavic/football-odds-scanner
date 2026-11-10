import { describe, expect, it, vi } from "vitest";
import {
  createOddsPapiProvider, extractOdds, OddsPapiClient, resolveOutcomeMap, splitRange,
  type OddsPapiFixture, type OddsPapiMarket,
} from "@/lib/robot/providers/oddspapi";
import { ProviderError, RequestLimitReached, type ProviderFixture, type ScanContext } from "@/lib/robot/types";

const MARKETS: OddsPapiMarket[] = [
  { marketId: 101, marketName: "Full Time Result", marketType: "1x2", period: "fulltime", handicap: 0, playerProp: false, sportId: 10,
    outcomes: [{ outcomeId: 101, outcomeName: "1" }, { outcomeId: 102, outcomeName: "X" }, { outcomeId: 103, outcomeName: "2" }] },
  { marketId: 104, marketName: "Both Teams To Score", marketType: "totals", period: "fulltime", handicap: 0, playerProp: false, sportId: 10,
    outcomes: [{ outcomeId: 104, outcomeName: "Yes" }, { outcomeId: 105, outcomeName: "No" }] },
  { marketId: 1010, marketName: "Over Under Full Time", marketType: "totals", period: "fulltime", handicap: 1.5, playerProp: false, sportId: 10,
    outcomes: [{ outcomeId: 1010, outcomeName: "Over" }, { outcomeId: 1011, outcomeName: "Under" }] },
  { marketId: 2010, marketName: "Home Team Over Under", marketType: "totals", period: "fulltime", handicap: 1.5, playerProp: false, sportId: 10,
    outcomes: [{ outcomeId: 2010, outcomeName: "Over" }, { outcomeId: 2011, outcomeName: "Under" }] },
  { marketId: 1014, marketName: "Over Under Full Time", marketType: "totals", period: "fulltime", handicap: 3.5, playerProp: false, sportId: 10,
    outcomes: [{ outcomeId: 1014, outcomeName: "Over" }, { outcomeId: 1015, outcomeName: "Under" }] },
  { marketId: 3014, marketName: "Over Under First Half", marketType: "totals", period: "firsthalf", handicap: 3.5, playerProp: false, sportId: 10,
    outcomes: [{ outcomeId: 3014, outcomeName: "Over" }, { outcomeId: 3015, outcomeName: "Under" }] },
  { marketId: 111, marketName: "Moneyline", marketType: "1x2", period: "fulltime", handicap: 0, playerProp: false, sportId: 11,
    outcomes: [{ outcomeId: 1, outcomeName: "1" }, { outcomeId: 2, outcomeName: "X" }, { outcomeId: 3, outcomeName: "2" }] },
];

const price = (p: number, extra: Record<string, unknown> = {}) => ({ players: { "0": { active: true, price: p, changedAt: "2026-11-09T20:00:00Z", ...extra } } });

const fixture = (id: string, tournamentId: number, startTime = "2026-11-10T19:00:00.000Z"): OddsPapiFixture => ({
  fixtureId: id, sportId: 10, tournamentId, statusId: 0, startTime,
  participant1Name: `Home ${id}`, participant2Name: `Away ${id}`, tournamentName: `T${tournamentId}`, categoryName: "England",
});

const withOdds = (f: OddsPapiFixture): OddsPapiFixture => ({
  ...f,
  bookmakerOdds: {
    "soccerbet.rs": {
      bookmakerIsActive: true, suspended: false,
      markets: {
        "101": { marketActive: true, outcomes: { "101": price(1.25), "102": price(5.5), "103": price(11) } },
        "1010": { marketActive: true, outcomes: { "1010": price(1.18), "1011": price(4.2) } },
        "1014": { marketActive: true, outcomes: { "1014": price(3.1), "1015": price(1.31) } },
      },
    },
  },
});

describe("OddsPapi – mapiranje tržišta", () => {
  it("prepoznaje 1/X/2, više od 1.5 i manje od 3.5 (pun meč)", () => {
    expect(resolveOutcomeMap(MARKETS)).toEqual({
      HOME: [{ marketId: "101", outcomeId: "101" }],
      DRAW: [{ marketId: "101", outcomeId: "102" }],
      AWAY: [{ marketId: "101", outcomeId: "103" }],
      OVER_1_5: [{ marketId: "1010", outcomeId: "1010" }],
      UNDER_3_5: [{ marketId: "1014", outcomeId: "1015" }],
    });
  });

  it("više kandidata za isto tržište: uzima onaj koji Soccerbet ima", () => {
    const extra: OddsPapiMarket = { marketId: 9015, marketName: "Over Under Full Time", marketType: "totals", period: "fulltime", handicap: 1.5, playerProp: false, sportId: 10,
      outcomes: [{ outcomeId: 9016, outcomeName: "Over" }, { outcomeId: 9017, outcomeName: "Under" }] };
    const map = resolveOutcomeMap([...MARKETS, extra]);
    expect(map.OVER_1_5).toHaveLength(2);
    const f = fixture("x", 1);
    f.bookmakerOdds = { "soccerbet.rs": { markets: { "9015": { outcomes: { "9016": price(1.22) } } } } };
    expect(extractOdds(f, map).OVER_1_5?.price).toBe(1.22);
  });

  it("izvlači kvote Soccerbet-a, preskače neaktivne i suspendovane", () => {
    const map = resolveOutcomeMap(MARKETS);
    const odds = extractOdds(withOdds(fixture("a", 1)), map);
    expect(odds.HOME?.price).toBe(1.25);
    expect(odds.OVER_1_5?.price).toBe(1.18);
    expect(odds.UNDER_3_5?.price).toBe(1.31);
    expect(odds.HOME?.changedAt.toISOString()).toBe("2026-11-09T20:00:00.000Z");

    const susp = withOdds(fixture("b", 1));
    susp.bookmakerOdds!["soccerbet.rs"].suspended = true;
    expect(extractOdds(susp, map)).toEqual({});

    const inactive = withOdds(fixture("c", 1));
    inactive.bookmakerOdds!["soccerbet.rs"].markets!["101"].outcomes!["101"] = price(1.2, { active: false });
    expect(extractOdds(inactive, map).HOME).toBeUndefined();

    expect(extractOdds(fixture("d", 1), map)).toEqual({});
  });

  it("deli period na delove kraće od 10 dana", () => {
    const parts = splitRange(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-15T00:00:00Z"));
    expect(parts).toHaveLength(2);
    expect(parts[0].to.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(parts[1].to.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });
});

type Route = (url: URL) => { status: number; body: unknown };

function mockFetch(route: Route) {
  const calls: URL[] = [];
  const fn = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    calls.push(url);
    const { status, body } = route(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function ctx(maxRequests = 60): ScanContext & { requests: number; total: number | null; warnings: string[] } {
  const c = {
    requests: 0, total: null as number | null, warnings: [] as string[], maxRequests,
    shouldStop: async () => false,
    setTotal: async (n: number) => { c.total = n; },
    countRequest: async () => { c.requests += 1; },
    warn: async (m: string) => { c.warnings.push(m); },
  };
  return c;
}

const noSleep = async () => {};

describe("OddsPapi – klijent", () => {
  it("šalje apiKey kao query parametar i vraća JSON", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: [{ sportId: 10 }] }));
    const client = new OddsPapiClient("TAJNI", fn, 0, noSleep);
    await client.get("/sports", {});
    expect(calls[0].searchParams.get("apiKey")).toBe("TAJNI");
    expect(calls[0].pathname).toBe("/v4/sports");
  });

  it("potrošena kvota daje jasnu poruku i ne ponavlja zahtev", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 429, body: { message: "Request limit exceeded", code: "REQUEST_LIMIT_EXCEEDED" } }));
    const client = new OddsPapiClient("k", fn, 0, noSleep);
    await expect(client.get("/sports", {})).rejects.toThrow(/mesečna kvota/);
    expect(calls).toHaveLength(1);
  });

  it("privremeni 429/500 ponavlja sa pauzom", async () => {
    let n = 0;
    const { fn, calls } = mockFetch(() => (++n < 3 ? { status: 500, body: {} } : { status: 200, body: { ok: 1 } }));
    const client = new OddsPapiClient("k", fn, 0, noSleep);
    await expect(client.get("/sports", {})).resolves.toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
  });

  it("neispravan ključ i zabranjen pristup", async () => {
    const bad = new OddsPapiClient("k", mockFetch(() => ({ status: 401, body: { error: { code: "INVALID_API_KEY" } } })).fn, 0, noSleep);
    await expect(bad.get("/sports", {})).rejects.toBeInstanceOf(ProviderError);
    await expect(bad.get("/sports", {})).rejects.toThrow(/ključ/);
    const forb = new OddsPapiClient("k", mockFetch(() => ({ status: 403, body: { code: "RESTRICTED_ACCESS", details: "bookmaker not in plan" } })).fn, 0, noSleep);
    await expect(forb.get("/odds", {})).rejects.toThrow(/SoccerBet RS/);
  });
});

describe("OddsPapi – skeniranje", () => {
  const fixtures = [fixture("f1", 1), fixture("f2", 1), fixture("f3", 2), fixture("f4", 3), fixture("f5", 4)];
  const route: Route = (url) => {
    if (url.pathname === "/v4/markets") return { status: 200, body: MARKETS };
    if (url.pathname === "/v4/fixtures") return { status: 200, body: fixtures };
    if (url.pathname === "/v4/odds-by-tournaments") {
      const ids = url.searchParams.get("tournamentIds")!.split(",").map(Number);
      const list = fixtures.filter((f) => ids.includes(f.tournamentId)).map(withOdds);
      // turnir vraća i utakmicu van perioda – mora biti ignorisana
      list.push(withOdds(fixture("van-perioda", ids[0], "2027-01-01T00:00:00.000Z")));
      return { status: 200, body: list };
    }
    return { status: 404, body: {} };
  };

  async function collect(gen: AsyncGenerator<ProviderFixture>) {
    const out: ProviderFixture[] = [];
    for await (const f of gen) out.push(f);
    return out;
  }

  it("štedi zahteve: 1 markets + 1 fixtures + turniri po 3", async () => {
    const { fn, calls } = mockFetch(route);
    const provider = createOddsPapiProvider("k", fn, new OddsPapiClient("k", fn, 0, noSleep));
    const c = ctx();
    const out = await collect(provider.scan({ from: new Date("2026-11-10T00:00:00Z"), to: new Date("2026-11-11T00:00:00Z") }, c));
    expect(out.map((f) => f.externalId).sort()).toEqual(["f1", "f2", "f3", "f4", "f5"]);
    expect(c.total).toBe(5);
    const paths = calls.map((u) => u.pathname);
    expect(paths.filter((p) => p === "/v4/odds-by-tournaments")).toHaveLength(2); // 4 turnira → 2 zahteva
    expect(c.requests).toBe(calls.length);
    const fx = calls.find((u) => u.pathname === "/v4/fixtures")!;
    expect(fx.searchParams.get("bookmakers")).toBe("soccerbet.rs");
    expect(fx.searchParams.get("sportId")).toBe("10");
    expect(fx.searchParams.get("statusId")).toBe("0");
    expect(out[0].odds.HOME?.price).toBe(1.25);
    expect(out[0].country).toBe("England");
  });

  it("staje na limitu zahteva po skeniranju", async () => {
    const { fn } = mockFetch(route);
    const provider = createOddsPapiProvider("k", fn, new OddsPapiClient("k", fn, 0, noSleep));
    // markets je možda keširan iz prethodnog testa, zato limit 1 sigurno puca pre kraja
    await expect(collect(provider.scan({ from: new Date("2026-11-10T00:00:00Z"), to: new Date("2026-11-11T00:00:00Z") }, ctx(1))))
      .rejects.toBeInstanceOf(RequestLimitReached);
  });
});

describe("OddsPapi – druga kladionica", () => {
  it("koristi slug izabrane kladionice za utakmice i kvote", async () => {
    const calls: URL[] = [];
    const fn = (async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      calls.push(url);
      let body: unknown = [];
      if (url.pathname === "/v4/markets") body = MARKETS;
      if (url.pathname === "/v4/fixtures") body = [fixture("m1", 7)];
      if (url.pathname === "/v4/odds-by-tournaments") {
        const f = fixture("m1", 7);
        f.bookmakerOdds = { "maxbet.rs": { markets: { "1010": { outcomes: { "1010": price(1.2) } }, "1014": { outcomes: { "1015": price(1.28) } } } } };
        body = [f];
      }
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = createOddsPapiProvider("k", fn, new OddsPapiClient("k", fn, 0, noSleep), { slug: "maxbet.rs", name: "MaxBet" });
    expect(provider.id).toBe("oddspapi:maxbet.rs");
    expect(provider.matchNamespace).toBe("oddspapi");
    const out: ProviderFixture[] = [];
    for await (const f of provider.scan({ from: new Date("2026-11-10T00:00:00Z"), to: new Date("2026-11-11T00:00:00Z") }, ctx())) out.push(f);
    expect(calls.find((u) => u.pathname === "/v4/fixtures")!.searchParams.get("bookmakers")).toBe("maxbet.rs");
    expect(calls.find((u) => u.pathname === "/v4/odds-by-tournaments")!.searchParams.get("bookmaker")).toBe("maxbet.rs");
    expect(out[0].odds.OVER_1_5?.price).toBe(1.2);
    expect(out[0].odds.UNDER_3_5?.price).toBe(1.28);
  });
});
