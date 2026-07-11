import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { pageNumber } from "@/lib/articles";
import { requireAdmin } from "@/lib/session";
import { Pagination } from "@/components/pagination";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Journal d'audit" };

const PAGE_SIZE = 50;

/** Libellés lisibles des actions auditées. */
const actionLabels: Record<string, string> = {
  "auth.inscription": "Inscription",
  "auth.connexion": "Connexion",
  "auth.mot_de_passe_modifie": "Mot de passe modifié",
  "article.creation": "Article créé",
  "article.modification": "Article modifié",
  "article.soumission": "Article soumis à validation",
  "article.publication": "Article publié",
  "article.suppression": "Article supprimé",
  "categorie.creation": "Catégorie créée",
  "categorie.modification": "Catégorie modifiée",
  "categorie.suppression": "Catégorie supprimée",
  "serie.creation": "Série créée",
  "serie.modification": "Série modifiée",
  "serie.suppression": "Série supprimée",
  "tag.creation": "Tag créé",
  "tag.suppression": "Tag supprimé",
  "commentaire.moderation": "Commentaire modéré",
  "signalement.classement": "Signalement classé",
  "membre.bannissement": "Membre banni",
  "membre.debannissement": "Membre réintégré",
  "membre.promotion_auteur": "Promotion auteur",
  "membre.retrait_auteur": "Retrait du rôle auteur",
};

export default async function AdminJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const { page: pageParam } = await searchParams;
  const page = pageNumber(pageParam);

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    db.auditLog.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">
          Journal d&apos;audit{" "}
          <span className="font-mono text-accent">({total})</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Trace des connexions, changements de mots de passe et actions
          d&apos;administration. Consultation seule : le journal ne se modifie
          pas depuis l&apos;interface.
        </p>
      </header>

      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Acteur</th>
              <th className="px-4 py-3 font-medium">Détail</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Aucun événement enregistré.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted">
                  {formatDateTime(entry.createdAt)}
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-medium">
                    {actionLabels[entry.action] ?? entry.action}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted">
                  {entry.actor?.name ?? entry.actorEmail ?? "—"}
                </td>
                <td className="max-w-64 px-4 py-2.5">
                  <span className="line-clamp-1 text-muted">{entry.detail ?? "—"}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">
                  {entry.ipAddress ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => `/admin/journal?page=${p}`}
      />
    </div>
  );
}
