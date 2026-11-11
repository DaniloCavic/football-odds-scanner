import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "fos_session";
const PUBLIC_PATHS = ["/login", "/api/health"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** CSRF zaštita za API: izmene su dozvoljene samo sa iste adrese (Origin mora da odgovara Host-u). */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Brza provera: bez cookie-ja nema pristupa privatnim rutama.
// Prava provera sesije (u bazi) radi se u (app)/layout.tsx i u svakoj API ruti.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") && MUTATING.has(req.method) && !sameOrigin(req)) {
    return NextResponse.json({ error: "Zahtev odbijen (pogrešan izvor)." }, { status: 403 });
  }
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get(SESSION_COOKIE)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
