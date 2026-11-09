import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "fos_session";
const PUBLIC_PATHS = ["/login", "/api/health"];

// Brza provera: bez cookie-ja nema pristupa privatnim rutama.
// Prava provera sesije (u bazi) radi se u (app)/layout.tsx.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get(SESSION_COOKIE)) {
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
