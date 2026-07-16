import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { localeHref, toLocale } from "@/lib/i18n";
import { articleCardSelect, localizeCard } from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { buttonClass, buttonGhostClass, cardClass } from "@/components/ui";

const copy = {
  fr: {
    tagline:
      "Articles, analyses et tutoriels de cybersécurité : offensive, défense, cryptographie et actualité de la sécurité informatique.",
    featured: "À la une",
    featuredAria: "Article à la une",
    readArticle: "Lire l'article",
    empty: "Aucun article publié pour le moment. Revenez bientôt !",
    latest: "Derniers articles",
    allArticles: "Tous les articles →",
  },
  en: {
    tagline:
      "Cybersecurity articles, analyses and tutorials: offensive security, defense, cryptography and infosec news.",
    featured: "Featured",
    featuredAria: "Featured article",
    readArticle: "Read the article",
    empty: "No articles published yet. Check back soon!",
    latest: "Latest articles",
    allArticles: "All articles →",
  },
};

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];

  const latest = await db.article.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 7,
    select: articleCardSelect,
  });

  const [featuredRow, ...restRows] = latest;
  const featured = featuredRow ? localizeCard(featuredRow, locale) : undefined;

  return (
    <div className="space-y-14">
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
            <Link href={localeHref(locale, `/articles/${featured.slug}`)} className="block">
              {featured.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featured.coverImage}
                  alt=""
                  className="h-full min-h-56 w-full object-cover"
                />
              ) : (
                <div className="flex h-full min-h-56 items-center justify-center bg-gradient-to-br from-accent/20 via-surface to-surface">
                  <Image
                    src="/images/Logo/cybersphere-icone.png"
                    alt=""
                    width={1024}
                    height={1024}
                    className="h-24 w-24 opacity-40"
                    aria-hidden
                  />
                </div>
              )}
            </Link>
            <div className="flex flex-col gap-4 p-8">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-accent px-2.5 py-0.5 font-mono text-xs font-semibold text-accent-contrast">
                  {t.featured}
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
                  {formatDate(featured.publishedAt, locale)} · {featured.author.name}
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
