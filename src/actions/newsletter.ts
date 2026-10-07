"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requestIp } from "@/lib/audit";
import { verifyTurnstile } from "@/lib/captcha";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, newsletterConfirmEmail } from "@/lib/email";
import { localeHref, toLocale } from "@/lib/i18n";
import { confirmNewsletter, unsubscribeNewsletter } from "@/lib/newsletter";
import { SITE_URL as BASE_URL } from "@/lib/site";
import { newsletterSchema } from "@/lib/validations";
import type { ActionResult } from "./comments";

/**
 * Inscription à la newsletter (double opt-in) : enregistre l'adresse comme
 * non confirmée et envoie un lien de confirmation. La réponse est toujours
 * identique, que l'adresse soit nouvelle, déjà inscrite ou déjà confirmée :
 * aucune fuite sur le contenu de la liste.
 */
export async function subscribeNewsletter(input: {
  email: string;
  /** Honeypot : champ invisible pour les humains, rempli par les bots. */
  website?: string;
  /** Langue du site au moment de l'inscription : langue des futurs e-mails. */
  locale?: string;
  /** Jeton Cloudflare Turnstile (si le CAPTCHA est configuré). */
  captchaToken?: string | null;
}): Promise<ActionResult> {
  if (input.website) return { ok: true };
  const en = input.locale === "en";

  // Anti-abus par IP : 5 demandes / 10 min (une inscription peut faire
  // envoyer un e-mail à une adresse tierce)
  const ip = await requestIp();
  if (!rateLimit(`newsletter:${ip ?? "inconnue"}`, 5, 10 * 60_000)) {
    return {
      ok: false,
      error: en
        ? "Too many requests. Please try again in a few minutes."
        : "Trop de demandes. Réessayez dans quelques minutes.",
    };
  }
  if (!(await verifyTurnstile(input.captchaToken, ip))) {
    return {
      ok: false,
      error: en ? "Anti-bot check failed. Please try again." : "Vérification anti-robot échouée. Réessayez.",
    };
  }

  const parsed = newsletterSchema.safeParse({
    email: input.email,
    locale: en ? "en" : "fr",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: en ? "Invalid email address." : "Adresse e-mail invalide.",
    };
  }
  const email = parsed.data.email.toLowerCase();
  const locale = parsed.data.locale;

  const existing = await db.newsletterSubscriber.findUnique({
    where: { email },
    select: { id: true, confirmed: true, token: true, createdAt: true },
  });

  // Déjà confirmé : ne pas renvoyer d'e-mail (sinon l'inscription devient
  // un canal de harcèlement d'adresses tierces)
  if (existing?.confirmed) return { ok: true };

  // Anti-abus : pas de renvoi si une demande date de moins de 10 minutes
  if (existing && Date.now() - existing.createdAt.getTime() < 10 * 60_000) {
    return { ok: true };
  }

  const token = randomBytes(24).toString("base64url");
  await db.newsletterSubscriber.upsert({
    where: { email },
    create: { email, token, locale },
    update: { token, locale, createdAt: new Date() },
  });

  const url = `${BASE_URL}${localeHref(locale, `/newsletter/confirmation?jeton=${token}`)}`;
  const { html, text } = newsletterConfirmEmail(url, locale);
  await sendEmail({
    to: email,
    subject:
      locale === "en"
        ? "Confirm your subscription — CyberSphere newsletter"
        : "Confirmez votre inscription — newsletter CyberSphere",
    html,
    text,
  });

  return { ok: true };
}

/*
 * Confirmation et désinscription, en formulaire uniquement : jamais sur un
 * simple GET. Les scanners de liens des messageries (Safe Links,
 * antivirus…) ouvrent les URL des e-mails : un GET qui agit désinscrirait un
 * abonné — ou confirmerait une adresse — à son insu. La logique par jeton vit
 * dans lib/newsletter.ts, hors de ce fichier "use server" (cf. son commentaire).
 */

export async function confirmNewsletterForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? ""));
  const ok = await confirmNewsletter(String(formData.get("jeton") ?? ""));
  redirect(localeHref(locale, `/newsletter/confirmation?statut=${ok ? "ok" : "invalide"}`));
}

export async function unsubscribeNewsletterForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? ""));
  const ok = await unsubscribeNewsletter(String(formData.get("jeton") ?? ""));
  redirect(localeHref(locale, `/newsletter/desinscription?statut=${ok ? "ok" : "invalide"}`));
}
