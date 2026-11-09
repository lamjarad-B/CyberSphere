import Link from "next/link";
import Image from "next/image";
import { formatDate } from "@/lib/format";
import { localeHref, type Locale } from "@/lib/i18n";
import { authorHref } from "@/lib/authors";
import { cardClass } from "./ui";
import { CoverFill } from "./cover-image";

export type ArticleCardData = {
  slug: string;
  title: string;
  excerpt: string;
  /** Libellé du type d'article, déjà localisé (« Analyse », « Tutoriel »…) */
  kind: string;
  coverImage: string | null;
  publishedAt: Date | null;
  category: { name: string; slug: string };
  /** `slug` : page auteur publique, absente tant que l'auteur n'a rien publié. */
  author: { name: string; slug?: string | null };
};

/** Nom de l'auteur, lié à sa page quand elle existe. */
export function AuthorName({
  author,
  locale,
}: {
  author: ArticleCardData["author"];
  locale: Locale;
}) {
  if (!author.slug) return <>{author.name}</>;
  return (
    <Link href={authorHref(author.slug, locale)} className="transition-colors hover:text-accent">
      {author.name}
    </Link>
  );
}

export function ArticleCard({
  article,
  locale,
  headingLevel = 3,
}: {
  article: ArticleCardData;
  locale: Locale;
  /** 2 sur une page de liste, où la carte suit directement le h1 ; 3 sous un h2. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article
      className={`${cardClass} group flex flex-col overflow-hidden transition-colors hover:border-accent/60`}
    >
      {/* Doublon du lien du titre : masqué au clavier et aux lecteurs d’écran */}
      <Link
        href={localeHref(locale, `/articles/${article.slug}`)}
        className="block"
        tabIndex={-1}
        aria-hidden
      >
        {article.coverImage ? (
          <div className="relative aspect-video w-full">
            <CoverFill
              src={article.coverImage}
              sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-accent/15 via-surface to-surface">
            {/* Dimensions d'affichage : le srcset de next/image en découle */}
            <Image
              src="/images/Logo/cybersphere-icone.png"
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 opacity-40"
              aria-hidden
            />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            {article.kind}
          </span>
          <Link
            href={localeHref(locale, `/categories/${article.category.slug}`)}
            className="w-fit rounded-full border border-accent/40 px-2.5 py-0.5 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
          >
            {article.category.name}
          </Link>
        </div>
        <Heading className="text-lg font-semibold leading-snug">
          <Link
            href={localeHref(locale, `/articles/${article.slug}`)}
            className="transition-colors group-hover:text-accent"
          >
            {article.title}
          </Link>
        </Heading>
        <p className="line-clamp-3 text-sm text-muted">{article.excerpt}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <p className="text-xs text-muted">
            <time dateTime={article.publishedAt?.toISOString()}>
              {formatDate(article.publishedAt, locale)}
            </time>{" "}
            · <AuthorName author={article.author} locale={locale} />
          </p>
          {/* Doublon du lien du titre : masqué au clavier et aux lecteurs d’écran */}
          <Link
            href={localeHref(locale, `/articles/${article.slug}`)}
            className="text-sm font-medium text-accent transition-colors hover:underline"
            tabIndex={-1}
            aria-hidden
          >
            {locale === "en" ? "Read the article" : "Lire l’article"}{" "}
            <span className="inline-block transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}
