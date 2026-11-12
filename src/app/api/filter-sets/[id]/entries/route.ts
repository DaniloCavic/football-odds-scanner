import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings-repo";
import { addEntry, listEntries } from "@/lib/filter/service";
import { body, handle } from "@/lib/filter/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) => handle(async () => Response.json(await listEntries(prisma, (await params).id)));

export const POST = (req: Request, { params }: Ctx) => handle(async () => {
  const { marketSelectionId } = await body(req);
  if (typeof marketSelectionId !== "string") return Response.json({ error: "Neispravan zahtev." }, { status: 400 });
  const settings = await getSettings();
  const id = await addEntry(prisma, { filterSetId: (await params).id, marketSelectionId, maxOdds: settings.maxOdds, excludeGoalsPair: settings.excludeGoalsPair });
  return Response.json({ id }, { status: 201 });
});
