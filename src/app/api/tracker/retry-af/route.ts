import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { setState } from "@/lib/results/job-state";
import { runTrackerNow } from "@/lib/results/runtime";

export const dynamic = "force-dynamic";

/** Skida pauzu API-Football-a i odmah pokreće proveru (npr. posle odblokiranja naloga). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Samo administrator." }, { status: 403 });
  await setState(prisma, "af:error", null);
  await prisma.jobState.deleteMany({ where: { key: { startsWith: "af:day:" } } });
  return Response.json(await runTrackerNow());
}
