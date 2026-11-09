import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { localeHref, toLocale } from "@/lib/i18n";
import { articleCardSelect, localizeCard } from "@/lib/articles";
import { organizationJsonLd, pageMetadata, websiteJsonLd } from "@/lib/seo";
import { ArticleCard, AuthorName } from "@/components/article-card";
import { CoverFill } from "@/components/cover-image";
import { JsonLd } from "@/components/json-ld";
import { buttonClass, buttonGhostClass, cardClass } from "@/components/ui";

const copy = {
  fr: {
    metaTitle: "CyberSphere — Blog cybersécurité",
    metaDescription:
      "CyberSphere : analyses et décryptages de la cybersécurité — menaces, géopolitique, régulation et stratégie, avec à l'occasion des articles techniques.",
    tagline:
      "Analyses et décryptages de la cybersécurité : menaces, géopolitique, régulation et stratégie — et, à l'occasion, de la technique.",
    featured: "À la une",
    featuredAria: "Article à la une",
    readArticle: "Lire l'article",
    empty: "Aucun article publié pour le moment. Revenez bientôt !",
    latest: "Derniers articles",
    allArticles: "Tous les articles →",
  },
  en: {
    metaTitle: "CyberSphere — Cybersecurity blog",
    metaDescription:
      "CyberSphere: cybersecurity analysis and explainers — threats, geopolitics, regulation and strategy, with technical deep dives now and then.",
    tagline:
      "Cybersecurity analysis and explainers: threats, geopolitics, regulation and strategy — with the occasional technical deep dive.",
    featured: "Featured",
    featuredAria: "Featured article",
    readArticle: "Read the article",
    empty: "No articles published yet. Check back soon!",
    latest: "Latest articles",
    allArticles: "All articles →",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const metadata = pageMetadata({
    locale,
    path: "/",
    title: t.metaTitle,
    description: t.metaDescription,
  });
  // Titre complet : le gabarit « %s — CyberSphere » du layout le doublerait
  return { ...metadata, title: { absolute: t.metaTitle } };
}

export default async function HomePage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];

  // « À la une » : l'article épinglé encore valide, sinon le dernier publié
  const [pinned, latest] = await Promise.all([
    db.article.findFirst({
      where: { status: "PUBLISHED", featuredUntil: { gt: new Date() } },
      orderBy: { publishedAt: "desc" },
      select: articleCardSelect,
    }),
    db.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 7,
      select: articleCardSelect,
    }),
  ]);

  const [featuredRow, ...restRows] = pinned
    ? [pinned, ...latest.filter((row) => row.slug !== pinned.slug).slice(0, 6)]
    : latest;
  const featured = featuredRow ? localizeCard(featuredRow, locale) : undefined;

  return (
    <div className="space-y-14">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(locale, t.metaDescription)]} />
      <section className="pt-4 text-center">
        <p className="font-mono text-sm text-accent">$ whoami --blog</p>
        <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Cyber<span className="text-accent">Sphere</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">{t.tagline}</p>
      </section>

      {featured ? (
        <section aria-label={t.featuredAria}>
          <article
            className={`${cardClass} grid overflow-hidden transition-colors hover:border-accent/60 md:grid-cols-2`}
          >
            <Link
              href={localeHref(locale, `/articles/${featured.slug}`)}
              // Avec couverture, le lien porte les proportions de l'image :
              // 1200/630 sur téléphone, hauteur de la carte à partir de md
              className={
                featured.coverImage
                  ? "relative block aspect-[1200/630] w-full md:aspect-auto md:h-full md:min-h-56"
                  : "block"
              }
              tabIndex={-1}
              aria-hidden
            >
              {featured.coverImage ? (
                // Image principale de l'accueil : préchargée (LCP)
                <CoverFill
                  src={featured.coverImage}
                  sizes="(min-width: 768px) 576px, 100vw"
                  preload
                />
              ) : (
                <div className="flex aspect-video h-full items-center md:aspect-auto md:min-h-56 justify-center bg-gradient-to-br from-accent/20 via-surface to-surface">
                  {/* Dimensions d'affichage : le srcset de next/image en découle */}
                  <Image
                    src="/images/Logo/cybersphere-icone.png"
                    alt=""
                    width={96}
                    height={96}
                    className="h-24 w-24 opacity-40"
                    aria-hidden
                  />
                </div>
              )}
            </Link>
            <div className="flex flex-col gap-4 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="whitespace-nowrap rounded-full bg-accent px-2.5 py-0.5 font-mono text-xs font-semibold text-accent-contrast">
                  {t.featured}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {featured.kind}
                </span>
                <Link
                  href={localeHref(locale, `/categories/${featured.category.slug}`)}
                  className="font-mono text-xs text-accent hover:underline"
                >
                  {featured.category.name}
                </Link>
              </div>
              <h2 className="text-2xl font-bold leading-tight">
                <Link
                  href={localeHref(locale, `/articles/${featured.slug}`)}
                  className="transition-colors hover:text-accent"
                >
                  {featured.title}
                </Link>
              </h2>
              <p className="line-clamp-4 text-muted">{featured.excerpt}</p>
              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="text-xs text-muted">
                  <time dateTime={featured.publishedAt?.toISOString()}>
                    {formatDate(featured.publishedAt, locale)}
                  </time>{" "}
                  · <AuthorName author={featured.author} locale={locale} />
                </span>
                <Link
                  href={localeHref(locale, `/articles/${featured.slug}`)}
                  className={buttonClass}
                >
                  {t.readArticle}
                </Link>
              </div>
            </div>
          </article>
        </section>
      ) : (
        <p className="text-center text-muted">{t.empty}</p>
      )}

      {restRows.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{t.latest}</h2>
            <Link href={localeHref(locale, "/articles")} className={buttonGhostClass}>
              {t.allArticles}
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {restRows.map((article) => (
              <ArticleCard
                key={article.slug}
                article={localizeCard(article, locale)}
                locale={locale}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
