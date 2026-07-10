import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Contrôle optimiste : la présence du cookie de session est vérifiée ici,
// la session réelle et le rôle sont revérifiés dans les layouts et les
// Server Actions (défense en profondeur).
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL("/connexion", request.url);
    url.searchParams.set("redirection", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/membre/:path*"],
};
