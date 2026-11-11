import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { oddsPapiKey } from "@/lib/robot/providers";
import { OddsPapiClient } from "@/lib/robot/providers/oddspapi";

export const dynamic = "force-dynamic";

/**
 * Dijagnostika: za JEDNU završenu utakmicu pita OddsPapi na 3 načina (/settlements, /scores, /fixture)
 * i vraća skraćene sirove odgovore. Troši 3 zahteva.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Samo administrator." }, { status: 403 });
  const key = oddsPapiKey();
  if (!key) return Response.json({ error: "OddsPapi ključ nije podešen." }, { status: 400 });

  const match = await prisma.match.findFirst({
    where: { provider: "oddspapi", isDemo: false, kickoffTime: { lt: new Date(Date.now() - 3 * 3600_000) }, trackedSelections: { some: {} } },
    orderBy: { kickoffTime: "desc" },
  });
  if (!match) return Response.json({ error: "Nema završene utakmice iz filtera (OddsPapi) za test." }, { status: 400 });

  const client = new OddsPapiClient(key, fetch, 1100);
  const call = async (path: string) => {
    try {
      const data = await client.get<unknown>(path, { fixtureId: match.externalId });
      const text = JSON.stringify(data);
      return { ok: true, size: text.length, preview: text.slice(0, 1500) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };
  const result = {
    match: `${match.homeTeam} – ${match.awayTeam}`,
    fixtureId: match.externalId,
    kickoff: match.kickoffTime.toISOString(),
    settlements: await call("/settlements"),
    scores: await call("/scores"),
    fixture: await call("/fixture"),
  };
  console.log("[oddspapi-test]", JSON.stringify(result).slice(0, 4000));
  return Response.json(result);
}
