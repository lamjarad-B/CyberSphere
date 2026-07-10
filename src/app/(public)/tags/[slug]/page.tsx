import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PAGE_SIZE, articleCardSelect, pageNumber } from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { Pagination } from "@/components/pagination";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tag = await db.tag.findUnique({ where: { slug } });
  if (!tag) return {};
  return {
    title: `Tag : ${tag.name}`,
    description: `Articles portant le tag ${tag.name}.`,
  };
}

export default async function TagPage({ params, searchParams }: Props) {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const page = pageNumber(pageParam);

  const tag = await db.tag.findUnique({ where: { slug } });
  if (!tag) notFound();

  const where = {
    status: "PUBLISHED" as const,
    tags: { some: { id: tag.id } },
  };

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
        <h1 className="text-3xl font-bold">
          Tag : <span className="font-mono text-accent">#{tag.name}</span>
        </h1>
        <p className="mt-2 text-muted">
          {total} article{total > 1 ? "s" : ""}
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="text-muted">Aucun article avec ce tag pour le moment.</p>
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
        makeHref={(p) => `/tags/${slug}?page=${p}`}
      />
    </div>
  );
}
