import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPreviewToken } from "@/lib/draft-preview";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { toLocale } from "@/lib/i18n";
import { kindLabel } from "@/lib/articles";
import { CodeCopy } from "@/components/code-copy";
import { KeyPoints } from "@/components/key-points";

const copy = {
  fr: {
    metaTitle: "Prévisualisation",
    banner:
      "Prévisualisation avant publication — ce lien est temporaire, merci de ne pas le diffuser.",
  },
  en: {
    metaTitle: "Preview",
    banner:
      "Pre-publication preview — this link is temporary, please don't share it.",
  },
};

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ jeton?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: copy[toLocale((await params).locale)].metaTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * Prévisualisation partageable d'un brouillon : accessible sans compte,
 * uniquement avec un lien signé (HMAC + expiration) généré depuis l'admin.
 */
export default async function ApercuPage({ params, searchParams }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = toLocale(rawLocale);
  const { jeton } = await searchParams;

  if (!jeton || !verifyPreviewToken(id, jeton)) notFound();

  const article = await db.article.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      category: { select: { name: true, nameEn: true } },
      tags: { orderBy: { name: "asc" } },
      translations: {
        where: { locale: "en" },
        select: { title: true, excerpt: true, content: true, keyPoints: true },
      },
    },
  });
  if (!article) notFound();

  // En /en, la prévisualisation montre la traduction si elle existe
  const translation = locale === "en" ? article.translations[0] : undefined;
  const html = await renderMarkdown(
    translation?.content ?? article.content,
    translation ? "en" : "fr",
  );

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-500">
        {copy[locale].banner}
      </p>

      <header className="space-y-4">
        <p className="font-mono text-sm text-muted">
          <span className="mr-3 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-contrast">
            {kindLabel(article.kind, locale)}
          </span>
          {locale === "en" && article.category.nameEn
            ? article.category.nameEn
            : article.category.name}
        </p>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
          {translation?.title ?? article.title}
        </h1>
        <p className="text-lg text-muted">{translation?.excerpt ?? article.excerpt}</p>
        <p className="text-sm text-muted">
          {article.author.name}
          {article.publishedAt ? ` · ${formatDate(article.publishedAt, locale)}` : null}
        </p>
      </header>

      <KeyPoints raw={translation ? translation.keyPoints : article.keyPoints} locale={locale} />

      {article.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverImage}
          alt=""
          className="w-full rounded-xl border border-border object-cover"
        />
      )}

      <CodeCopy>
        <div
          className="prose prose-neutral max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </CodeCopy>
    </article>
  );
}
