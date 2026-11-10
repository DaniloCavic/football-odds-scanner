import type { MarketTypeCode } from "@/lib/odds";
import { ProviderError, RequestLimitReached, type OddsProvider, type ProviderFixture, type ScanContext } from "../types";

/**
 * OddsPapi (https://oddspapi.io) – agregator kvota koji nudi i SoccerBet RS.
 * Dokumentacija: https://oddspapi.io/en/docs  (v4, API ključ ide kao query parametar apiKey).
 * Svaki poziv (osim /v4/account) troši 1 zahtev iz mesečne kvote; cooldown po endpointu je 1000 ms.
 */
export const ODDSPAPI_BASE = "https://api.oddspapi.io/v4";
export const SOCCERBET_SLUG = "soccerbet.rs";

/** Srpske kladionice koje OddsPapi nudi (slug → naziv). */
export const ODDSPAPI_BOOKMAKERS = [
  { slug: "admiralbet.rs", name: "AdmiralBet" },
  { slug: "superbet.rs", name: "Superbet" },
  { slug: "mozzartbet", name: "Mozzart" },
  { slug: "maxbet.rs", name: "MaxBet" },
  { slug: "soccerbet.rs", name: "Soccerbet" },
  { slug: "balkanbet.rs", name: "BalkanBet" },
] as const;
export type OddsPapiBookmaker = { slug: string; name: string };
export const FOOTBALL_SPORT_ID = 10;
const COOLDOWN_MS = 1100;
const MAX_RANGE_MS = 9 * 24 * 3600_000; // /v4/fixtures dozvoljava manje od 10 dana
const TOURNAMENTS_PER_CALL = 3; // /v4/odds-by-tournaments: najviše 3 turnira

type Fetch = typeof fetch;

export type OddsPapiMarket = {
  marketId: number;
  marketName: string;
  marketType: string;
  period: string;
  handicap: number;
  playerProp: boolean;
  sportId: number;
  outcomes: { outcomeId: number; outcomeName: string }[];
};

export type OddsPapiFixture = {
  fixtureId: string;
  sportId: number;
  tournamentId: number;
  statusId: number;
  startTime: string;
  participant1Name?: string;
  participant2Name?: string;
  tournamentName?: string;
  categoryName?: string;
  sportName?: string;
  bookmakerOdds?: Record<string, OddsPapiBookmakerOdds>;
};

type OddsPapiBookmakerOdds = {
  bookmakerIsActive?: boolean;
  suspended?: boolean;
  markets?: Record<string, {
    marketActive?: boolean;
    outcomes?: Record<string, { players?: Record<string, { active?: boolean; price?: number; changedAt?: string; bookmakerChangedAt?: string | null }> }>;
  }>;
};

/** Mapiranje naših tipova na OddsPapi (marketId, outcomeId). Može biti više kandidata po tipu. */
export type OutcomeRef = { marketId: string; outcomeId: string };
export type OutcomeMap = Partial<Record<MarketTypeCode, OutcomeRef[]>>;

const EXCLUDED_TOTALS = /(team|home|away|asian|corner|card|booking|half|1st|2nd|player|exact|odd|even|both|btts|minute|interval|period|draw no|handicap|spread)/i;

export function resolveOutcomeMap(markets: OddsPapiMarket[]): OutcomeMap {
  const ft = markets.filter((m) => m.sportId === FOOTBALL_SPORT_ID && !m.playerProp && /^(fulltime|full_time|ft|regular)$/i.test(m.period));
  const map: OutcomeMap = {};
  const add = (t: MarketTypeCode, m: OddsPapiMarket, outcomeName: RegExp) => {
    const o = m.outcomes.find((x) => outcomeName.test(x.outcomeName.trim()));
    if (o) (map[t] ??= []).push({ marketId: String(m.marketId), outcomeId: String(o.outcomeId) });
  };
  for (const m of ft.filter((x) => x.marketType === "1x2" && x.outcomes.length === 3 && !EXCLUDED_TOTALS.test(x.marketName))) {
    add("HOME", m, /^1$/);
    add("AWAY", m, /^2$/);
  }
  // 1) Klasično: "Over Under" sa granicom 1.5 (Over = 2+) i 3.5 (Under = 0–3)
  const totals = (line: number) => ft.filter((m) => m.marketType === "totals" && Math.abs(m.handicap - line) < 1e-9
    && !EXCLUDED_TOTALS.test(m.marketName));
  for (const m of totals(1.5)) add("OVER_1_5", m, /^(over|over\s*1\.5|\+1\.5)$/i);
  for (const m of totals(3.5)) add("UNDER_3_5", m, /^(under|under\s*3\.5|-3\.5)$/i);
  // 2) Tržišta gde je sam ishod "2+" ili "0–3" (opsezi golova, "ukupno golova")
  const goalish = ft.filter((m) => !EXCLUDED_TOTALS.test(m.marketName) && /(goal|total|range|over|under|ukupno)/i.test(`${m.marketName} ${m.marketType}`));
  for (const m of goalish) {
    add("OVER_1_5", m, /^(2\+|2\s*\+\s*goals?|2 or more( goals)?|2 and more|at least 2( goals)?|over 1\.5( goals)?|2-\+|2\s*-\s*more)$/i);
    add("UNDER_3_5", m, /^(0\s*[-–]\s*3( goals)?|0 to 3( goals)?|3 or (less|fewer)( goals)?|under 3\.5( goals)?|max(imum)? 3)$/i);
  }
  // 3) Da/Ne tržišta tipa "2+ goals" / "Over 1.5 goals"
  for (const m of goalish) {
    if (/(2\+|over\s*1\.5|two or more|at least 2)/i.test(m.marketName)) add("OVER_1_5", m, /^yes$/i);
    if (/(0\s*[-–]\s*3|under\s*3\.5|3 or (less|fewer))/i.test(m.marketName)) add("UNDER_3_5", m, /^yes$/i);
  }
  // bez duplikata
  for (const k of Object.keys(map) as MarketTypeCode[]) {
    const seen = new Set<string>();
    map[k] = map[k]!.filter((r) => { const key = `${r.marketId}/${r.outcomeId}`; if (seen.has(key)) return false; seen.add(key); return true; });
  }
  return map;
}

/** Izvlači kvote jednog bukmejkera za naše tipove. Neaktivne/suspendovane kvote se preskaču. */
export function extractOdds(fx: OddsPapiFixture, map: OutcomeMap, slug = SOCCERBET_SLUG): ProviderFixture["odds"] {
  const book = fx.bookmakerOdds?.[slug];
  const out: ProviderFixture["odds"] = {};
  if (!book || book.bookmakerIsActive === false || book.suspended) return out;
  for (const [type, refs] of Object.entries(map) as [MarketTypeCode, OutcomeRef[]][]) {
    for (const ref of refs) {
      const market = book.markets?.[ref.marketId];
      if (!market || market.marketActive === false) continue;
      const player = market.outcomes?.[ref.outcomeId]?.players?.["0"];
      if (!player || player.active === false || typeof player.price !== "number") continue;
      const ts = player.bookmakerChangedAt ?? player.changedAt;
      out[type] = { price: player.price, changedAt: ts ? new Date(ts) : new Date() };
      break;
    }
  }
  return out;
}

export function toProviderFixture(fx: OddsPapiFixture, map: OutcomeMap, slug = SOCCERBET_SLUG): ProviderFixture {
  const book = fx.bookmakerOdds?.[slug];
  return {
    rawMarketIds: book?.markets ? Object.keys(book.markets) : [],
    externalId: fx.fixtureId,
    sport: fx.sportId === FOOTBALL_SPORT_ID ? "football" : "other",
    homeTeam: fx.participant1Name ?? "?",
    awayTeam: fx.participant2Name ?? "?",
    competition: fx.tournamentName ?? "?",
    country: fx.categoryName ?? null,
    externalCompetitionId: fx.tournamentId != null ? String(fx.tournamentId) : null,
    kickoffTime: new Date(fx.startTime),
    odds: extractOdds(fx, map, slug),
  };
}

/** Deli period na delove kraće od 10 dana (ograničenje /v4/fixtures). */
export function splitRange(from: Date, to: Date): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += MAX_RANGE_MS) {
    out.push({ from: new Date(t), to: new Date(Math.min(t + MAX_RANGE_MS, to.getTime())) });
  }
  return out;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class OddsPapiClient {
  private lastCall = 0;
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly cooldownMs = COOLDOWN_MS,
    private readonly sleepImpl: (ms: number) => Promise<void> = sleep,
  ) {}

  async get<T>(path: string, params: Record<string, string | number | boolean>, ctx?: ScanContext): Promise<T> {
    const url = new URL(ODDSPAPI_BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set("apiKey", this.apiKey);

    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = this.lastCall + this.cooldownMs - Date.now();
      if (wait > 0) await this.sleepImpl(wait);
      this.lastCall = Date.now();

      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers: { accept: "application/json" }, cache: "no-store" });
      } catch {
        if (attempt === 3) throw new ProviderError("OddsPapi nije dostupan (mrežna greška).", "NETWORK");
        await this.sleepImpl(2000 * 2 ** attempt);
        continue;
      }
      if (path !== "/account" && ctx) await ctx.countRequest();

      if (res.ok) return (await res.json()) as T;
      const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string; details?: string; error?: { code?: string; message?: string; details?: string } };
      const err = body.error ?? body;
      const code = err.code ?? `HTTP_${res.status}`;
      if (code === "REQUEST_LIMIT_EXCEEDED") throw new ProviderError("Potrošena je mesečna kvota OddsPapi zahteva. Kvota se obnavlja 1. u mesecu ili uz plaćeni paket.", code);
      if (res.status === 401) throw new ProviderError("OddsPapi API ključ nije ispravan. Proverite ODDSPAPI_API_KEY na Railway-u.", code);
      if (res.status === 403) throw new ProviderError(`OddsPapi odbija pristup (${err.details ?? err.message ?? code}). Vaš paket možda ne uključuje SoccerBet RS.`, code);
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await this.sleepImpl(2000 * 2 ** attempt);
        continue;
      }
      throw new ProviderError(`OddsPapi greška ${res.status}: ${err.details ?? err.message ?? code}`, code);
    }
    throw new ProviderError("OddsPapi ne odgovara ni posle više pokušaja.", "RETRY_EXHAUSTED");
  }
}

type MarketsCache = { at: number; map: OutcomeMap; names: Map<string, string>; outcomeNames: Map<string, string> };
let marketsCache: MarketsCache | null = null;

function buildCache(markets: OddsPapiMarket[]): MarketsCache {
  const football = markets.filter((m) => m.sportId === FOOTBALL_SPORT_ID);
  return {
    at: Date.now(),
    map: resolveOutcomeMap(markets),
    names: new Map(football.map((m) => [String(m.marketId), `${m.marketName} [${m.marketType}, ${m.period}, ${m.handicap}]`])),
    outcomeNames: new Map(football.flatMap((m) => m.outcomes.map((o) => [`${m.marketId}/${o.outcomeId}`, o.outcomeName] as [string, string]))),
  };
}

const GOAL_MARKET = /(totals|goal|over|under|range|ukupno)/i;
const NOT_GOAL = /(half|p1|p2|team|corner|card|first goal|firstgoal|scorer|toscore|exact|correct|both|btts|winning|margin|wintonil|highest)/i;

/** Sažet prikaz tržišta: ishodi sa imenom, kvotom i aktivnošću. */
function describeMarket(mid: string, m: NonNullable<OddsPapiBookmakerOdds["markets"]>[string] & { bookmakerMarketId?: string }) {
  return {
    marketId: mid,
    name: marketsCache?.names.get(mid) ?? "?",
    bookmakerMarketId: m.bookmakerMarketId,
    outcomes: Object.entries(m.outcomes ?? {}).map(([oid, o]) => {
      const p = o.players?.["0"] as { price?: number; active?: boolean; bookmakerOutcomeId?: string } | undefined;
      return { id: oid, name: marketsCache?.outcomeNames.get(`${mid}/${oid}`) ?? "?", price: p?.price ?? null, active: p?.active ?? null, bookmakerOutcomeId: p?.bookmakerOutcomeId || undefined };
    }),
  };
}

export function createOddsPapiProvider(
  apiKey: string,
  fetchImpl: Fetch = fetch,
  client = new OddsPapiClient(apiKey, fetchImpl),
  bookmaker: OddsPapiBookmaker = ODDSPAPI_BOOKMAKERS.find((b) => b.slug === SOCCERBET_SLUG)!,
): OddsProvider {
  const slug = bookmaker.slug;
  return {
    id: `oddspapi:${slug}`,
    matchNamespace: "oddspapi",
    name: bookmaker.name,
    sourceLabel: `${bookmaker.name} · OddsPapi`,
    isDemo: false,
    async *scan(range, ctx) {
      let used = 0;
      const call = async <T>(path: string, params: Record<string, string | number | boolean>) => {
        if (used >= ctx.maxRequests) throw new RequestLimitReached(ctx.maxRequests);
        used += 1;
        return client.get<T>(path, params, ctx);
      };

      // 1) Šifre tržišta (keš 24h)
      if (!marketsCache || Date.now() - marketsCache.at > 24 * 3600_000) {
        const markets = await call<OddsPapiMarket[]>("/markets", { language: "en" });
        marketsCache = buildCache(markets);
      }
      const { map, names } = marketsCache;
      const seenMarkets = new Map<string, number>();
      // Uzorak za mapirana tržišta i SVA tržišta golova (prva utakmica gde ih kladionica ima)
      const mappedIds = new Set(Object.values(map).flat().map((r) => r!.marketId));
      const samples: Record<string, ReturnType<typeof describeMarket>> = {};
      const sample = (fx: OddsPapiFixture) => {
        const markets = fx.bookmakerOdds?.[slug]?.markets ?? {};
        for (const id of Object.keys(markets)) {
          const name = names.get(id) ?? "";
          const relevant = mappedIds.has(id) || (GOAL_MARKET.test(name) && !NOT_GOAL.test(name));
          if (relevant && !(id in samples)) samples[id] = describeMarket(id, markets[id]);
        }
      };
      const emit = (f: ProviderFixture) => {
        for (const id of f.rawMarketIds ?? []) seenMarkets.set(id, (seenMarkets.get(id) ?? 0) + 1);
        return f;
      };
      const missing = (["HOME", "AWAY", "OVER_1_5", "UNDER_3_5"] as const).filter((t) => !map[t]);
      if (missing.length) await ctx.warn(`OddsPapi nema prepoznato tržište za: ${missing.join(", ")}. Ti tipovi se preskaču.`);
      await ctx.diagnostic?.({ marketMap: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v!.map((r) => `${r.marketId}/${r.outcomeId}`)])) });

      // 2) Utakmice sa Soccerbet kvotama u periodu (samo one koje nisu počele)
      const fixtures: OddsPapiFixture[] = [];
      for (const part of splitRange(range.from, range.to)) {
        if (await ctx.shouldStop()) return;
        const list = await call<OddsPapiFixture[]>("/fixtures", {
          sportId: FOOTBALL_SPORT_ID, from: iso(part.from), to: iso(part.to), statusId: 0, hasOdds: true, bookmakers: slug,
        });
        fixtures.push(...list.filter((f) => f.sportId === FOOTBALL_SPORT_ID));
      }
      const wanted = new Map(fixtures.map((f) => [f.fixtureId, f]));
      await ctx.setTotal(wanted.size);
      if (wanted.size === 0) return;

      // 3) Kvote po turnirima (do 3 turnira po zahtevu) – mnogo štedljivije od zahteva po utakmici
      const tournaments = [...new Set(fixtures.map((f) => f.tournamentId))];
      const seen = new Set<string>();
      for (let i = 0; i < tournaments.length; i += TOURNAMENTS_PER_CALL) {
        if (await ctx.shouldStop()) return;
        const ids = tournaments.slice(i, i + TOURNAMENTS_PER_CALL);
        const data = await call<OddsPapiFixture[] | Record<string, OddsPapiFixture>>("/odds-by-tournaments", {
          tournamentIds: ids.join(","), bookmaker: slug, oddsFormat: "decimal", language: "en",
        });
        const list = Array.isArray(data) ? data : Object.values(data);
        for (const fx of list) {
          const base = wanted.get(fx.fixtureId);
          if (!base || seen.has(fx.fixtureId)) continue;
          seen.add(fx.fixtureId);
          try { sample(fx); } catch { /* dijagnostika ne sme da obori skeniranje */ }
          yield emit(toProviderFixture({ ...base, ...fx, sportId: base.sportId, startTime: fx.startTime ?? base.startTime }, map, slug));
        }
      }
      // Utakmice za koje Soccerbet nije vratio kvote se i dalje broje kao pregledane
      for (const [id, fx] of wanted) if (!seen.has(id)) yield toProviderFixture(fx, map, slug);
      // Dijagnostika: koja tržišta Soccerbet stvarno ima (najčešćih 40)
      const top = [...seenMarkets.entries()].sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ id, count, name: names.get(id) ?? "?" }));
      await ctx.diagnostic?.({ bookmakerMarkets: top, rawSamples: samples });
    },
  };
}

/** Kvote više kladionica za jednu utakmicu – 1 zahtev (/v4/odds). */
export async function compareBookmakers(apiKey: string, fixtureId: string, fetchImpl: Fetch = fetch, client = new OddsPapiClient(apiKey, fetchImpl)) {
  if (!marketsCache || Date.now() - marketsCache.at > 24 * 3600_000) {
    const markets = await client.get<OddsPapiMarket[]>("/markets", { language: "en" });
    marketsCache = buildCache(markets);
  }
  const fx = await client.get<OddsPapiFixture>("/odds", {
    fixtureId, bookmakers: ODDSPAPI_BOOKMAKERS.map((b) => b.slug).join(","), oddsFormat: "decimal", language: "en",
  });
  return {
    fixtureId,
    match: `${fx.participant1Name ?? "?"} – ${fx.participant2Name ?? "?"}`,
    competition: [fx.categoryName, fx.tournamentName].filter(Boolean).join(" · "),
    startTime: fx.startTime,
    bookmakers: ODDSPAPI_BOOKMAKERS.map((b) => {
      const odds = extractOdds(fx, marketsCache!.map, b.slug);
      // Sva tržišta za golove (pun meč) sa svim ishodima – da se vidi gde je npr. "2+"
      const goals = Object.entries(fx.bookmakerOdds?.[b.slug]?.markets ?? {})
        .filter(([mid]) => { const n = marketsCache!.names.get(mid) ?? "?"; return GOAL_MARKET.test(n) && !NOT_GOAL.test(n); })
        .map(([mid, m]) => describeMarket(mid, m));
      return {
        slug: b.slug,
        name: b.name,
        goals,
        present: !!fx.bookmakerOdds?.[b.slug],
        odds: Object.fromEntries(Object.entries(odds).map(([k, v]) => [k, v!.price])) as Record<string, number>,
      };
    }),
  };
}

export type OddsPapiAccount = {
  subscriptions?: { is_active?: boolean; request_limit?: number | null; request_count?: number; bookmakers?: Record<string, unknown>; sport_ids?: number[]; valid_until?: string | null }[];
  current_subscription_id?: string;
};

/** Status naloga – /v4/account ne troši kvotu. */
export async function getOddsPapiStatus(apiKey: string, fetchImpl: Fetch = fetch) {
  const client = new OddsPapiClient(apiKey, fetchImpl, 0);
  const acc = await client.get<OddsPapiAccount>("/account", {});
  const sub = acc.subscriptions?.find((s) => s.is_active) ?? acc.subscriptions?.[0];
  const books = sub?.bookmakers ? Object.keys(sub.bookmakers) : null;
  return {
    requestLimit: sub?.request_limit ?? null,
    requestCount: sub?.request_count ?? null,
    hasSoccerbet: books ? books.length === 0 || books.includes(SOCCERBET_SLUG) : null,
    /** null = paket ne ograničava kladionice */
    bookmakers: books && books.length ? books : null,
    hasFootball: sub?.sport_ids ? sub.sport_ids.includes(FOOTBALL_SPORT_ID) : null,
  };
}
