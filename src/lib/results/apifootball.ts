/**
 * API-Football (api-sports.io) – primarni izvor rezultata.
 * Jedan zahtev /fixtures?date=YYYY-MM-DD vraća sve utakmice dana sa rezultatima.
 * score.fulltime = rezultat posle 90 min (+ nadoknada), produžeci i penali su odvojeni.
 * Besplatan paket: 100 zahteva/dan, datumi juče–sutra.
 */
export const APIFOOTBALL_BASE = "https://v3.football.api-sports.io";

export type AfStatus = "NOT_STARTED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED" | "ABANDONED" | "AWARDED" | "UNKNOWN";

export type AfFixture = {
  id: number;
  home: string;
  away: string;
  kickoff: Date;
  league: string;
  country: string;
  status: AfStatus;
  statusShort: string;
  /** Rezultat posle 90 minuta (null ako nije poznat). */
  score90: { home: number; away: number } | null;
};

export function mapStatus(short: string): AfStatus {
  switch (short) {
    case "TBD": case "NS": return "NOT_STARTED";
    case "1H": case "HT": case "2H": case "ET": case "BT": case "P": case "LIVE": case "SUSP": case "INT": return "LIVE";
    case "FT": case "AET": case "PEN": return "FINISHED";
    case "PST": return "POSTPONED";
    case "CANC": return "CANCELLED";
    case "ABD": return "ABANDONED";
    case "AWD": case "WO": return "AWARDED";
    default: return "UNKNOWN";
  }
}

type Raw = {
  fixture: { id: number; date: string; status: { short: string } };
  league: { name: string; country: string };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  score: { fulltime: { home: number | null; away: number | null } };
};

export function parseFixture(r: Raw): AfFixture {
  const status = mapStatus(r.fixture.status.short);
  const ft = r.score?.fulltime;
  let score90: AfFixture["score90"] = null;
  if (ft && ft.home != null && ft.away != null) score90 = { home: ft.home, away: ft.away };
  // Za FT bez produžetaka "goals" = 90 min; za AET/PEN koristimo isključivo score.fulltime.
  else if (r.fixture.status.short === "FT" && r.goals.home != null && r.goals.away != null) score90 = { home: r.goals.home, away: r.goals.away };
  return {
    id: r.fixture.id,
    home: r.teams.home.name,
    away: r.teams.away.name,
    kickoff: new Date(r.fixture.date),
    league: r.league.name,
    country: r.league.country,
    status,
    statusShort: r.fixture.status.short,
    score90,
  };
}

export class ApiFootballError extends Error {}

export async function fetchDay(apiKey: string, date: string, fetchImpl: typeof fetch = fetch): Promise<AfFixture[]> {
  const url = `${APIFOOTBALL_BASE}/fixtures?date=${date}&timezone=Europe/Belgrade`;
  const res = await fetchImpl(url, { headers: { "x-apisports-key": apiKey }, cache: "no-store" });
  if (!res.ok) throw new ApiFootballError(`API-Football greška ${res.status}`);
  const body = (await res.json()) as { errors?: unknown; response?: Raw[] };
  const errors = body.errors && typeof body.errors === "object" ? Object.values(body.errors as Record<string, string>) : [];
  if (Array.isArray(body.errors) ? body.errors.length : errors.length) {
    throw new ApiFootballError(`API-Football: ${(Array.isArray(body.errors) ? body.errors : errors).join("; ")}`);
  }
  return (body.response ?? []).map(parseFixture);
}

const AF_KEY_NAMES = [
  "APIFOOTBALL_API_KEY", "API_FOOTBALL_API_KEY", "APIFOOTBALL_KEY", "API_FOOTBALL_KEY", "APIFOOTBALL",
  "API_FOOTBALL", "APISPORTS_KEY", "API_SPORTS_KEY", "X_APISPORTS_KEY", "FOOTBALL_API_KEY",
];
export const apiFootballKey = () => AF_KEY_NAMES.map((n) => process.env[n]?.trim()).find(Boolean) || null;
/** Samo IMENA promenljivih koje liče na API-Football ključ (nikad vrednosti) – pomoć pri podešavanju. */
export const apiFootballSimilarNames = () => Object.keys(process.env).filter((n) => /football|apisports|api_sports/i.test(n));
