import { unsubscribeNewsletter } from "@/actions/newsletter";

/**
 * Désabonnement en un clic (RFC 8058) : cible de l'en-tête List-Unsubscribe
 * des e-mails newsletter. Les clients mail (Gmail, Yahoo, Apple Mail…)
 * envoient un POST `List-Unsubscribe=One-Click` ; seul le jeton secret,
 * propre à chaque abonné, autorise la suppression.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("jeton") ?? "";
  await unsubscribeNewsletter(token);
  // Réponse identique que le jeton soit valide ou non : aucune énumération
  return new Response(null, { status: 204 });
}
