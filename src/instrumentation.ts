export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Jednokratna primena pravila „2+ i 0–3 zajedno“ na stare podatke (idempotentno)
  try {
    const { prisma } = await import("./lib/db");
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    if (s?.excludeGoalsPair ?? true) {
      const { retroExcludeGoalsPairs } = await import("./lib/robot/retro");
      const r = await retroExcludeGoalsPairs(prisma);
      if (r.selectionsExcluded) console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", area: "rules", msg: "2+ i 0–3: izbačeno iz starih podataka", ...r }));
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "error", area: "rules", msg: "retro pravilo nije primenjeno", error: (e as Error).message }));
  }
  if (process.env.TRACKER_ENABLED === "false") return;
  const { startTracker } = await import("./lib/results/scheduler");
  startTracker();
}
