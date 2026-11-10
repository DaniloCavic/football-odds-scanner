import { getCurrentUser } from "@/lib/auth/session";
import { runTrackerNow } from "@/lib/results/runtime";

export const dynamic = "force-dynamic";

/** Ručno pokretanje provere rezultata (poštuje iste limite kao automatska). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Samo administrator." }, { status: 403 });
  return Response.json(await runTrackerNow());
}
