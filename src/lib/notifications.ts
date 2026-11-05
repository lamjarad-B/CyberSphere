import { createHash } from "node:crypto";
import { db } from "./db";
import {
  adminNotificationEmail,
  commentPublishedEmail,
  securityAlertEmail,
  sendEmail,
  type SecurityAlertKind,
} from "./email";
import { formatDateTime } from "./format";
import { localeHref, type Locale } from "./i18n";
import { subscribeApprovedCommenter } from "./newsletter";
import { SITE_URL } from "./site";
import { describeUserAgent } from "./user-agent";

const UA_LABELS: Record<Locale, Parameters<typeof describeUserAgent>[1]> = {
  fr: {
    unknownDevice: "Appareil inconnu",
    unknownBrowser: "Navigateur inconnu",
    unknownOs: "système inconnu",
  },
  en: {
    unknownDevice: "Unknown device",
    unknownBrowser: "Unknown browser",
    unknownOs: "unknown OS",
  },
};

/**
 * Mémorise l'appareil (empreinte SHA-256 du user-agent) d'une connexion.
 * Renvoie true si c'est un appareil inconnu sur un compte qui en connaissait
 * déjà au moins un — la toute première connexion n'est pas une alerte.
 */
export async function isNewLoginDevice(
  userId: string,
  userAgent: string | null | undefined,
): Promise<boolean> {
  const uaHash = createHash("sha256").update(userAgent ?? "").digest("hex");
  const existing = await db.loginDevice.findUnique({
    where: { userId_uaHash: { userId, uaHash } },
    select: { id: true },
  });
  if (existing) {
    await db.loginDevice.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
    return false;
  }
  const known = await db.loginDevice.count({ where: { userId } });
  await db.loginDevice.create({ data: { userId, uaHash } });
  return known > 0;
}

/**
 * Prévient le titulaire d'un compte d'un événement de sécurité. Ne lève
 * jamais : l'alerte ne doit pas faire échouer l'opération qui la déclenche.
 */
export async function sendSecurityAlert(input: {
  userId: string;
  kind: SecurityAlertKind;
  locale: Locale;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user) return;
    const en = input.locale === "en";
    const details: [string, string][] = [
      ["Date", formatDateTime(new Date(), input.locale)],
    ];
    if (input.userAgent !== undefined) {
      details.push([
        en ? "Device" : "Appareil",
        describeUserAgent(input.userAgent, UA_LABELS[input.locale]),
      ]);
    }
    if (input.ipAddress) details.push([en ? "IP address" : "Adresse IP", input.ipAddress]);

    const { subject, html, text } = securityAlertEmail({
      kind: input.kind,
      locale: input.locale,
      accountUrl: `${SITE_URL}${localeHref(input.locale, "/membre")}`,
      details,
    });
    await sendEmail({ to: user.email, subject, html, text });
  } catch (error) {
    console.error("[alerte] envoi impossible :", error);
  }
}

/**
 * Prévient un invité que son commentaire est publié et, s'il a coché la case,
 * l'abonne à la newsletter. Conçu pour `after()` ; ne lève jamais.
 */
export async function notifyCommentPublished(input: {
  email: string;
  locale: Locale;
  articleTitle: string;
  articleSlug: string;
  subscribe: boolean;
}): Promise<void> {
  const { email, locale } = input;
  try {
    const token = input.subscribe ? await subscribeApprovedCommenter(email, locale) : null;
    const { html, text } = commentPublishedEmail({
      articleTitle: input.articleTitle,
      url: `${SITE_URL}${localeHref(locale, `/articles/${input.articleSlug}`)}`,
      unsubscribeUrl: token
        ? `${SITE_URL}${localeHref(locale, `/newsletter/desinscription?jeton=${token}`)}`
        : undefined,
      locale,
    });
    await sendEmail({
      to: email,
      subject:
        locale === "en"
          ? "Your comment is online — CyberSphere"
          : "Votre commentaire est en ligne — CyberSphere",
      html,
      text,
      headers: token
        ? {
            "List-Unsubscribe": `<${SITE_URL}/api/newsletter/desinscription?jeton=${token}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    });
  } catch (error) {
    console.error("[commentaires] notification de publication impossible :", error);
  }
}

/**
 * Notifie tous les administrateurs actifs (article soumis, commentaire
 * signalé…). Conçu pour `after()` ; ne lève jamais.
 */
export async function notifyAdmins(input: {
  subject: string;
  title: string;
  intro: string;
  /** Chemin de l'administration à ouvrir, ex. "/admin/signalements" */
  path: string;
  details?: [string, string][];
}): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: "admin", banned: false },
      select: { email: true },
    });
    const { html, text } = adminNotificationEmail({
      title: input.title,
      intro: input.intro,
      url: `${SITE_URL}${input.path}`,
      details: input.details ?? [],
    });
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `${input.subject} — Admin CyberSphere`,
        html,
        text,
      }).catch((error) => console.error(`[notif] envoi impossible à ${admin.email} :`, error));
    }
  } catch (error) {
    console.error("[notif] notification des admins impossible :", error);
  }
}
