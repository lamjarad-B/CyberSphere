import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { extractToc, readingTimeMinutes, renderMarkdown } from "@/lib/markdown";
import { externalReferrerHost, recordArticleView } from "@/lib/stats";
import { formatDate, formatDateTime } from "@/lib/format";
import { localeHref, toLocale, type Locale } from "@/lib/i18n";
import { articleCardSelect, categoryLabel, localizeCard } from "@/lib/articles";
import { ArticleCard } from "@/components/article-card";
import { ArticleActions } from "@/components/article-actions";
import { CodeCopy } from "@/components/code-copy";
import { cardClass } from "@/components/ui";
import {
  CommentSection,
  type CommentView,
  type Viewer,
} from "@/components/comments/comment-section";

const copy = {
  fr: {
    home: "Accueil",
    submittedBanner:
      "En attente de validation — cet article n'est pas visible du public.",
    draftBanner: "Brouillon — cet article n'est visible que par l'équipe.",
    untranslatedBanner: "",
    readingTime: (min: number) => `${min} min de lecture`,
    views: (n: number) => `${n} vue${n > 1 ? "s" : ""}`,
    seriesLabel: "Série :",
    seriesAria: "Série d'articles",
    toc: "Sommaire",
    readNext: "À lire ensuite",
    similarAria: "Articles similaires",
  },
  en: {
    home: "Home",
    submittedBanner: "Awaiting review — this article is not visible to the public.",
    draftBanner: "Draft — this article is only visible to the team.",
    untranslatedBanner:
      "This article hasn't been translated into English yet — you're reading the original French version.",
    readingTime: (min: number) => `${min} min read`,
    views: (n: number) => `${n} view${n === 1 ? "" : "s"}`,
    seriesLabel: "Series:",
    seriesAria: "Article series",
    toc: "Contents",
    readNext: "Read next",
    similarAria: "Related articles",
  },
};

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = toLocale(rawLocale);
  const article = await db.article.findUnique({
    where: { slug },
    select: {
      title: true,
      excerpt: true,
      coverImage: true,
      status: true,
      publishedAt: true,
      translations: {
        where: { locale: "en" },
        select: { title: true, excerpt: true },
      },
    },
  });
  if (!article || article.status !== "PUBLISHED") return {};
  const translation = locale === "en" ? article.translations[0] : undefined;
  const title = translation?.title ?? article.title;
  const description = translation?.excerpt ?? article.excerpt;
  return {
    title,
    description,
    alternates: {
      canonical: localeHref(locale, `/articles/${slug}`),
      languages: {
        fr: `/articles/${slug}`,
        en: `/en/articles/${slug}`,
      },
    },
    openGraph: {
      title,
      description,
      type: "article",
      locale: locale === "en" ? "en_US" : "fr_FR",
      publishedTime: article.publishedAt?.toISOString(),
      images: article.coverImage ? [article.coverImage] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale: Locale = toLocale(rawLocale);
  const t = copy[locale];

  const [article, session] = await Promise.all([
    db.article.findUnique({
      where: { slug },
      include: {
        author: { select: { name: true, image: true } },
        category: { include: { parent: true } },
        tags: { orderBy: { name: "asc" } },
        translations: {
          where: { locale: "en" },
          select: { title: true, excerpt: true, content: true },
        },
        series: {
          select: {
            title: true,
            titleEn: true,
            slug: true,
            articles: {
              where: { status: "PUBLISHED" },
              orderBy: [{ seriesPosition: "asc" }, { publishedAt: "asc" }],
              select: {
                slug: true,
                title: true,
                seriesPosition: true,
                translations: {
                  where: { locale: "en" },
                  select: { title: true },
                },
              },
            },
          },
        },
        _count: { select: { reactions: true } },
      },
    }),
    getSession(),
  ]);

  if (!article) notFound();
  const isStaff =
    session?.user.role === "admin" || session?.user.role === "author";
  if (article.status !== "PUBLISHED" && !isStaff) notFound();

  if (article.status === "PUBLISHED") {
    // Le référent se lit pendant le rendu ; l'écriture part dans after()
    const referrerHost = await externalReferrerHost().catch(() => null);
    after(async () => {
      await recordArticleView(article.id, referrerHost).catch((error) => {
        console.error("[stats] vue non comptabilisée :", error);
      });
    });
  }

  // Version affichée : traduction anglaise si demandée et disponible,
  // sinon repli sur l'original français (avec bandeau d'avertissement).
  const translation = locale === "en" ? article.translations[0] : undefined;
  const untranslated = locale === "en" && !translation;
  const title = translation?.title ?? article.title;
  const excerpt = translation?.excerpt ?? article.excerpt;
  const content = translation?.content ?? article.content;

  const [html, rawComments, viewerReaction, viewerBookmark, similar] =
    await Promise.all([
      renderMarkdown(content),
      db.comment.findMany({
        where: { articleId: article.id, parentId: null },
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true, image: true } },
          replies: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, image: true } } },
          },
        },
      }),
      session
        ? db.reaction.findUnique({
            where: {
              articleId_userId: { articleId: article.id, userId: session.user.id },
            },
            select: { id: true },
          })
        : null,
      session
        ? db.bookmark.findUnique({
            where: {
              articleId_userId: { articleId: article.id, userId: session.user.id },
            },
            select: { id: true },
          })
        : null,
      db.article.findMany({
        where: {
          status: "PUBLISHED",
          id: { not: article.id },
          OR: [
            { categoryId: article.categoryId },
            { tags: { some: { id: { in: article.tags.map((tag) => tag.id) } } } },
          ],
        },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: articleCardSelect,
      }),
    ]);

  const toc = extractToc(content);
  const readingTime = readingTimeMinutes(content);

  const comments: CommentView[] = rawComments.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: formatDateTime(c.createdAt, locale),
    author: c.author,
    replies: c.replies.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: formatDateTime(r.createdAt, locale),
      author: r.author,
      replies: [],
    })),
  }));

  const viewer: Viewer = session
    ? {
        id: session.user.id,
        name: session.user.name,
        isAdmin: session.user.role === "admin",
      }
    : null;

  const seriesTitle =
    locale === "en" && article.series?.titleEn
      ? article.series.titleEn
      : article.series?.title;

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      {article.status !== "PUBLISHED" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-500">
          {article.status === "SUBMITTED" ? t.submittedBanner : t.draftBanner}
        </p>
      )}

      {untranslated && (
        <p
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-600 dark:text-sky-400"
          lang="en"
        >
          {t.untranslatedBanner}
        </p>
      )}

      <header className="space-y-4">
        <p className="font-mono text-sm text-muted">
          <Link href={localeHref(locale, "/")} className="hover:text-accent">
            {t.home}
          </Link>
          {" / "}
          {article.category.parent && (
            <>
              <Link
                href={localeHref(locale, `/categories/${article.category.parent.slug}`)}
                className="hover:text-accent"
              >
                {categoryLabel(article.category.parent, locale)}
              </Link>
              {" / "}
            </>
          )}
          <Link
            href={localeHref(locale, `/categories/${article.category.slug}`)}
            className="hover:text-accent"
          >
            {categoryLabel(article.category, locale)}
          </Link>
        </p>

        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>

        <p className="text-lg text-muted">{excerpt}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span className="flex items-center gap-2">
            {article.author.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.author.image}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 font-mono text-xs font-bold text-accent">
                {article.author.name.charAt(0).toUpperCase()}
              </span>
            )}
            {article.author.name}
          </span>
          {article.publishedAt && <span>{formatDate(article.publishedAt, locale)}</span>}
          <span>{t.readingTime(readingTime)}</span>
          <span>{t.views(article.views)}</span>
        </div>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <Link
                key={tag.id}
                href={localeHref(locale, `/tags/${tag.slug}`)}
                className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      {article.series && article.series.articles.length > 1 && (
        <aside className={`${cardClass} space-y-2 p-5`} aria-label={t.seriesAria}>
          <p className="text-sm font-semibold">
            {t.seriesLabel}{" "}
            <Link
              href={localeHref(locale, `/series/${article.series.slug}`)}
              className="text-accent hover:underline"
            >
              {seriesTitle}
            </Link>
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {article.series.articles.map((episode) => {
              const episodeTitle =
                locale === "en"
                  ? episode.translations[0]?.title ?? episode.title
                  : episode.title;
              return (
                <li key={episode.slug}>
                  {episode.slug === article.slug ? (
                    <span className="font-medium text-accent">{episodeTitle}</span>
                  ) : (
                    <Link
                      href={localeHref(locale, `/articles/${episode.slug}`)}
                      className="text-muted hover:text-accent hover:underline"
                    >
                      {episodeTitle}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </aside>
      )}

      {article.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverImage}
          alt=""
          className="w-full rounded-xl border border-border object-cover"
        />
      )}

      {toc.length >= 3 && (
        <nav className={`${cardClass} p-5`} aria-label={t.toc}>
          <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted">
            {t.toc}
          </p>
          <ul className="space-y-1 text-sm">
            {toc.map((entry) => (
              <li key={entry.id} className={entry.depth === 3 ? "pl-4" : ""}>
                <a href={`#${entry.id}`} className="text-muted hover:text-accent">
                  {entry.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <CodeCopy>
        <div
          className="prose prose-neutral max-w-none dark:prose-invert"
          // Contenu compilé côté serveur depuis le Markdown : le HTML brut
          // saisi dans l'éditeur est ignoré par le pipeline (voir lib/markdown.ts)
          dangerouslySetInnerHTML={{ __html: html }}
          lang={untranslated ? "fr" : undefined}
        />
      </CodeCopy>

      {article.status === "PUBLISHED" && (
        <ArticleActions
          articleId={article.id}
          articleSlug={article.slug}
          reactionCount={article._count.reactions}
          reacted={Boolean(viewerReaction)}
          bookmarked={Boolean(viewerBookmark)}
          isLoggedIn={Boolean(session)}
        />
      )}

      <hr className="border-border" />

      <CommentSection
        articleId={article.id}
        articleSlug={article.slug}
        comments={comments}
        viewer={viewer}
      />

      {similar.length > 0 && (
        <section className="space-y-4" aria-label={t.similarAria}>
          <h2 className="text-xl font-bold">{t.readNext}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((item) => (
              <ArticleCard
                key={item.slug}
                article={localizeCard(item, locale)}
                locale={locale}
              />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
