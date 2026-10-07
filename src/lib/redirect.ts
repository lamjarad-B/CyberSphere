/** Origine fictive servant à résoudre la cible comme le ferait le navigateur. */
const INTERNAL_ORIGIN = "https://interne.invalid";

/**
 * Cible de redirection après authentification : chemin interne uniquement.
 * Doit commencer par « / ». Les caractères de contrôle et l'antislash sont
 * refusés partout : les navigateurs suppriment tabulations et retours à la
 * ligne des URL et lisent « \ » comme « / » — « /\t/evil.com » deviendrait
 * « //evil.com » (URL protocol-relative → autre origine). La cible est enfin
 * résolue comme par le navigateur et doit rester sur la même origine.
 */
export function safeRedirect(target: string | null | undefined, fallback: string): string {
  // typeof : un paramètre de recherche répété arrive sous forme de tableau
  if (typeof target !== "string" || !target.startsWith("/")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(target)) return fallback;
  try {
    const url = new URL(target, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
