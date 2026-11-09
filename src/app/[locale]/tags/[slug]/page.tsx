import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import { PAGE_SIZE, articleCardSelect, localizeCard, pageNumber } from "@/lib/articles";
import {
  NOINDEX,
  TAG_INDEX_MIN_ARTICLES,
  breadcrumbJsonLd,
  pageMetadata,
  pagedTitle,
  withQuery,
} from "@/lib/seo";
import { ArticleCard } from "@/components/article-card";
import { JsonLd } from "@/components/json-ld";
import { Pagination } from "@/components/pagination";

const copy = {
  fr: {
    home: "Accueil",
    breadcrumbAria: "Fil d'Ariane",
    title: (name: string) => `Tag : ${name}`,
    description: (name: string) => `Articles portant le tag ${name}.`,
    heading: "Tag :",
    count: (n: number) => `${n} article${n > 1 ? "s" : ""}`,
    empty: "Aucun article avec ce tag pour le moment.",
  },
  en: {
    home: "Home",
    breadcrumbAria: "Breadcrumb",
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

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale: rawLocale, slug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = toLocale(rawLocale);
  const t = copy[locale];
  const page = pageNumber(pageParam);
  const tag = await db.tag.findUnique({ where: { slug } });
  if (!tag) return {};
  const published = await db.article.count({
    where: { status: "PUBLISHED", tags: { some: { id: tag.id } } },
  });
  return pageMetadata({
    locale,
    path: withQuery(`/tags/${slug}`, { page }),
    title: pagedTitle(t.title(tag.name), page),
    description: t.description(tag.name),
    // Trop peu d'articles : la page ne ferait que répéter leurs cartes
    robots: published < TAG_INDEX_MIN_ARTICLES ? NOINDEX : undefined,
    feed: { path: `/tags/${slug}/rss.xml`, title: `CyberSphere — #${tag.name}` },
  });
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
  // Page au-delà de la dernière : vraie 404 plutôt qu'une liste vide en 200
  if (page > totalPages) notFound();

  return (
    <div className="space-y-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t.home, path: localeHref(locale, "/") },
          { name: `#${tag.name}` },
        ])}
      />
      <header className="space-y-3">
        <nav aria-label={t.breadcrumbAria}>
          <ol className="font-mono text-sm text-muted [&>li]:inline">
            <li>
              <Link href={localeHref(locale, "/")} className="hover:text-accent">
                {t.home}
              </Link>
              <span aria-hidden>{" / "}</span>
            </li>
            <li aria-current="page" className="text-foreground">
              #{tag.name}
            </li>
          </ol>
        </nav>
        <div>
          <h1 className="text-3xl font-bold">
            {t.heading} <span className="font-mono text-accent">#{tag.name}</span>
          </h1>
          <p className="mt-2 text-muted">{t.count(total)}</p>
        </div>
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
              headingLevel={2}
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
