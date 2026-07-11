import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Entrée bilingue : URL française canonique + alternates hreflang fr/en. */
function bilingual(
  path: string,
  extra: Omit<MetadataRoute.Sitemap[number], "url" | "alternates">,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE_URL}${path}`,
    alternates: {
      languages: {
        fr: `${BASE_URL}${path}`,
        en: `${BASE_URL}${path === "/" ? "/en" : `/en${path}`}`,
      },
    },
    ...extra,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, categories, tags] = await Promise.all([
    db.article.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    db.category.findMany({ select: { slug: true } }),
    db.tag.findMany({ select: { slug: true } }),
  ]);

  return [
    bilingual("/", { changeFrequency: "daily", priority: 1 }),
    bilingual("/articles", { changeFrequency: "daily", priority: 0.9 }),
    ...articles.map((article) =>
      bilingual(`/articles/${article.slug}`, {
        lastModified: article.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }),
    ),
    ...categories.map((category) =>
      bilingual(`/categories/${category.slug}`, {
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }),
    ),
    ...tags.map((tag) =>
      bilingual(`/tags/${tag.slug}`, {
        changeFrequency: "weekly" as const,
        priority: 0.4,
      }),
    ),
  ];
}
