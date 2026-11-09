/**
 * Samo pravi fudbal. Virtuelni fudbal, e-sport (FIFA/eFootball/Esoccer), simulacije (SRL)
 * i sve što nije fudbal se izbacuje, čak i ako provajder kaže da je "Soccer".
 */
const VIRTUAL_PATTERNS = [
  /\be-?soccer\b/i,
  /\be-?football\b/i,
  /\bcyber\s*(football|soccer)?\b/i,
  /\bvirtual/i,
  /\bvirtuel/i,
  /\bsimulat/i,
  /\bsimulirani/i,
  /\bsrl\b/i,
  /\bfifa\s*\d{2}/i,
  /\bea\s*sports\s*fc\b/i,
  /\bgt\s*(sports|leagues?)\b/i,
  /\besports?\b/i,
  /\bbattle\b.*\b(8|10|12)\s*min/i,
];

export type FootballCheckInput = {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  country?: string | null;
};

export function isRealFootball(m: FootballCheckInput): boolean {
  if (m.sport !== "football") return false;
  const fields = [m.homeTeam, m.awayTeam, m.competition, m.country ?? ""];
  return !fields.some((f) => VIRTUAL_PATTERNS.some((re) => re.test(f)));
}
