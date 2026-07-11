import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getAdminSession } from "@/lib/session";
import { buttonClass, cardClass } from "@/components/ui";

export default async function AdminDashboardPage() {
  // Les auteurs n'ont pas de tableau de bord : direction leurs articles
  if (!(await getAdminSession())) redirect("/admin/articles");

  const [articleCount, publishedCount, submittedCount, commentCount, memberCount, pendingReports, viewsAgg, latestComments, latestArticles] =
    await Promise.all([
      db.article.count(),
      db.article.count({ where: { status: "PUBLISHED" } }),
      db.article.count({ where: { status: "SUBMITTED" } }),
      db.comment.count(),
      db.user.count(),
      db.commentReport.count({ where: { resolvedAt: null } }),
      db.article.aggregate({ _sum: { views: true } }),
      db.comment.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          author: { select: { name: true } },
          article: { select: { title: true, slug: true } },
        },
      }),
      db.article.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, updatedAt: true },
      }),
    ]);

  const stats: { label: string; value: number; hint?: string; href?: string }[] = [
    { label: "Articles", value: articleCount, hint: `dont ${publishedCount} publiés` },
    {
      label: "À valider",
      value: submittedCount,
      hint: "articles soumis par les auteurs",
      href: "/admin/articles",
    },
    { label: "Commentaires", value: commentCount },
    {
      label: "Signalements",
      value: pendingReports,
      hint: "en attente de modération",
      href: "/admin/signalements",
    },
    { label: "Membres", value: memberCount },
    { label: "Vues totales", value: viewsAgg._sum.views ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <Link href="/admin/articles/nouveau" className={buttonClass}>
          + Nouvel article
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const body = (
            <>
              <p className="text-sm text-muted">{stat.label}</p>
              <p className="mt-1 font-mono text-3xl font-bold text-accent">
                {stat.value}
              </p>
              {stat.hint && <p className="mt-1 text-xs text-muted">{stat.hint}</p>}
            </>
          );
          return stat.href ? (
            <Link
              key={stat.label}
              href={stat.href}
              className={`${cardClass} block p-5 transition-colors hover:border-accent`}
            >
              {body}
            </Link>
          ) : (
            <div key={stat.label} className={`${cardClass} p-5`}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">Derniers commentaires</h2>
          {latestComments.length === 0 ? (
            <p className="text-sm text-muted">Aucun commentaire.</p>
          ) : (
            <ul className="divide-y divide-border">
              {latestComments.map((comment) => (
                <li key={comment.id} className="space-y-1 py-3">
                  <p className="text-xs text-muted">
                    <span className="font-medium text-foreground">
                      {comment.author.name}
                    </span>{" "}
                    sur{" "}
                    <Link
                      href={`/articles/${comment.article.slug}`}
                      className="text-accent hover:underline"
                    >
                      {comment.article.title}
                    </Link>{" "}
                    · {formatDateTime(comment.createdAt)}
                  </p>
                  <p className="line-clamp-2 text-sm">{comment.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">Derniers articles modifiés</h2>
          {latestArticles.length === 0 ? (
            <p className="text-sm text-muted">Aucun article.</p>
          ) : (
            <ul className="divide-y divide-border">
              {latestArticles.map((article) => (
                <li key={article.id} className="flex items-center justify-between gap-3 py-3">
                  <Link
                    href={`/admin/articles/${article.id}`}
                    className="truncate text-sm font-medium hover:text-accent"
                  >
                    {article.title}
                  </Link>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
                      article.status === "PUBLISHED"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : article.status === "SUBMITTED"
                          ? "bg-sky-500/15 text-sky-500"
                          : "bg-amber-500/15 text-amber-500"
                    }`}
                  >
                    {article.status === "PUBLISHED"
                      ? "Publié"
                      : article.status === "SUBMITTED"
                        ? "À valider"
                        : "Brouillon"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
