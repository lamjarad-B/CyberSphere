import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import { articleCardSelect, localizeCard } from "@/lib/articles";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { ArticleCard } from "@/components/article-card";
import { JsonLd } from "@/components/json-ld";

const copy = {
  fr: {
    label: "Série",
    metaTitle: (title: string) => `Série : ${title}`,
    home: "Accueil",
    series: "Séries",
    breadcrumbAria: "Fil d'Ariane",
  },
  en: {
    label: "Series",
    metaTitle: (title: string) => `Series: ${title}`,
    home: "Home",
    series: "Series",
    breadcrumbAria: "Breadcrumb",
  },
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
  return pageMetadata({
    locale,
    path: `/series/${slug}`,
    title: copy[locale].metaTitle(title),
    description,
  });
}

export default async function SerieDetailPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = toLocale(rawLocale);
  const t = copy[locale];

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
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t.home, path: localeHref(locale, "/") },
          { name: t.series, path: localeHref(locale, "/series") },
          { name: title },
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
            <li>
              <Link href={localeHref(locale, "/series")} className="hover:text-accent">
                {t.series}
              </Link>
              <span aria-hidden>{" / "}</span>
            </li>
            <li aria-current="page" className="text-foreground">
              {title}
            </li>
          </ol>
        </nav>
        <div>
          <p className="font-mono text-sm text-accent">{t.label}</p>
          <h1 className="text-3xl font-bold">{title}</h1>
          {description && <p className="mt-2 text-muted">{description}</p>}
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {series.articles.map((article) => (
          <ArticleCard
            key={article.slug}
            article={localizeCard(article, locale)}
            locale={locale}
            headingLevel={2}
          />
        ))}
      </div>
    </div>
  );
}
