const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Vérifie un jeton Cloudflare Turnstile côté serveur, pour les formulaires
 * hors better-auth (newsletter). Sans TURNSTILE_SECRET_KEY, le CAPTCHA est
 * désactivé (même convention que le plugin captcha de better-auth).
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error("[captcha] vérification impossible :", error);
    return false;
  }
}
