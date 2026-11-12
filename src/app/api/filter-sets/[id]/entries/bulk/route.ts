import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings-repo";
import { addEntries } from "@/lib/filter/service";
import { body, handle } from "@/lib/filter/http";

export const dynamic = "force-dynamic";

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => handle(async () => {
  const { marketSelectionIds } = await body(req);
  if (!Array.isArray(marketSelectionIds) || !marketSelectionIds.every((x) => typeof x === "string")) {
    return Response.json({ error: "Neispravan zahtev." }, { status: 400 });
  }
  const settings = await getSettings();
  const result = await addEntries(prisma, { filterSetId: (await params).id, marketSelectionIds, maxOdds: settings.maxOdds, excludeGoalsPair: settings.excludeGoalsPair });
  return Response.json(result);
});
