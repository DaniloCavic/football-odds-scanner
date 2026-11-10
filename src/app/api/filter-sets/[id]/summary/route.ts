import { handle } from "@/lib/filter/http";
import { entrySummary } from "@/lib/results/queries";

export const dynamic = "force-dynamic";

export const GET = (_req: Request, { params }: { params: Promise<{ id: string }> }) => handle(async () =>
  Response.json(await entrySummary({ filterSetId: (await params).id, removedAt: null })));
