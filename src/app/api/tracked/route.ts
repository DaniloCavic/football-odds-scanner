import { getCurrentUser } from "@/lib/auth/session";
import { listTracked, TABS, trackedCounts, type TabKey } from "@/lib/results/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  const tab = (new URL(req.url).searchParams.get("tab") ?? "all") as TabKey;
  if (!(tab in TABS)) return Response.json({ error: "Nepoznat tab." }, { status: 400 });
  const [rows, counts] = await Promise.all([listTracked(tab), trackedCounts()]);
  return Response.json({ rows, counts });
}
