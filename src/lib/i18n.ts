/**
 * Primitives de localisation (sans dépendance React — utilisables dans le
 * proxy, les Server Components et les Server Actions).
 *
 * Convention d'URL : le français (langue par défaut) vit sans préfixe
 * (`/articles/...`), l'anglais sous `/en` (`/en/articles/...`). Le proxy
 * réécrit les chemins non préfixés vers le segment interne `/fr`.
 */

export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";

/** Cookie de préférence de langue (posé par le sélecteur de langue). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function hasLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Coercition sûre du paramètre de route (le layout 404 déjà les URL forgées). */
export function toLocale(value: string): Locale {
  return hasLocale(value) ? value : defaultLocale;
}

/** Préfixe un chemin interne avec la locale ("/en" pour l'anglais, rien pour le français). */
export function localeHref(locale: Locale, path: string): string {
  if (locale === defaultLocale) return path;
  return path === "/" ? "/en" : `/en${path}`;
}

/**
 * Négociation de langue sur l'en-tête Accept-Language (RFC 9110) : plus
 * fiable qu'une géolocalisation IP — un anglophone en France reçoit bien
 * l'anglais — et sans base GeoIP ni donnée personnelle traitée.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (hasLocale(base)) return base;
  }
  return defaultLocale;
}
