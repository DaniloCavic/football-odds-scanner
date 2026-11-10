import { prisma } from "@/lib/db";
import { removeEntry } from "@/lib/filter/service";
import { handle } from "@/lib/filter/http";

export const dynamic = "force-dynamic";

export const DELETE = (_req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) => handle(async () => {
  const { id, entryId } = await params;
  await removeEntry(prisma, id, entryId);
  return Response.json({ ok: true });
});
