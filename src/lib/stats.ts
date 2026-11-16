import { headers } from "next/headers";
import { db } from "./db";
import { locateIp } from "./geoip";
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

/**
 * Lieux distincts par jour : au-delà, une visite ne compte plus que pour son
 * pays. Borne les lignes créées par un réseau de machines aux IP variées.
 */
const MAX_LOCATIONS_PER_DAY = 1000;

/** Nom d'hôte DNS ou IPv4, port éventuel — rien d'autre n'est enregistré. */
const HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/;

/**
 * Un navigateur s'annonce toujours « Mozilla/5.0 (plateforme… » (Opera Mini :
 * « Opera/9.80 (… »). Tout autre user-agent est celui d'un programme : curl,
 * script, bibliothèque HTTP, scanner, lecteur de flux, aperçu de lien.
 */
const BROWSER_PATTERN = /^(Mozilla\/5\.0|Opera\/[\d.]+) \(/;

/**
 * Robots et outils qui prennent la forme d'un navigateur : ils rendent la page
 * sans que personne ne la lise. « compatible; » n'est plus envoyé par aucun
 * navigateur depuis Internet Explorer 10, et aucun ne cite d'URL : ce sont les
 * marques des robots déclarés. « bot » hors « Cubot », marque de téléphones.
 */
const BOT_PATTERN =
  /compatible;|https?:\/\/|(?<!cu)bot|crawl|spider|slurp|scrap|preview|fetch|headless|phantomjs|lighthouse|powershell|ptst|pingdom|synthetic/i;

/** Raison pour laquelle une requête est écartée des statistiques. */
export type BotKind = "robot" | "programme" | "absent";

/**
 * Requêtes écartées en attente d'écriture (« jour|type » → nombre). Comptées
 * en mémoire puis écrites chaque minute par la tâche de fond (lib/scheduler) :
 * un robot qui enchaîne des milliers de pages ne coûte pas une écriture en
 * base par page. Sur globalThis : la tâche de fond, lancée par
 * instrumentation.ts, n'utilise pas forcément la même copie de ce module que
 * le rendu des pages. Un redémarrage perd au plus la dernière minute.
 */
const globalForBotHits = globalThis as unknown as { cybersphereBotHits?: Map<string, number> };
const pendingBotHits = (globalForBotHits.cybersphereBotHits ??= new Map<string, number>());

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
 * Comptabilise un visiteur du jour (UTC) par pays, région et ville, une seule
 * fois par visiteur et par jour. L'IP n'est lue qu'en mémoire, dans la base
 * de géolocalisation locale (lib/geoip) : ni écrite ni transmise. Rien n'est
 * compté sans IP ou sans base ; une IP absente de la base (réseau privé)
 * compte comme lieu inconnu. Comme recordArticleView, conçu pour `after()`.
 */
export async function recordVisit(visitor: string | null): Promise<void> {
  if (!visitor) return;
  const day = today();
  // Jour dans la clé : un visiteur de 23 h revenu le lendemain compte deux fois
  if (!rateLimit(`visite:${day.toISOString()}:${ipBucket(visitor)}`, 1, DAY_MS)) return;

  const location = await locateIp(visitor);
  if (!location) return;

  const { count } = await db.visitorLocationStat.updateMany({
    where: { day, ...location },
    data: { count: { increment: 1 } },
  });
  if (count > 0) return;

  const place =
    (await db.visitorLocationStat.count({ where: { day } })) < MAX_LOCATIONS_PER_DAY
      ? location
      : { country: location.country, region: "", city: "" };
  // upsert : deux premiers visiteurs simultanés depuis le même lieu
  await db.visitorLocationStat.upsert({
    where: { day_country_region_city: { day, ...place } },
    create: { day, ...place, count: 1 },
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

/**
 * Type de robot d'un user-agent, null pour un navigateur : absent, qui porte la
 * marque d'un robot, ou qui n'a pas la forme de celui d'un navigateur. Un
 * programme qui recopie le user-agent d'un navigateur reste indétectable par
 * ce seul en-tête.
 */
export function botKind(userAgent: string | null): BotKind | null {
  if (!userAgent) return "absent";
  if (BOT_PATTERN.test(userAgent)) return "robot";
  if (!BROWSER_PATTERN.test(userAgent)) return "programme";
  return null;
}

/** Vrai pour un robot ou un programme (voir botKind). */
export function isBotUserAgent(userAgent: string | null): boolean {
  return botKind(userAgent) !== null;
}

/** Type de robot de la requête, null pour un navigateur. À appeler pendant le rendu. */
export async function requestBotKind(): Promise<BotKind | null> {
  return botKind((await headers()).get("user-agent"));
}

/** Vrai si la requête vient d'un robot. À appeler pendant le rendu. */
export async function isBotRequest(): Promise<boolean> {
  return (await requestBotKind()) !== null;
}

/** Compte une requête écartée par le filtre de user-agent (écrite par flushBotHits). */
export function recordBotHit(kind: BotKind): void {
  const key = `${today().toISOString()}|${kind}`;
  pendingBotHits.set(key, (pendingBotHits.get(key) ?? 0) + 1);
}

/**
 * Écrit en base les requêtes écartées depuis le passage précédent. Un compteur
 * dont l'écriture échoue est remis en attente pour le passage suivant.
 */
export async function flushBotHits(): Promise<void> {
  const batch = [...pendingBotHits];
  pendingBotHits.clear();
  await Promise.all(
    batch.map(async ([key, count]) => {
      const [isoDay, kind] = key.split("|");
      const day = new Date(isoDay);
      try {
        await db.botHitStat.upsert({
          where: { day_kind: { day, kind } },
          create: { day, kind, count },
          update: { count: { increment: count } },
        });
      } catch (error) {
        pendingBotHits.set(key, (pendingBotHits.get(key) ?? 0) + count);
        throw error;
      }
    }),
  );
}
