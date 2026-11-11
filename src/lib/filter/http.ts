import { getCurrentUser } from "@/lib/auth/session";
import { FilterError } from "./service";
import { log } from "@/lib/log";

/** Zajednički omotač za rute: provera prijave i pretvaranje grešaka u JSON. */
export async function handle(fn: (user: { id: string }) => Promise<Response>): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  try {
    return await fn(user);
  } catch (e) {
    if (e instanceof FilterError) return Response.json({ error: e.message }, { status: e.status });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2034") {
      return Response.json({ error: "Istovremena izmena – pokušajte ponovo." }, { status: 409 });
    }
    log.error("api", "neočekivana greška", { error: (e as Error).message });
    return Response.json({ error: "Greška na serveru." }, { status: 500 });
  }
}

export const body = async (req: Request) => (await req.json().catch(() => ({}))) as Record<string, unknown>;
