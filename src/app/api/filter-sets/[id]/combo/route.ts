import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings-repo";
import { body, handle } from "@/lib/filter/http";
import { addManualCombo } from "@/lib/combos/service";

export const dynamic = "force-dynamic";

/** Ručni unos kvote spojenog tipa (sa sajta kladionice) i dodavanje u filter. */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => handle(async () => {
  const { candidateId, odds } = await body(req);
  if (typeof candidateId !== "string") return Response.json({ error: "Neispravan zahtev." }, { status: 400 });
  const settings = await getSettings();
  const r = await addManualCombo(prisma, { filterSetId: (await params).id, candidateId, odds, maxOdds: settings.maxOdds });
  return Response.json(r, { status: 201 });
});
