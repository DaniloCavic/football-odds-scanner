export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Jednokratno: stari spojeni tipovi („1&2+“ …) postaju samo pobednik (1 ili 2) – idempotentno
  try {
    const { prisma } = await import("./lib/db");
    const { convertCombosToWinner } = await import("./lib/results/combo-to-winner");
    const r = await convertCombosToWinner(prisma);
    if (r) console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", area: "migrate", msg: "spojeni tipovi → pobednik", ...r }));
    const { winnerOnlyCleanup } = await import("./lib/results/winner-only-cleanup");
    const c = await winnerOnlyCleanup(prisma);
    if (c) console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", area: "migrate", msg: "u filterima samo 1 i 2", ...c }));
  } catch (e) {
    console.error(JSON.stringify({ level: "error", area: "migrate", msg: "konverzija spojenih tipova nije uspela", error: (e as Error).message }));
  }
  if (process.env.TRACKER_ENABLED === "false") return;
  const { startTracker } = await import("./lib/results/scheduler");
  startTracker();
}
