import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toLocale } from "@/lib/i18n";
import { articleCardSelect, localizeCard } from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";

const copy = {
  fr: { label: "Série", metaTitle: (title: string) => `Série : ${title}` },
  en: { label: "Series", metaTitle: (title: string) => `Series: ${title}` },
};

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = toLocale(rawLocale);
  const series = await db.series.findUnique({
    where: { slug },
    select: { title: true, titleEn: true, description: true, descriptionEn: true },
  });
  if (!series) return {};
  const title = locale === "en" && series.titleEn ? series.titleEn : series.title;
  const description =
    locale === "en"
      ? series.descriptionEn ?? series.description ?? undefined
      : series.description ?? undefined;
  return { title: copy[locale].metaTitle(title), description };
}

export default async function SerieDetailPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = toLocale(rawLocale);

  const series = await db.series.findUnique({
    where: { slug },
    select: {
      title: true,
      titleEn: true,
      description: true,
      descriptionEn: true,
      articles: {
        where: { status: "PUBLISHED" },
        orderBy: [{ seriesPosition: "asc" }, { publishedAt: "asc" }],
        select: articleCardSelect,
      },
    },
  });
  if (!series || series.articles.length === 0) notFound();

  const title = locale === "en" && series.titleEn ? series.titleEn : series.title;
  const description =
    locale === "en" ? series.descriptionEn ?? series.description : series.description;

  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-sm text-accent">{copy[locale].label}</p>
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && <p className="mt-2 text-muted">{description}</p>}
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {series.articles.map((article) => (
          <ArticleCard
            key={article.slug}
            article={localizeCard(article, locale)}
            locale={locale}
          />
        ))}
      </div>
    </div>
  );
}
