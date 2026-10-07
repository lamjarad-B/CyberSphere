import type { ArticleStatus } from "@prisma/client";

const badges: Record<ArticleStatus, { label: string; className: string }> = {
  PUBLISHED: { label: "Publié", className: "bg-emerald-500/15 text-emerald-500" },
  SCHEDULED: { label: "Programmé", className: "bg-violet-500/15 text-violet-400" },
  SUBMITTED: { label: "À valider", className: "bg-sky-500/15 text-sky-500" },
  DRAFT: { label: "Brouillon", className: "bg-amber-500/15 text-amber-500" },
};

/** Pastille de statut d'un article (administration, en français). */
export function StatusBadge({ status, title }: { status: ArticleStatus; title?: string }) {
  const badge = badges[status];
  return (
    <span
      title={title}
      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
