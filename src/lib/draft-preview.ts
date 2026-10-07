import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// Un seul secret maître pour l'instance (celui de l'auth)…
const SECRET = process.env.BETTER_AUTH_SECRET ?? "";

const DEFAULT_TTL_SECONDS = 72 * 3600; // 3 jours

let previewKey: Buffer | null = null;

/**
 * …mais une clé HMAC dédiée, dérivée par HKDF-SHA256 (séparation des
 * usages) : better-auth signe ses cookies et jetons avec le secret brut, si
 * bien qu'une signature produite ici ne vaut nulle part ailleurs — et
 * inversement.
 */
function key(): Buffer {
  // Sans secret, les jetons seraient forgeables : on refuse de signer plutôt
  // que d'émettre/valider un jeton avec une clé vide (défaut de configuration).
  if (!SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET est requis pour signer les jetons de prévisualisation.",
    );
  }
  if (!previewKey) {
    previewKey = Buffer.from(hkdfSync("sha256", SECRET, "", "cybersphere/apercu-brouillon", 32));
  }
  return previewKey;
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

/**
 * Jeton signé pour partager la prévisualisation d'un brouillon sans compte :
 * `expiration.signature(articleId.expiration)`. Sans état côté serveur,
 * infalsifiable sans le secret, expire tout seul.
 */
export function createPreviewToken(
  articleId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${expiresAt}.${sign(`${articleId}.${expiresAt}`)}`;
}

/** Vérifie un jeton de prévisualisation (signature + expiration). */
export function verifyPreviewToken(articleId: string, token: unknown): boolean {
  // ?jeton= répété arrive en tableau : refus net plutôt qu'une erreur 500
  if (typeof token !== "string") return false;
  const [expRaw, mac] = token.split(".");
  if (!expRaw || !mac) return false;

  const expiresAt = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;

  const expected = Buffer.from(sign(`${articleId}.${expiresAt}`));
  const provided = Buffer.from(mac);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}
