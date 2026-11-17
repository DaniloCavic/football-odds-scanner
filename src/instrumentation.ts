export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.TRACKER_ENABLED === "false") return;
  const { startTracker } = await import("./lib/results/scheduler");
  startTracker();
}
