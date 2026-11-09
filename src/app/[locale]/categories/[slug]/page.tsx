import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localeHref, toLocale, type Locale } from "@/lib/i18n";
import {
  PAGE_SIZE,
  articleCardSelect,
  categoryLabel,
  localizeCard,
  pageNumber,
} from "@/lib/articles";
import { NOINDEX, breadcrumbJsonLd, pageMetadata, pagedTitle, withQuery } from "@/lib/seo";
import { ArticleCard } from "@/components/article-card";
import { JsonLd } from "@/components/json-ld";
import { Pagination } from "@/components/pagination";

const copy = {
  fr: {
    home: "Accueil",
    breadcrumbAria: "Fil d'Ariane",
    fallbackDescription: (name: string) => `Articles de la catégorie ${name}.`,
    empty: "Aucun article dans cette catégorie pour le moment.",
  },
  en: {
    home: "Home",
    breadcrumbAria: "Breadcrumb",
    fallbackDescription: (name: string) => `Articles in the ${name} category.`,
    empty: "No articles in this category yet.",
  },
};

/** Description dans la langue de la page, sans repli sur l'autre langue. */
function localizedDescription(
  category: { description: string | null; descriptionEn: string | null },
  locale: Locale,
): string | null {
  return (locale === "en" ? category.descriptionEn : category.description) || null;
}

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
  const page = pageNumber(pageParam);
  const category = await db.category.findUnique({ where: { slug } });
  if (!category) return {};
  // Articles de la catégorie et de ses sous-catégories, comme la page et son flux
  const published = await db.article.count({
    where: {
      status: "PUBLISHED",
      OR: [{ categoryId: category.id }, { category: { parentId: category.id } }],
    },
  });
  const name = categoryLabel(category, locale);
  return pageMetadata({
    locale,
    path: withQuery(`/categories/${slug}`, { page }),
    title: pagedTitle(name, page),
    // Sans description dans la langue de la page : texte générique
    description: localizedDescription(category, locale) ?? copy[locale].fallbackDescription(name),
    // Rubrique encore vide : accessible depuis le menu, mais hors index
    robots: published === 0 ? NOINDEX : undefined,
    feed: { path: `/categories/${slug}/rss.xml`, title: `CyberSphere — ${name}` },
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ locale: rawLocale, slug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = toLocale(rawLocale);
  const t = copy[locale];
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
  // Page au-delà de la dernière : vraie 404 plutôt qu'une liste vide en 200
  if (page > totalPages) notFound();
  const name = categoryLabel(category, locale);
  const description = localizedDescription(category, locale);
  const parent = category.parent
    ? {
        name: categoryLabel(category.parent, locale),
        path: localeHref(locale, `/categories/${category.parent.slug}`),
      }
    : null;

  return (
    <div className="space-y-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t.home, path: localeHref(locale, "/") },
          ...(parent ? [parent] : []),
          { name },
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
            {parent && (
              <li>
                <Link href={parent.path} className="hover:text-accent">
                  {parent.name}
                </Link>
                <span aria-hidden>{" / "}</span>
              </li>
            )}
            <li aria-current="page" className="text-foreground">
              {name}
            </li>
          </ol>
        </nav>
        <h1 className="text-3xl font-bold">{name}</h1>
        {description && <p className="text-muted">{description}</p>}
        {category.children.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {category.children.map((child) => (
              <Link
                key={child.id}
                href={localeHref(locale, `/categories/${child.slug}`)}
                className="rounded-full border border-accent/40 px-3 py-1 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
              >
                {categoryLabel(child, locale)}
              </Link>
            ))}
          </div>
        )}
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
        makeHref={(p) => localeHref(locale, `/categories/${slug}?page=${p}`)}
        locale={locale}
      />
    </div>
  );
}
