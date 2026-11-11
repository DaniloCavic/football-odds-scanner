import type { PrismaClient } from "@prisma/client";
import type { MarketTypeCode } from "@/lib/odds";
import { addDays, zonedYmd, ymdToString } from "@/lib/time";
import { applyDecision } from "./apply";
import type { AfFixture } from "./apifootball";
import { findFixture } from "./matching";
import type { OpResponse, OpSettlement } from "./oddspapi-results";
import { outcomeFor, type TrackStatus } from "./settle-math";
import { dailyCount, getState, incDaily, setState, tryLock, unlock } from "./job-state";

const MIN = 60_000;
/** Posle koliko minuta od početka očekujemo kraj utakmice (90 + poluvreme + nadoknade). */
export const EXPECTED_END_MIN = 110;
const FALLBACK_AFTER_MIN = 150;
const REVIEW_AFTER_H = 36;
const GIVE_UP_DAYS = 3;
const AF_DAILY_CAP = 90;
/** Brojač uspešnih API-Football zahteva (v2: neuspeli se više ne broje). */
const AF_COUNTER = "apifootball-ok";

export type TrackerDeps = {
  db: PrismaClient;
  now?: Date;
  /** null = API-Football nije podešen */
  apiFootball: ((date: string) => Promise<AfFixture[]>) | null;
  /** null = OddsPapi nije podešen */
  oddsPapi: ((fixtureId: string) => Promise<OpResponse>) | null;
  resultCheckMinutes: number;
  oddsPapiChecksPerDay: number;
};

export type TrackerReport = {
  at: string;
  matches: number;
  settled: number;
  live: number;
  postponed: number;
  needsReview: number;
  apiFootballCalls: number;
  oddsPapiCalls: number;
  errors: string[];
  skipped?: string;
  /** Stanje izvora (za prikaz). */
  sources?: {
    apiFootball: { configured: boolean; usedToday: number; cap: number; blockedUntil: string | null; lastError: string | null };
    oddsPapi: { configured: boolean; usedToday: number; budget: number };
  };
};

type OpResult = { result: OpSettlement; score: { home: number; away: number } | null };

export type TrackerLogEntry = { at: string; source: string; message: string };

/** Posle greške API-Football-a ne pokušavamo odmah ponovo (suspendovan nalog / paket → 6h, ostalo → 30 min). */
function afBackoffMs(message: string) {
  return /suspend|plan|access|key|token|subscription/i.test(message) ? 6 * 3600_000 : 30 * 60_000;
}

type OpenTracked = { id: string; marketType: string; status: string };
type MatchRow = {
  id: string; provider: string; externalId: string; homeTeam: string; awayTeam: string; competition: string;
  kickoffTime: Date; isDemo: boolean; apiFootballId: number | null; resultMatchConfidence: string | null;
  tracked: OpenTracked[];
  /** Bar jedan tip je u aktivnom filteru (samo takve proveravamo preko skupog OddsPapi-ja). */
  inActiveFilter: boolean;
};

function demoScore(externalId: string) {
  let h = 0;
  for (const ch of externalId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { home: h % 4, away: (h >>> 4) % 3 };
}

export async function runTracker(deps: TrackerDeps): Promise<TrackerReport> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const report: TrackerReport = { at: now.toISOString(), matches: 0, settled: 0, live: 0, postponed: 0, needsReview: 0, apiFootballCalls: 0, oddsPapiCalls: 0, errors: [] };

  if (!(await tryLock(db, "tracker", 4 * MIN, now))) return { ...report, skipped: "Druga provera je u toku." };
  const log: TrackerLogEntry[] = [];
  const logError = (source: string, message: string) => {
    report.errors.push(`${source}: ${message}`);
    log.push({ at: now.toISOString(), source, message });
  };
  try {
    const rows = await db.trackedSelection.findMany({
      where: { status: { in: ["PENDING", "LIVE", "POSTPONED"] } },
      include: { match: true, filterEntries: { where: { removedAt: null, filterSet: { status: { not: "DELETED" } } }, select: { id: true } } },
    });
    const byMatch = new Map<string, MatchRow>();
    for (const r of rows) {
      const m = byMatch.get(r.matchId) ?? { ...r.match, tracked: [], inActiveFilter: false };
      m.tracked.push({ id: r.id, marketType: r.marketType, status: r.status });
      if (r.filterEntries.length > 0) m.inActiveFilter = true;
      byMatch.set(r.matchId, m);
    }
    report.matches = byMatch.size;

    const decide = async (m: MatchRow, status: TrackStatus, source: string, opts: { home?: number; away?: number; reason?: string; per?: Partial<Record<MarketTypeCode, TrackStatus>> } = {}) => {
      for (const t of m.tracked) {
        const st = opts.per?.[t.marketType as MarketTypeCode] ?? status;
        const ok = await applyDecision(db, t.id, { status: st, home: opts.home, away: opts.away, source, reason: opts.reason });
        if (!ok) continue;
        if (st === "WON" || st === "LOST" || st === "VOID") report.settled++;
        else if (st === "LIVE") report.live++;
        else if (st === "POSTPONED") report.postponed++;
        else if (st === "NEEDS_REVIEW") report.needsReview++;
      }
    };

    const settleFromScore = async (m: MatchRow, home: number, away: number, source: string) => {
      const per: Partial<Record<MarketTypeCode, TrackStatus>> = {};
      for (const t of m.tracked) per[t.marketType as MarketTypeCode] = outcomeFor(t.marketType as MarketTypeCode, home, away);
      await db.match.update({ where: { id: m.id }, data: { finalHomeScore: home, finalAwayScore: away, matchStatus: "FINISHED" } });
      await decide(m, "WON", source, { home, away, per });
    };

    const recordUpdate = async (m: MatchRow, source: string, matchStatus: string, home: number | null, away: number | null, detail?: object) => {
      const last = await db.resultUpdate.findFirst({ where: { matchId: m.id, source }, orderBy: { fetchedAt: "desc" } });
      if (last && last.matchStatus === matchStatus && last.homeScore === home && last.awayScore === away) return;
      await db.resultUpdate.create({ data: { matchId: m.id, source, matchStatus, homeScore: home, awayScore: away, detail: detail ?? undefined } });
    };

    // OddsPapi (rezervni) – štedljivo
    const opBudget = async () => deps.oddsPapi && (await dailyCount(db, "oddspapi-results", now)) < deps.oddsPapiChecksPerDay;
    const askOddsPapi = async (m: MatchRow): Promise<OpResult | null> => {
      if (m.provider !== "oddspapi" || !m.inActiveFilter || !deps.oddsPapi || !(await opBudget())) return null;
      const lastKey = `op:last:${m.externalId}`;
      const last = await getState<{ at: string } | null>(db, lastKey, null);
      if (last && now.getTime() - new Date(last.at).getTime() < 60 * MIN) return null;
      await setState(db, lastKey, { at: now.toISOString() });
      await incDaily(db, "oddspapi-results", now);
      report.oddsPapiCalls++;
      try {
        const r = await deps.oddsPapi(m.externalId);
        const result: OpSettlement = { ...r.result };
        if (r.score) for (const t of m.tracked) result[t.marketType as MarketTypeCode] = outcomeFor(t.marketType as MarketTypeCode, r.score.home, r.score.away);
        const missing = m.tracked.filter((t) => !result[t.marketType as MarketTypeCode]).map((t) => t.marketType);
        await recordUpdate(m, "OddsPapi", r.score ? "FINISHED" : missing.length === 0 ? "SETTLED" : r.rawMarketIds.length ? "PARTIAL" : "NO_DATA",
          r.score?.home ?? null, r.score?.away ?? null, { result, missing, marketsInResponse: r.rawMarketIds });
        return { result, score: r.score ?? null };
      } catch (e) {
        logError("OddsPapi", `${m.homeTeam} – ${m.awayTeam}: ${(e as Error).message}`);
        return null;
      }
    };
    const opCovers = (m: MatchRow, s: OpResult | null) => !!s && m.tracked.every((t) => s.result[t.marketType as MarketTypeCode]);

    // API-Football po danu (beogradsko vreme), samo juče/danas/sutra
    const today = zonedYmd(now);
    const window = new Set([-1, 0, 1].map((n) => ymdToString(addDays(today, n))));
    const dayCache = new Map<string, AfFixture[] | null>();
    const afBlocked = async () => {
      const e = await getState<{ until: string } | null>(db, "af:error", null);
      return !!e && new Date(e.until) > now;
    };
    const getDay = async (date: string): Promise<AfFixture[] | null> => {
      if (dayCache.has(date)) return dayCache.get(date)!;
      let result: AfFixture[] | null = null;
      if (deps.apiFootball && window.has(date)) {
        const key = `af:day:${date}`;
        const cached = await getState<{ at: string; fixtures: (Omit<AfFixture, "kickoff"> & { kickoff: string })[] } | null>(db, key, null);
        const fresh = cached && now.getTime() - new Date(cached.at).getTime() < deps.resultCheckMinutes * MIN;
        if (fresh) result = cached!.fixtures.map((f) => ({ ...f, kickoff: new Date(f.kickoff) }));
        else if (!(await afBlocked()) && (await dailyCount(db, AF_COUNTER, now)) < AF_DAILY_CAP) {
          try {
            report.apiFootballCalls++;
            result = await deps.apiFootball(date);
            await incDaily(db, AF_COUNTER, now); // brojimo samo uspešne zahteve
            await setState(db, key, { at: now.toISOString(), fixtures: result.map((f) => ({ ...f, kickoff: f.kickoff.toISOString() })) });
            await setState(db, "af:error", null);
          } catch (e) {
            const message = (e as Error).message;
            logError("API-Football", `${date}: ${message}`);
            await setState(db, "af:error", { at: now.toISOString(), message, until: new Date(now.getTime() + afBackoffMs(message)).toISOString() });
            result = cached ? cached.fixtures.map((f) => ({ ...f, kickoff: new Date(f.kickoff) })) : null;
          }
        } else if (cached) result = cached.fixtures.map((f) => ({ ...f, kickoff: new Date(f.kickoff) }));
      }
      dayCache.set(date, result);
      return result;
    };

    for (const m of byMatch.values()) {
      const sinceKick = (now.getTime() - m.kickoffTime.getTime()) / MIN;
      if (sinceKick < 0) continue; // nije počela – ne trošimo zahteve

      if (m.isDemo) {
        if (sinceKick >= EXPECTED_END_MIN) {
          const s = demoScore(m.externalId);
          await recordUpdate(m, "DEMO", "FINISHED", s.home, s.away);
          await settleFromScore(m, s.home, s.away, "DEMO (izmišljen rezultat)");
        } else await decide(m, "LIVE", "Sat (utakmica je počela)");
        continue;
      }

      if (sinceKick > GIVE_UP_DAYS * 24 * 60) {
        await decide(m, "NEEDS_REVIEW", "Result Tracker", { reason: `Nema potvrđenog rezultata ${GIVE_UP_DAYS} dana posle početka.` });
        continue;
      }
      if (sinceKick < EXPECTED_END_MIN) {
        await decide(m, "LIVE", "Sat (utakmica je počela)");
        continue;
      }

      // 1) Primarni izvor
      const date = ymdToString(zonedYmd(m.kickoffTime));
      const day = await getDay(date);
      let handled = false;
      if (day) {
        let fx: AfFixture | undefined;
        let confidence = m.resultMatchConfidence as "HIGH" | "MEDIUM" | null;
        if (m.apiFootballId) fx = day.find((f) => f.id === m.apiFootballId);
        else {
          const r = findFixture({ homeTeam: m.homeTeam, awayTeam: m.awayTeam, kickoffTime: m.kickoffTime, competition: m.competition }, day);
          if (r.status === "found") {
            fx = r.fixture;
            confidence = r.confidence;
            await db.match.update({ where: { id: m.id }, data: { apiFootballId: fx.id, resultMatchConfidence: confidence } });
          } else if (r.status === "ambiguous") {
            await decide(m, "NEEDS_REVIEW", "API-Football", { reason: `Više mogućih utakmica: ${r.candidates.map((c) => `${c.home} – ${c.away}`).join(", ")}` });
            continue;
          }
        }

        if (fx) {
          await recordUpdate(m, "API-Football", fx.status, fx.score90?.home ?? null, fx.score90?.away ?? null, { id: fx.id, statusShort: fx.statusShort, name: `${fx.home} – ${fx.away}` });
          handled = true;
          if (fx.status === "FINISHED" && fx.score90) {
            if (confidence === "HIGH") await settleFromScore(m, fx.score90.home, fx.score90.away, "API-Football");
            else {
              const op = await askOddsPapi(m);
              if (opCovers(m, op)) {
                const disagree = m.tracked.some((t) => op!.result[t.marketType as MarketTypeCode] !== outcomeFor(t.marketType as MarketTypeCode, fx!.score90!.home, fx!.score90!.away));
                if (disagree) await decide(m, "NEEDS_REVIEW", "API-Football + OddsPapi", { reason: "Izvori se ne slažu oko ishoda.", home: fx.score90.home, away: fx.score90.away });
                else await settleFromScore(m, fx.score90.home, fx.score90.away, "API-Football + OddsPapi");
              } else if (sinceKick > REVIEW_AFTER_H * 60) {
                await decide(m, "NEEDS_REVIEW", "API-Football", { reason: `Utakmica nije sigurno prepoznata (${fx.home} – ${fx.away}), a drugi izvor nije potvrdio.`, home: fx.score90.home, away: fx.score90.away });
              }
            }
          } else if (fx.status === "FINISHED") await decide(m, "NEEDS_REVIEW", "API-Football", { reason: "Utakmica je završena, ali rezultat posle 90 minuta nije poznat." });
          else if (fx.status === "LIVE") await decide(m, "LIVE", "API-Football");
          else if (fx.status === "POSTPONED") await decide(m, "POSTPONED", "API-Football");
          else if (fx.status === "CANCELLED") await decide(m, "VOID", "API-Football", { reason: "Utakmica je otkazana." });
          else if (fx.status === "NOT_STARTED") {
            if (sinceKick > 6 * 60) await decide(m, "NEEDS_REVIEW", "API-Football", { reason: "Utakmica nije počela ni 6 sati posle zakazanog vremena." });
          } else await decide(m, "NEEDS_REVIEW", "API-Football", { reason: `Status utakmice: ${fx.statusShort} (prekinuta / službeni rezultat).` });
        }
      }

      // 2) Rezervni izvor ako primarni nije dao odgovor
      if (!handled && sinceKick >= FALLBACK_AFTER_MIN) {
        const op = await askOddsPapi(m);
        if (op?.score) {
          await settleFromScore(m, op.score.home, op.score.away, "OddsPapi");
        } else if (opCovers(m, op)) {
          const per: Partial<Record<MarketTypeCode, TrackStatus>> = {};
          for (const t of m.tracked) per[t.marketType as MarketTypeCode] = op!.result[t.marketType as MarketTypeCode]!;
          await db.match.update({ where: { id: m.id }, data: { matchStatus: "FINISHED" } });
          await decide(m, "WON", "OddsPapi", { per });
        } else if (sinceKick > REVIEW_AFTER_H * 60) {
          await decide(m, "NEEDS_REVIEW", "Result Tracker", { reason: "Rezultat nije pronađen ni u jednom izvoru." });
        }
      }
    }
    return report;
  } finally {
    const afErr = await getState<{ until: string; message: string } | null>(db, "af:error", null).catch(() => null);
    report.sources = {
      apiFootball: {
        configured: !!deps.apiFootball, usedToday: await dailyCount(db, AF_COUNTER, now).catch(() => 0), cap: AF_DAILY_CAP,
        blockedUntil: afErr && new Date(afErr.until) > now ? afErr.until : null, lastError: afErr?.message ?? null,
      },
      oddsPapi: { configured: !!deps.oddsPapi, usedToday: await dailyCount(db, "oddspapi-results", now).catch(() => 0), budget: deps.oddsPapiChecksPerDay },
    };
    if (log.length) {
      const prev = await getState<TrackerLogEntry[]>(db, "tracker:log", []).catch(() => []);
      await setState(db, "tracker:log", [...log, ...prev].slice(0, 30)).catch(() => {});
    }
    await setState(db, "tracker:last", report).catch(() => {});
    await unlock(db, "tracker");
  }
}
