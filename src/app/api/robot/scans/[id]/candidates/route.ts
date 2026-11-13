import { prisma } from "@/lib/db";
import { handle } from "@/lib/filter/http";
import { listCandidates } from "@/lib/combos/service";

export const dynamic = "force-dynamic";

export const GET = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => Response.json(await listCandidates(prisma, (await params).id)));
