import { headers } from "next/headers";
import { db } from "./db";
import { ipBucket, rateLimit } from "./rate-limit";
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

/**
 * Robots d'indexation, aperçus de liens et clients HTTP : ils rendent la page
 * sans que personne ne la lise. « bot » hors « Cubot », marque de téléphones.
 */
const BOT_PATTERN =
  /(?<!cu)bot|crawl|spider|slurp|scrape|preview|fetch|headless|lighthouse|facebookexternalhit|whatsapp|embedly|iframely|curl|wget|python|httpclient|axios|okhttp|go-http|java\//i;

/** Jour courant en UTC (borne des agrégats quotidiens). */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Comptabilise une vue d'article : compteur global + agrégat quotidien +
 * référent externe éventuel. Une vue par visiteur et par article sur 24 h :
 * actualiser la page ou y revenir ne la compte pas de nouveau. Aucune donnée
 * personnelle enregistrée : ni IP, ni cookie, ni identifiant de visiteur —
 * uniquement des compteurs. L'IP (`visitor`) ne sert qu'aux limiteurs en
 * mémoire (vues déjà comptées, référents), oubliés au redémarrage.
 * Référent et IP sont passés en paramètre : conçu pour tourner dans
 * `after()`, où les API de requête (headers) ne sont plus accessibles.
 */
export async function recordArticleView(
  articleId: string,
  referrerHost: string | null,
  visitor: string | null,
): Promise<void> {
  // IPv6 ramenée au /64 : une même box change d'adresse dans son préfixe.
  // IP inconnue : la vue compte, sinon ces visiteurs n'en feraient qu'une.
  if (visitor && !rateLimit(`vue:${articleId}:${ipBucket(visitor)}`, 1, DAY_MS)) return;

  const day = today();

  const jobs: Promise<unknown>[] = [
    // En SQL brut : via le client Prisma, @updatedAt ferait de chaque vue une
    // modification de l'article (lastmod du sitemap, dateModified du JSON-LD)
    db.$executeRaw`UPDATE "Article" SET "views" = "views" + 1 WHERE "id" = ${articleId}`,
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

/** Vrai pour un robot ou un script : sans user-agent, ce n'est pas un navigateur. */
export function isBotUserAgent(userAgent: string | null): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

/** Vrai si la requête vient d'un robot. À appeler pendant le rendu. */
export async function isBotRequest(): Promise<boolean> {
  return isBotUserAgent((await headers()).get("user-agent"));
}
