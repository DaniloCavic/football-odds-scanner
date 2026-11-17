import { ABSOLUTE_MAX_ODDS } from "./settings";

/** Tipovi koje robot traži: samo pobednik meča – 1 i 2 (kvota do 1.30). */
export const MARKET_TYPES = ["HOME", "AWAY"] as const;
export type ActiveMarketType = (typeof MARKET_TYPES)[number];
export const isActiveType = (t: string): t is ActiveMarketType => (MARKET_TYPES as readonly string[]).includes(t);
/**
 * Svi tipovi koji mogu postojati u bazi. 2+, 0–3, spojeni tipovi i X se više ne traže –
 * ostaju samo zbog starih zapisa (istorija, CSV izvoz).
 */
export type MarketTypeCode = ActiveMarketType | "DRAW" | "OVER_1_5" | "UNDER_3_5" | "HOME_OVER_1_5" | "HOME_UNDER_3_5" | "AWAY_OVER_1_5" | "AWAY_UNDER_3_5";

export const MARKET_LABELS: Record<MarketTypeCode, string> = {
  HOME: "1",
  DRAW: "X",
  AWAY: "2",
  OVER_1_5: "2+",
  UNDER_3_5: "0–3",
  HOME_OVER_1_5: "1&2+",
  HOME_UNDER_3_5: "1&0–3",
  AWAY_OVER_1_5: "2&2+",
  AWAY_UNDER_3_5: "2&0–3",
};

export const MARKET_DESCRIPTIONS: Record<MarketTypeCode, string> = {
  HOME: "Pobeda domaćina",
  DRAW: "Nerešeno",
  AWAY: "Pobeda gosta",
  OVER_1_5: "Ukupno golova 2 ili više",
  UNDER_3_5: "Ukupno golova 0 do 3",
  HOME_OVER_1_5: "Pobeda domaćina i 2+ gola",
  HOME_UNDER_3_5: "Pobeda domaćina i 0–3 gola",
  AWAY_OVER_1_5: "Pobeda gosta i 2+ gola",
  AWAY_UNDER_3_5: "Pobeda gosta i 0–3 gola",
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
