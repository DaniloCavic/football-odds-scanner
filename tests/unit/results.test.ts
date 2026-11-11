import { describe, expect, it } from "vitest";
import { amountsFor, outcomeFor } from "@/lib/results/settle-math";
import { findFixture, teamSimilarity } from "@/lib/results/matching";
import { parseScores } from "@/lib/results/oddspapi-results";

describe("obračun tipova (90 min)", () => {
  it("1 i 2", () => {
    expect(outcomeFor("HOME", 2, 1)).toBe("WON");
    expect(outcomeFor("HOME", 1, 1)).toBe("LOST");
    expect(outcomeFor("AWAY", 0, 1)).toBe("WON");
    expect(outcomeFor("AWAY", 2, 2)).toBe("LOST");
  });
  it("2+ = najmanje 2 gola", () => {
    expect(outcomeFor("OVER_1_5", 1, 1)).toBe("WON");
    expect(outcomeFor("OVER_1_5", 2, 0)).toBe("WON");
    expect(outcomeFor("OVER_1_5", 1, 0)).toBe("LOST");
    expect(outcomeFor("OVER_1_5", 0, 0)).toBe("LOST");
  });
  it("0–3 = najviše 3 gola", () => {
    expect(outcomeFor("UNDER_3_5", 0, 0)).toBe("WON");
    expect(outcomeFor("UNDER_3_5", 2, 1)).toBe("WON");
    expect(outcomeFor("UNDER_3_5", 3, 0)).toBe("WON");
    expect(outcomeFor("UNDER_3_5", 3, 1)).toBe("LOST");
    expect(outcomeFor("UNDER_3_5", 2, 2)).toBe("LOST");
  });
});

describe("isplata i profit (ulog 1.000 RSD)", () => {
  const n = (x: { grossReturn: unknown; netProfit: unknown }) => [Number(x.grossReturn), Number(x.netProfit)];
  it("WON = ulog × kvota, neto = ulog × (kvota − 1)", () => expect(n(amountsFor("WON", 1000, 1.25))).toEqual([1250, 250]));
  it("LOST = 0, neto −ulog", () => expect(n(amountsFor("LOST", 1000, 1.25))).toEqual([0, -1000]));
  it("VOID = vraćen ulog, neto 0", () => expect(n(amountsFor("VOID", 1000, 1.25))).toEqual([1000, 0]));
  it("na čekanju se ne obračunava", () => expect(amountsFor("PENDING", 1000, 1.25)).toEqual({ grossReturn: null, netProfit: null }));
  it("zaokruživanje na 2 decimale", () => {
    expect(n(amountsFor("WON", 333.33, 1.17))).toEqual([390, 56.67]);
    expect(n(amountsFor("WON", 1000, 1.2345))).toEqual([1234.5, 234.5]);
    expect(n(amountsFor("WON", 999.99, 1.29))).toEqual([1289.99, 290]);
  });
});

describe("prepoznavanje utakmice", () => {
  const t = (h: string, a: string, iso = "2026-11-10T17:45:00Z") => ({ homeTeam: h, awayTeam: a, kickoffTime: new Date(iso) });
  const c = (id: number, home: string, away: string, iso = "2026-11-10T17:45:00Z") => ({ id, home, away, kickoff: new Date(iso) });

  it("isti timovi pod drugim imenima", () => {
    expect(teamSimilarity("AFC Metalul Buzau", "Metalul Buzău")).toBeGreaterThan(0.8);
    expect(teamSimilarity("Csa Steaua Bucuresti", "CSA Steaua Bucureşti")).toBeGreaterThan(0.8);
    expect(teamSimilarity("Estudiantes de LP Reserve", "Estudiantes La Plata Res")).toBeGreaterThan(0.6);
    expect(teamSimilarity("CD Pamplona", "Pamplona")).toBeGreaterThan(0.8);
    expect(teamSimilarity("Leicester City", "Leicester")).toBeGreaterThan(0.8);
  });
  it("ženski, rezervni i mlađi timovi se ne mešaju sa prvim timom", () => {
    expect(teamSimilarity("Chelsea", "Chelsea W")).toBe(0);
    expect(teamSimilarity("Tigre Reserve", "Tigre")).toBe(0);
    expect(teamSimilarity("Benfica U23", "Benfica")).toBe(0);
  });
  it("ženska/rezervna ekipa prepoznata iz imena takmičenja", () => {
    expect(teamSimilarity("Chelsea FC", "Chelsea W", "UEFA Champions League Women", "UEFA Champions League Women")).toBeGreaterThan(0.8);
    expect(teamSimilarity("Odense Q", "Odense Q W", "A Liga, Women", "Kvindeliga")).toBeGreaterThan(0.8);
    expect(teamSimilarity("CA Sarmiento de Junin", "Sarmiento Res.", "Primera LPF, Reserves", "Reserve League")).toBeGreaterThan(0.6);
    expect(teamSimilarity("Chelsea FC", "Chelsea W", "Premier League", "UEFA Champions League Women")).toBe(0);
  });

  it("nalazi pravu utakmicu", () => {
    const r = findFixture(t("AFC Metalul Buzau", "Csa Steaua Bucuresti", "2026-11-10T16:30:00Z"), [
      c(1, "Metalul Buzău", "CSA Steaua Bucureşti", "2026-11-10T16:30:00Z"),
      c(2, "Dinamo", "Rapid", "2026-11-10T16:30:00Z"),
    ]);
    expect(r).toMatchObject({ status: "found", confidence: "HIGH" });
    if (r.status === "found") expect(r.fixture.id).toBe(1);
  });
  it("isti domaćin, drugi gost → nema poklapanja (ne obračunava se pogrešna utakmica)", () => {
    expect(findFixture(t("Envigado FC", "Boca Juniors de Cali"), [c(1, "Envigado", "Popayan")]).status).toBe("none");
    expect(findFixture(t("Jaguar PE", "Vera Cruz PE"), [c(1, "Jaguaré", "Ipojuca")]).status).toBe("none");
  });
  it("vreme mora da se slaže", () => {
    expect(findFixture(t("Leicester City", "Walsall FC"), [c(1, "Leicester", "Walsall", "2026-11-11T17:45:00Z")]).status).toBe("none");
  });
  it("pomereno vreme (do 3h) → MEDIUM, potrebna potvrda", () => {
    const r = findFixture(t("Leicester City", "Walsall FC"), [c(1, "Leicester", "Walsall", "2026-11-10T19:45:00Z")]);
    expect(r).toMatchObject({ status: "found", confidence: "MEDIUM" });
  });
  it("dve slične utakmice → nejasno", () => {
    const r = findFixture(t("Nacional", "Peñarol"), [c(1, "Nacional", "Penarol"), c(2, "Nacional", "Peñarol")]);
    expect(r.status).toBe("ambiguous");
  });
});

describe("OddsPapi /scores", () => {
  it("uzima period fulltime (90 min)", () => {
    expect(parseScores({ scores: { periods: { result: { participant1Score: 3, participant2Score: 2 }, p1: { participant1Score: 0, participant2Score: 0 }, fulltime: { participant1Score: 2, participant2Score: 2 } } } })).toEqual({ home: 2, away: 2 });
  });
  it("bez fulltime → null (ne nagađamo)", () => {
    expect(parseScores({ scores: { periods: { result: { participant1Score: 1, participant2Score: 0 } } } })).toBeNull();
    expect(parseScores({})).toBeNull();
  });
});
