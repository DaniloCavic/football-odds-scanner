import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getScanStatus } from "@/lib/robot/scans";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  const { id } = await params;
  await prisma.robotScan.updateMany({ where: { id, status: "RUNNING" }, data: { stopRequested: true } });
  const scan = await getScanStatus(id);
  return scan ? Response.json(scan) : Response.json({ error: "Skeniranje ne postoji." }, { status: 404 });
}
