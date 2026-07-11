import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import { PAGE_SIZE, articleCardSelect, localizeCard, pageNumber } from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { Pagination } from "@/components/pagination";

const copy = {
  fr: {
    title: (name: string) => `Tag : ${name}`,
    description: (name: string) => `Articles portant le tag ${name}.`,
    heading: "Tag :",
    count: (n: number) => `${n} article${n > 1 ? "s" : ""}`,
    empty: "Aucun article avec ce tag pour le moment.",
  },
  en: {
    title: (name: string) => `Tag: ${name}`,
    description: (name: string) => `Articles tagged ${name}.`,
    heading: "Tag:",
    count: (n: number) => `${n} article${n === 1 ? "" : "s"}`,
    empty: "No articles with this tag yet.",
  },
};

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const t = copy[toLocale(rawLocale)];
  const tag = await db.tag.findUnique({ where: { slug } });
  if (!tag) return {};
  return { title: t.title(tag.name), description: t.description(tag.name) };
}

export default async function TagPage({ params, searchParams }: Props) {
  const [{ locale: rawLocale, slug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = toLocale(rawLocale);
  const t = copy[locale];
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
          {t.heading} <span className="font-mono text-accent">#{tag.name}</span>
        </h1>
        <p className="mt-2 text-muted">{t.count(total)}</p>
      </header>

      {articles.length === 0 ? (
        <p className="text-muted">{t.empty}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard
              key={article.slug}
              article={localizeCard(article, locale)}
              locale={locale}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => localeHref(locale, `/tags/${slug}?page=${p}`)}
        locale={locale}
      />
    </div>
  );
}
