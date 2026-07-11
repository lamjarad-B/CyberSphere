import type { Metadata } from "next";
import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import { PAGE_SIZE, articleCardSelect, localizeCard, pageNumber } from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { Pagination } from "@/components/pagination";

const copy = {
  fr: {
    title: "Articles",
    description: "Tous les articles de CyberSphere.",
    count: (n: number) => `${n} article${n > 1 ? "s" : ""} publié${n > 1 ? "s" : ""}`,
    empty: "Aucun article publié pour le moment.",
  },
  en: {
    title: "Articles",
    description: "All CyberSphere articles.",
    count: (n: number) => `${n} published article${n === 1 ? "" : "s"}`,
    empty: "No articles published yet.",
  },
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = copy[toLocale((await params).locale)];
  return { title: t.title, description: t.description };
}

export default async function ArticlesPage({ params, searchParams }: Props) {
  const [{ locale: rawLocale }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = toLocale(rawLocale);
  const t = copy[locale];
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
        <h1 className="text-3xl font-bold">{t.title}</h1>
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
        makeHref={(p) => localeHref(locale, `/articles?page=${p}`)}
        locale={locale}
      />
    </div>
  );
}
