import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { localeHref, locales } from "@/lib/i18n";
import { LIST_INDEX_MIN_ARTICLES, absoluteUrl } from "@/lib/seo";

// Rendu à la requête : le contenu vient de la base, indisponible à la build
// (la CI compile sans PostgreSQL). Sans ceci, `next build` tente de prérendre
// le sitemap et échoue sur la connexion Prisma.
export const dynamic = "force-dynamic";

type Entry = MetadataRoute.Sitemap[number];
type Extra = Omit<Entry, "url" | "alternates">;

/**
 * Une entrée par langue, chacune listant toutes les versions (elle-même
 * comprise) et x-default, comme Google le demande pour les sitemaps hreflang.
 * `lastModified` peut différer d'une langue à l'autre (traduction modifiée).
 */
function bilingual(path: string, extra: Extra = {}, lastModifiedEn?: Date): Entry[] {
  const languages = {
    fr: absoluteUrl(path),
    en: absoluteUrl(localeHref("en", path)),
    "x-default": absoluteUrl(path),
  };
  return locales.map((locale) => ({
    url: absoluteUrl(localeHref(locale, path)),
    alternates: { languages },
    ...extra,
    ...(locale === "en" && lastModifiedEn && { lastModified: lastModifiedEn }),
  }));
}

/** Date la plus récente, undefined si aucune. */
function latest(dates: (Date | null | undefined)[]): Date | undefined {
  const times = dates.filter((d): d is Date => Boolean(d)).map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, categories, tags, series, authors] = await Promise.all([
    db.article.findMany({
      where: { status: "PUBLISHED" },
      select: {
        slug: true,
        publishedAt: true,
        contentUpdatedAt: true,
        categoryId: true,
        translations: { where: { locale: "en" }, select: { updatedAt: true } },
      },
      orderBy: { publishedAt: "desc" },
    }),
    db.category.findMany({ select: { id: true, slug: true, parentId: true } }),
    db.tag.findMany({
      select: {
        slug: true,
        articles: { where: { status: "PUBLISHED" }, select: { publishedAt: true } },
      },
    }),
    // Seules les séries ayant au moins un épisode publié sont accessibles
    db.series.findMany({
      select: {
        slug: true,
        articles: { where: { status: "PUBLISHED" }, select: { publishedAt: true } },
      },
    }),
    // Pages auteurs : servies dès un article publié (voir /auteurs/[slug])
    db.user.findMany({
      where: { slug: { not: null }, articles: { some: { status: "PUBLISHED" } } },
      select: {
        slug: true,
        updatedAt: true,
        articles: { where: { status: "PUBLISHED" }, select: { publishedAt: true } },
      },
    }),
  ]);

  // Une liste change quand un article y entre : sa date est celle du dernier publié
  const newest = latest(articles.map((a) => a.publishedAt));

  // Une catégorie parente liste aussi les articles de ses sous-catégories
  const publishedByCategory = new Map<string, Date[]>();
  for (const article of articles) {
    const category = categories.find((c) => c.id === article.categoryId);
    for (const id of [category?.id, category?.parentId]) {
      if (!id || !article.publishedAt) continue;
      publishedByCategory.set(id, [...(publishedByCategory.get(id) ?? []), article.publishedAt]);
    }
  }

  return [
    ...bilingual("/", { lastModified: newest }),
    ...bilingual("/articles", { lastModified: newest }),
    ...bilingual("/series", {
      lastModified: latest(series.flatMap((s) => s.articles.map((a) => a.publishedAt))),
    }),
    ...bilingual("/a-propos"),
    ...bilingual("/contact"),
    ...bilingual("/securite"),
    ...bilingual("/mentions-legales"),
    ...bilingual("/confidentialite"),
    ...articles.flatMap((article) => {
      const path = `/articles/${article.slug}`;
      const translation = article.translations[0];
      // Date du contenu, jamais updatedAt (que touche toute écriture)
      const modified = latest([article.publishedAt, article.contentUpdatedAt]);
      // Sans traduction, /en/articles/… sert le texte français et désigne
      // l'original comme canonique : seule l'URL française est listée.
      if (!translation) return [{ url: absoluteUrl(path), lastModified: modified }];
      return bilingual(path, { lastModified: modified }, latest([modified, translation.updatedAt]));
    }),
    ...series
      .filter((item) => item.articles.length > 0)
      .flatMap((item) =>
        bilingual(`/series/${item.slug}`, {
          lastModified: latest(item.articles.map((a) => a.publishedAt)),
        }),
      ),
    ...authors.flatMap((author) =>
      bilingual(`/auteurs/${author.slug}`, {
        // Nouvel article ou profil (bio, liens) modifié
        lastModified: latest([author.updatedAt, ...author.articles.map((a) => a.publishedAt)]),
      }),
    ),
    // Catégories et tags sans contenu suffisant sont en noindex : hors sitemap
    ...categories
      .filter((category) => publishedByCategory.has(category.id))
      .flatMap((category) =>
        bilingual(`/categories/${category.slug}`, {
          lastModified: latest(publishedByCategory.get(category.id) ?? []),
        }),
      ),
    ...tags
      .filter((tag) => tag.articles.length >= LIST_INDEX_MIN_ARTICLES)
      .flatMap((tag) =>
        bilingual(`/tags/${tag.slug}`, {
          lastModified: latest(tag.articles.map((a) => a.publishedAt)),
        }),
      ),
  ];
}
