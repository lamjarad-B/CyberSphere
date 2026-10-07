import { headers } from "next/headers";
import type { Locale } from "./i18n";

/**
 * Langue de la page qui a déclenché une Server Action. L'action est postée
 * sur l'URL de la page (/en/… pour l'anglais) : le proxy y pose `x-locale`.
 * Sert à renvoyer les messages d'erreur dans la langue du visiteur.
 */
export async function actionLocale(): Promise<Locale> {
  try {
    return (await headers()).get("x-locale") === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}
