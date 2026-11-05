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

/**
 * Clé d'une adresse IP pour les limiteurs. Une IPv6 est ramenée à son préfixe
 * /64 : un abonné en dispose de milliards, compter par adresse ne limiterait rien.
 */
export function ipBucket(ip: string | null): string {
  if (!ip) return "inconnue";
  const address = ip.split("%")[0].toLowerCase();
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  if (!address.includes(":")) return address;

  const [head, tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = address.includes("::") ? Math.max(0, 8 - left.length - right.length) : 0;
  return [...left, ...Array<string>(missing).fill("0"), ...right]
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":");
}

/** Réinitialise le limiteur (tests). */
export function resetRateLimits(): void {
  buckets.clear();
}
