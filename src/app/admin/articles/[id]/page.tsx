import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { categoryOptions } from "@/lib/categories";
import { ArticleForm } from "@/components/admin/article-form";

export const metadata: Metadata = { title: "Modifier l'article" };

export default async function ModifierArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [article, categories] = await Promise.all([
    db.article.findUnique({
      where: { id },
      include: { tags: { orderBy: { name: "asc" } } },
    }),
    categoryOptions(),
  ]);
  if (!article) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Modifier l&apos;article</h1>
      <ArticleForm
        categories={categories}
        article={{
          id: article.id,
          title: article.title,
          excerpt: article.excerpt,
          content: article.content,
          coverImage: article.coverImage,
          categoryId: article.categoryId,
          status: article.status,
          tags: article.tags.map((t) => t.name).join(", "),
        }}
      />
    </div>
  );
}
