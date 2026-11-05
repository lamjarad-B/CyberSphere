import { createAltchaChallenge } from "@/lib/altcha";
import { requestIp } from "@/lib/audit";
import { ipBucket, rateLimit } from "@/lib/rate-limit";

// Un défi par requête, jamais mis en cache
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const WINDOW_SECONDS = 10 * 60;

/**
 * Défi de preuve de travail du formulaire de commentaire sans compte. Limité
 * par IP : chaque défi coûte une dérivation de clé au serveur.
 */
export async function GET() {
  if (!rateLimit(`altcha:${ipBucket(await requestIp())}`, 20, WINDOW_SECONDS * 1000)) {
    return Response.json(
      { error: "Trop de demandes." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(WINDOW_SECONDS) } },
    );
  }
  return Response.json(await createAltchaChallenge(), { headers: NO_STORE });
}
