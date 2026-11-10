import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isValidOdds, MARKET_TYPES } from "@/lib/odds";
import { isRealFootball } from "./football";
import { getProvider } from "./providers";
import { ProviderError, RequestLimitReached, type ScanContext } from "./types";

/** Skeniranje koje nije javilo napredak duže od ovoga smatra se prekinutim (npr. restart servera). */
export const STALE_MS = 3 * 60_000;

export async function markStaleScans() {
  await prisma.robotScan.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "FAILED", finishedAt: new Date(), errors: ["Skeniranje je prekinuto (restart servera ili greška)."] },
  });
}

async function appendError(scanId: string, msg: string) {
  const s = await prisma.robotScan.findUnique({ where: { id: scanId }, select: { errors: true } });
  const list = Array.isArray(s?.errors) ? (s!.errors as string[]) : [];
  await prisma.robotScan.update({ where: { id: scanId }, data: { errors: [...list, msg].slice(-20) } });
}

/** Pokreće skeniranje. Ne baca grešku – sve greške se upisuju u RobotScan. */
export async function runScan(scanId: string): Promise<void> {
  const scan = await prisma.robotScan.findUnique({ where: { id: scanId } });
  if (!scan || scan.status !== "RUNNING") return;
  const provider = getProvider(scan.provider);
  if (!provider) {
    await prisma.robotScan.update({ where: { id: scanId }, data: { status: "FAILED", finishedAt: new Date(), errors: ["Izvor kvota nije dostupan."] } });
    return;
  }
  const maxOdds = scan.maxOddsUsed.toNumber();
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  const diag: Record<string, unknown> = {};
  const priceCounts: Record<string, { total: number; valid: number; min: number | null }> = {};
  for (const m of MARKET_TYPES) priceCounts[m] = { total: 0, valid: 0, min: null };
  let lastStopCheck = 0;
  let stop = false;
  const ctx: ScanContext = {
    maxRequests: settings?.maxRequestsPerScan ?? 60,
    async shouldStop() {
      if (stop) return true;
      if (Date.now() - lastStopCheck < 500) return false;
      lastStopCheck = Date.now();
      const s = await prisma.robotScan.findUnique({ where: { id: scanId }, select: { stopRequested: true } });
      stop = !!s?.stopRequested;
      return stop;
    },
    async setTotal(n) {
      await prisma.robotScan.update({ where: { id: scanId }, data: { fixturesTotal: n } });
    },
    async countRequest() {
      await prisma.robotScan.update({ where: { id: scanId }, data: { requestsUsed: { increment: 1 } } });
    },
    async warn(msg) {
      await appendError(scanId, msg);
    },
    async diagnostic(data) {
      Object.assign(diag, data);
    },
  };

  let finalStatus: "COMPLETED" | "STOPPED" | "FAILED" = "COMPLETED";
  try {
    for await (const fx of provider.scan({ from: scan.startDate, to: scan.endDate }, ctx)) {
      const inRange = fx.kickoffTime >= scan.startDate && fx.kickoffTime < scan.endDate;
      if (!inRange || !isRealFootball(fx)) {
        await prisma.robotScan.update({ where: { id: scanId }, data: { fixturesScanned: { increment: 1 }, fixturesExcluded: { increment: 1 } } });
        continue;
      }
      for (const m of MARKET_TYPES) {
        const p = fx.odds[m]?.price;
        if (typeof p !== "number") continue;
        priceCounts[m].total += 1;
        priceCounts[m].min = priceCounts[m].min == null ? p : Math.min(priceCounts[m].min!, p);
      }
      const valid = MARKET_TYPES.filter((m) => fx.odds[m] && isValidOdds(fx.odds[m]!.price, maxOdds));
      for (const m of valid) priceCounts[m].valid += 1;
      let created = 0;
      if (valid.length) {
        const match = await prisma.match.upsert({
          where: { provider_externalId: { provider: provider.matchNamespace ?? provider.id, externalId: fx.externalId } },
          create: {
            provider: provider.matchNamespace ?? provider.id, externalId: fx.externalId, homeTeam: fx.homeTeam, awayTeam: fx.awayTeam,
            competition: fx.competition, country: fx.country, externalCompetitionId: fx.externalCompetitionId,
            kickoffTime: fx.kickoffTime, isDemo: provider.isDemo,
          },
          update: { homeTeam: fx.homeTeam, awayTeam: fx.awayTeam, competition: fx.competition, country: fx.country, kickoffTime: fx.kickoffTime },
        });
        const res = await prisma.marketSelection.createMany({
          data: valid.map((m) => ({
            matchId: match.id, scanId, marketType: m, odds: new Prisma.Decimal(fx.odds[m]!.price),
            oddsTimestamp: fx.odds[m]!.changedAt, source: provider.sourceLabel, isDemo: provider.isDemo,
          })),
          skipDuplicates: true,
        });
        created = res.count;
      }
      await prisma.robotScan.update({
        where: { id: scanId },
        data: { fixturesScanned: { increment: 1 }, selectionsFound: { increment: created } },
      });
    }
    if (await ctx.shouldStop()) finalStatus = "STOPPED";
  } catch (e) {
    if (e instanceof RequestLimitReached) {
      finalStatus = "STOPPED";
      await appendError(scanId, e.message);
    } else {
      finalStatus = "FAILED";
      const msg = e instanceof ProviderError ? e.message : "Neočekivana greška robota.";
      console.error(`[robot] skeniranje ${scanId} palo:`, e);
      await appendError(scanId, msg);
    }
  }
  await prisma.robotScan.update({
    where: { id: scanId },
    data: { status: finalStatus, finishedAt: new Date(), diagnostics: JSON.parse(JSON.stringify({ priceCounts, ...diag })) },
  });
}
