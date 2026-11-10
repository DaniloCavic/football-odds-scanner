import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { oddsPapiKey } from "@/lib/robot/providers";
import { compareBookmakers } from "@/lib/robot/providers/oddspapi";
import { ProviderError } from "@/lib/robot/types";

export const dynamic = "force-dynamic";

/** Poređenje kladionica na 3 predstojeće utakmice (3 OddsPapi zahteva). */
export async function POST() {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  const key = oddsPapiKey();
  if (!key) return Response.json({ error: "OddsPapi ključ nije podešen." }, { status: 400 });
  const matches = await prisma.match.findMany({
    where: { provider: "oddspapi", kickoffTime: { gt: new Date(Date.now() + 15 * 60_000) } },
    orderBy: { kickoffTime: "asc" },
    take: 3,
  });
  if (matches.length === 0) return Response.json({ error: "Prvo pokrenite skeniranje (Danas ili Sutra) preko OddsPapi, pa uporedite." }, { status: 400 });
  try {
    const results = [];
    for (const m of matches) results.push(await compareBookmakers(key, m.externalId));
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: e instanceof ProviderError ? e.message : "Poređenje nije uspelo." }, { status: 502 });
  }
}
