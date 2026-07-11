"use server";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { sendEmail, newsletterConfirmEmail } from "@/lib/email";
import { localeHref } from "@/lib/i18n";
import { newsletterSchema } from "@/lib/validations";
import type { ActionResult } from "./comments";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
}): Promise<ActionResult> {
  if (input.website) return { ok: true };

  const parsed = newsletterSchema.safeParse({
    email: input.email,
    locale: input.locale === "en" ? "en" : "fr",
  });
  if (!parsed.success) return { ok: false, error: "Adresse e-mail invalide." };
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

/** Confirme une inscription via le jeton reçu par e-mail. */
export async function confirmNewsletter(token: string): Promise<boolean> {
  if (!token) return false;
  const subscriber = await db.newsletterSubscriber.findUnique({
    where: { token },
    select: { id: true, confirmed: true },
  });
  if (!subscriber) return false;
  if (!subscriber.confirmed) {
    await db.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { confirmed: true, confirmedAt: new Date() },
    });
  }
  return true;
}

/** Désinscription via le jeton présent dans chaque e-mail. */
export async function unsubscribeNewsletter(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    await db.newsletterSubscriber.delete({ where: { token } });
    return true;
  } catch {
    return false;
  }
}
