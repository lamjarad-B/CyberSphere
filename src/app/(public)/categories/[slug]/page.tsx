import type { Metadata } from "next";
import Link from "next/link";
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
  const category = await db.category.findUnique({ where: { slug } });
  if (!category) return {};
  return {
    title: category.name,
    description: category.description ?? `Articles de la catégorie ${category.name}.`,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const page = pageNumber(pageParam);

  const category = await db.category.findUnique({
    where: { slug },
    include: {
      parent: true,
      children: { orderBy: [{ position: "asc" }, { name: "asc" }] },
    },
  });
  if (!category) notFound();

  // Une catégorie parente affiche aussi les articles de ses sous-catégories
  const categoryIds = [category.id, ...category.children.map((c) => c.id)];
  const where = {
    status: "PUBLISHED" as const,
    categoryId: { in: categoryIds },
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
      <header className="space-y-3">
        <p className="font-mono text-sm text-muted">
          <Link href="/" className="hover:text-accent">
            Accueil
          </Link>
          {" / "}
          {category.parent && (
            <>
              <Link
                href={`/categories/${category.parent.slug}`}
                className="hover:text-accent"
              >
                {category.parent.name}
              </Link>
              {" / "}
            </>
          )}
          <span className="text-foreground">{category.name}</span>
        </p>
        <h1 className="text-3xl font-bold">{category.name}</h1>
        {category.description && <p className="text-muted">{category.description}</p>}
        {category.children.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {category.children.map((child) => (
              <Link
                key={child.id}
                href={`/categories/${child.slug}`}
                className="rounded-full border border-accent/40 px-3 py-1 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
              >
                {child.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      {articles.length === 0 ? (
        <p className="text-muted">Aucun article dans cette catégorie pour le moment.</p>
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
        makeHref={(p) => `/categories/${slug}?page=${p}`}
      />
    </div>
  );
}
