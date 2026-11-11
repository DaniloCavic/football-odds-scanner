import { prisma } from "@/lib/db";
import { getState } from "@/lib/results/job-state";

export const dynamic = "force-dynamic";

/** Javna provera zdravlja (bez osetljivih podataka) – koristi je Railway healthcheck. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const last = await getState<{ at: string } | null>(prisma, "tracker:last", null);
    return Response.json({
      status: "ok",
      db: "ok",
      version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      trackerLastRun: last?.at ?? null,
      uptimeSec: Math.round(process.uptime()),
    });
  } catch {
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
