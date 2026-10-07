import type { Locale } from "./i18n";

const DATE_LOCALES: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

// Fuseau d'affichage fixe : identique serveur (souvent UTC en conteneur) et
// navigateur, donc pas d'écart d'hydratation ni d'heure décalée.
const TIME_ZONE = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE || "Europe/Paris";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, withTime: boolean): Intl.DateTimeFormat {
  const key = `${locale}:${withTime}`;
  let cached = dateFormatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(
      DATE_LOCALES[locale],
      withTime
        ? {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: TIME_ZONE,
          }
        : { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE },
    );
    dateFormatters.set(key, cached);
  }
  return cached;
}

export function formatDate(date: Date | null | undefined, locale: Locale = "fr"): string {
  if (!date) return "";
  return formatter(locale, false).format(date);
}

export function formatDateTime(date: Date | null | undefined, locale: Locale = "fr"): string {
  if (!date) return "";
  return formatter(locale, true).format(date);
}
