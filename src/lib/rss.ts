import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { localeHref, type Locale } from "./i18n";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Construit un flux RSS 2.0 des 20 derniers articles publiés correspondant
 * au filtre donné (tous, une catégorie, un tag…), dans la langue demandée.
 * Le flux anglais utilise les traductions disponibles et replie sur le
 * français sinon — même comportement que le site.
 */
export async function buildRssFeed(options: {
  title: string;
  description: string;
  /** Chemin public du flux, ex. "/rss.xml" ou "/en/rss.xml" */
  path: string;
  locale?: Locale;
  where?: Prisma.ArticleWhereInput;
}): Promise<Response> {
  const locale = options.locale ?? "fr";
  const articles = await db.article.findMany({
    where: { status: "PUBLISHED", ...options.where },
    orderBy: { publishedAt: "desc" },
    take: 20,
    select: {
      title: true,
      slug: true,
      excerpt: true,
      publishedAt: true,
      author: { select: { name: true } },
      category: { select: { name: true, nameEn: true } },
      translations: {
        where: { locale: "en" },
        select: { title: true, excerpt: true },
      },
    },
  });

  const items = articles
    .map((article) => {
      const translation = locale === "en" ? article.translations[0] : undefined;
      const title = translation?.title ?? article.title;
      const excerpt = translation?.excerpt ?? article.excerpt;
      const categoryName =
        locale === "en" && article.category.nameEn
          ? article.category.nameEn
          : article.category.name;
      const url = `${BASE_URL}${localeHref(locale, `/articles/${article.slug}`)}`;
      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${url}</link>
      <guid>${url}</guid>
      <description>${escapeXml(excerpt)}</description>
      <category>${escapeXml(categoryName)}</category>
      <pubDate>${(article.publishedAt ?? new Date()).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(options.title)}</title>
    <link>${BASE_URL}${localeHref(locale, "/")}</link>
    <atom:link href="${BASE_URL}${options.path}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(options.description)}</description>
    <language>${locale}</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
