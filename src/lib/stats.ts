import { headers } from "next/headers";
import { db } from "./db";

/** Jour courant en UTC (borne des agrégats quotidiens). */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Comptabilise une vue d'article : compteur global + agrégat quotidien +
 * référent externe éventuel. Aucune donnée personnelle : ni IP, ni cookie,
 * ni identifiant de visiteur — uniquement des compteurs.
 * Le référent est passé en paramètre : conçu pour tourner dans `after()`,
 * où les API de requête (headers) ne sont plus accessibles.
 */
export async function recordArticleView(
  articleId: string,
  referrerHost: string | null,
): Promise<void> {
  const day = today();

  const jobs: Promise<unknown>[] = [
    db.article.update({
      where: { id: articleId },
      data: { views: { increment: 1 } },
    }),
    db.articleDailyView.upsert({
      where: { articleId_day: { articleId, day } },
      create: { articleId, day, views: 1 },
      update: { views: { increment: 1 } },
    }),
  ];

  if (referrerHost) {
    jobs.push(
      db.referrerStat.upsert({
        where: { host_day: { host: referrerHost, day } },
        create: { host: referrerHost, day, count: 1 },
        update: { count: { increment: 1 } },
      }),
    );
  }

  await Promise.all(jobs);
}

/**
 * Hôte du référent si la visite vient d'un site externe, sinon null.
 * À appeler pendant le rendu (accès aux en-têtes de la requête).
 */
export async function externalReferrerHost(): Promise<string | null> {
  const referer = (await headers()).get("referer");
  if (!referer) return null;
  try {
    const host = new URL(referer).host.toLowerCase().slice(0, 100);
    const ownHost = new URL(
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    ).host.toLowerCase();
    return host && host !== ownHost ? host : null;
  } catch {
    return null;
  }
}
