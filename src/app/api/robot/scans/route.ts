import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings-repo";
import { periodRange, PERIODS, type PeriodKey } from "@/lib/time";
import { getProvider } from "@/lib/robot/providers";
import { markStaleScans, runScan } from "@/lib/robot/runner";
import { getScanStatus } from "@/lib/robot/scans";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  period: z.enum(Object.keys(PERIODS) as [PeriodKey, ...PeriodKey[]]),
  from: z.string().optional(),
  to: z.string().optional(),
  provider: z.string(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Neispravan zahtev." }, { status: 400 });
  const { period, from, to, provider: providerId } = parsed.data;

  const range = periodRange(period, new Date(), { from, to });
  if ("error" in range) return Response.json({ error: range.error }, { status: 400 });

  const provider = getProvider(providerId);
  if (!provider) return Response.json({ error: "Izabrani izvor kvota nije dostupan." }, { status: 400 });

  await markStaleScans();
  const settings = await getSettings();

  const scan = await prisma.$transaction(async (tx) => {
    const running = await tx.robotScan.findFirst({ where: { status: "RUNNING" } });
    if (running) return null;
    return tx.robotScan.create({
      data: {
        userId: user.id, provider: provider.id, isDemo: provider.isDemo, periodLabel: range.label,
        startDate: range.from, endDate: range.to, maxOddsUsed: settings.maxOdds,
      },
    }, );
  }, { isolationLevel: "Serializable" }).catch(() => null);

  if (!scan) return Response.json({ error: "Robot već radi. Sačekajte da završi ili ga zaustavite." }, { status: 409 });

  // Robot radi u pozadini; napredak se čita iz baze.
  void runScan(scan.id).catch((e) => console.error("[robot]", e));
  return Response.json(await getScanStatus(scan.id), { status: 201 });
}
