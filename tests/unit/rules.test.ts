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
