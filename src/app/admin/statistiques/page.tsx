import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { geoipAvailable } from "@/lib/geoip";
import { subscriberCountsByLocale } from "@/lib/newsletter";
import { requireAdmin } from "@/lib/session";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Statistiques" };

const PERIODS = [7, 30, 90, 365] as const;
const DEFAULT_PERIOD = 30;
const DAY_MS = 24 * 3600 * 1000;

const countryNames = new Intl.DisplayNames(["fr"], { type: "region" });

/** Nom français d'un code pays ISO, le code lui-même s'il est inconnu. */
function countryName(code: string): string {
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Jour au format de l'URL (?jour=2026-11-10). */
function dayParam(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** Lien vers la page en gardant les réglages non par défaut. */
function statsHref(windowDays: number, day: string, today: string): string {
  const params = new URLSearchParams();
  if (windowDays !== DEFAULT_PERIOD) params.set("periode", String(windowDays));
  if (day !== today) params.set("jour", day);
  const query = params.toString();
  return query ? `/admin/statistiques?${query}` : "/admin/statistiques";
}

export default async function AdminStatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; jour?: string }>;
}) {
  await requireAdmin();
  const { periode, jour } = await searchParams;
  const requested = Number(periode);
  const windowDays = PERIODS.find((days) => days === requested) ?? DEFAULT_PERIOD;

  // Borne en UTC, comme les agrégats quotidiens (lib/stats)
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(today.getTime() - (windowDays - 1) * DAY_MS);

  // Jour affiché dans « Provenance » : aujourd'hui sauf date passée valide
  const requestedDay = /^\d{4}-\d{2}-\d{2}$/.test(jour ?? "") ? new Date(`${jour}T00:00:00Z`) : null;
  const day =
    requestedDay && !Number.isNaN(requestedDay.getTime()) && requestedDay < today
      ? requestedDay
      : today;
  const todayParam = dayParam(today);
  const previousDay = dayParam(new Date(day.getTime() - DAY_MS));
  const nextDay = day < today ? dayParam(new Date(day.getTime() + DAY_MS)) : null;

  const [
    dailyTotals,
    topArticles,
    referrers,
    subscribers,
    reactionCount,
    places,
    countries,
    todayVisitors,
    geoip,
  ] = await Promise.all([
      db.articleDailyView.groupBy({
        by: ["day"],
        where: { day: { gte: since } },
        _sum: { views: true },
        orderBy: { day: "desc" },
      }),
      db.articleDailyView.groupBy({
        by: ["articleId"],
        where: { day: { gte: since } },
        _sum: { views: true },
        orderBy: { _sum: { views: "desc" } },
        take: 10,
      }),
      db.referrerStat.groupBy({
        by: ["host"],
        where: { day: { gte: since } },
        _sum: { count: true },
        orderBy: { _sum: { count: "desc" } },
        take: 10,
      }),
      subscriberCountsByLocale(),
      db.reaction.count(),
      db.visitorLocationStat.findMany({
        where: { day },
        orderBy: [{ count: "desc" }, { country: "asc" }, { city: "asc" }],
      }),
      db.visitorLocationStat.groupBy({
        by: ["country"],
        where: { day: { gte: since } },
        _sum: { count: true },
        orderBy: { _sum: { count: "desc" } },
        take: 15,
      }),
      db.visitorLocationStat.aggregate({ where: { day: today }, _sum: { count: true } }),
      geoipAvailable(),
    ]);

  const totalViews = dailyTotals.reduce(
    (sum, day) => sum + (day._sum.views ?? 0),
    0,
  );
  const dayVisitors = places.reduce((sum, place) => sum + place.count, 0);
  const dayNavClass =
    "rounded-md border border-border px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent";

  const articles = await db.article.findMany({
    where: { id: { in: topArticles.map((item) => item.articleId) } },
    select: { id: true, title: true, slug: true },
  });
  const articleById = new Map(articles.map((article) => [article.id, article]));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Statistiques</h1>
        <p className="mt-2 text-sm text-muted">
          {windowDays} derniers jours — compteurs anonymes, sans cookie ni
          tracker : aucune donnée personnelle n&apos;est collectée.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Période">
          {PERIODS.map((days) => (
            <Link
              key={days}
              href={statsHref(days, dayParam(day), todayParam)}
              aria-current={days === windowDays ? "page" : undefined}
              className={`rounded-md border px-3 py-1 font-mono text-xs transition-colors ${
                days === windowDays
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {days} j
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Visiteurs aujourd'hui", value: todayVisitors._sum.count ?? 0 },
          { label: `Vues (${windowDays} j)`, value: totalViews },
          {
            label: "Abonnés newsletter",
            value: subscribers.fr + subscribers.en,
            detail: `${subscribers.fr} FR · ${subscribers.en} EN`,
          },
          { label: "Réactions « utile »", value: reactionCount },
        ].map((item) => (
          <div key={item.label} className={`${cardClass} p-5`}>
            <p className="text-sm text-muted">{item.label}</p>
            <p className="mt-1 font-mono text-3xl font-bold text-accent">
              {item.value}
            </p>
            {"detail" in item && <p className="mt-1 text-xs text-muted">{item.detail}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${cardClass} overflow-x-auto`}>
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold">
            Articles les plus lus ({windowDays} j)
          </h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {topArticles.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted">
                    Pas encore de vues sur la période.
                  </td>
                </tr>
              )}
              {topArticles.map((item) => {
                const article = articleById.get(item.articleId);
                if (!article) return null;
                return (
                  <tr key={item.articleId}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/articles/${article.slug}`}
                        className="line-clamp-1 hover:text-accent"
                      >
                        {article.title}
                      </Link>
                    </td>
                    <td className="w-20 px-4 py-2.5 text-right font-mono text-accent">
                      {item._sum.views ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className={`${cardClass} overflow-x-auto`}>
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold">
            Sites référents ({windowDays} j)
          </h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {referrers.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted">
                    Aucun référent externe sur la période.
                  </td>
                </tr>
              )}
              {referrers.map((item) => (
                <tr key={item.host}>
                  <td className="px-4 py-2.5 font-mono text-xs">{item.host}</td>
                  <td className="w-20 px-4 py-2.5 text-right font-mono text-accent">
                    {item._sum.count ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold">Provenance des visiteurs</h2>
        {!geoip && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            Base de géolocalisation absente : la provenance n&apos;est pas
            comptée. En local, la télécharger avec{" "}
            <code className="font-mono text-xs">npm run geoip</code> puis
            redémarrer le serveur.
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className={`${cardClass} overflow-x-auto`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="text-sm font-bold">
                {day.getTime() === today.getTime() ? "Aujourd'hui" : formatDate(day)}
                <span className="ml-2 font-mono font-normal text-accent">
                  {dayVisitors} visiteur{dayVisitors > 1 ? "s" : ""}
                </span>
              </h3>
              <nav className="flex gap-2" aria-label="Jour affiché">
                <Link href={statsHref(windowDays, previousDay, todayParam)} className={dayNavClass}>
                  ← Veille
                </Link>
                {nextDay && (
                  <Link href={statsHref(windowDays, nextDay, todayParam)} className={dayNavClass}>
                    Lendemain →
                  </Link>
                )}
                {nextDay && nextDay !== todayParam && (
                  <Link href={statsHref(windowDays, todayParam, todayParam)} className={dayNavClass}>
                    Aujourd&apos;hui
                  </Link>
                )}
              </nav>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {places.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted">
                      Aucun visiteur ce jour-là.
                    </td>
                  </tr>
                )}
                {places.map((place) => (
                  <tr key={place.id}>
                    <td className="px-4 py-2.5">
                      {place.country ? (
                        <>
                          <span className="font-medium">{place.city || "Ville inconnue"}</span>
                          <span className="block text-xs text-muted">
                            {[place.region, countryName(place.country)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">Lieu inconnu</span>
                      )}
                    </td>
                    <td className="w-20 px-4 py-2.5 text-right font-mono text-accent">
                      {place.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={`${cardClass} overflow-x-auto`}>
            <h3 className="border-b border-border px-4 py-3 text-sm font-bold">
              Pays ({windowDays} j)
            </h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {countries.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted">
                      Aucun visiteur sur la période.
                    </td>
                  </tr>
                )}
                {countries.map((item) => (
                  <tr key={item.country}>
                    <td className="px-4 py-2.5">
                      {item.country ? countryName(item.country) : (
                        <span className="text-muted">Lieu inconnu</span>
                      )}
                    </td>
                    <td className="w-20 px-4 py-2.5 text-right font-mono text-accent">
                      {item._sum.count ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
        <p className="text-xs text-muted">
          Un visiteur compte une fois par jour (UTC). L&apos;adresse IP est
          seulement lue en mémoire pour trouver la ville, puis oubliée. La
          ville est indicative : les opérateurs mobiles et les VPN placent
          souvent leurs abonnés dans une grande ville. Géolocalisation IP :{" "}
          <a
            href="https://db-ip.com"
            className="underline hover:text-accent"
            rel="noopener noreferrer"
            target="_blank"
          >
            DB-IP
          </a>{" "}
          (licence CC BY 4.0).
        </p>
      </div>

      <section className={`${cardClass} overflow-x-auto`}>
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold">
          Vues par jour
        </h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {dailyTotals.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-muted">
                  Pas encore de données quotidiennes.
                </td>
              </tr>
            )}
            {dailyTotals.map((day) => (
              <tr key={day.day.toISOString()}>
                <td className="px-4 py-2 text-muted">{formatDate(day.day)}</td>
                <td className="w-20 px-4 py-2 text-right font-mono text-accent">
                  {day._sum.views ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
