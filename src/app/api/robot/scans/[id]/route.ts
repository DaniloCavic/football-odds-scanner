import { getCurrentUser } from "@/lib/auth/session";
import { getScanStatus } from "@/lib/robot/scans";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  const scan = await getScanStatus((await params).id);
  return scan ? Response.json(scan) : Response.json({ error: "Skeniranje ne postoji." }, { status: 404 });
}
