import { describe, expect, it } from "vitest";
import { normalizeDecimal, settingsSchema } from "@/lib/settings";

const parse = (maxOdds: string, stake = "1000", req = "60") => settingsSchema.safeParse({ maxOdds, stakePerSelection: stake, maxRequestsPerScan: req });

describe("podešavanja – maksimalna kvota", () => {
  it("prihvata 1.30 (granica uključena)", () => expect(parse("1.30").success).toBe(true));
  it("prihvata nižu granicu, npr. 1.20", () => expect(parse("1.20").success).toBe(true));
  it("odbija 1.31", () => expect(parse("1.31").success).toBe(false));
  it("odbija 1.00 i manje", () => {
    expect(parse("1.00").success).toBe(false);
    expect(parse("0.9").success).toBe(false);
  });
  it("odbija tekst i prazno", () => {
    expect(parse("abc").success).toBe(false);
    expect(parse("").success).toBe(false);
  });
  it("odbija više od dve decimale", () => expect(parse("1.255").success).toBe(false));
});

describe("podešavanja – ulog", () => {
  it("prihvata 1000 i 1000.50", () => {
    expect(parse("1.30", "1000").success).toBe(true);
    expect(parse("1.30", "1000.50").success).toBe(true);
  });
  it("odbija 0, negativan i tri decimale", () => {
    expect(parse("1.30", "0").success).toBe(false);
    expect(parse("1.30", "-5").success).toBe(false);
    expect(parse("1.30", "10.001").success).toBe(false);
  });
});

describe("normalizeDecimal", () => {
  it("pretvara decimalni zarez u tačku i skida razmake", () => {
    expect(normalizeDecimal(" 1,25 ")).toBe("1.25");
    expect(normalizeDecimal("1 000")).toBe("1000");
    expect(normalizeDecimal(null)).toBe("");
  });
});

describe("podešavanja – limit zahteva", () => {
  it("prihvata 1–1000, odbija 0, decimalu i 1001", () => {
    expect(parse("1.30", "1000", "60").success).toBe(true);
    expect(parse("1.30", "1000", "0").success).toBe(false);
    expect(parse("1.30", "1000", "2.5").success).toBe(false);
    expect(parse("1.30", "1000", "1001").success).toBe(false);
  });
});
