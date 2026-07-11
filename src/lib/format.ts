import type { Locale } from "./i18n";

const DATE_LOCALES: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, withTime: boolean): Intl.DateTimeFormat {
  const key = `${locale}:${withTime}`;
  let cached = dateFormatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(
      DATE_LOCALES[locale],
      withTime
        ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
        : { day: "numeric", month: "long", year: "numeric" },
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
