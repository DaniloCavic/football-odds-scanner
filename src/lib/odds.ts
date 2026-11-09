import { ABSOLUTE_MAX_ODDS } from "./settings";

export const MARKET_TYPES = ["HOME", "DRAW", "AWAY", "OVER_1_5", "UNDER_3_5"] as const;
export type MarketTypeCode = (typeof MARKET_TYPES)[number];

export const MARKET_LABELS: Record<MarketTypeCode, string> = {
  HOME: "1",
  DRAW: "X",
  AWAY: "2",
  OVER_1_5: "2+",
  UNDER_3_5: "0–3",
};

export const MARKET_DESCRIPTIONS: Record<MarketTypeCode, string> = {
  HOME: "Pobeda domaćina",
  DRAW: "Nerešeno",
  AWAY: "Pobeda gosta",
  OVER_1_5: "Ukupno golova 2 ili više",
  UNDER_3_5: "Ukupno golova 0 do 3",
};

const EPS = 1e-9;

/**
 * Centralno pravilo kvote (backend). Kvota mora biti konačan broj, veća od 1.00
 * i najviše maxOdds (koji nikada ne može preći 1.30). 1.30 prolazi, 1.31 i 1.301 ne.
 */
export function isValidOdds(odds: unknown, maxOdds: number = ABSOLUTE_MAX_ODDS): boolean {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return false;
  const limit = Math.min(Number.isFinite(maxOdds) ? maxOdds : ABSOLUTE_MAX_ODDS, ABSOLUTE_MAX_ODDS);
  return odds > 1 + EPS && odds <= limit + EPS;
}
