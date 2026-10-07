import { SITE_URL as BASE_URL } from "@/lib/site";
const CONTACT = process.env.SECURITY_CONTACT ?? "lamjarad@gmail.com";

/** security.txt (RFC 9116) : point de contact pour la divulgation responsable. */
export async function GET() {
  // Expiration glissante : toujours dans ~6 mois, comme recommandé par la RFC
  const expires = new Date(Date.now() + 182 * 24 * 3600 * 1000).toISOString();

  const body = [
    `Contact: mailto:${CONTACT}`,
    `Expires: ${expires}`,
    `Canonical: ${BASE_URL}/.well-known/security.txt`,
    `Policy: ${BASE_URL}/securite`,
    "Preferred-Languages: fr, en",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
