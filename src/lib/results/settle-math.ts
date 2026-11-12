import { Prisma } from "@prisma/client";
import type { MarketTypeCode } from "@/lib/odds";

export type FinalStatus = "WON" | "LOST" | "VOID";
export type TrackStatus = "PENDING" | "LIVE" | "WON" | "LOST" | "POSTPONED" | "VOID" | "NEEDS_REVIEW";

/** Ishod tipa iz rezultata posle 90 minuta (+ nadoknada), bez produžetaka i penala. */
export function outcomeFor(type: MarketTypeCode, home: number, away: number): "WON" | "LOST" {
  const total = home + away;
  switch (type) {
    case "HOME": return home > away ? "WON" : "LOST";
    case "AWAY": return away > home ? "WON" : "LOST";
    case "DRAW": return home === away ? "WON" : "LOST";
    case "OVER_1_5": return total >= 2 ? "WON" : "LOST";
    case "UNDER_3_5": return total <= 3 ? "WON" : "LOST";
    // spojeni tip prolazi samo ako prođu oba dela
    case "HOME_OVER_1_5": return home > away && total >= 2 ? "WON" : "LOST";
    case "HOME_UNDER_3_5": return home > away && total <= 3 ? "WON" : "LOST";
    case "AWAY_OVER_1_5": return away > home && total >= 2 ? "WON" : "LOST";
    case "AWAY_UNDER_3_5": return away > home && total <= 3 ? "WON" : "LOST";
  }
}

/** Isplata i neto rezultat jedne simulirane opklade (zaokruženo na 2 decimale). */
export function amountsFor(status: TrackStatus, stake: Prisma.Decimal | number, odds: Prisma.Decimal | number) {
  const s = new Prisma.Decimal(stake);
  const o = new Prisma.Decimal(odds);
  switch (status) {
    case "WON": {
      const gross = s.mul(o).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return { grossReturn: gross, netProfit: gross.sub(s) };
    }
    case "LOST": return { grossReturn: new Prisma.Decimal(0), netProfit: s.neg() };
    case "VOID": return { grossReturn: s, netProfit: new Prisma.Decimal(0) };
    default: return { grossReturn: null, netProfit: null };
  }
}

export const FINAL_STATUSES: TrackStatus[] = ["WON", "LOST", "VOID"];
export const OPEN_STATUSES: TrackStatus[] = ["PENDING", "LIVE", "POSTPONED"];
