import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localeHref, toLocale, type Locale } from "@/lib/i18n";
import { authorHref } from "@/lib/authors";
import {
  PAGE_SIZE,
  articleCardSelect,
  localizeCard,
  pageNumber,
} from "@/lib/articles";
import {
  breadcrumbJsonLd,
  pageMetadata,
  pagedTitle,
  parseProfileLinks,
  profilePageJsonLd,
  withQuery,
} from "@/lib/seo";
import { ArticleCard } from "@/components/article-card";
import { JsonLd } from "@/components/json-ld";
import { Pagination } from "@/components/pagination";
import { ProfileLinkIcon } from "@/components/profile-link-icon";

const copy = {
  fr: {
    home: "Accueil",
    breadcrumbAria: "Fil d'Ariane",
    fallbackDescription: (name: string) => `Articles de ${name} sur CyberSphere.`,
    linksAria: "Profils publics",
    articles: "Articles publiés",
    count: (n: number) => `${n} article${n > 1 ? "s" : ""}`,
  },
  en: {
    home: "Home",
    breadcrumbAria: "Breadcrumb",
    fallbackDescription: (name: string) => `Articles by ${name} on CyberSphere.`,
    linksAria: "Public profiles",
    articles: "Published articles",
    count: (n: number) => `${n} article${n === 1 ? "" : "s"}`,
  },
};

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

/** Auteur public : un slug et au moins un article publié, sinon pas de page. */
async function findAuthor(slug: string) {
  return db.user.findFirst({
    where: { slug, articles: { some: { status: "PUBLISHED" } } },
    select: { id: true, name: true, image: true, bio: true, bioEn: true, links: true },
  });
}

/**
 * Bio dans la langue de la page. En anglais sans traduction, la bio française
 * est servie telle quelle (lang = "fr") ; sans bio, rien n'est affiché.
 */
function localizedBio(
  author: { bio: string | null; bioEn: string | null },
  locale: Locale,
): { text: string; lang?: Locale } | null {
  if (locale === "en" && author.bioEn) return { text: author.bioEn };
  if (!author.bio) return null;
  return { text: author.bio, lang: locale === "en" ? "fr" : undefined };
}

/** Méta-description : la bio coupée vers 160 caractères, sur une fin de mot. */
function metaDescription(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 159);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 100 ? cut.lastIndexOf(" ") : 159)}…`;
}

/** Nom d'hôte affiché pour un profil public (www. retiré). */
function linkLabel(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale: rawLocale, slug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = toLocale(rawLocale);
  const author = await findAuthor(slug);
  if (!author) return {};
  const bio = localizedBio(author, locale);
  return pageMetadata({
    locale,
    path: withQuery(`/auteurs/${slug}`, { page: pageNumber(pageParam) }),
    title: pagedTitle(author.name, pageNumber(pageParam)),
    description: bio ? metaDescription(bio.text) : copy[locale].fallbackDescription(author.name),
    openGraph: { type: "profile" },
  });
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const [{ locale: rawLocale, slug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = toLocale(rawLocale);
  const t = copy[locale];
  const page = pageNumber(pageParam);

  const author = await findAuthor(slug);
  if (!author) notFound();

  const where = { status: "PUBLISHED" as const, authorId: author.id };
  const [articles, total] = await Promise.all([
    db.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: articleCardSelect,
    }),
    db.article.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Page au-delà de la dernière : vraie 404 plutôt qu'une liste vide en 200
  if (page > totalPages) notFound();

  const bio = localizedBio(author, locale);
  const links = parseProfileLinks(author.links);

  return (
    <div className="space-y-8">
      <JsonLd
        data={[
          profilePageJsonLd({
            name: author.name,
            path: authorHref(slug, locale),
            description: bio?.text,
            image: author.image,
            sameAs: links,
          }),
          breadcrumbJsonLd([{ name: t.home, path: localeHref(locale, "/") }, { name: author.name }]),
        ]}
      />
      <header className="space-y-4">
        <nav aria-label={t.breadcrumbAria}>
          <ol className="font-mono text-sm text-muted [&>li]:inline">
            <li>
              <Link href={localeHref(locale, "/")} className="hover:text-accent">
                {t.home}
              </Link>
              <span aria-hidden>{" / "}</span>
            </li>
            <li aria-current="page" className="text-foreground">
              {author.name}
            </li>
          </ol>
        </nav>
        <div className="flex items-center gap-4">
          {author.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.image}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-full border border-border object-cover"
            />
          ) : (
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 font-mono text-xl font-bold text-accent"
              aria-hidden
            >
              {author.name.charAt(0).toUpperCase()}
            </span>
          )}
          <h1 className="text-3xl font-bold">{author.name}</h1>
        </div>
        {bio && (
          <p lang={bio.lang} className="max-w-3xl whitespace-pre-line text-muted">
            {bio.text}
          </p>
        )}
        {links.length > 0 && (
          <ul aria-label={t.linksAria} className="flex flex-wrap gap-2">
            {links.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  rel="me noopener"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  <ProfileLinkIcon url={url} />
                  {linkLabel(url)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>

      <section className="space-y-6">
        <h2 className="text-xl font-bold">
          {t.articles} <span className="font-mono text-base text-muted">({t.count(total)})</span>
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard
              key={article.slug}
              article={localizeCard(article, locale)}
              locale={locale}
            />
          ))}
        </div>
      </section>

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => localeHref(locale, `/auteurs/${slug}?page=${p}`)}
        locale={locale}
      />
    </div>
  );
}
