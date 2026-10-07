import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { deleteComment } from "@/actions/comments";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { ActionButton } from "@/components/admin/action-button";
import { pageNumber } from "@/lib/articles";
import { Pagination } from "@/components/pagination";
import { buttonDangerClass, cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Commentaires" };

const PAGE_SIZE = 50;

export default async function AdminCommentairesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const page = pageNumber((await searchParams).page);
  const [comments, total] = await Promise.all([
    db.comment.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        author: { select: { name: true, email: true } },
        article: { select: { title: true, slug: true } },
      },
    }),
    db.comment.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Commentaires <span className="font-mono text-accent">({total})</span>
      </h1>

      {comments.length === 0 ? (
        <p className="text-muted">Aucun commentaire.</p>
      ) : (
        <div className={cardClass}>
          <ul className="divide-y divide-border">
            {comments.map((comment) => (
              <li key={comment.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">
                    <span className="font-medium text-foreground">
                      {comment.author.name}
                    </span>{" "}
                    <span className="font-mono">({comment.author.email})</span> sur{" "}
                    <Link
                      href={`/articles/${comment.article.slug}`}
                      className="text-accent hover:underline"
                    >
                      {comment.article.title}
                    </Link>{" "}
                    · {formatDateTime(comment.createdAt)}
                    {comment.parentId && " · réponse"}
                  </p>
                  <ActionButton
                    action={deleteComment.bind(null, comment.id)}
                    label="Supprimer"
                    pendingLabel="Suppression…"
                    confirmMessage="Supprimer ce commentaire (et ses réponses) ?"
                    className={buttonDangerClass}
                  />
                </div>
                <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => `/admin/commentaires?page=${p}`}
      />
    </div>
  );
}
