/**
 * Statistika iz trajno sačuvanih zapisa (tipovi u filterima). Čiste funkcije – lako se testiraju.
 * Prolaznost = WON / (WON + LOST). PENDING/LIVE/POSTPONED/VOID/NEEDS_REVIEW ne ulaze u imenilac.
 */
export type StatRow = {
  status: string;
  marketType: string;
  odds: number;
  stake: number;
  gross: number | null;
  net: number | null;
  kickoff: string; // ISO
  competition: string;
  country: string | null;
  filterSetId: string;
  filterSetName: string;
  match: string;
  home: number | null;
  away: number | null;
};

export type Metrics = {
  total: number;
  won: number;
  lost: number;
  void: number;
  open: number;
  review: number;
  settled: number;
  passRate: number | null;
  /** Prolaznost potrebna da se ne bude u minusu (za ove kvote). */
  breakEven: number | null;
  avgOdds: number | null;
  stake: number;
  gross: number;
  net: number;
  roi: number | null;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

export function metrics(rows: StatRow[]): Metrics {
  let won = 0, lost = 0, voided = 0, open = 0, review = 0, stake = 0, gross = 0, net = 0, oddsSum = 0;
  for (const r of rows) {
    if (r.status === "WON" || r.status === "LOST") {
      if (r.status === "WON") won++;
      else lost++;
      oddsSum += r.odds;
    }
    if (r.status === "VOID") voided++;
    if (r.status === "NEEDS_REVIEW") review++;
    if (r.status === "PENDING" || r.status === "LIVE" || r.status === "POSTPONED") open++;
    if (r.status === "WON" || r.status === "LOST" || r.status === "VOID") {
      stake += r.stake;
      gross += r.gross ?? 0;
      net += r.net ?? 0;
    }
  }
  const decided = won + lost;
  return {
    total: rows.length,
    won, lost, void: voided, open, review,
    settled: won + lost + voided,
    passRate: decided ? (won / decided) * 100 : null,
    breakEven: decided ? (decided / oddsSum) * 100 : null,
    avgOdds: decided ? oddsSum / decided : null,
    stake: r2(stake), gross: r2(gross), net: r2(net),
    roi: stake > 0 ? (net / stake) * 100 : null,
  };
}

export const TYPE_ORDER = ["HOME", "AWAY", "OVER_1_5", "UNDER_3_5", "HOME_OVER_1_5", "HOME_UNDER_3_5", "AWAY_OVER_1_5", "AWAY_UNDER_3_5", "DRAW"] as const;
export const TYPE_LABEL: Record<string, string> = {
  HOME: "1", AWAY: "2", OVER_1_5: "2+", UNDER_3_5: "0–3", DRAW: "X",
  HOME_OVER_1_5: "1&2+", HOME_UNDER_3_5: "1&0–3", AWAY_OVER_1_5: "2&2+", AWAY_UNDER_3_5: "2&0–3",
};
const OPTIONAL_TYPES = new Set(["DRAW", "HOME_OVER_1_5", "HOME_UNDER_3_5", "AWAY_OVER_1_5", "AWAY_UNDER_3_5"]);
export const GROUPS = [
  { key: "result", label: "Konačan ishod (1, 2)", types: ["HOME", "AWAY", "DRAW"] },
  { key: "goals", label: "Golovi (2+, 0–3)", types: ["OVER_1_5", "UNDER_3_5"] },
  { key: "combo", label: "Spojeni (1&2+, 1&0–3, 2&2+, 2&0–3)", types: ["HOME_OVER_1_5", "HOME_UNDER_3_5", "AWAY_OVER_1_5", "AWAY_UNDER_3_5"] },
];

export const ODDS_BUCKETS = [
  { key: "1.01-1.05", from: 1.01, to: 1.05 },
  { key: "1.06-1.10", from: 1.06, to: 1.1 },
  { key: "1.11-1.15", from: 1.11, to: 1.15 },
  { key: "1.16-1.20", from: 1.16, to: 1.2 },
  { key: "1.21-1.25", from: 1.21, to: 1.25 },
  { key: "1.26-1.30", from: 1.26, to: 1.3 },
];
export const SPEC_BUCKETS = [
  { key: "1.01-1.10", from: 1.01, to: 1.1 },
  { key: "1.11-1.20", from: 1.11, to: 1.2 },
  { key: "1.21-1.30", from: 1.21, to: 1.3 },
];

/** Kvota se zaokružuje na 2 decimale pre svrstavanja (1.105 → 1.11). */
export function bucketOf(odds: number, buckets: { key: string; from: number; to: number }[]) {
  const o = Math.round(odds * 100) / 100;
  return buckets.find((b) => o >= b.from - 1e-9 && o <= b.to + 1e-9)?.key ?? null;
}

const TZ = "Europe/Belgrade";
const ymd = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));

export type Granularity = "day" | "week" | "month";

/** Ključ perioda u beogradskom vremenu: dan (YYYY-MM-DD), nedelja (ponedeljak te nedelje) ili mesec (YYYY-MM). */
export function periodKey(iso: string, g: Granularity): string {
  const d = ymd(iso);
  if (g === "day") return d;
  if (g === "month") return d.slice(0, 7);
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  const dow = (t.getUTCDay() + 6) % 7; // 0 = ponedeljak
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

function groupBy<T>(rows: T[], key: (r: T) => string | null) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

export function computeStats(rows: StatRow[], granularity: Granularity = "day") {
  const overall = metrics(rows);
  const byType = TYPE_ORDER.map((t) => ({ key: t, label: TYPE_LABEL[t], ...metrics(rows.filter((r) => r.marketType === t)) })).filter((x) => x.total > 0 || !OPTIONAL_TYPES.has(x.key));
  const byGroup = GROUPS.map((g) => ({ key: g.key, label: g.label, ...metrics(rows.filter((r) => g.types.includes(r.marketType))) })).filter((g) => g.total > 0 || g.key !== "combo");
  const byOdds = ODDS_BUCKETS.map((b) => ({ key: b.key, label: b.key.replace("-", "–"), ...metrics(rows.filter((r) => bucketOf(r.odds, ODDS_BUCKETS) === b.key)) }));
  const bySpecOdds = SPEC_BUCKETS.map((b) => ({ key: b.key, label: b.key.replace("-", "–"), ...metrics(rows.filter((r) => bucketOf(r.odds, SPEC_BUCKETS) === b.key)) }));
  const matrix = TYPE_ORDER.filter((t) => !OPTIONAL_TYPES.has(t) || rows.some((r) => r.marketType === t)).map((t) => ({
    key: t, label: TYPE_LABEL[t],
    cells: ODDS_BUCKETS.map((b) => {
      const m = metrics(rows.filter((r) => r.marketType === t && bucketOf(r.odds, ODDS_BUCKETS) === b.key));
      return { bucket: b.key, won: m.won, lost: m.lost, passRate: m.passRate, net: m.net };
    }),
  }));

  const comp = groupBy(rows, (r) => `${r.country ? `${r.country} · ` : ""}${r.competition}`);
  const byCompetition = [...comp.entries()].map(([label, rs]) => ({ key: label, label, ...metrics(rs) }))
    .filter((c) => c.won + c.lost > 0)
    .sort((a, b) => b.won + b.lost - (a.won + a.lost) || b.net - a.net);

  const periods = groupBy(rows.filter((r) => r.status === "WON" || r.status === "LOST" || r.status === "VOID"), (r) => periodKey(r.kickoff, granularity));
  let cumulative = 0;
  const timeline = [...periods.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rs]) => {
    const m = metrics(rs);
    cumulative = r2(cumulative + m.net);
    return { key, won: m.won, lost: m.lost, void: m.void, passRate: m.passRate, net: m.net, cumulative };
  });

  const sets = groupBy(rows, (r) => r.filterSetId);
  const byFilterSet = [...sets.entries()].map(([id, rs]) => ({
    key: id, label: rs[0].filterSetName, ...metrics(rs),
    byType: TYPE_ORDER.map((t) => ({ key: t, label: TYPE_LABEL[t], ...metrics(rs.filter((r) => r.marketType === t)) })).filter((x) => x.total > 0),
  })).sort((a, b) => b.total - a.total);

  const recentLost = rows.filter((r) => r.status === "LOST").sort((a, b) => b.kickoff.localeCompare(a.kickoff)).slice(0, 20);

  return { overall, byType, byGroup, byOdds, bySpecOdds, matrix, byCompetition, timeline, byFilterSet, recentLost };
}
export type Stats = ReturnType<typeof computeStats>;
