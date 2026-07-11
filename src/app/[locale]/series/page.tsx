import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import { cardClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Séries",
    description: "Les séries d'articles CyberSphere : des tutoriels en plusieurs épisodes.",
    intro: "Des sujets traités en profondeur, épisode par épisode.",
    empty: "Aucune série publiée pour le moment.",
    episodes: (n: number) => `${n} épisode${n > 1 ? "s" : ""}`,
  },
  en: {
    title: "Series",
    description: "CyberSphere article series: multi-part tutorials.",
    intro: "Topics covered in depth, one episode at a time.",
    empty: "No series published yet.",
    episodes: (n: number) => `${n} episode${n === 1 ? "" : "s"}`,
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = copy[toLocale((await params).locale)];
  return { title: t.title, description: t.description };
}

export default async function SeriesPage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];

  const series = await db.series.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      slug: true,
      title: true,
      titleEn: true,
      description: true,
      descriptionEn: true,
      _count: { select: { articles: { where: { status: "PUBLISHED" } } } },
    },
  });
  const visible = series.filter((item) => item._count.articles > 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-muted">{t.intro}</p>
      </header>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {visible.map((item) => {
            const title = locale === "en" && item.titleEn ? item.titleEn : item.title;
            const description =
              locale === "en"
                ? item.descriptionEn ?? item.description
                : item.description;
            return (
              <Link
                key={item.slug}
                href={localeHref(locale, `/series/${item.slug}`)}
                className={`${cardClass} block space-y-2 p-6 transition-colors hover:border-accent`}
              >
                <h2 className="text-lg font-bold">{title}</h2>
                {description && <p className="text-sm text-muted">{description}</p>}
                <p className="font-mono text-xs text-accent">
                  {t.episodes(item._count.articles)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
