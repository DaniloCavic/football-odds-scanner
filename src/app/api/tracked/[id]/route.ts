import { getCurrentUser } from "@/lib/auth/session";
import { trackedDetail } from "@/lib/results/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  const d = await trackedDetail((await params).id);
  return d ? Response.json(d) : Response.json({ error: "Ne postoji." }, { status: 404 });
}
