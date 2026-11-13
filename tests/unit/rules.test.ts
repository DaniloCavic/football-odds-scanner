import { describe, expect, it } from "vitest";
import { applyGoalsPairRule } from "@/lib/robot/rules";

describe("pravilo 2+ i 0–3 zajedno", () => {
  it("izbacuje oba tipa golova, ostavlja 1/2", () => {
    expect(applyGoalsPairRule(["HOME", "OVER_1_5", "UNDER_3_5"], true)).toEqual({ kept: ["HOME"], pairExcluded: true });
    expect(applyGoalsPairRule(["OVER_1_5", "UNDER_3_5"], true)).toEqual({ kept: [], pairExcluded: true });
  });
  it("samo jedan tip golova – ostaje", () => {
    expect(applyGoalsPairRule(["AWAY", "OVER_1_5"], true)).toEqual({ kept: ["AWAY", "OVER_1_5"], pairExcluded: false });
    expect(applyGoalsPairRule(["UNDER_3_5"], true)).toEqual({ kept: ["UNDER_3_5"], pairExcluded: false });
  });
  it("isključeno pravilo – ništa se ne menja", () => {
    expect(applyGoalsPairRule(["OVER_1_5", "UNDER_3_5"], false)).toEqual({ kept: ["OVER_1_5", "UNDER_3_5"], pairExcluded: false });
  });
});

import { applyMatchRules } from "@/lib/robot/rules";
import { outcomeFor } from "@/lib/results/settle-math";
import { resolveOutcomeMap } from "@/lib/robot/providers/oddspapi";

const ON = { excludeGoalsPair: true, combineResultGoals: true };

describe("spajanje 1/2 + tip golova", () => {
  it("1 + 2+ → spojeni „1&2+“ po kvoti kladionice (bez ograničenja)", () => {
    expect(applyMatchRules(["HOME", "OVER_1_5"], { HOME_OVER_1_5: 1.62 }, ON)).toEqual({ singles: [], combo: "HOME_OVER_1_5", pairExcluded: false, comboMissing: false });
  });
  it("2 + 0–3 → „2&0–3“", () => {
    expect(applyMatchRules(["AWAY", "UNDER_3_5"], { AWAY_UNDER_3_5: 1.45 }, ON).combo).toBe("AWAY_UNDER_3_5");
  });
  it("nema kvote za spojeni tip → po podešavanju", () => {
    expect(applyMatchRules(["HOME", "UNDER_3_5"], { HOME_OVER_1_5: 1.5 }, { ...ON, comboFallback: "SKIP" })).toEqual({ singles: [], combo: null, pairExcluded: false, comboMissing: true });
    expect(applyMatchRules(["HOME", "UNDER_3_5"], {}, ON)).toEqual({ singles: ["HOME"], combo: null, pairExcluded: false, comboMissing: true }); // podrazumevano: samo 1
    expect(applyMatchRules(["AWAY", "OVER_1_5"], {}, { ...ON, comboFallback: "WINNER_ONLY" }).singles).toEqual(["AWAY"]);
    expect(applyMatchRules(["HOME", "OVER_1_5"], {}, { ...ON, comboFallback: "BOTH_SINGLE" }).singles).toEqual(["HOME", "OVER_1_5"]);
  });
  it("1 + 2+ + 0–3 → igra se samo 1", () => {
    expect(applyMatchRules(["HOME", "OVER_1_5", "UNDER_3_5"], { HOME_OVER_1_5: 1.5 }, ON)).toEqual({ singles: ["HOME"], combo: null, pairExcluded: true, comboMissing: false });
  });
  it("samo jedan tip → kao do sada", () => {
    expect(applyMatchRules(["OVER_1_5"], {}, ON)).toMatchObject({ singles: ["OVER_1_5"], combo: null });
    expect(applyMatchRules(["AWAY"], {}, ON)).toMatchObject({ singles: ["AWAY"], combo: null });
  });
  it("pravilo isključeno → pojedinačni tipovi", () => {
    expect(applyMatchRules(["HOME", "OVER_1_5"], {}, { excludeGoalsPair: true, combineResultGoals: false })).toMatchObject({ singles: ["HOME", "OVER_1_5"], combo: null });
  });
});

describe("obračun spojenih tipova (oba dela moraju proći)", () => {
  it("1&2+", () => {
    expect(outcomeFor("HOME_OVER_1_5", 2, 0)).toBe("WON");
    expect(outcomeFor("HOME_OVER_1_5", 1, 0)).toBe("LOST"); // 1 prošao, 2+ pao
    expect(outcomeFor("HOME_OVER_1_5", 1, 1)).toBe("LOST"); // 2+ prošao, 1 pao
  });
  it("1&0–3, 2&2+, 2&0–3", () => {
    expect(outcomeFor("HOME_UNDER_3_5", 3, 0)).toBe("WON");
    expect(outcomeFor("HOME_UNDER_3_5", 4, 0)).toBe("LOST");
    expect(outcomeFor("AWAY_OVER_1_5", 1, 2)).toBe("WON");
    expect(outcomeFor("AWAY_UNDER_3_5", 0, 1)).toBe("WON");
    expect(outcomeFor("AWAY_UNDER_3_5", 2, 2)).toBe("LOST");
  });
});

describe("prepoznavanje spojenog tržišta u OddsPapi katalogu", () => {
  it("„Result & Total Goals“ sa ishodima „1 & Over 1.5“…", () => {
    const map = resolveOutcomeMap([{
      marketId: 900, marketName: "Full Time Result & Total Goals", marketType: "1x2-totals", period: "fulltime", handicap: 0, playerProp: false, sportId: 10,
      outcomes: [
        { outcomeId: 901, outcomeName: "1 & Over 1.5" }, { outcomeId: 902, outcomeName: "1 & Under 3.5" },
        { outcomeId: 903, outcomeName: "2 & Over 1.5" }, { outcomeId: 904, outcomeName: "2 & Under 3.5" },
        { outcomeId: 905, outcomeName: "X & Over 1.5" }, { outcomeId: 906, outcomeName: "1 & Over 2.5" },
      ],
    }]);
    expect(map.HOME_OVER_1_5).toEqual([{ marketId: "900", outcomeId: "901" }]);
    expect(map.HOME_UNDER_3_5).toEqual([{ marketId: "900", outcomeId: "902" }]);
    expect(map.AWAY_OVER_1_5).toEqual([{ marketId: "900", outcomeId: "903" }]);
    expect(map.AWAY_UNDER_3_5).toEqual([{ marketId: "900", outcomeId: "904" }]);
  });
});
