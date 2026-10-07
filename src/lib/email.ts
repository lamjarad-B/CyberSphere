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
  /** En-têtes supplémentaires (ex. List-Unsubscribe pour la newsletter). */
  headers?: Record<string, string>;
};

/**
 * Envoie un e-mail via SMTP. En l'absence de configuration SMTP (développement),
 * le contenu est écrit dans la console pour rester testable sans serveur mail.
 */
export async function sendEmail({ to, subject, html, text, headers }: SendEmailInput) {
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
    headers,
  });
}

type EmailContent = { html: string; text: string };

/**
 * Échappe les caractères HTML sensibles. Les titres/extraits d'article sont
 * rédigés par le staff mais restent des données : sans échappement, un titre
 * contenant du HTML s'exécuterait dans la boîte mail des abonnés.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  // Détails clé / valeur (alertes de sécurité), échappés comme le reste
  details: [string, string][] = [],
): string {
  const detailRows = details
    .map(
      ([label, value]) =>
        `<tr><td style="color:#8b98a9;padding:4px 12px 4px 0;white-space:nowrap">${escapeHtml(label)}</td><td style="font-family:monospace;padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;background:#0a0f16;font-family:Arial,Helvetica,sans-serif;color:#e6edf3;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#0f1622;border:1px solid #1e293b;border-radius:12px;padding:32px">
      <p style="font-family:monospace;color:#22d3ee;font-weight:bold;font-size:18px;margin:0 0 8px">&gt;_ CyberSphere</p>
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
      <p style="color:#8b98a9;line-height:1.6;margin:0 0 24px">${escapeHtml(intro)}</p>
      ${detailRows ? `<table style="font-size:14px;margin:0 0 24px;border-collapse:collapse">${detailRows}</table>` : ""}
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#22d3ee;color:#06222b;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px">
        ${ctaLabel}
      </a>
      <p style="color:#8b98a9;font-size:13px;line-height:1.6;margin:24px 0 0">
        ${COPY_LINK[locale]} <br /><span style="color:#22d3ee;word-break:break-all">${escapeHtml(url)}</span>
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

export type SecurityAlertKind =
  | "new_device"
  | "password_changed"
  | "two_factor_disabled"
  | "passkey_added";

const SECURITY_ALERTS: Record<
  Locale,
  Record<SecurityAlertKind, { subject: string; title: string; intro: string }>
> = {
  fr: {
    new_device: {
      subject: "Nouvelle connexion à votre compte — CyberSphere",
      title: "Nouvelle connexion détectée",
      intro:
        "Votre compte vient d'être utilisé depuis un appareil ou un navigateur que nous ne connaissions pas.",
    },
    password_changed: {
      subject: "Votre mot de passe a été modifié — CyberSphere",
      title: "Mot de passe modifié",
      intro: "Le mot de passe de votre compte vient d'être changé.",
    },
    two_factor_disabled: {
      subject: "Double authentification désactivée — CyberSphere",
      title: "Double authentification désactivée",
      intro:
        "La double authentification (2FA) vient d'être désactivée sur votre compte : il n'est plus protégé que par son mot de passe.",
    },
    passkey_added: {
      subject: "Nouvelle passkey ajoutée — CyberSphere",
      title: "Nouvelle passkey ajoutée",
      intro: "Une nouvelle passkey permet désormais de se connecter à votre compte.",
    },
  },
  en: {
    new_device: {
      subject: "New sign-in to your account — CyberSphere",
      title: "New sign-in detected",
      intro: "Your account was just used from a device or browser we hadn't seen before.",
    },
    password_changed: {
      subject: "Your password was changed — CyberSphere",
      title: "Password changed",
      intro: "Your account password was just changed.",
    },
    two_factor_disabled: {
      subject: "Two-factor authentication disabled — CyberSphere",
      title: "Two-factor authentication disabled",
      intro:
        "Two-factor authentication (2FA) was just turned off on your account: it is now protected by its password alone.",
    },
    passkey_added: {
      subject: "New passkey added — CyberSphere",
      title: "New passkey added",
      intro: "A new passkey can now be used to sign in to your account.",
    },
  },
};

/** Alerte de sécurité envoyée au titulaire du compte. */
export function securityAlertEmail(input: {
  kind: SecurityAlertKind;
  locale: Locale;
  /** Page « Mon profil » (sessions, 2FA, passkeys) */
  accountUrl: string;
  details: [string, string][];
}): EmailContent & { subject: string } {
  const copy = SECURITY_ALERTS[input.locale][input.kind];
  const en = input.locale === "en";
  const cta = en ? "Review my account" : "Vérifier mon compte";
  const footer = en
    ? "If this was you, no action is needed. Otherwise, change your password right away and revoke unknown sessions from your profile."
    : "Si c'est bien vous, aucune action n'est nécessaire. Sinon, changez immédiatement votre mot de passe et révoquez les sessions inconnues depuis votre profil.";
  const detailText = input.details.map(([label, value]) => `${label} : ${value}`).join("\n");
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.intro}\n\n${detailText}\n\n${footer}\n${input.accountUrl}`,
    html: layout(input.locale, copy.title, copy.intro, cta, input.accountUrl, footer, input.details),
  };
}

/** Notification interne aux administrateurs (l'administration est en français). */
export function adminNotificationEmail(input: {
  title: string;
  intro: string;
  url: string;
  details: [string, string][];
}): EmailContent {
  const footer =
    "Vous recevez cet e-mail en tant qu'administrateur de CyberSphere.";
  const detailText = input.details.map(([label, value]) => `${label} : ${value}`).join("\n");
  return {
    text: `${input.title}\n\n${input.intro}\n\n${detailText}\n\n${input.url}`,
    html: layout("fr", input.title, input.intro, "Ouvrir l'administration", input.url, footer, input.details),
  };
}
