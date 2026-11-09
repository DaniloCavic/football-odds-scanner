import { describe, expect, it } from "vitest";
import { isValidOdds } from "@/lib/odds";

describe("isValidOdds – strogo pravilo 1.30", () => {
  it("primeri iz specifikacije", () => {
    expect(isValidOdds(1.25)).toBe(true); // 1 @ 1.25 prikaži
    expect(isValidOdds(1.45)).toBe(false); // X @ 1.45 ignoriši
    expect(isValidOdds(1.2)).toBe(true); // 2+ @ 1.20 prikaži
    expect(isValidOdds(1.3)).toBe(true); // 0–3 @ 1.30 prikaži
    expect(isValidOdds(1.31)).toBe(false); // 2 @ 1.31 ignoriši
  });
  it("odbija sve iznad 1.30, i sa tri decimale", () => {
    expect(isValidOdds(1.301)).toBe(false);
    expect(isValidOdds(1.3001)).toBe(false);
    expect(isValidOdds(2.5)).toBe(false);
  });
  it("kvota mora biti veća od 1.00 i broj", () => {
    expect(isValidOdds(1)).toBe(false);
    expect(isValidOdds(1.0)).toBe(false);
    expect(isValidOdds(0.95)).toBe(false);
    expect(isValidOdds(1.01)).toBe(true);
    expect(isValidOdds(NaN)).toBe(false);
    expect(isValidOdds(Infinity)).toBe(false);
    expect(isValidOdds("1.20")).toBe(false);
    expect(isValidOdds(null)).toBe(false);
  });
  it("niži maxOdds iz podešavanja se poštuje, ali viši od 1.30 se ignoriše", () => {
    expect(isValidOdds(1.25, 1.2)).toBe(false);
    expect(isValidOdds(1.2, 1.2)).toBe(true);
    expect(isValidOdds(1.4, 2.0)).toBe(false);
    expect(isValidOdds(1.3, 5)).toBe(true);
  });
  it("floating point: 1.1 + 0.2 (=1.3000000000000003) se tretira kao 1.30", () => {
    expect(isValidOdds(1.1 + 0.2)).toBe(true);
  });
});
