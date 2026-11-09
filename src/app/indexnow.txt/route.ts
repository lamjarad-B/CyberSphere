import { indexNowKey } from "@/lib/indexnow";

// Clé dérivée du secret, lue à l'exécution : jamais figée à la build
export const dynamic = "force-dynamic";

/** Fichier de clé IndexNow : les moteurs y vérifient que le site les a notifiés. */
export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("Introuvable", { status: 404 });
  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
