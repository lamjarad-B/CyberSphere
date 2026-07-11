import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Statistiques" };

const WINDOW_DAYS = 30;

export default async function AdminStatistiquesPage() {
  await requireAdmin();

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const [dailyTotals, topArticles, referrers, subscriberCount, reactionCount] =
    await Promise.all([
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
      db.newsletterSubscriber.count({ where: { confirmed: true } }),
      db.reaction.count(),
    ]);

  const totalViews = dailyTotals.reduce(
    (sum, day) => sum + (day._sum.views ?? 0),
    0,
  );

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
          {WINDOW_DAYS} derniers jours — compteurs anonymes, sans cookie ni
          tracker : aucune donnée personnelle n&apos;est collectée.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: `Vues (${WINDOW_DAYS} j)`, value: totalViews },
          { label: "Abonnés newsletter", value: subscriberCount },
          { label: "Réactions « utile »", value: reactionCount },
        ].map((item) => (
          <div key={item.label} className={`${cardClass} p-5`}>
            <p className="text-sm text-muted">{item.label}</p>
            <p className="mt-1 font-mono text-3xl font-bold text-accent">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${cardClass} overflow-x-auto`}>
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold">
            Articles les plus lus ({WINDOW_DAYS} j)
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
            Sites référents ({WINDOW_DAYS} j)
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
