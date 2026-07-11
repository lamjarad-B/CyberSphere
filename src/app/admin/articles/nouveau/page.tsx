import type { Metadata } from "next";
import { db } from "@/lib/db";
import { categoryOptions } from "@/lib/categories";
import { requireStaff } from "@/lib/session";
import { ArticleForm } from "@/components/admin/article-form";

export const metadata: Metadata = { title: "Nouvel article" };

export default async function NouvelArticlePage() {
  const session = await requireStaff();
  const [categories, seriesList] = await Promise.all([
    categoryOptions(),
    db.series.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Nouvel article</h1>
      <ArticleForm
        categories={categories}
        series={seriesList.map((item) => ({ id: item.id, label: item.title }))}
        canPublish={session.user.role === "admin"}
      />
    </div>
  );
}
