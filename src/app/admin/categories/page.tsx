import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { deleteCategory } from "@/actions/categories";
import { ActionButton } from "@/components/admin/action-button";
import { CategoryForm } from "@/components/admin/category-form";
import { buttonDangerClass, buttonGhostClass, cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Catégories" };

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;

  const tops = await db.category.findMany({
    where: { parentId: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { articles: true } },
      children: {
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: { _count: { select: { articles: true } } },
      },
    },
  });

  const flat = tops.flatMap((top) => [top, ...top.children]);
  const editing = edit ? flat.find((c) => c.id === edit) : undefined;

  const rows = tops.flatMap((top) => [
    { ...top, depth: 0 },
    ...top.children.map((child) => ({ ...child, depth: 1 })),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Catégories <span className="font-mono text-accent">({flat.length})</span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`${cardClass} overflow-x-auto lg:col-span-2`}>
          {rows.length === 0 ? (
            <p className="p-6 text-muted">Aucune catégorie. Créez-en une !</p>
          ) : (
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Nom</th>
                  <th className="px-4 py-3 text-right font-medium">Articles</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <div className={row.depth === 1 ? "pl-6" : ""}>
                        <Link
                          href={`/categories/${row.slug}`}
                          className="font-medium hover:text-accent"
                        >
                          {row.depth === 1 && (
                            <span className="mr-1 text-muted">↳</span>
                          )}
                          {row.name}
                        </Link>
                        {row.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                            {row.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {row._count.articles}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/categories?edit=${row.id}`}
                          className={`${buttonGhostClass} px-3 py-1.5`}
                        >
                          Modifier
                        </Link>
                        <ActionButton
                          action={deleteCategory.bind(null, row.id)}
                          label="Supprimer"
                          pendingLabel="Suppression…"
                          confirmMessage={`Supprimer la catégorie « ${row.name} » ?`}
                          className={buttonDangerClass}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={`${cardClass} h-fit p-6`}>
          <h2 className="mb-4 text-lg font-bold">
            {editing ? `Modifier « ${editing.name} »` : "Nouvelle catégorie"}
          </h2>
          <CategoryForm
            key={editing?.id ?? "new"}
            category={
              editing
                ? {
                    id: editing.id,
                    name: editing.name,
                    description: editing.description ?? "",
                    parentId: editing.parentId ?? "",
                  }
                : undefined
            }
            parents={tops
              .filter((t) => t.id !== editing?.id)
              .map((t) => ({ id: t.id, name: t.name }))}
          />
        </div>
      </div>
    </div>
  );
}
