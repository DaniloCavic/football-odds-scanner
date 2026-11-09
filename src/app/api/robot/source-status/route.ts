import { getCurrentUser } from "@/lib/auth/session";
import { oddsPapiKey } from "@/lib/robot/providers";
import { getOddsPapiStatus } from "@/lib/robot/providers/oddspapi";
import { ProviderError } from "@/lib/robot/types";

export const dynamic = "force-dynamic";

/** Status OddsPapi naloga. Koristi /v4/account koji NE troši kvotu. */
export async function GET() {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  const key = oddsPapiKey();
  if (!key) return Response.json({ configured: false });
  try {
    return Response.json({ configured: true, ok: true, ...(await getOddsPapiStatus(key)) });
  } catch (e) {
    return Response.json({ configured: true, ok: false, error: e instanceof ProviderError ? e.message : "OddsPapi nije dostupan." });
  }
}
