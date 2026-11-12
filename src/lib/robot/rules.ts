import type { ComboTypeCode, MarketTypeCode } from "@/lib/odds";

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

export type RuleResult = {
  /** Pojedinačni tipovi koji se čuvaju. */
  singles: MarketTypeCode[];
  /** Spojeni tip koji se čuva (kvota iz izvora). */
  combo: ComboTypeCode | null;
  pairExcluded: boolean;
  /** Utakmica preskočena – trebao je spojeni tip, a izvor nema njegovu kvotu. */
  comboMissing: boolean;
};

/**
 * Sva pravila jedne utakmice, redom:
 * 1) 2+ i 0–3 oba do maks. kvote → izbacuju se oba (1/2 ostaje).
 * 2) 1 (ili 2) + tačno jedan tip golova → igra se SPOJENI tip („1&2+“, „1&0–3“, „2&2+“, „2&0–3“)
 *    po kvoti kladionice (bez ograničenja kvote). Ako izvor nema tu kvotu → cela utakmica se preskače.
 * 3) Inače – pojedinačni tipovi kao do sada.
 */
export function applyMatchRules(
  valid: MarketTypeCode[],
  availableCombos: Partial<Record<ComboTypeCode, number>>,
  opts: { excludeGoalsPair: boolean; combineResultGoals: boolean },
): RuleResult {
  const { kept, pairExcluded } = applyGoalsPairRule(valid, opts.excludeGoalsPair);
  if (!opts.combineResultGoals) return { singles: kept, combo: null, pairExcluded, comboMissing: false };
  const winner = kept.includes("HOME") ? "HOME" : kept.includes("AWAY") ? "AWAY" : null;
  const goals = kept.filter((t) => t === "OVER_1_5" || t === "UNDER_3_5");
  if (!winner || goals.length !== 1) return { singles: kept, combo: null, pairExcluded, comboMissing: false };
  const combo = `${winner}_${goals[0]}` as ComboTypeCode;
  const price = availableCombos[combo];
  const others = kept.filter((t) => t !== winner && t !== goals[0]);
  if (typeof price === "number" && Number.isFinite(price) && price > 1) {
    return { singles: others, combo, pairExcluded, comboMissing: false };
  }
  return { singles: [], combo: null, pairExcluded, comboMissing: true };
}
