import type { MarketTypeCode } from "@/lib/odds";

/**
 * Pravilo „2+ i 0–3 zajedno“: ako su za istu utakmicu OBA tipa golova do maks. kvote,
 * takva utakmica ne odgovara sistemu (praktično igra na „2 ili 3 gola“) – izbacuju se oba tipa.
 * Ostali tipovi iste utakmice (1, 2) ostaju.
 */
export function applyGoalsPairRule<T extends MarketTypeCode>(valid: T[], enabled: boolean): { kept: T[]; pairExcluded: boolean } {
  if (!enabled) return { kept: valid, pairExcluded: false };
  const both = valid.includes("OVER_1_5" as T) && valid.includes("UNDER_3_5" as T);
  if (!both) return { kept: valid, pairExcluded: false };
  return { kept: valid.filter((t) => t !== "OVER_1_5" && t !== "UNDER_3_5"), pairExcluded: true };
}
