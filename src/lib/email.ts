import nodemailer, { type Transporter } from "nodemailer";

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

/** Gabarit HTML sobre pour l'e-mail de vérification de compte. */
export function verificationEmail(url: string): { html: string; text: string } {
  const text = `Bienvenue sur CyberSphere !

Confirmez votre adresse e-mail pour activer votre compte :
${url}

Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`;

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#0a0f16;font-family:Arial,Helvetica,sans-serif;color:#e6edf3;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#0f1622;border:1px solid #1e293b;border-radius:12px;padding:32px">
      <p style="font-family:monospace;color:#22d3ee;font-weight:bold;font-size:18px;margin:0 0 8px">&gt;_ CyberSphere</p>
      <h1 style="font-size:20px;margin:0 0 16px">Confirmez votre adresse e-mail</h1>
      <p style="color:#8b98a9;line-height:1.6;margin:0 0 24px">
        Bienvenue ! Cliquez sur le bouton ci-dessous pour activer votre compte et commencer à commenter les articles.
      </p>
      <a href="${url}" style="display:inline-block;background:#22d3ee;color:#06222b;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px">
        Activer mon compte
      </a>
      <p style="color:#8b98a9;font-size:13px;line-height:1.6;margin:24px 0 0">
        Ou copiez ce lien : <br /><span style="color:#22d3ee;word-break:break-all">${url}</span>
      </p>
      <p style="color:#5b6675;font-size:12px;margin:24px 0 0">
        Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.
      </p>
    </div>
  </body>
</html>`;

  return { html, text };
}
