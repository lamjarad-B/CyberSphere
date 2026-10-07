import { db } from "./db";
import { sendEmail, newArticleEmail } from "./email";
import { localeHref, type Locale } from "./i18n";

import { SITE_URL as BASE_URL } from "@/lib/site";

/*
 * Confirmation et désinscription par jeton : volontairement hors du fichier
 * "use server" (actions/newsletter.ts). Toute fonction exportée d'un tel
 * fichier devient une Server Action publique dont les arguments arrivent
 * désérialisés depuis la requête — un objet { not: "" } passé comme jeton
 * deviendrait un filtre Prisma et viderait toute la liste.
 */

/** Jeton d'abonné reçu de l'extérieur : une chaîne non vide, jamais un objet. */
function isToken(token: unknown): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= 128;
}

/** Confirme une inscription via le jeton reçu par e-mail. */
export async function confirmNewsletter(token: unknown): Promise<boolean> {
  if (!isToken(token)) return false;
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
export async function unsubscribeNewsletter(token: unknown): Promise<boolean> {
  if (!isToken(token)) return false;
  const { count } = await db.newsletterSubscriber.deleteMany({ where: { token } });
  return count > 0;
}

/**
 * Envoie l'e-mail « nouvel article » à tous les abonnés confirmés, chacun
 * dans sa langue (celle du site au moment de son inscription). Les abonnés
 * anglophones reçoivent la traduction si elle existe, sinon l'original.
 * Conçu pour être appelé via `after()` (hors du chemin de réponse) :
 * les échecs individuels sont journalisés sans interrompre l'envoi.
 */
export async function dispatchArticleToSubscribers(articleId: string): Promise<void> {
  const article = await db.article.findUnique({
    where: { id: articleId },
    select: {
      title: true,
      excerpt: true,
      slug: true,
      status: true,
      translations: {
        where: { locale: "en" },
        select: { title: true, excerpt: true },
      },
    },
  });
  if (!article || article.status !== "PUBLISHED") return;

  const subscribers = await db.newsletterSubscriber.findMany({
    where: { confirmed: true },
    select: { email: true, token: true, locale: true },
  });
  if (subscribers.length === 0) return;

  const en = article.translations[0];

  for (const subscriber of subscribers) {
    const locale: Locale = subscriber.locale === "en" ? "en" : "fr";
    const title = locale === "en" && en ? en.title : article.title;
    const excerpt = locale === "en" && en ? en.excerpt : article.excerpt;
    const { html, text } = newArticleEmail({
      title,
      excerpt,
      url: `${BASE_URL}${localeHref(locale, `/articles/${article.slug}`)}`,
      unsubscribeUrl: `${BASE_URL}${localeHref(
        locale,
        `/newsletter/desinscription?jeton=${subscriber.token}`,
      )}`,
      locale,
    });
    try {
      await sendEmail({
        to: subscriber.email,
        subject:
          locale === "en"
            ? `New article: ${title} — CyberSphere`
            : `Nouvel article : ${title} — CyberSphere`,
        html,
        text,
        // Désabonnement en un clic (RFC 8058), exigé par Gmail/Yahoo pour
        // les envois groupés : le client mail affiche un bouton natif.
        headers: {
          "List-Unsubscribe": `<${BASE_URL}/api/newsletter/desinscription?jeton=${subscriber.token}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    } catch (error) {
      console.error(`[newsletter] envoi impossible à ${subscriber.email} :`, error);
    }
  }
}
