import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  CommentSection,
  type CommentView,
  type Viewer,
} from "@/components/comments/comment-section";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await db.article.findUnique({
    where: { slug },
    select: { title: true, excerpt: true, coverImage: true, status: true, publishedAt: true },
  });
  if (!article || article.status !== "PUBLISHED") return {};
  return {
    title: article.title,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: "article",
      publishedTime: article.publishedAt?.toISOString(),
      images: article.coverImage ? [article.coverImage] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;

  const [article, session] = await Promise.all([
    db.article.findUnique({
      where: { slug },
      include: {
        author: { select: { name: true, image: true } },
        category: { include: { parent: true } },
        tags: { orderBy: { name: "asc" } },
      },
    }),
    getSession(),
  ]);

  if (!article) notFound();
  const isAdmin = session?.user.role === "admin";
  if (article.status !== "PUBLISHED" && !isAdmin) notFound();

  if (article.status === "PUBLISHED") {
    after(async () => {
      await db.article
        .update({ where: { id: article.id }, data: { views: { increment: 1 } } })
        .catch(() => {});
    });
  }

  const [html, rawComments] = await Promise.all([
    renderMarkdown(article.content),
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
  ]);

  const comments: CommentView[] = rawComments.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: formatDateTime(c.createdAt),
    author: c.author,
    replies: c.replies.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: formatDateTime(r.createdAt),
      author: r.author,
      replies: [],
    })),
  }));

  const viewer: Viewer = session
    ? { id: session.user.id, name: session.user.name, isAdmin: isAdmin ?? false }
    : null;

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      {article.status !== "PUBLISHED" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-500">
          Brouillon — cet article n&apos;est visible que par les administrateurs.
        </p>
      )}

      <header className="space-y-4">
        <p className="font-mono text-sm text-muted">
          <Link href="/" className="hover:text-accent">
            Accueil
          </Link>
          {" / "}
          {article.category.parent && (
            <>
              <Link
                href={`/categories/${article.category.parent.slug}`}
                className="hover:text-accent"
              >
                {article.category.parent.name}
              </Link>
              {" / "}
            </>
          )}
          <Link href={`/categories/${article.category.slug}`} className="hover:text-accent">
            {article.category.name}
          </Link>
        </p>

        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
          {article.title}
        </h1>

        <p className="text-lg text-muted">{article.excerpt}</p>

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
          {article.publishedAt && <span>{formatDate(article.publishedAt)}</span>}
          <span>{article.views} vue{article.views > 1 ? "s" : ""}</span>
        </div>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      {article.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverImage}
          alt=""
          className="w-full rounded-xl border border-border object-cover"
        />
      )}

      <div
        className="prose prose-neutral max-w-none dark:prose-invert"
        // Contenu compilé côté serveur depuis le Markdown : le HTML brut
        // saisi dans l'éditeur est ignoré par le pipeline (voir lib/markdown.ts)
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <hr className="border-border" />

      <CommentSection
        articleId={article.id}
        articleSlug={article.slug}
        comments={comments}
        viewer={viewer}
      />
    </article>
  );
}
