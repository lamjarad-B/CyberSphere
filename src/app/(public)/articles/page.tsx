import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PAGE_SIZE, articleCardSelect, pageNumber } from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { Pagination } from "@/components/pagination";

export const metadata: Metadata = {
  title: "Articles",
  description: "Tous les articles de CyberSphere.",
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = pageNumber(pageParam);

  const where = { status: "PUBLISHED" as const };
  const [articles, total] = await Promise.all([
    db.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: articleCardSelect,
    }),
    db.article.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Articles</h1>
        <p className="mt-2 text-muted">
          {total} article{total > 1 ? "s" : ""} publié{total > 1 ? "s" : ""}
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="text-muted">Aucun article publié pour le moment.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => `/articles?page=${p}`}
      />
    </div>
  );
}
