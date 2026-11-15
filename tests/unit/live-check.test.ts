import { describe, it, expect } from "vitest";
import { checkLiveOdds, OddsPapiClient } from "@/lib/robot/providers/oddspapi";

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
function fake(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const f = (async (u: URL) => { calls.push(u.pathname); return json(routes[u.pathname.replace("/v4", "")]); }) as unknown as typeof fetch;
  return { calls, client: new OddsPapiClient("k", f, 0) };
}

describe("checkLiveOdds", () => {
  it("bez utakmica u toku troši samo /fixtures", async () => {
    const { calls, client } = fake({ "/account": { subscriptions: [{ is_active: true, bookmakers: { "admiralbet.rs": { has_live_odds: true } } }] }, "/fixtures": [] });
    const r = await checkLiveOdds("k", "admiralbet.rs", fetch, client);
    expect(r.liveFixtures).toBe(0);
    expect(r.subscription).toEqual({ has_live_odds: true });
    expect(calls).toEqual(["/v4/account", "/v4/fixtures"]);
  });

  it("utakmica u toku sa kvotama → DA", async () => {
    const { client } = fake({
      "/account": { subscriptions: [{ is_active: true }] },
      "/fixtures": [{ fixtureId: "f1", sportId: 10, statusId: 1, tournamentId: 1, startTime: "2026-11-15T12:00:00Z", participant1Name: "A", participant2Name: "B" }],
      "/markets": [{ marketId: 101, marketName: "Full Time Result", marketType: "1x2", period: "fulltime", handicap: 0, playerProp: false, sportId: 10, outcomes: [{ outcomeId: 101, outcomeName: "1" }, { outcomeId: 102, outcomeName: "X" }, { outcomeId: 103, outcomeName: "2" }] }],
      "/odds": { fixtureId: "f1", sportId: 10, statusId: 1, tournamentId: 1, startTime: "x", bookmakerOdds: { "admiralbet.rs": { markets: { "101": { outcomes: { "101": { players: { "0": { active: true, price: 1.5, changedAt: "2026-11-15T12:30:00Z" } } } } } } } } },
    });
    const r = await checkLiveOdds("k", "admiralbet.rs", fetch, client);
    expect(r.verdict).toMatch(/^DA/);
    expect(r).toMatchObject({ marketCount: 1, lastChangedAt: "2026-11-15T12:30:00Z" });
  });
});
