import type { Metadata } from "next";
import { categoryOptions } from "@/lib/categories";
import { ArticleForm } from "@/components/admin/article-form";

export const metadata: Metadata = { title: "Nouvel article" };

export default async function NouvelArticlePage() {
  const categories = await categoryOptions();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Nouvel article</h1>
      <ArticleForm categories={categories} />
    </div>
  );
}
