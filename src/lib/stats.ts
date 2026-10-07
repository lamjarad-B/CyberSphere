import { headers } from "next/headers";
import { db } from "./db";
import { rateLimit } from "./rate-limit";
import { SITE_URL } from "./site";

const DAY_MS = 24 * 3600 * 1000;

/**
 * Plafonds des référents : l'en-tête Referer est fourni par le client et
 * chaque hôte inédit crée une ligne. Sans borne, un script anonyme pourrait
 * créer des millions de lignes (base qui gonfle, statistiques noyées).
 */
const MAX_REFERRER_HOSTS_PER_DAY = 500;
/** Hôtes inédits qu'un même visiteur peut introduire par jour. */
const MAX_NEW_HOSTS_PER_VISITOR = 5;

/** Nom d'hôte DNS ou IPv4, port éventuel — rien d'autre n'est enregistré. */
const HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/;

/** Jour courant en UTC (borne des agrégats quotidiens). */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Comptabilise une vue d'article : compteur global + agrégat quotidien +
 * référent externe éventuel. Aucune donnée personnelle enregistrée : ni IP,
 * ni cookie, ni identifiant de visiteur — uniquement des compteurs. L'IP
 * (`visitor`) ne sert qu'au limiteur en mémoire des référents.
 * Référent et IP sont passés en paramètre : conçu pour tourner dans
 * `after()`, où les API de requête (headers) ne sont plus accessibles.
 */
export async function recordArticleView(
  articleId: string,
  referrerHost: string | null,
  visitor: string | null,
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

  if (referrerHost) jobs.push(recordReferrer(referrerHost, day, visitor));

  await Promise.all(jobs);
}

/**
 * Un hôte déjà vu aujourd'hui est simplement incrémenté ; un hôte inédit
 * n'est créé que dans la limite des plafonds (par visiteur, et par jour).
 */
async function recordReferrer(host: string, day: Date, visitor: string | null): Promise<void> {
  const { count } = await db.referrerStat.updateMany({
    where: { host, day },
    data: { count: { increment: 1 } },
  });
  if (count > 0) return;

  if (!rateLimit(`referent:${visitor ?? "inconnu"}`, MAX_NEW_HOSTS_PER_VISITOR, DAY_MS)) return;
  if ((await db.referrerStat.count({ where: { day } })) >= MAX_REFERRER_HOSTS_PER_DAY) return;

  // upsert : deux premières visites simultanées depuis le même hôte
  await db.referrerStat.upsert({
    where: { host_day: { host, day } },
    create: { host, day, count: 1 },
    update: { count: { increment: 1 } },
  });
}

/**
 * Hôte d'un en-tête Referer s'il désigne un site externe, sinon null. Les
 * valeurs trop longues ou hors format d'hôte sont ignorées (pas tronquées).
 */
export function referrerHostFrom(referer: string | null, ownHost: string): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).host.toLowerCase();
    if (!host || host === ownHost || host.length > 100 || !HOST_PATTERN.test(host)) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

/**
 * Hôte du référent si la visite vient d'un site externe, sinon null.
 * À appeler pendant le rendu (accès aux en-têtes de la requête).
 */
export async function externalReferrerHost(): Promise<string | null> {
  const referer = (await headers()).get("referer");
  return referrerHostFrom(referer, new URL(SITE_URL).host.toLowerCase());
}
