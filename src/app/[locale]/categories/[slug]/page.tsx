import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import {
  PAGE_SIZE,
  articleCardSelect,
  categoryLabel,
  localizeCard,
  pageNumber,
} from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { Pagination } from "@/components/pagination";

const copy = {
  fr: {
    home: "Accueil",
    fallbackDescription: (name: string) => `Articles de la catégorie ${name}.`,
    empty: "Aucun article dans cette catégorie pour le moment.",
  },
  en: {
    home: "Home",
    fallbackDescription: (name: string) => `Articles in the ${name} category.`,
    empty: "No articles in this category yet.",
  },
};

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = toLocale(rawLocale);
  const category = await db.category.findUnique({ where: { slug } });
  if (!category) return {};
  const name = categoryLabel(category, locale);
  return {
    title: name,
    // La description libre n'existe qu'en français ; l'anglais garde un texte générique
    description:
      locale === "fr" && category.description
        ? category.description
        : copy[locale].fallbackDescription(name),
  };
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
  const name = categoryLabel(category, locale);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="font-mono text-sm text-muted">
          <Link href={localeHref(locale, "/")} className="hover:text-accent">
            {t.home}
          </Link>
          {" / "}
          {category.parent && (
            <>
              <Link
                href={localeHref(locale, `/categories/${category.parent.slug}`)}
                className="hover:text-accent"
              >
                {categoryLabel(category.parent, locale)}
              </Link>
              {" / "}
            </>
          )}
          <span className="text-foreground">{name}</span>
        </p>
        <h1 className="text-3xl font-bold">{name}</h1>
        {locale === "fr" && category.description && (
          <p className="text-muted">{category.description}</p>
        )}
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
