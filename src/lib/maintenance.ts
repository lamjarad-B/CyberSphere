import { db } from "./db";
import { logAudit } from "./audit";
import { toLocale } from "./i18n";
import { dispatchArticleToSubscribers, subscribeCommenter } from "./newsletter";

const DAY_MS = 24 * 3600 * 1000;

/** Délai de confirmation d'une inscription newsletter avant purge (double opt-in). */
const UNCONFIRMED_NEWSLETTER_DAYS = 7;

/** Empreinte d'IP d'un invité : utile aux quotas et à la modération, pas au-delà. */
const GUEST_IP_HASH_DAYS = 30;

/** Délai avant d'abonner un invité : de quoi retirer un commentaire abusif. */
const COMMENT_SUBSCRIBE_DELAY_MS = DAY_MS;

/** Durée de conservation du journal d'audit (jours), réglable par AUDIT_RETENTION_DAYS. */
function auditRetentionDays(): number {
  const days = Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? "", 10);
  return Number.isFinite(days) && days >= 30 ? days : 365;
}

/**
 * Met en ligne les articles programmés dont l'heure est venue, puis prévient
 * les abonnés. La bascule SCHEDULED → PUBLISHED est conditionnelle : si deux
 * instances tournent, une seule la réalise et une seule newsletter part.
 */
export async function publishDueArticles(now = new Date()): Promise<number> {
  const due = await db.article.findMany({
    where: { status: "SCHEDULED", publishedAt: { lte: now } },
    select: { id: true, title: true },
  });

  let published = 0;
  for (const article of due) {
    const { count } = await db.article.updateMany({
      where: { id: article.id, status: "SCHEDULED" },
      data: { status: "PUBLISHED" },
    });
    if (count !== 1) continue;
    published++;
    await logAudit({
      action: "article.publication_programmee",
      targetType: "article",
      targetId: article.id,
      detail: article.title,
    });
    await dispatchArticleToSubscribers(article.id).catch((error) => {
      console.error("[programmation] newsletter non envoyée :", error);
    });
  }
  return published;
}

/**
 * Abonne les invités qui ont coché la newsletter et dont le commentaire est
 * resté en ligne 24 h. L'adresse saisie n'est pas vérifiée et peut être celle
 * d'un tiers : supprimer ou masquer le commentaire à temps annule l'inscription.
 */
export async function subscribeCommenters(now = new Date()): Promise<number> {
  const due = await db.comment.findMany({
    where: {
      status: "APPROVED",
      newsletterOptIn: true,
      guestEmail: { not: null },
      createdAt: { lt: new Date(now.getTime() - COMMENT_SUBSCRIBE_DELAY_MS) },
    },
    select: { id: true, guestEmail: true, guestLocale: true },
  });

  let subscribed = 0;
  for (const comment of due) {
    if (!comment.guestEmail) continue;
    try {
      await subscribeCommenter(comment.guestEmail, toLocale(comment.guestLocale ?? ""));
      await db.comment.update({
        where: { id: comment.id },
        data: { newsletterOptIn: false, guestLocale: null },
      });
      subscribed++;
    } catch (error) {
      console.error(`[commentaires] abonnement impossible (commentaire ${comment.id}) :`, error);
    }
  }
  return subscribed;
}

/**
 * Purge des données devenues inutiles (minimisation RGPD) : sessions et
 * jetons expirés, inscriptions newsletter jamais confirmées, empreintes d'IP
 * anciennes, défis ALTCHA expirés, entrées anciennes du journal d'audit. Traite
 * aussi les abonnements différés.
 */
export async function purgeStaleData(now = new Date()) {
  const commenters = await subscribeCommenters(now);
  const [sessions, verifications, newsletter, ipHashes, captchaChallenges, audit] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.newsletterSubscriber.deleteMany({
      where: {
        confirmed: false,
        createdAt: { lt: new Date(now.getTime() - UNCONFIRMED_NEWSLETTER_DAYS * DAY_MS) },
      },
    }),
    db.comment.updateMany({
      where: {
        guestIpHash: { not: null },
        createdAt: { lt: new Date(now.getTime() - GUEST_IP_HASH_DAYS * DAY_MS) },
      },
      data: { guestIpHash: null },
    }),
    db.usedCaptchaChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - auditRetentionDays() * DAY_MS) } },
    }),
  ]);
  return {
    sessions: sessions.count,
    verifications: verifications.count,
    newsletter: newsletter.count,
    commenters,
    ipHashes: ipHashes.count,
    captchaChallenges: captchaChallenges.count,
    audit: audit.count,
  };
}
