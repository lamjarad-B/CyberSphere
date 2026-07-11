import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { categoryOptions } from "@/lib/categories";
import { requireStaff } from "@/lib/session";
import { ArticleForm } from "@/components/admin/article-form";

export const metadata: Metadata = { title: "Modifier l'article" };

export default async function ModifierArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireStaff();
  const isAdmin = session.user.role === "admin";

  const [article, categories, seriesList] = await Promise.all([
    db.article.findUnique({
      where: { id },
      include: {
        tags: { orderBy: { name: "asc" } },
        translations: { where: { locale: "en" } },
      },
    }),
    categoryOptions(),
    db.series.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);
  if (!article) notFound();
  // Un auteur n'ouvre que ses propres articles
  if (!isAdmin && article.authorId !== session.user.id) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Modifier l&apos;article</h1>
      <ArticleForm
        categories={categories}
        series={seriesList.map((item) => ({ id: item.id, label: item.title }))}
        canPublish={isAdmin}
        article={{
          id: article.id,
          title: article.title,
          excerpt: article.excerpt,
          content: article.content,
          coverImage: article.coverImage,
          categoryId: article.categoryId,
          status: article.status,
          tags: article.tags.map((t) => t.name).join(", "),
          seriesId: article.seriesId ?? "",
          seriesPosition: article.seriesPosition,
          titleEn: article.translations[0]?.title ?? "",
          excerptEn: article.translations[0]?.excerpt ?? "",
          contentEn: article.translations[0]?.content ?? "",
        }}
      />
    </div>
  );
}
