"use server";

import { redirect } from "next/navigation";
import { requestIp } from "@/lib/audit";
import { verifyTurnstile } from "@/lib/captcha";
import { rateLimit } from "@/lib/rate-limit";
import { localeHref, toLocale } from "@/lib/i18n";
import {
  confirmNewsletter,
  requestNewsletterSubscription,
  unsubscribeNewsletter,
} from "@/lib/newsletter";
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
  await requestNewsletterSubscription(parsed.data.email.toLowerCase(), parsed.data.locale);
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
