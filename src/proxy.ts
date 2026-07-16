import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import {
  LOCALE_COOKIE,
  defaultLocale,
  hasLocale,
  localeHref,
  negotiateLocale,
  type Locale,
} from "@/lib/i18n";

const isDev = process.env.NODE_ENV === "development";
const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

// Chemins servis hors du segment [locale] : jamais réécrits ni redirigés.
const NON_LOCALIZED = ["/admin", "/.well-known", "/robots.txt", "/sitemap.xml"];

/**
 * CSP stricte par requête : chaque script légitime porte un nonce à usage
 * unique ; 'strict-dynamic' laisse ces scripts charger leurs dépendances.
 * Aucun 'unsafe-inline' sur script-src — un script injecté ne s'exécute pas.
 * (style-src conserve 'unsafe-inline' : la coloration Shiki produit des
 * attributs style, inoffensifs pour l'exécution de code.)
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // Le widget Turnstile s'exécute dans une iframe Cloudflare
    `frame-src ${turnstileEnabled ? "https://challenges.cloudflare.com" : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Langue souhaitée : cookie de préférence, sinon Accept-Language du navigateur. */
function preferredLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookie && hasLocale(cookie)) return cookie;
  return negotiateLocale(request.headers.get("accept-language"));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonLocalized = NON_LOCALIZED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // URL canoniques : le français vit sans préfixe, /fr/* redirige vers /*
  if (pathname === "/fr" || pathname.startsWith("/fr/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  const isEnglish = pathname === "/en" || pathname.startsWith("/en/");
  // Chemin « nu » (sans préfixe de langue) : sert aux gardes et réécritures
  const barePath = isEnglish ? pathname.slice(3) || "/" : pathname;
  const locale: Locale = nonLocalized ? defaultLocale : isEnglish ? "en" : defaultLocale;

  // Première visite sans préfixe : on suit la langue du navigateur
  // (Accept-Language) ou le cookie posé par le sélecteur de langue.
  // Redirection temporaire (307) limitée aux navigations HTML — les flux RSS,
  // Server Actions et autres requêtes programmatiques ne sont pas déviés.
  if (
    !nonLocalized &&
    !isEnglish &&
    (request.method === "GET" || request.method === "HEAD") &&
    (request.headers.get("accept") ?? "").includes("text/html") &&
    preferredLocale(request) === "en"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = localeHref("en", pathname);
    return NextResponse.redirect(url, 307);
  }

  // Contrôle optimiste des espaces protégés : la présence du cookie de
  // session est vérifiée ici, la session réelle et le rôle sont revérifiés
  // dans les layouts et les Server Actions (défense en profondeur).
  if (barePath.startsWith("/admin") || barePath.startsWith("/membre")) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      const url = new URL(localeHref(locale, "/connexion"), request.url);
      url.searchParams.set("redirection", pathname);
      return NextResponse.redirect(url);
    }
  }

  // Nonce CSP à usage unique, transmis au rendu via l'en-tête x-nonce
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-locale", locale);
  requestHeaders.set("Content-Security-Policy", csp);

  let response: NextResponse;
  if (nonLocalized) {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    // Routage interne : les pages publiques vivent sous /[locale]/… ;
    // /articles/x est servi par /fr/articles/x sans changer l'URL visible.
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${barePath === "/" ? "" : barePath}`;
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Tout sauf les routes API, les assets Next, les fichiers téléversés
    // (uploads) et les assets statiques du dépôt (public/covers).
    // (Les préchargements de next/link passent aussi par ici : la réécriture
    // de locale doit s'appliquer pour qu'ils résolvent la bonne route.)
    "/((?!api|_next/static|_next/image|uploads|covers|favicon.ico).*)",
  ],
};
