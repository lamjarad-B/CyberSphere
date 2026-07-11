"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

/**
 * Bascule FR ↔ EN : mémorise le choix dans un cookie (respecté par le proxy
 * pour les visites suivantes) puis recharge la page équivalente dans l'autre
 * langue — les slugs d'articles étant communs aux deux langues, le chemin
 * se transpose toujours.
 */
export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function switchLocale() {
    const target: Locale = locale === "fr" ? "en" : "fr";
    // Cookie de préférence : un an, portée site entière
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=31536000; samesite=lax`;

    const bare = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
    const path = target === "en" ? (bare === "/" ? "/en" : `/en${bare}`) : bare;
    const query = searchParams.toString();
    // Navigation complète : le proxy et les Server Components relisent le cookie
    window.location.assign(query ? `${path}?${query}` : path);
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      aria-label={t.language.switchAria}
      title={t.language.switchTo}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-xs font-semibold uppercase text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
      </svg>
      {locale === "fr" ? "EN" : "FR"}
    </button>
  );
}
