import { db } from "./db";
import { sendEmail, newArticleEmail } from "./email";
import { localeHref, type Locale } from "./i18n";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
      });
    } catch (error) {
      console.error(`[newsletter] envoi impossible à ${subscriber.email} :`, error);
    }
  }
}
