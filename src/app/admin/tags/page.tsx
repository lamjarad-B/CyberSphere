import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { deleteTag } from "@/actions/tags";
import { ActionButton } from "@/components/admin/action-button";
import { TagForm } from "@/components/admin/tag-form";
import { buttonDangerClass, cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Tags" };

export default async function AdminTagsPage() {
  const tags = await db.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { articles: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Tags <span className="font-mono text-accent">({tags.length})</span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`${cardClass} lg:col-span-2`}>
          {tags.length === 0 ? (
            <p className="p-6 text-muted">
              Aucun tag. Créez-en un ici ou directement depuis un article.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {tags.map((tag) => (
                <li key={tag.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link
                    href={`/tags/${tag.slug}`}
                    className="font-mono text-sm text-accent hover:underline"
                  >
                    #{tag.name}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">
                      {tag._count.articles} article{tag._count.articles > 1 ? "s" : ""}
                    </span>
                    <ActionButton
                      action={deleteTag.bind(null, tag.id)}
                      label="Supprimer"
                      pendingLabel="Suppression…"
                      confirmMessage={`Supprimer le tag « ${tag.name} » ?`}
                      className={buttonDangerClass}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${cardClass} h-fit p-6`}>
          <h2 className="mb-4 text-lg font-bold">Nouveau tag</h2>
          <TagForm />
        </div>
      </div>
    </div>
  );
}
