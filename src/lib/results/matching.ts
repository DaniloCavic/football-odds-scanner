/**
 * Prepoznavanje iste utakmice kod drugog izvora. Nikad samo po imenima:
 * moraju da se poklope OBA tima, vreme početka (±) i "tip" ekipe (ženska/rezerve/mlađa).
 */
const STOP = new Set([
  "fc", "cf", "sc", "ac", "afc", "cd", "ca", "cs", "csa", "sd", "ud", "fk", "sk", "nk", "bk", "if", "ik", "sv", "tsv", "vfl", "vfb",
  "club", "clube", "de", "da", "do", "del", "la", "el", "los", "las", "the", "and", "y", "e", "athletic", "atletico", "sporting",
  "deportivo", "sport", "sports", "football", "futbol", "soccer", "calcio", "esporte", "esportivo", "associacao", "asociacion", "societa",
  "pe", "ce", "sp", "rj", "mg", "rs", "pr", "ba", "go", "sc", "1", "cp", "ad", "rc", "rcd", "ssc", "as", "us", "ss", "sa",
]);

const WOMEN = /\b(w|wfc|women|womens|woman|femenino|feminino|femminile|feminin|ladies|frauen|dames|zenski|zene)\b/;
const RESERVE = /\b(res|reserve|reserves|reservas|ii|b|2)\b/;
const YOUTH = /\bu-?(17|18|19|20|21|22|23)\b/;

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ø]/g, "o").replace(/[æ]/g, "ae").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Kind = { women: boolean; reserve: boolean; youth: string | null };
const COMP_WOMEN = /\b(women|womens|woman|femenin[oa]?|feminin[oa]?|femminile|ladies|frauen|wsl|kvindeliga|damallsvenskan|liga f|nwsl)\b/;
const COMP_RESERVE = /\b(reserves?|reservas|res)\b/;

/** Vrsta ekipe iz imena tima, dopunjena imenom takmičenja (npr. "Champions League Women" → ženska ekipa). */
export function teamKind(raw: string, competition?: string | null): Kind {
  const n = normalizeName(raw);
  const c = competition ? normalizeName(competition) : "";
  return {
    women: WOMEN.test(n) || COMP_WOMEN.test(c),
    reserve: RESERVE.test(n) || COMP_RESERVE.test(c),
    youth: n.match(YOUTH)?.[1] ?? c.match(YOUTH)?.[1] ?? null,
  };
}

function tokens(raw: string): string[] {
  return normalizeName(raw)
    .split(" ")
    .filter((t) => t && !STOP.has(t) && !WOMEN.test(t) && !RESERVE.test(t) && !YOUTH.test(t) && !/^\d{4}$/.test(t));
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  const m = new Map<string, number>();
  for (const x of A) m.set(x, (m.get(x) ?? 0) + 1);
  let inter = 0;
  for (const x of B) { const c = m.get(x) ?? 0; if (c > 0) { inter++; m.set(x, c - 1); } }
  return (2 * inter) / (A.length + B.length);
}

/** Sličnost imena dva tima, 0–1. Takmičenja (opciono) pomažu da se prepozna ženska/rezervna ekipa. */
export function teamSimilarity(a: string, b: string, compA?: string | null, compB?: string | null): number {
  if (!kindsMatch(teamKind(a, compA), teamKind(b, compB))) return 0;
  const ta = tokens(a), tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return dice(normalizeName(a), normalizeName(b));
  const ja = ta.join(" "), jb = tb.join(" ");
  if (ja === jb) return 1;
  // svaki "bitan" token jednog imena ima dobar par u drugom (npr. "Inter Milano" ~ "Inter")
  const best = (x: string, ys: string[]) => Math.max(...ys.map((y) => (y.startsWith(x) || x.startsWith(y) ? (Math.min(x.length, y.length) >= 3 ? 0.95 : 0.6) : dice(x, y))));
  const short = ta.length <= tb.length ? ta : tb;
  const long = short === ta ? tb : ta;
  const cover = short.reduce((acc, t) => acc + best(t, long), 0) / short.length;
  return Math.max(cover * (short.length === long.length ? 1 : 0.92), dice(ja.replace(/ /g, ""), jb.replace(/ /g, "")));
}

function kindsMatch(a: Kind, b: Kind) {
  return a.women === b.women && a.reserve === b.reserve && a.youth === b.youth;
}

export type Candidate = { id: number; home: string; away: string; kickoff: Date; league?: string | null };
export type MatchResult<T extends Candidate> =
  | { status: "found"; fixture: T; confidence: "HIGH" | "MEDIUM"; score: number }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "none" };

export function findFixture<T extends Candidate>(
  ours: { homeTeam: string; awayTeam: string; kickoffTime: Date; competition?: string | null },
  candidates: T[],
): MatchResult<T> {
  const scored = candidates
    .map((c) => {
      const dt = Math.abs(c.kickoff.getTime() - ours.kickoffTime.getTime()) / 60_000;
      if (dt > 180) return null;
      const h = teamSimilarity(ours.homeTeam, c.home, ours.competition, c.league);
      const a = teamSimilarity(ours.awayTeam, c.away, ours.competition, c.league);
      if (Math.min(h, a) < 0.5) return null; // oba tima moraju da liče
      const score = (h + a) / 2 - (dt > 30 ? 0.1 : 0);
      const high = h >= 0.8 && a >= 0.8 && dt <= 30;
      return { c, score, high };
    })
    .filter((x): x is { c: T; score: number; high: boolean } => !!x)
    .sort((x, y) => y.score - x.score);
  if (scored.length === 0) return { status: "none" };
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.1) return { status: "ambiguous", candidates: scored.slice(0, 3).map((s) => s.c) };
  const top = scored[0];
  return { status: "found", fixture: top.c, confidence: top.high ? "HIGH" : "MEDIUM", score: top.score };
}
