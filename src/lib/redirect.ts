/**
 * Cible de redirection après authentification : chemin interne uniquement.
 * Doit commencer par « / » mais ni par « // » ni par « /\ », que certains
 * navigateurs normalisent en « // » (URL protocol-relative → autre origine).
 */
export function safeRedirect(target: string | null | undefined, fallback: string): string {
  return target && /^\/(?![/\\])/.test(target) ? target : fallback;
}
