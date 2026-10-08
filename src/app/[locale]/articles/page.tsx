import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import {
  ARTICLE_KINDS,
  PAGE_SIZE,
  articleCardSelect,
  kindLabel,
  localizeCard,
  pageNumber,
  parseKindParam,
} from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { Pagination } from "@/components/pagination";

const copy = {
  fr: {
    title: "Articles",
    description: "Tous les articles de CyberSphere : analyses, décryptages et points de vue.",
    count: (n: number) => `${n} article${n > 1 ? "s" : ""} publié${n > 1 ? "s" : ""}`,
    empty: "Aucun article publié pour le moment.",
    all: "Tous",
    filterAria: "Filtrer par type d'article",
  },
  en: {
    title: "Articles",
    description: "All CyberSphere articles: analyses, explainers and opinions.",
    count: (n: number) => `${n} published article${n === 1 ? "" : "s"}`,
    empty: "No articles published yet.",
    all: "All",
    filterAria: "Filter by article type",
  },
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; type?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = copy[toLocale((await params).locale)];
  return { title: t.title, description: t.description };
}

export default async function ArticlesPage({ params, searchParams }: Props) {
  const [{ locale: rawLocale }, { page: pageParam, type: typeParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = toLocale(rawLocale);
  const t = copy[locale];
  const page = pageNumber(pageParam);
  // Valeur inconnue (?type=xyz) : ignorée, la liste complète est servie
  const kind = parseKindParam(typeParam);

  const where = { status: "PUBLISHED" as const, ...(kind && { kind }) };
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
  const typeQuery = kind ? `type=${kind.toLowerCase()}&` : "";

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      active
        ? "border-accent bg-accent text-accent-contrast"
        : "border-border text-muted hover:border-accent hover:text-accent"
    }`;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">{t.title}</h1>
          <p className="mt-2 text-muted">{t.count(total)}</p>
        </div>
        <nav aria-label={t.filterAria} className="flex flex-wrap gap-2">
          <Link
            href={localeHref(locale, "/articles")}
            className={chip(!kind)}
            aria-current={!kind ? "page" : undefined}
          >
            {t.all}
          </Link>
          {ARTICLE_KINDS.map((value) => (
            <Link
              key={value}
              href={localeHref(locale, `/articles?type=${value.toLowerCase()}`)}
              className={chip(kind === value)}
              aria-current={kind === value ? "page" : undefined}
            >
              {kindLabel(value, locale)}
            </Link>
          ))}
        </nav>
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
        makeHref={(p) => localeHref(locale, `/articles?${typeQuery}page=${p}`)}
        locale={locale}
      />
    </div>
  );
}
