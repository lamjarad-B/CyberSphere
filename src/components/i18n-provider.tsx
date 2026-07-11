"use client";

import { createContext, useContext } from "react";
import { defaultLocale, type Locale } from "@/lib/i18n";
import { getDictionary, type Dictionary } from "@/i18n/dictionaries";

type I18nContextValue = { locale: Locale; t: Dictionary };

// Valeur par défaut : français — les composants partagés rendus hors du
// provider (ex. bascule de thème dans l'admin) restent fonctionnels.
const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  t: getDictionary(defaultLocale),
});

/**
 * Fournit la locale courante et son dictionnaire aux composants client.
 * Seule la locale transite par le payload RSC : les dictionnaires sont
 * importés statiquement (les textes ne sont pas dupliqués par requête).
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: getDictionary(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
