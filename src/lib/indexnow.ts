import { hkdfSync } from "node:crypto";
import { localeHref } from "./i18n";
import { SITE_URL } from "./site";

/**
 * IndexNow : signale aussitôt une page publiée ou modifiée aux moteurs qui
 * partagent ce protocole (Bing — dont dépendent Copilot et la recherche de
 * ChatGPT —, Yandex, Seznam, Naver), sans attendre leur prochain passage.
 * Seules des URL publiques sont transmises.
 *
 * Aucune configuration : la clé est dérivée de BETTER_AUTH_SECRET (elle est
 * publique par nature, servie sur /indexnow.txt ; la dérivation ne révèle
 * rien du secret). Désactivé hors d'un site public en https.
 */

const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Chemin public du fichier de clé (racine du site : couvre toutes ses URL). */
export const INDEXNOW_KEY_PATH = "/indexnow.txt";

export function indexNowKey(): string | null {
  const master = process.env.BETTER_AUTH_SECRET;
  if (!master) return null;
  return Buffer.from(hkdfSync("sha256", master, "", "cybersphere/indexnow", 16)).toString("hex");
}

function enabled(): boolean {
  const { protocol, hostname } = new URL(SITE_URL);
  return protocol === "https:" && hostname !== "localhost" && process.env.NODE_ENV === "production";
}

/** Corps de la requête IndexNow pour ces chemins (exporté pour les tests). */
export function indexNowPayload(paths: string[], key: string) {
  return {
    host: new URL(SITE_URL).host,
    key,
    keyLocation: `${SITE_URL}${INDEXNOW_KEY_PATH}`,
    urlList: [...new Set(paths)].map((p) => `${SITE_URL}${p}`),
  };
}

/** Chemins d'un article : l'anglais seulement s'il existe une traduction. */
export function articlePaths(slug: string, translated: boolean): string[] {
  const path = `/articles/${slug}`;
  return translated ? [path, localeHref("en", path)] : [path];
}

/**
 * Notifie les moteurs. Ne lève jamais : un échec (réseau, quota) est
 * journalisé, la publication n'en dépend pas. À appeler dans after().
 */
export async function notifyIndexNow(paths: string[]): Promise<void> {
  const key = indexNowKey();
  if (!key || !enabled() || paths.length === 0) return;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowPayload(paths, key)),
      signal: AbortSignal.timeout(10_000),
    });
    // 200 : reçu ; 202 : reçu, clé en cours de vérification
    if (!response.ok) console.error(`[indexnow] réponse ${response.status}`);
  } catch (error) {
    console.error("[indexnow] notification impossible :", error);
  }
}
