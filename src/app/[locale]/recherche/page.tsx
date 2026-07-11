import type { Metadata } from "next";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PAGE_SIZE, pageNumber } from "@/lib/articles";
import { formatDate } from "@/lib/format";
import { localeHref, toLocale, type Locale } from "@/lib/i18n";
import { Pagination } from "@/components/pagination";
import { buttonClass, cardClass, inputClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Recherche",
    description: "Recherchez un article sur CyberSphere.",
    placeholder: "Rechercher un article… (2 caractères minimum)",
    searchAria: "Termes de recherche",
    submit: "Rechercher",
    tipPrefix: "Astuce :",
    tipSuffix: "sont supportés.",
    tipOr: "ou",
    tipExact: '"expression exacte"',
    tipExclude: "mot -exclu",
    results: (n: number) => `${n} résultat${n > 1 ? "s" : ""} pour «`,
    resultsSuffix: "»",
    enOnlyNote: "",
  },
  en: {
    title: "Search",
    description: "Search CyberSphere articles.",
    placeholder: "Search articles… (2 characters minimum)",
    searchAria: "Search terms",
    submit: "Search",
    tipPrefix: "Tip:",
    tipSuffix: "are supported.",
    tipOr: "or",
    tipExact: '"exact phrase"',
    tipExclude: "word -excluded",
    results: (n: number) => `${n} result${n === 1 ? "" : "s"} for “`,
    resultsSuffix: "”",
    enOnlyNote: "English search only covers articles that have been translated.",
  },
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = copy[toLocale((await params).locale)];
  return { title: t.title, description: t.description };
}

type SearchRow = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: Date | null;
  categoryName: string;
  categorySlug: string;
  authorName: string;
  headline: string;
};

/**
 * Rend l'extrait produit par ts_headline : les correspondances sont bornées
 * par des délimiteurs neutres ([[…]]) transformés ici en <mark> par React —
 * le texte reste échappé, aucun HTML de l'article n'est interprété.
 */
function Headline({ text }: { text: string }) {
  const parts = text.split(/\[\[|\]\]/g);
  return (
    <p className="text-sm text-muted">
      …
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded bg-accent/20 px-0.5 text-accent">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
      …
    </p>
  );
}

/**
 * Recherche plein texte PostgreSQL, classée par pertinence, requête
 * paramétrée (aucune concaténation SQL). En français elle interroge le
 * vecteur de l'article original ; en anglais, celui des traductions.
 */
async function search(
  locale: Locale,
  query: string,
  page: number,
): Promise<{ results: SearchRow[]; total: number }> {
  const headlineOptions =
    "StartSel=[[, StopSel=]], MaxWords=30, MinWords=15, MaxFragments=1";

  if (locale === "en") {
    const tsQuery = Prisma.sql`websearch_to_tsquery('english', ${query})`;
    const [rows, countRows] = await Promise.all([
      db.$queryRaw<SearchRow[]>`
        SELECT
          a."slug",
          tr."title",
          tr."excerpt",
          a."publishedAt",
          COALESCE(c."nameEn", c."name") AS "categoryName",
          c."slug"  AS "categorySlug",
          u."name"  AS "authorName",
          ts_headline('english', tr."content", ${tsQuery}, ${headlineOptions}) AS "headline"
        FROM "ArticleTranslation" tr
        JOIN "Article" a  ON a."id" = tr."articleId"
        JOIN "Category" c ON c."id" = a."categoryId"
        JOIN "User" u     ON u."id" = a."authorId"
        WHERE tr."locale" = 'en'
          AND a."status" = 'PUBLISHED'
          AND tr."search" @@ ${tsQuery}
        ORDER BY ts_rank(tr."search", ${tsQuery}) DESC, a."publishedAt" DESC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      `,
      db.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count
        FROM "ArticleTranslation" tr
        JOIN "Article" a ON a."id" = tr."articleId"
        WHERE tr."locale" = 'en'
          AND a."status" = 'PUBLISHED'
          AND tr."search" @@ ${tsQuery}
      `,
    ]);
    return { results: rows, total: Number(countRows[0]?.count ?? 0) };
  }

  const tsQuery = Prisma.sql`websearch_to_tsquery('french', ${query})`;
  const [rows, countRows] = await Promise.all([
    db.$queryRaw<SearchRow[]>`
      SELECT
        a."slug",
        a."title",
        a."excerpt",
        a."publishedAt",
        c."name"  AS "categoryName",
        c."slug"  AS "categorySlug",
        u."name"  AS "authorName",
        ts_headline('french', a."content", ${tsQuery}, ${headlineOptions}) AS "headline"
      FROM "Article" a
      JOIN "Category" c ON c."id" = a."categoryId"
      JOIN "User" u     ON u."id" = a."authorId"
      WHERE a."status" = 'PUBLISHED' AND a."search" @@ ${tsQuery}
      ORDER BY ts_rank(a."search", ${tsQuery}) DESC, a."publishedAt" DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
      FROM "Article" a
      WHERE a."status" = 'PUBLISHED' AND a."search" @@ ${tsQuery}
    `,
  ]);
  return { results: rows, total: Number(countRows[0]?.count ?? 0) };
}

export default async function RecherchePage({ params, searchParams }: Props) {
  const [{ locale: rawLocale }, { q: rawQuery, page: pageParam }] =
    await Promise.all([params, searchParams]);
  const locale = toLocale(rawLocale);
  const t = copy[locale];
  const query = (rawQuery ?? "").trim().slice(0, 100);
  const page = pageNumber(pageParam);

  let results: SearchRow[] = [];
  let total = 0;
  if (query.length >= 2) {
    ({ results, total } = await search(locale, query, page));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <form
          action={localeHref(locale, "/recherche")}
          method="get"
          className="flex max-w-xl gap-2"
          role="search"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t.placeholder}
            aria-label={t.searchAria}
            className={inputClass}
          />
          <button type="submit" className={buttonClass}>
            {t.submit}
          </button>
        </form>
        <p className="text-xs text-muted">
          {t.tipPrefix} <code className="font-mono">{t.tipExact}</code>,{" "}
          <code className="font-mono">{t.tipExclude}</code>{" "}
          {locale === "fr" ? "et" : "and"}{" "}
          <code className="font-mono">{t.tipOr}</code> {t.tipSuffix}
        </p>
        {t.enOnlyNote && <p className="text-xs text-muted">{t.enOnlyNote}</p>}
      </header>

      {query.length >= 2 && (
        <p className="text-muted">
          {t.results(total)}{" "}
          <span className="font-medium text-foreground">{query}</span>{" "}
          {t.resultsSuffix}
        </p>
      )}

      {results.length > 0 && (
        <ul className="space-y-4">
          {results.map((result) => (
            <li key={result.slug} className={`${cardClass} space-y-2 p-5`}>
              <p className="font-mono text-xs text-muted">
                <Link
                  href={localeHref(locale, `/categories/${result.categorySlug}`)}
                  className="hover:text-accent"
                >
                  {result.categoryName}
                </Link>
                {result.publishedAt
                  ? ` · ${formatDate(result.publishedAt, locale)}`
                  : null}
                {` · ${result.authorName}`}
              </p>
              <h2 className="text-lg font-bold">
                <Link
                  href={localeHref(locale, `/articles/${result.slug}`)}
                  className="hover:text-accent"
                >
                  {result.title}
                </Link>
              </h2>
              <Headline text={result.headline} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) =>
          localeHref(locale, `/recherche?q=${encodeURIComponent(query)}&page=${p}`)
        }
        locale={locale}
      />
    </div>
  );
}
