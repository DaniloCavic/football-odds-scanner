import { runTrackerNow } from "./runtime";

const g = globalThis as unknown as { __fosTracker?: NodeJS.Timeout };

/** Result Tracker radi u serveru, nezavisno od browsera. */
export function startTracker() {
  if (g.__fosTracker) return;
  const every = Number(process.env.TRACKER_INTERVAL_MS ?? 5 * 60_000);
  const tick = () => runTrackerNow()
    .then((r) => { if (r.settled || r.errors.length || r.needsReview) console.log("[tracker]", JSON.stringify(r)); })
    .catch((e) => console.error("[tracker] greška:", e));
  setTimeout(tick, 20_000);
  g.__fosTracker = setInterval(tick, every);
  console.log(`[tracker] pokrenut, provera na svakih ${Math.round(every / 60_000)} min`);
}
