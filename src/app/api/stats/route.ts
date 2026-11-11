import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { computeStats } from "@/lib/stats/compute";
import { loadStatRows } from "@/lib/stats/load";
import { addDays, parseYmd, zonedMidnight } from "@/lib/time";

export const dynamic = "force-dynamic";

const schema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  scope: z.enum(["active", "all"]).default("active"),
  demo: z.enum(["0", "1"]).default("0"),
  filterSet: z.string().optional(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  const p = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return Response.json({ error: "Neispravan zahtev." }, { status: 400 });
  const f = p.data.from ? parseYmd(p.data.from) : null;
  const t = p.data.to ? parseYmd(p.data.to) : null;
  const rows = await loadStatRows({
    from: f ? zonedMidnight(f) : null,
    to: t ? zonedMidnight(addDays(t, 1)) : null,
    scope: p.data.scope,
    includeDemo: p.data.demo === "1",
    filterSetId: p.data.filterSet || null,
  });
  return Response.json(computeStats(rows, p.data.granularity));
}
