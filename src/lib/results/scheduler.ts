import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { runTrackerNow } from "./runtime";

const g = globalThis as unknown as { __fosTracker?: NodeJS.Timeout; __fosMaint?: number };

/** Dnevno održavanje: brisanje isteklih sesija i starih keš zapisa. */
export async function maintenance(now = new Date()) {
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const old = new Date(now.getTime() - 4 * 86400_000);
  const cache = await prisma.jobState.deleteMany({
    where: { OR: [{ key: { startsWith: "af:day:" } }, { key: { startsWith: "op:last:" } }, { key: { startsWith: "count:" } }], updatedAt: { lt: old } },
  });
  return { sessions: sessions.count, cache: cache.count };
}

/** Result Tracker radi u serveru, nezavisno od browsera. */
export function startTracker() {
  if (g.__fosTracker) return;
  const every = Number(process.env.TRACKER_INTERVAL_MS ?? 5 * 60_000);
  const tick = async () => {
    try {
      const r = await runTrackerNow();
      if (r.settled || r.errors.length || r.needsReview) log.info("tracker", "provera", { matches: r.matches, settled: r.settled, needsReview: r.needsReview, af: r.apiFootballCalls, op: r.oddsPapiCalls, errors: r.errors });
      if (!g.__fosMaint || Date.now() - g.__fosMaint > 24 * 3600_000) {
        g.__fosMaint = Date.now();
        log.info("maintenance", "dnevno održavanje", await maintenance());
      }
    } catch (e) {
      log.error("tracker", "greška", { error: (e as Error).message });
    }
  };
  setTimeout(tick, 20_000);
  g.__fosTracker = setInterval(tick, every);
  log.info("tracker", "pokrenut", { everyMin: Math.round(every / 60_000) });
}
