import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { deleteArticle } from "@/actions/articles";
import { formatDateTime } from "@/lib/format";
import { ActionButton } from "@/components/admin/action-button";
import { buttonClass, buttonDangerClass, cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Articles" };

export default async function AdminArticlesPage() {
  const articles = await db.article.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      category: { select: { name: true } },
      _count: { select: { comments: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          Articles <span className="font-mono text-accent">({articles.length})</span>
        </h1>
        <Link href="/admin/articles/nouveau" className={buttonClass}>
          + Nouvel article
        </Link>
      </header>

      {articles.length === 0 ? (
        <p className="text-muted">Aucun article. Rédigez le premier !</p>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Titre</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Catégorie</th>
                <th className="px-4 py-3 font-medium">Modifié</th>
                <th className="px-4 py-3 text-right font-medium">Vues</th>
                <th className="px-4 py-3 text-right font-medium">Comm.</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {articles.map((article) => (
                <tr key={article.id}>
                  <td className="max-w-64 px-4 py-3">
                    <Link
                      href={`/admin/articles/${article.id}`}
                      className="line-clamp-1 font-medium hover:text-accent"
                    >
                      {article.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
                        article.status === "PUBLISHED"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-amber-500/15 text-amber-500"
                      }`}
                    >
                      {article.status === "PUBLISHED" ? "Publié" : "Brouillon"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{article.category.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDateTime(article.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{article.views}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {article._count.comments}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/articles/${article.slug}`}
                        className="text-xs font-medium text-muted hover:text-accent"
                      >
                        Voir
                      </Link>
                      <ActionButton
                        action={deleteArticle.bind(null, article.id)}
                        label="Supprimer"
                        pendingLabel="Suppression…"
                        confirmMessage={`Supprimer « ${article.title} » et ses commentaires ?`}
                        className={buttonDangerClass}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
