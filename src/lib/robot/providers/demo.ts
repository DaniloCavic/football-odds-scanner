import type { MarketTypeCode } from "@/lib/odds";
import type { OddsProvider, ProviderFixture } from "../types";

/**
 * DEMO izvor – izmišljene utakmice za testiranje toka robota. Svaka utakmica i kvota je jasno
 * označena kao DEMO. Namerno sadrži i kvote iznad 1.30 i virtuelni fudbal, da se vidi da ih robot izbacuje.
 */
const LEAGUES = [
  { name: "DEMO Liga A", country: "DEMO" },
  { name: "DEMO Liga B", country: "DEMO" },
  { name: "DEMO Kup", country: "DEMO" },
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const PRICES = [1.08, 1.12, 1.15, 1.2, 1.25, 1.29, 1.3, 1.31, 1.35, 1.45, 1.6, 1.9, 2.4, 3.2, 4.5];

export function demoFixtures(from: Date, to: Date): ProviderFixture[] {
  const out: ProviderFixture[] = [];
  const hour = 3600_000;
  const start = Math.ceil(from.getTime() / hour) * hour;
  const r = rng(Math.floor(start / hour));
  let i = 0;
  for (let t = start; t < to.getTime() && out.length < 60; t += 2 * hour) {
    const local = new Date(t).getUTCHours();
    if (local < 10 || local > 20) continue;
    for (let k = 0; k < 2; k++) {
      i += 1;
      const league = LEAGUES[i % LEAGUES.length];
      const virtual = i % 9 === 0;
      const pick = () => PRICES[Math.floor(r() * PRICES.length)];
      const odds: Partial<Record<MarketTypeCode, { price: number; changedAt: Date }>> = {};
      (["HOME", "DRAW", "AWAY", "OVER_1_5", "UNDER_3_5"] as const).forEach((m) => {
        if (r() < 0.85) odds[m] = { price: pick(), changedAt: new Date() };
      });
      out.push({
        externalId: `demo-${t}-${k}`,
        sport: "football",
        homeTeam: `DEMO Tim ${i * 2 - 1}`,
        awayTeam: `DEMO Tim ${i * 2}`,
        competition: virtual ? "DEMO Virtual Football" : league.name,
        country: league.country,
        externalCompetitionId: null,
        kickoffTime: new Date(t + k * 30 * 60_000),
        odds,
      });
    }
  }
  return out;
}

export const demoProvider: OddsProvider = {
  id: "demo",
  name: "Probni podaci",
  sourceLabel: "DEMO",
  isDemo: true,
  async *scan(range, ctx) {
    const fixtures = demoFixtures(range.from, range.to);
    await ctx.setTotal(fixtures.length);
    for (const f of fixtures) {
      if (await ctx.shouldStop()) return;
      await new Promise((res) => setTimeout(res, Number(process.env.DEMO_DELAY_MS ?? 250)));
      yield f;
    }
  },
};
