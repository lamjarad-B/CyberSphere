import nodemailer, { type Transporter } from "nodemailer";
import type { Locale } from "./i18n";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  SMTP_SECURE,
} = process.env;

let transporter: Transporter | null = null;

/** Transport SMTP réutilisé, ou null si aucun SMTP n'est configuré. */
function getTransporter(): Transporter | null {
  if (!SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: SMTP_SECURE === "true",
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Envoie un e-mail via SMTP. En l'absence de configuration SMTP (développement),
 * le contenu est écrit dans la console pour rester testable sans serveur mail.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  const tx = getTransporter();
  if (!tx) {
    console.log(
      `\n[email] SMTP non configuré — e-mail simulé\n  À : ${to}\n  Sujet : ${subject}\n  ${text}\n`,
    );
    return;
  }
  await tx.sendMail({
    from: SMTP_FROM ?? "CyberSphere <no-reply@cybersphere.local>",
    to,
    subject,
    text,
    html,
  });
}

type EmailContent = { html: string; text: string };

/** Libellé « copiez ce lien » selon la langue du destinataire. */
const COPY_LINK: Record<Locale, string> = {
  fr: "Ou copiez ce lien :",
  en: "Or copy this link:",
};

/** Gabarit HTML commun : cadre sombre + bouton d'action cyan. */
function layout(
  locale: Locale,
  title: string,
  intro: string,
  ctaLabel: string,
  url: string,
  footer: string,
): string {
  return `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;background:#0a0f16;font-family:Arial,Helvetica,sans-serif;color:#e6edf3;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#0f1622;border:1px solid #1e293b;border-radius:12px;padding:32px">
      <p style="font-family:monospace;color:#22d3ee;font-weight:bold;font-size:18px;margin:0 0 8px">&gt;_ CyberSphere</p>
      <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
      <p style="color:#8b98a9;line-height:1.6;margin:0 0 24px">${intro}</p>
      <a href="${url}" style="display:inline-block;background:#22d3ee;color:#06222b;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px">
        ${ctaLabel}
      </a>
      <p style="color:#8b98a9;font-size:13px;line-height:1.6;margin:24px 0 0">
        ${COPY_LINK[locale]} <br /><span style="color:#22d3ee;word-break:break-all">${url}</span>
      </p>
      <p style="color:#5b6675;font-size:12px;margin:24px 0 0">${footer}</p>
    </div>
  </body>
</html>`;
}

/** E-mail de vérification de compte. */
export function verificationEmail(url: string, locale: Locale = "fr"): EmailContent {
  if (locale === "en") {
    return {
      text: `Welcome to CyberSphere!

Confirm your email address to activate your account:
${url}

This link expires in 1 hour. If you didn't sign up, you can safely ignore this message.`,
      html: layout(
        "en",
        "Confirm your email address",
        "Welcome! Click the button below to activate your account and start commenting on articles.",
        "Activate my account",
        url,
        "This link expires in 1 hour. If you didn't sign up, you can safely ignore this message.",
      ),
    };
  }
  return {
    text: `Bienvenue sur CyberSphere !

Confirmez votre adresse e-mail pour activer votre compte :
${url}

Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
    html: layout(
      "fr",
      "Confirmez votre adresse e-mail",
      "Bienvenue ! Cliquez sur le bouton ci-dessous pour activer votre compte et commencer à commenter les articles.",
      "Activer mon compte",
      url,
      "Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.",
    ),
  };
}

/** E-mail de réinitialisation de mot de passe. */
export function resetPasswordEmail(url: string, locale: Locale = "fr"): EmailContent {
  if (locale === "en") {
    return {
      text: `CyberSphere password reset

Choose a new password by opening this link:
${url}

This link expires in 1 hour. If you didn't request this reset, ignore this message: your password stays unchanged.`,
      html: layout(
        "en",
        "Reset your password",
        "A password reset was requested for your account. Click the button to choose a new one.",
        "Choose a new password",
        url,
        "This link expires in 1 hour. If you didn't request this reset, ignore this message: your password stays unchanged.",
      ),
    };
  }
  return {
    text: `Réinitialisation de votre mot de passe CyberSphere

Choisissez un nouveau mot de passe en ouvrant ce lien :
${url}

Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez ce message : votre mot de passe reste inchangé.`,
    html: layout(
      "fr",
      "Réinitialisez votre mot de passe",
      "Une réinitialisation de mot de passe a été demandée pour votre compte. Cliquez sur le bouton pour en choisir un nouveau.",
      "Choisir un nouveau mot de passe",
      url,
      "Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez ce message : votre mot de passe reste inchangé.",
    ),
  };
}

/** E-mail de confirmation d'inscription à la newsletter (double opt-in). */
export function newsletterConfirmEmail(url: string, locale: Locale = "fr"): EmailContent {
  if (locale === "en") {
    return {
      text: `Confirm your subscription to the CyberSphere newsletter:
${url}

If you didn't request this, ignore this message: no newsletter will be sent without confirmation.`,
      html: layout(
        "en",
        "Confirm your subscription",
        "One more click: confirm your address to receive new CyberSphere articles by email.",
        "Confirm my subscription",
        url,
        "If you didn't request this, ignore this message: no newsletter will be sent without confirmation.",
      ),
    };
  }
  return {
    text: `Confirmez votre inscription à la newsletter CyberSphere :
${url}

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : aucune newsletter ne vous sera envoyée sans confirmation.`,
    html: layout(
      "fr",
      "Confirmez votre inscription",
      "Encore un clic : confirmez votre adresse pour recevoir les nouveaux articles CyberSphere par e-mail.",
      "Confirmer mon inscription",
      url,
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : aucune newsletter ne vous sera envoyée sans confirmation.",
    ),
  };
}

/** E-mail « nouvel article publié » envoyé aux abonnés confirmés. */
export function newArticleEmail(input: {
  title: string;
  excerpt: string;
  url: string;
  unsubscribeUrl: string;
  locale?: Locale;
}): EmailContent {
  if (input.locale === "en") {
    return {
      text: `New article on CyberSphere: ${input.title}

${input.excerpt}

Read the article: ${input.url}

Unsubscribe: ${input.unsubscribeUrl}`,
      html: layout(
        "en",
        input.title,
        input.excerpt,
        "Read the article",
        input.url,
        `You're receiving this email because you subscribed to the CyberSphere newsletter. <a href="${input.unsubscribeUrl}" style="color:#8b98a9">Unsubscribe</a>`,
      ),
    };
  }
  return {
    text: `Nouvel article sur CyberSphere : ${input.title}

${input.excerpt}

Lire l'article : ${input.url}

Se désabonner : ${input.unsubscribeUrl}`,
    html: layout(
      "fr",
      input.title,
      input.excerpt,
      "Lire l'article",
      input.url,
      `Vous recevez cet e-mail car vous êtes abonné à la newsletter CyberSphere. <a href="${input.unsubscribeUrl}" style="color:#8b98a9">Se désabonner</a>`,
    ),
  };
}
