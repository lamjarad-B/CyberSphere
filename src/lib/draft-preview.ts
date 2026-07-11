import { createHmac, timingSafeEqual } from "node:crypto";

// Réutilise le secret d'auth : un seul secret maître pour l'instance.
const SECRET = process.env.BETTER_AUTH_SECRET ?? "";

const DEFAULT_TTL_SECONDS = 72 * 3600; // 3 jours

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
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
export function verifyPreviewToken(articleId: string, token: string): boolean {
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
