import { getCurrentUser } from "@/lib/auth/session";
import { oddsPapiKey } from "@/lib/robot/providers";
import { checkLiveOdds } from "@/lib/robot/providers/oddspapi";
import { ProviderError } from "@/lib/robot/types";

export const dynamic = "force-dynamic";

/** Dijagnostika: da li OddsPapi vraća uživo kvote za AdmiralBet. Troši najviše 3 zahteva. Otvara se ručno u pregledaču. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  const key = oddsPapiKey();
  if (!key) return Response.json({ error: "OddsPapi ključ nije podešen." }, { status: 400 });
  const slug = new URL(req.url).searchParams.get("bookmaker") ?? "admiralbet.rs";
  if (!/^[a-z0-9.]{3,40}$/.test(slug)) return Response.json({ error: "Neispravna kladionica." }, { status: 400 });
  try {
    return Response.json(await checkLiveOdds(key, slug));
  } catch (e) {
    return Response.json({ error: e instanceof ProviderError ? e.message : "Provera nije uspela." }, { status: 502 });
  }
}
