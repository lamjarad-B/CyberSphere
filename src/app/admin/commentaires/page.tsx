import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { deleteComment, hideComment, showComment } from "@/actions/comments";
import { commentAuthorName } from "@/lib/comments";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { ActionButton } from "@/components/admin/action-button";
import { CommentCheckbox, CommentSelection } from "@/components/admin/comment-selection";
import { pageNumber } from "@/lib/articles";
import { Pagination } from "@/components/pagination";
import { buttonDangerClass, buttonGhostClass, cardClass } from "@/components/ui";

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
  // Paramètre d'URL non fiable : toute autre valeur retombe sur les commentaires publiés
  const hidden = params.statut === "masques";
  const [comments, publishedCount, hiddenCount] = await Promise.all([
    db.comment.findMany({
      where: { status: hidden ? "HIDDEN" : "APPROVED" },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        author: { select: { name: true, email: true } },
        article: { select: { title: true, slug: true } },
      },
    }),
    db.comment.count({ where: { status: "APPROVED" } }),
    db.comment.count({ where: { status: "HIDDEN" } }),
  ]);
  const total = hidden ? hiddenCount : publishedCount;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = [
    { href: "/admin/commentaires", label: "Publiés", count: publishedCount, active: !hidden },
    {
      href: "/admin/commentaires?statut=masques",
      label: "Masqués",
      count: hiddenCount,
      active: hidden,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Commentaires</h1>

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
          {hidden ? "Aucun commentaire masqué." : "Aucun commentaire publié."}
        </p>
      ) : (
        <CommentSelection ids={comments.map((comment) => comment.id)}>
          <div className={cardClass}>
            <ul className="divide-y divide-border">
              {comments.map((comment) => {
                const email = comment.author?.email ?? comment.guestEmail;
                const authorName = commentAuthorName(comment);
                return (
                  <li key={comment.id} className="flex items-start gap-3 px-5 py-4">
                    <CommentCheckbox
                      id={comment.id}
                      label={`Sélectionner le commentaire de ${authorName}`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted">
                          <span className="font-medium text-foreground">{authorName}</span>{" "}
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
                            <span className="font-mono">
                              {" "}
                              · IP #{comment.guestIpHash.slice(0, 8)}
                            </span>
                          )}
                          {comment.newsletterOptIn && " · newsletter demandée"}
                        </p>
                        <div className="flex gap-2">
                          {hidden ? (
                            <ActionButton
                              action={showComment.bind(null, comment.id)}
                              label="Réafficher"
                              pendingLabel="Réaffichage…"
                              className={buttonGhostClass}
                            />
                          ) : (
                            <ActionButton
                              action={hideComment.bind(null, comment.id)}
                              label="Masquer"
                              pendingLabel="Masquage…"
                              className={buttonGhostClass}
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </CommentSelection>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => `/admin/commentaires?statut=${hidden ? "masques" : "publies"}&page=${p}`}
      />
    </div>
  );
}
