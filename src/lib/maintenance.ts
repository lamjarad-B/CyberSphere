import { db } from "./db";
import { logAudit } from "./audit";
import { dispatchArticleToSubscribers } from "./newsletter";

const DAY_MS = 24 * 3600 * 1000;

/** Délai de confirmation d'une inscription newsletter avant purge (double opt-in). */
const UNCONFIRMED_NEWSLETTER_DAYS = 7;

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
 * Purge des données devenues inutiles (minimisation RGPD) : sessions et
 * jetons expirés, inscriptions newsletter jamais confirmées, entrées
 * anciennes du journal d'audit.
 */
export async function purgeStaleData(now = new Date()) {
  const [sessions, verifications, newsletter, audit] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.newsletterSubscriber.deleteMany({
      where: {
        confirmed: false,
        createdAt: { lt: new Date(now.getTime() - UNCONFIRMED_NEWSLETTER_DAYS * DAY_MS) },
      },
    }),
    db.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - auditRetentionDays() * DAY_MS) } },
    }),
  ]);
  return {
    sessions: sessions.count,
    verifications: verifications.count,
    newsletter: newsletter.count,
    audit: audit.count,
  };
}
