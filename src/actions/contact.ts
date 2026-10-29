"use server";

import { db } from "@/lib/db";
import { requestIp } from "@/lib/audit";
import { actionLocale } from "@/lib/action-locale";
import { verifyTurnstile } from "@/lib/captcha";
import { rateLimit } from "@/lib/rate-limit";
import { contactMessageEmail, sendEmail } from "@/lib/email";
import { contactSchema } from "@/lib/validations";
import type { ActionResult } from "./comments";

const messages = {
  fr: {
    rateLimited: "Trop de messages envoyés. Réessayez dans quelques minutes.",
    captcha: "Vérification anti-robot échouée. Réessayez.",
    name: "Indiquez votre nom (2 à 80 caractères).",
    email: "Adresse e-mail invalide.",
    subject: "Indiquez un sujet (3 à 120 caractères).",
    message: "Votre message doit contenir entre 10 et 5 000 caractères.",
    failed: "L'envoi a échoué. Réessayez plus tard.",
  },
  en: {
    rateLimited: "Too many messages sent. Please try again in a few minutes.",
    captcha: "Anti-bot check failed. Please try again.",
    name: "Please enter your name (2 to 80 characters).",
    email: "Invalid email address.",
    subject: "Please enter a subject (3 to 120 characters).",
    message: "Your message must be between 10 and 5,000 characters.",
    failed: "Sending failed. Please try again later.",
  },
};

/**
 * Destinataires des messages : CONTACT_EMAIL s'il est défini, sinon tous les
 * administrateurs actifs.
 */
async function contactRecipients(): Promise<string[]> {
  const configured = process.env.CONTACT_EMAIL?.trim();
  if (configured) return [configured];
  const admins = await db.user.findMany({
    where: { role: "admin", banned: false },
    select: { email: true },
  });
  return admins.map((admin) => admin.email);
}

/**
 * Formulaire de contact : transmet le message à l'équipe par e-mail, avec
 * l'expéditeur en Reply-To. Rien n'est stocké en base.
 */
export async function sendContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Honeypot : champ invisible pour les humains, rempli par les bots. */
  website?: string;
  /** Jeton Cloudflare Turnstile (si le CAPTCHA est configuré). */
  captchaToken?: string | null;
}): Promise<ActionResult> {
  if (input.website) return { ok: true };
  const locale = await actionLocale();
  const t = messages[locale];

  // Anti-abus par IP : 3 messages / 10 min (chaque envoi produit un e-mail)
  const ip = await requestIp();
  if (!rateLimit(`contact:${ip ?? "inconnue"}`, 3, 10 * 60_000)) {
    return { ok: false, error: t.rateLimited };
  }
  if (!(await verifyTurnstile(input.captchaToken, ip))) {
    return { ok: false, error: t.captcha };
  }

  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as keyof typeof t | undefined;
    return { ok: false, error: field && field in t ? t[field] : t.failed };
  }
  const { name, email, subject, message } = parsed.data;

  const { html, text } = contactMessageEmail({ name, email, subject, message, locale });
  try {
    const recipients = await contactRecipients();
    if (recipients.length === 0) throw new Error("aucun destinataire (CONTACT_EMAIL ni admin)");
    for (const to of recipients) {
      await sendEmail({
        to,
        subject: `[Contact] ${subject}`,
        html,
        text,
        replyTo: { name, address: email },
      });
    }
  } catch (error) {
    console.error("[contact] envoi impossible :", error);
    return { ok: false, error: t.failed };
  }

  return { ok: true };
}
