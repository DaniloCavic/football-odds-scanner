import { prisma } from "@/lib/db";
import { clearFilterSet } from "@/lib/filter/service";
import { handle } from "@/lib/filter/http";

export const dynamic = "force-dynamic";

export const POST = (_req: Request, { params }: { params: Promise<{ id: string }> }) => handle(async (user) => {
  const removed = await clearFilterSet(prisma, (await params).id, user.id);
  return Response.json({ removed });
});
