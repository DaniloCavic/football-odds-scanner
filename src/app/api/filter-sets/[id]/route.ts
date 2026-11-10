import { prisma } from "@/lib/db";
import { deleteFilterSet, renameFilterSet } from "@/lib/filter/service";
import { body, handle } from "@/lib/filter/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = (req: Request, { params }: Ctx) => handle(async () => {
  const { name } = await body(req);
  await renameFilterSet(prisma, (await params).id, name);
  return Response.json({ ok: true });
});

export const DELETE = (_req: Request, { params }: Ctx) => handle(async (user) => {
  await deleteFilterSet(prisma, (await params).id, user.id);
  return Response.json({ ok: true });
});
