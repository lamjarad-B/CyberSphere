import type { Metadata } from "next";
import { db } from "@/lib/db";
import { deleteSeries } from "@/actions/series";
import { requireAdmin } from "@/lib/session";
import { ActionButton } from "@/components/admin/action-button";
import { SeriesForm } from "@/components/admin/series-form";
import { buttonDangerClass, cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Séries" };

export default async function AdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string }>;
}) {
  await requireAdmin();
  const { edition } = await searchParams;

  const seriesList = await db.series.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { articles: true } } },
  });
  const editing = edition
    ? seriesList.find((item) => item.id === edition)
    : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Séries <span className="font-mono text-accent">({seriesList.length})</span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">
            {editing ? `Modifier « ${editing.title} »` : "Nouvelle série"}
          </h2>
          <SeriesForm
            key={editing?.id ?? "new"}
            series={
              editing
                ? {
                    id: editing.id,
                    title: editing.title,
                    description: editing.description ?? "",
                    titleEn: editing.titleEn ?? "",
                    descriptionEn: editing.descriptionEn ?? "",
                  }
                : undefined
            }
          />
        </section>

        <section className={`${cardClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Série</th>
                <th className="px-4 py-3 text-right font-medium">Articles</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {seriesList.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted">
                    Aucune série. Créez la première !
                  </td>
                </tr>
              )}
              {seriesList.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.title}</p>
                    <p className="font-mono text-xs text-muted">/{item.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item._count.articles}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/admin/series?edition=${item.id}`}
                        className="text-xs font-medium text-muted hover:text-accent"
                      >
                        Modifier
                      </a>
                      <ActionButton
                        action={deleteSeries.bind(null, item.id)}
                        label="Supprimer"
                        pendingLabel="…"
                        confirmMessage={`Supprimer la série « ${item.title} » ? Les articles ne seront pas supprimés.`}
                        className={buttonDangerClass}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
