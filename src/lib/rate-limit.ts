/**
 * Limiteur de débit en mémoire (fenêtre fixe), pour les actions publiques
 * hors better-auth (qui a le sien). Par instance : suffisant pour un blog
 * mono-serveur ; à déporter vers Redis si l'application passe à l'échelle.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Renvoie true si l'action est autorisée, false si la limite est atteinte. */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  // Ménage opportuniste : la table ne grossit pas indéfiniment
  if (buckets.size > 10_000) {
    for (const [k, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}

/** Réinitialise le limiteur (tests). */
export function resetRateLimits(): void {
  buckets.clear();
}
