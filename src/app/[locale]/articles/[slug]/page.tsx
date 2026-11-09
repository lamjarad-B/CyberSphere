import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requestIp } from "@/lib/audit";
import { getSession, getStaffSession, isStaffAccount } from "@/lib/session";
import { extractToc, readingTimeMinutes, renderMarkdown, wordCount } from "@/lib/markdown";
import { localImageSize, shareableImageSize } from "@/lib/images";
import { authorHref } from "@/lib/authors";
import { externalReferrerHost, isBotRequest, recordArticleView } from "@/lib/stats";
import { formatDate, formatDateTime } from "@/lib/format";
import { localeHref, toLocale, type Locale } from "@/lib/i18n";
import { articleCardSelect, categoryLabel, kindLabel, localizeCard } from "@/lib/articles";
import {
  DEFAULT_OG_IMAGE,
  OG_LOCALES,
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  pageMetadata,
  parseProfileLinks,
} from "@/lib/seo";
import { ArticleCard } from "@/components/article-card";
import { ArticleActions } from "@/components/article-actions";
import { CodeCopy } from "@/components/code-copy";
import { isVectorImage, shareableImage } from "@/components/cover-image";
import { JsonLd } from "@/components/json-ld";
import { KeyPoints } from "@/components/key-points";
import { buttonClass, cardClass } from "@/components/ui";
import {
  CommentSection,
  type CommentView,
  type Viewer,
} from "@/components/comments/comment-section";

/**
 * Champs publics d'un commentaire, en liste explicite : l'e-mail et
 * l'empreinte IP d'un invité ne doivent jamais atteindre le rendu de la page.
 */
const publicCommentSelect = {
  id: true,
  content: true,
  createdAt: true,
  guestName: true,
  author: { select: { id: true, name: true, image: true } },
} as const;

/** Le membre auteur du commentaire, ou le nom saisi par l'invité (id null). */
function commentAuthor(comment: {
  author: CommentView["author"] | null;
  guestName: string | null;
}): CommentView["author"] {
  return comment.author ?? { id: null, name: comment.guestName ?? "", image: null };
}

const copy = {
  fr: {
    home: "Accueil",
    breadcrumbAria: "Fil d'Ariane",
    submittedBanner:
      "En attente de validation — cet article n'est pas visible du public.",
    draftBanner: "Brouillon — cet article n'est visible que par l'équipe.",
    scheduledBanner: (date: string) =>
      `Programmé pour le ${date} — cet article n'est pas encore visible du public.`,
    upcomingTitle: "Article à venir",
    upcomingBody: "Cet article n'est pas encore disponible. Revenez bientôt !",
    upcomingLink: "Voir tous les articles",
    untranslatedBanner: "",
    readingTime: (min: number) => `${min} min de lecture`,
    updated: "Mis à jour le",
    views: (n: number) => `${n} vue${n > 1 ? "s" : ""}`,
    seriesLabel: "Série :",
    seriesAria: "Série d'articles",
    seriesNavAria: "Épisodes de la série",
    previousEpisode: "← Épisode précédent",
    nextEpisode: "Épisode suivant →",
    toc: "Sommaire",
    readNext: "À lire ensuite",
    similarAria: "Articles similaires",
  },
  en: {
    home: "Home",
    breadcrumbAria: "Breadcrumb",
    submittedBanner: "Awaiting review — this article is not visible to the public.",
    draftBanner: "Draft — this article is only visible to the team.",
    scheduledBanner: (date: string) =>
      `Scheduled for ${date} — this article is not visible to the public yet.`,
    upcomingTitle: "Upcoming article",
    upcomingBody: "This article isn't available yet. Check back soon!",
    upcomingLink: "See all articles",
    untranslatedBanner:
      "This article hasn't been translated into English yet — you're reading the original French version.",
    readingTime: (min: number) => `${min} min read`,
    updated: "Updated",
    views: (n: number) => `${n} view${n === 1 ? "" : "s"}`,
    seriesLabel: "Series:",
    seriesAria: "Article series",
    seriesNavAria: "Series episodes",
    previousEpisode: "← Previous episode",
    nextEpisode: "Next episode →",
    toc: "Contents",
    readNext: "Read next",
    similarAria: "Related articles",
  },
};

type Props = { params: Promise<{ locale: string; slug: string }> };

/**
 * Dernière modification du texte servi : modification du contenu de
 * l'article, ou de sa traduction quand c'est elle qui est servie — jamais
 * antérieure à la publication. updatedAt n'entre pas en compte : il bouge à
 * chaque enregistrement, même sans changement de texte.
 */
function lastModified(
  article: { publishedAt: Date | null; contentUpdatedAt: Date | null },
  translation?: { updatedAt: Date },
): Date | null {
  const times = [article.publishedAt, article.contentUpdatedAt, translation?.updatedAt]
    .filter((date): date is Date => date instanceof Date)
    .map((date) => date.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = toLocale(rawLocale);
  const article = await db.article.findUnique({
    where: { slug },
    select: {
      title: true,
      excerpt: true,
      coverImage: true,
      coverAlt: true,
      status: true,
      publishedAt: true,
      contentUpdatedAt: true,
      author: { select: { name: true } },
      category: { select: { name: true, nameEn: true } },
      tags: { orderBy: { name: "asc" }, select: { name: true } },
      translations: {
        where: { locale: "en" },
        select: { title: true, excerpt: true, coverAlt: true, updatedAt: true },
      },
    },
  });
  if (article?.status === "SCHEDULED") {
    return { title: copy[locale].upcomingTitle, robots: { index: false } };
  }
  if (!article || article.status !== "PUBLISHED") return {};
  // Traduction existante : les deux versions se répondent (hreflang). Sinon
  // /en sert l'original français et le désigne comme canonique.
  const english = article.translations[0];
  const translation = locale === "en" ? english : undefined;
  const title = translation?.title ?? article.title;
  const description = translation?.excerpt ?? article.excerpt;
  const coverAlt = (translation ? translation.coverAlt : article.coverAlt) ?? undefined;
  // Couverture SVG : son aperçu PNG, les réseaux sociaux refusant le vectoriel
  const cover = shareableImage(article.coverImage);
  const coverSize = cover ? await shareableImageSize(cover) : null;
  return pageMetadata({
    locale,
    path: `/articles/${slug}`,
    title,
    description,
    bilingual: Boolean(english),
    openGraph: {
      type: "article",
      // Langue du texte servi : un article non traduit reste en français sous /en
      locale: OG_LOCALES[translation ? "en" : "fr"],
      ...(english && { alternateLocale: [OG_LOCALES[translation ? "fr" : "en"]] }),
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: lastModified(article, translation)?.toISOString(),
      authors: [article.author.name],
      section: categoryLabel(article.category, locale),
      tags: article.tags.map((tag) => tag.name),
      images: cover
        ? [{ url: absoluteUrl(cover), ...coverSize, ...(coverAlt && { alt: coverAlt }) }]
        : [DEFAULT_OG_IMAGE],
    },
  });
}

export default async function ArticlePage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale: Locale = toLocale(rawLocale);
  const t = copy[locale];

  const [article, session] = await Promise.all([
    db.article.findUnique({
      where: { slug },
      include: {
        author: { select: { name: true, image: true, slug: true, links: true } },
        category: { include: { parent: true } },
        tags: { orderBy: { name: "asc" } },
        translations: {
          where: { locale: "en" },
          select: {
            title: true,
            excerpt: true,
            content: true,
            keyPoints: true,
            coverAlt: true,
            updatedAt: true,
          },
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
  // Non publié : visible des admins, et de son auteur (rôle auteur) —
  // jamais des brouillons d'un autre auteur. Comme pour toute
  // l'administration, 2FA et compte non banni exigés (getStaffSession).
  if (article.status !== "PUBLISHED") {
    const staff = await getStaffSession();
    const canSeeUnpublished =
      staff?.user.role === "admin" ||
      (staff?.user.role === "author" && staff.user.id === article.authorId);
    if (!canSeeUnpublished) {
      // Programmé : on annonce l'article sans rien en révéler (ni titre ni date)
      if (article.status !== "SCHEDULED") notFound();
      return (
        <div className="flex flex-col items-center gap-6 px-4 py-24 text-center">
          <h1 className="text-4xl font-bold">{t.upcomingTitle}</h1>
          <p className="max-w-md text-muted">{t.upcomingBody}</p>
          <Link href={localeHref(locale, "/articles")} className={buttonClass}>
            {t.upcomingLink}
          </Link>
        </div>
      );
    }
  }

  // Les relectures de l'équipe (admins, auteurs) ne sont pas des lectures
  if (article.status === "PUBLISHED" && !isStaffAccount(session)) {
    // Référent, IP et user-agent se lisent pendant le rendu ; l'écriture part dans after()
    const [referrerHost, visitor, bot] = await Promise.all([
      externalReferrerHost().catch(() => null),
      requestIp(),
      isBotRequest(),
    ]);
    if (!bot) {
      after(async () => {
        await recordArticleView(article.id, referrerHost, visitor).catch((error) => {
          console.error("[stats] vue non comptabilisée :", error);
        });
      });
    }
  }

  // Version affichée : traduction anglaise si demandée et disponible,
  // sinon repli sur l'original français (avec bandeau d'avertissement).
  const translation = locale === "en" ? article.translations[0] : undefined;
  const untranslated = locale === "en" && !translation;
  // Repli sur l'original : ces textes restent en français dans une page anglaise
  const contentLang = untranslated ? "fr" : undefined;
  const title = translation?.title ?? article.title;
  const excerpt = translation?.excerpt ?? article.excerpt;
  const content = translation?.content ?? article.content;
  const coverAlt = (translation ? translation.coverAlt : article.coverAlt) ?? "";
  const keyPoints = translation ? translation.keyPoints : article.keyPoints;

  const [html, rawComments, viewerReaction, viewerBookmark, similar, coverSize] =
    await Promise.all([
      // Libellé des sources dans la langue du texte affiché (repli : français)
      renderMarkdown(content, translation ? "en" : "fr"),
      db.comment.findMany({
        where: { articleId: article.id, parentId: null, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        select: {
          ...publicCommentSelect,
          replies: {
            where: { status: "APPROVED" },
            orderBy: { createdAt: "asc" },
            select: publicCommentSelect,
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
      // Dimensions de la couverture : sa place est réservée avant chargement
      article.coverImage ? localImageSize(article.coverImage) : null,
    ]);

  const toc = extractToc(content);
  const readingTime = readingTimeMinutes(content);

  const comments: CommentView[] = rawComments.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: formatDateTime(c.createdAt, locale),
    createdAtIso: c.createdAt.toISOString(),
    author: commentAuthor(c),
    replies: c.replies.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: formatDateTime(r.createdAt, locale),
      createdAtIso: r.createdAt.toISOString(),
      author: commentAuthor(r),
      replies: [],
    })),
  }));

  // « Mis à jour le » : seulement si le texte servi a changé un autre jour
  // que celui de sa publication (fuseau d'affichage, comme les dates)
  const modifiedAt = lastModified(article, translation) ?? article.createdAt;
  const updatedAt =
    article.publishedAt &&
    formatDate(modifiedAt, locale) !== formatDate(article.publishedAt, locale)
      ? modifiedAt
      : null;
  const authorPath = article.author.slug ? authorHref(article.author.slug, locale) : undefined;

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

  // Navigation précédent / suivant entre les épisodes publiés de la série
  const episodes = (article.series?.articles ?? []).map((episode) => ({
    slug: episode.slug,
    title:
      locale === "en"
        ? (episode.translations[0]?.title ?? episode.title)
        : episode.title,
  }));
  const episodeIndex = episodes.findIndex((episode) => episode.slug === article.slug);
  const previousEpisode = episodeIndex > 0 ? episodes[episodeIndex - 1] : null;
  const nextEpisode =
    episodeIndex >= 0 && episodeIndex < episodes.length - 1
      ? episodes[episodeIndex + 1]
      : null;

  // Données structurées des seuls articles publics (pas des relectures de l'équipe)
  const categoryName = categoryLabel(article.category, locale);
  const structuredData =
    article.status === "PUBLISHED"
      ? [
          articleJsonLd({
            // Canonique : l'original français tant que l'article n'est pas traduit
            path:
              article.translations.length > 0
                ? localeHref(locale, `/articles/${article.slug}`)
                : `/articles/${article.slug}`,
            headline: title,
            description: excerpt,
            inLanguage: translation ? "en" : "fr",
            datePublished: article.publishedAt,
            dateModified: modifiedAt,
            authorName: article.author.name,
            authorPath,
            authorSameAs: parseProfileLinks(article.author.links),
            image: shareableImage(article.coverImage),
            section: categoryName,
            keywords: article.tags.map((tag) => tag.name),
            wordCount: wordCount(content),
            ...(article.series && {
              series: {
                name: seriesTitle ?? article.series.title,
                path: localeHref(locale, `/series/${article.series.slug}`),
              },
            }),
          }),
          breadcrumbJsonLd([
            { name: t.home, path: localeHref(locale, "/") },
            ...(article.category.parent
              ? [
                  {
                    name: categoryLabel(article.category.parent, locale),
                    path: localeHref(locale, `/categories/${article.category.parent.slug}`),
                  },
                ]
              : []),
            {
              name: categoryName,
              path: localeHref(locale, `/categories/${article.category.slug}`),
            },
            { name: title },
          ]),
        ]
      : null;

  const tocList = (
    <ul className="space-y-1 text-sm">
      {toc.map((entry) => (
        <li key={entry.id} className={entry.depth === 3 ? "pl-4" : ""}>
          <a href={`#${entry.id}`} className="text-muted hover:text-accent">
            {entry.text}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      {structuredData && <JsonLd data={structuredData} />}

      {article.status !== "PUBLISHED" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-warning">
          {article.status === "SUBMITTED"
            ? t.submittedBanner
            : article.status === "SCHEDULED"
              ? t.scheduledBanner(formatDateTime(article.publishedAt, locale))
              : t.draftBanner}
        </p>
      )}

      {untranslated && (
        <p
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-info"
          lang="en"
        >
          {t.untranslatedBanner}
        </p>
      )}

      <header className="space-y-4">
        <div className="text-sm text-muted">
          <Link
            href={localeHref(locale, `/articles?type=${article.kind.toLowerCase()}`)}
            className="mr-3 rounded-full border border-border px-2.5 py-0.5 font-mono text-xs font-semibold transition-colors hover:border-accent hover:text-accent"
          >
            {kindLabel(article.kind, locale)}
          </Link>
          {/* Fil d'Ariane en ligne, à la suite du type d'article */}
          <nav aria-label={t.breadcrumbAria} className="inline">
            <ol className="inline">
              <li className="inline">
                <Link href={localeHref(locale, "/")} className="hover:text-accent">
                  {t.home}
                </Link>
              </li>
              {article.category.parent && (
                <li className="inline">
                  <span aria-hidden>{" / "}</span>
                  <Link
                    href={localeHref(locale, `/categories/${article.category.parent.slug}`)}
                    className="hover:text-accent"
                  >
                    {categoryLabel(article.category.parent, locale)}
                  </Link>
                </li>
              )}
              <li className="inline">
                <span aria-hidden>{" / "}</span>
                <Link
                  href={localeHref(locale, `/categories/${article.category.slug}`)}
                  className="hover:text-accent"
                >
                  {categoryName}
                </Link>
              </li>
            </ol>
          </nav>
        </div>

        <h1 lang={contentLang} className="text-3xl font-bold leading-tight sm:text-4xl">
          {title}
        </h1>

        <p lang={contentLang} className="text-lg text-muted">
          {excerpt}
        </p>

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
            {authorPath ? (
              <Link href={authorPath} rel="author" className="hover:text-accent">
                {article.author.name}
              </Link>
            ) : (
              article.author.name
            )}
          </span>
          {article.publishedAt && (
            <time dateTime={article.publishedAt.toISOString()}>
              {formatDate(article.publishedAt, locale)}
            </time>
          )}
          {updatedAt && (
            <span>
              {t.updated}{" "}
              <time dateTime={updatedAt.toISOString()}>{formatDate(updatedAt, locale)}</time>
            </span>
          )}
          <span>{t.readingTime(readingTime)}</span>
          <span>{t.views(article.views)}</span>
        </div>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <Link
                key={tag.id}
                href={localeHref(locale, `/tags/${tag.slug}`)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      <KeyPoints raw={keyPoints} locale={locale} lang={contentLang} />

      {article.series && article.series.articles.length > 1 && (
        <aside className={`${cardClass} space-y-2 p-5`} aria-label={t.seriesAria}>
          <p className="text-sm font-semibold">
            {t.seriesLabel}{" "}
            <Link
              href={localeHref(locale, `/series/${article.series.slug}`)}
              className="text-accent underline"
            >
              {seriesTitle}
            </Link>
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {episodes.map((episode) => (
              <li key={episode.slug}>
                {episode.slug === article.slug ? (
                  <span className="font-medium text-accent">{episode.title}</span>
                ) : (
                  <Link
                    href={localeHref(locale, `/articles/${episode.slug}`)}
                    className="text-muted hover:text-accent hover:underline"
                  >
                    {episode.title}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </aside>
      )}

      {article.coverImage &&
        (coverSize ? (
          // Image principale de l'article : préchargée, servie à la largeur
          // de la colonne (768 px au plus) plutôt qu'en taille d'origine
          <Image
            src={article.coverImage}
            alt={coverAlt}
            lang={contentLang}
            width={coverSize.width}
            height={coverSize.height}
            sizes="(min-width: 768px) 768px, 100vw"
            preload
            unoptimized={isVectorImage(article.coverImage)}
            className="w-full rounded-xl border border-border object-cover"
          />
        ) : (
          // Fichier introuvable ou illisible : dimensions inconnues
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.coverImage}
            alt={coverAlt}
            lang={contentLang}
            fetchPriority="high"
            className="w-full rounded-xl border border-border object-cover"
          />
        ))}

      {toc.length >= 3 && (
        <>
          {/* Petits écrans : sommaire en tête d'article */}
          <nav className={`${cardClass} p-5 xl:hidden`} aria-label={t.toc}>
            <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted">
              {t.toc}
            </p>
            {tocList}
          </nav>
          {/* Desktop : sommaire flottant dans la marge droite, toujours visible */}
          <nav
            className="fixed left-[calc(50%+25.5rem)] top-24 hidden max-h-[calc(100vh-8rem)] w-52 overflow-y-auto border-l border-border pl-4 xl:block"
            aria-label={t.toc}
          >
            <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted">
              {t.toc}
            </p>
            {tocList}
          </nav>
        </>
      )}

      <CodeCopy>
        <div
          className="prose prose-lg prose-neutral max-w-none dark:prose-invert"
          // Contenu compilé côté serveur depuis le Markdown : le HTML brut
          // saisi dans l'éditeur est ignoré par le pipeline (voir lib/markdown.ts)
          dangerouslySetInnerHTML={{ __html: html }}
          lang={contentLang}
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

      {(previousEpisode || nextEpisode) && (
        <nav className="grid gap-4 sm:grid-cols-2" aria-label={t.seriesNavAria}>
          {previousEpisode ? (
            <Link
              href={localeHref(locale, `/articles/${previousEpisode.slug}`)}
              className={`${cardClass} block p-4 transition-colors hover:border-accent`}
            >
              <span className="font-mono text-xs text-muted">{t.previousEpisode}</span>
              <span className="mt-1 block font-medium">{previousEpisode.title}</span>
            </Link>
          ) : (
            <span aria-hidden />
          )}
          {nextEpisode && (
            <Link
              href={localeHref(locale, `/articles/${nextEpisode.slug}`)}
              className={`${cardClass} block p-4 text-right transition-colors hover:border-accent`}
            >
              <span className="font-mono text-xs text-muted">{t.nextEpisode}</span>
              <span className="mt-1 block font-medium">{nextEpisode.title}</span>
            </Link>
          )}
        </nav>
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
