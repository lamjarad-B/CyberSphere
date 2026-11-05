import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { approveComment, deleteComment, deletePendingComments } from "@/actions/comments";
import { commentAuthorName } from "@/lib/comments";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { ActionButton } from "@/components/admin/action-button";
import { pageNumber } from "@/lib/articles";
import { Pagination } from "@/components/pagination";
import { buttonClass, buttonDangerClass, cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Commentaires" };

const PAGE_SIZE = 50;

export default async function AdminCommentairesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; statut?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = pageNumber(params.page);
  // Paramètre d'URL non fiable : toute autre valeur retombe sur la file d'attente
  const published = params.statut === "publies";
  const [comments, pendingCount, publishedCount] = await Promise.all([
    db.comment.findMany({
      where: { status: published ? "APPROVED" : "PENDING" },
      // La file se traite des plus anciens aux plus récents
      orderBy: { createdAt: published ? "desc" : "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        author: { select: { name: true, email: true } },
        article: { select: { title: true, slug: true } },
      },
    }),
    db.comment.count({ where: { status: "PENDING" } }),
    db.comment.count({ where: { status: "APPROVED" } }),
  ]);
  const total = published ? publishedCount : pendingCount;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = [
    { href: "/admin/commentaires", label: "En attente", count: pendingCount, active: !published },
    {
      href: "/admin/commentaires?statut=publies",
      label: "Publiés",
      count: publishedCount,
      active: published,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Commentaires</h1>
        {!published && pendingCount > 0 && (
          <ActionButton
            action={deletePendingComments}
            label="Tout supprimer"
            pendingLabel="Suppression…"
            confirmMessage={`Supprimer définitivement ${
              pendingCount > 1
                ? `les ${pendingCount} commentaires en attente`
                : "le commentaire en attente"
            } ?`}
            className={buttonDangerClass}
          />
        )}
      </header>

      <nav className="flex gap-1" aria-label="Filtrer les commentaires">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab.active
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-accent/10 hover:text-foreground"
            }`}
          >
            {tab.label} <span className="font-mono">({tab.count})</span>
          </Link>
        ))}
      </nav>

      {comments.length === 0 ? (
        <p className="text-muted">
          {published ? "Aucun commentaire publié." : "Aucun commentaire en attente de modération."}
        </p>
      ) : (
        <div className={cardClass}>
          <ul className="divide-y divide-border">
            {comments.map((comment) => {
              const email = comment.author?.email ?? comment.guestEmail;
              return (
                <li key={comment.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">
                      <span className="font-medium text-foreground">
                        {commentAuthorName(comment)}
                      </span>{" "}
                      {!comment.authorId && (
                        <>
                          <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
                            Invité
                          </span>{" "}
                        </>
                      )}
                      {email && (
                        <>
                          <span className="font-mono">({email})</span>{" "}
                        </>
                      )}
                      sur{" "}
                      <Link
                        href={`/articles/${comment.article.slug}`}
                        className="text-accent underline"
                      >
                        {comment.article.title}
                      </Link>{" "}
                      · {formatDateTime(comment.createdAt)}
                      {comment.parentId && " · réponse"}
                      {comment.guestIpHash && (
                        // Repère de même source : une empreinte, pas une adresse IP
                        <span className="font-mono"> · IP #{comment.guestIpHash.slice(0, 8)}</span>
                      )}
                      {comment.newsletterOptIn && " · newsletter demandée"}
                    </p>
                    <div className="flex gap-2">
                      {!published && (
                        <ActionButton
                          action={approveComment.bind(null, comment.id)}
                          label="Approuver"
                          pendingLabel="Approbation…"
                          className={buttonClass}
                        />
                      )}
                      <ActionButton
                        action={deleteComment.bind(null, comment.id)}
                        label="Supprimer"
                        pendingLabel="Suppression…"
                        confirmMessage="Supprimer ce commentaire (et ses réponses) ?"
                        className={buttonDangerClass}
                      />
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) =>
          `/admin/commentaires?statut=${published ? "publies" : "attente"}&page=${p}`
        }
      />
    </div>
  );
}
