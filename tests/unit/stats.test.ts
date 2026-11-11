import { describe, expect, it } from "vitest";
import { bucketOf, computeStats, metrics, ODDS_BUCKETS, periodKey, SPEC_BUCKETS, type StatRow } from "@/lib/stats/compute";

let n = 0;
const row = (status: string, marketType: string, odds: number, over: Partial<StatRow> = {}): StatRow => {
  const stake = 1000;
  const gross = status === "WON" ? Math.round(stake * odds * 100) / 100 : status === "VOID" ? stake : status === "LOST" ? 0 : null;
  return {
    status, marketType, odds, stake, gross, net: gross == null ? null : gross - stake,
    kickoff: "2026-11-11T10:00:00Z", competition: "Liga", country: "Srbija", filterSetId: "f1", filterSetName: "Filter",
    match: `M${++n}`, home: null, away: null, ...over,
  };
};

describe("metrike", () => {
  it("prolaznost, profit, ROI i break-even", () => {
    const m = metrics([row("WON", "HOME", 1.2), row("WON", "HOME", 1.25), row("LOST", "HOME", 1.3), row("PENDING", "HOME", 1.1), row("VOID", "HOME", 1.2), row("NEEDS_REVIEW", "HOME", 1.2)]);
    expect(m).toMatchObject({ total: 6, won: 2, lost: 1, void: 1, open: 1, review: 1, settled: 4 });
    expect(m.passRate).toBeCloseTo(66.67, 1);
    expect(m.net).toBe(200 + 250 - 1000);
    expect(m.stake).toBe(4000); // 3 odlučena + 1 VOID (vraćen ulog)
    expect(m.gross).toBe(1200 + 1250 + 1000);
    expect(m.roi).toBeCloseTo((-550 / 4000) * 100, 5);
    // break-even = 3 / (1.2 + 1.25 + 1.3)
    expect(m.breakEven).toBeCloseTo((3 / 3.75) * 100, 5);
    expect(m.avgOdds).toBeCloseTo(1.25, 5);
  });
  it("bez obračunatih – nema procenata", () => {
    expect(metrics([row("PENDING", "HOME", 1.2)])).toMatchObject({ passRate: null, breakEven: null, roi: null, net: 0 });
  });
  it("primer iz specifikacije: 40 prošlo @1.20, 10 palo → −2.000 RSD", () => {
    const rows = [...Array(40)].map(() => row("WON", "OVER_1_5", 1.2)).concat([...Array(10)].map(() => row("LOST", "OVER_1_5", 1.2)));
    const m = metrics(rows);
    expect(m.stake).toBe(50000);
    expect(m.gross).toBe(48000);
    expect(m.net).toBe(-2000);
    expect(m.passRate).toBe(80);
    expect(m.breakEven).toBeCloseTo(83.33, 1);
  });
});

describe("opsezi kvota", () => {
  it("granice uključene, zaokruživanje na 2 decimale", () => {
    expect(bucketOf(1.01, SPEC_BUCKETS)).toBe("1.01-1.10");
    expect(bucketOf(1.1, SPEC_BUCKETS)).toBe("1.01-1.10");
    expect(bucketOf(1.11, SPEC_BUCKETS)).toBe("1.11-1.20");
    expect(bucketOf(1.3, SPEC_BUCKETS)).toBe("1.21-1.30");
    expect(bucketOf(1.105, SPEC_BUCKETS)).toBe("1.11-1.20");
    expect(bucketOf(1.05, ODDS_BUCKETS)).toBe("1.01-1.05");
    expect(bucketOf(1.26, ODDS_BUCKETS)).toBe("1.26-1.30");
    expect(bucketOf(1.31, SPEC_BUCKETS)).toBeNull();
  });
});

describe("periodi (Beograd)", () => {
  it("dan, nedelja (od ponedeljka), mesec", () => {
    expect(periodKey("2026-11-10T23:30:00Z", "day")).toBe("2026-11-11"); // već sreda u Beogradu
    expect(periodKey("2026-11-11T10:00:00Z", "week")).toBe("2026-11-09"); // ponedeljak
    expect(periodKey("2026-11-15T20:00:00Z", "week")).toBe("2026-11-09"); // nedelja → ista nedelja
    expect(periodKey("2026-11-16T08:00:00Z", "week")).toBe("2026-11-16");
    expect(periodKey("2026-11-30T23:30:00Z", "month")).toBe("2026-12");
  });
});

describe("computeStats", () => {
  const rows = [
    row("WON", "HOME", 1.2, { kickoff: "2026-11-10T10:00:00Z" }),
    row("LOST", "OVER_1_5", 1.08, { kickoff: "2026-11-10T12:00:00Z", competition: "Kup" }),
    row("WON", "OVER_1_5", 1.07, { kickoff: "2026-11-11T12:00:00Z" }),
    row("WON", "UNDER_3_5", 1.27, { kickoff: "2026-11-11T12:00:00Z", filterSetId: "f2", filterSetName: "Drugi" }),
    row("PENDING", "AWAY", 1.15, { kickoff: "2026-11-12T12:00:00Z" }),
  ];
  const s = computeStats(rows, "day");
  it("po tipu i grupi (ishod vs golovi)", () => {
    expect(s.byType.map((t) => [t.label, t.won, t.lost])).toEqual([["1", 1, 0], ["2", 0, 0], ["2+", 1, 1], ["0–3", 1, 0]]);
    expect(s.byGroup.map((g) => [g.key, g.won, g.lost])).toEqual([["result", 1, 0], ["goals", 2, 1]]);
  });
  it("po kvoti i matrica tip × kvota", () => {
    expect(s.byOdds.find((b) => b.key === "1.06-1.10")).toMatchObject({ won: 1, lost: 1 });
    expect(s.matrix.find((m) => m.key === "OVER_1_5")!.cells.find((c) => c.bucket === "1.06-1.10")).toMatchObject({ won: 1, lost: 1, passRate: 50 });
  });
  it("vremenska linija sa kumulativnim profitom (bez neobračunatih)", () => {
    expect(s.timeline.map((t) => [t.key, t.won, t.lost, t.net, t.cumulative])).toEqual([
      ["2026-11-10", 1, 1, 200 - 1000, -800],
      ["2026-11-11", 2, 0, 70 + 270, -460],
    ]);
  });
  it("po filteru, takmičenju i poslednji pali", () => {
    expect(s.byFilterSet.map((f) => [f.label, f.total])).toEqual([["Filter", 4], ["Drugi", 1]]);
    expect(s.byCompetition[0].label).toBe("Srbija · Liga");
    expect(s.recentLost).toHaveLength(1);
  });
});
