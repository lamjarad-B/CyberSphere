import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PAGE_SIZE, articleCardSelect, pageNumber } from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { Pagination } from "@/components/pagination";
import { buttonClass, inputClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Recherche",
  description: "Recherchez un article sur CyberSphere.",
};

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q: rawQuery, page: pageParam } = await searchParams;
  const query = (rawQuery ?? "").trim().slice(0, 100);
  const page = pageNumber(pageParam);

  let articles: Awaited<
    ReturnType<typeof db.article.findMany<{ select: typeof articleCardSelect }>>
  > = [];
  let total = 0;

  if (query.length >= 2) {
    const where = {
      status: "PUBLISHED" as const,
      OR: [
        { title: { contains: query, mode: "insensitive" as const } },
        { excerpt: { contains: query, mode: "insensitive" as const } },
        { content: { contains: query, mode: "insensitive" as const } },
      ],
    };
    [articles, total] = await Promise.all([
      db.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: articleCardSelect,
      }),
      db.article.count({ where }),
    ]);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold">Recherche</h1>
        <form action="/recherche" method="get" className="flex max-w-xl gap-2" role="search">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Rechercher un article… (2 caractères minimum)"
            aria-label="Termes de recherche"
            className={inputClass}
          />
          <button type="submit" className={buttonClass}>
            Rechercher
          </button>
        </form>
      </header>

      {query.length >= 2 && (
        <p className="text-muted">
          {total} résultat{total > 1 ? "s" : ""} pour «{" "}
          <span className="font-medium text-foreground">{query}</span> »
        </p>
      )}

      {articles.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => `/recherche?q=${encodeURIComponent(query)}&page=${p}`}
      />
    </div>
  );
}
