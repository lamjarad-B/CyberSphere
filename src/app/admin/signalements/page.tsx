import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { deleteComment } from "@/actions/comments";
import { dismissReport } from "@/actions/reports";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { ActionButton } from "@/components/admin/action-button";
import { buttonDangerClass, buttonGhostClass, cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Signalements" };

export default async function AdminSignalementsPage() {
  await requireAdmin();

  const reports = await db.commentReport.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      reporter: { select: { name: true } },
      comment: {
        select: {
          id: true,
          content: true,
          author: { select: { name: true } },
          article: { select: { title: true, slug: true } },
          _count: { select: { reports: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Signalements{" "}
        <span className="font-mono text-accent">({reports.length})</span>
      </h1>

      {reports.length === 0 ? (
        <p className="text-muted">
          Aucun signalement en attente. La communauté se tient bien !
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li key={report.id} className={`${cardClass} space-y-3 p-5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
                <p>
                  Signalé par{" "}
                  <span className="font-medium text-foreground">
                    {report.reporter.name}
                  </span>{" "}
                  · {formatDateTime(report.createdAt)}
                  {report.comment._count.reports > 1 && (
                    <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 font-mono font-semibold text-red-500">
                      {report.comment._count.reports} signalements
                    </span>
                  )}
                </p>
                <Link
                  href={`/articles/${report.comment.article.slug}`}
                  className="text-accent hover:underline"
                >
                  {report.comment.article.title}
                </Link>
              </div>

              {report.reason && (
                <p className="text-sm">
                  <span className="font-medium">Motif :</span>{" "}
                  <span className="text-muted">{report.reason}</span>
                </p>
              )}

              <blockquote className="border-l-2 border-border pl-3 text-sm">
                <p className="mb-1 font-medium">{report.comment.author.name} :</p>
                <p className="whitespace-pre-wrap text-muted">
                  {report.comment.content}
                </p>
              </blockquote>

              <div className="flex gap-2">
                <ActionButton
                  action={deleteComment.bind(null, report.comment.id)}
                  label="Supprimer le commentaire"
                  pendingLabel="Suppression…"
                  confirmMessage="Supprimer ce commentaire (et ses réponses) ?"
                  className={buttonDangerClass}
                />
                <ActionButton
                  action={dismissReport.bind(null, report.id)}
                  label="Classer sans suite"
                  pendingLabel="…"
                  className={buttonGhostClass}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
