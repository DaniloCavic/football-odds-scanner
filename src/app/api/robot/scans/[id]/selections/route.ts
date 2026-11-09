import { getCurrentUser } from "@/lib/auth/session";
import { getScanSelections } from "@/lib/robot/scans";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  return Response.json(await getScanSelections((await params).id));
}
