import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { applyDecision } from "@/lib/results/apply";
import { outcomeFor } from "@/lib/results/settle-math";
import type { MarketTypeCode } from "@/lib/odds";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["WON", "LOST", "VOID", "POSTPONED", "PENDING", "NEEDS_REVIEW", "AUTO"]),
  home: z.coerce.number().int().min(0).max(99).optional(),
  away: z.coerce.number().int().min(0).max(99).optional(),
  reason: z.string().trim().min(5, "Obrazloženje mora imati bar 5 znakova.").max(500),
});

/** Ručna ispravka – samo administrator, obavezno obrazloženje, upisuje se u audit log. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Samo administrator može da ispravlja rezultate." }, { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return Response.json({ error: p.error.issues[0].message }, { status: 400 });
  const { id } = await params;
  const t = await prisma.trackedSelection.findUnique({ where: { id } });
  if (!t) return Response.json({ error: "Ne postoji." }, { status: 404 });

  let status = p.data.status;
  if (status === "AUTO") {
    if (p.data.home == null || p.data.away == null) return Response.json({ error: "Unesite rezultat (domaćin i gost)." }, { status: 400 });
    status = outcomeFor(t.marketType as MarketTypeCode, p.data.home, p.data.away);
  }
  await applyDecision(prisma, id, {
    status, home: p.data.home ?? null, away: p.data.away ?? null, source: "Ručna ispravka", reason: p.data.reason, manual: { userId: user.id },
  });
  return Response.json({ ok: true, status });
}
