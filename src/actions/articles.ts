"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getStaffSession } from "@/lib/session";
import { saveImage } from "@/lib/uploads";
import { renderMarkdown } from "@/lib/markdown";
import { slugify, uniqueSlug } from "@/lib/slug";
import { createPreviewToken } from "@/lib/draft-preview";
import { dispatchArticleToSubscribers } from "@/lib/newsletter";
import { articleSchema, firstError } from "@/lib/validations";
import type { ActionResult } from "./comments";

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && t.length <= 40),
    ),
  ].slice(0, 10);
}

export async function saveArticle(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getStaffSession();
  if (!session) return { ok: false, error: "Accès refusé." };
  const isAdmin = session.user.role === "admin";

  const parsed = articleSchema.safeParse({
    title: formData.get("title"),
    excerpt: formData.get("excerpt"),
    content: formData.get("content"),
    categoryId: formData.get("categoryId"),
    tags: formData.get("tags") ?? "",
    status: formData.get("status"),
    seriesId: formData.get("seriesId") ?? "",
    seriesPosition: formData.get("seriesPosition") || undefined,
    titleEn: formData.get("titleEn") ?? "",
    excerptEn: formData.get("excerptEn") ?? "",
    contentEn: formData.get("contentEn") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  // Traduction anglaise « tout ou rien » : un article à moitié traduit
  // mélangerait les deux langues sur le site anglais.
  const enFields = [data.titleEn, data.excerptEn, data.contentEn];
  const hasTranslation = enFields.every((field) => field.length > 0);
  if (!hasTranslation && enFields.some((field) => field.length > 0)) {
    return {
      ok: false,
      error:
        "Traduction anglaise incomplète : remplissez titre, extrait et contenu — ou laissez les trois vides.",
    };
  }

  // Un auteur ne publie pas : il enregistre un brouillon ou le soumet
  // à validation. La publication est réservée aux administrateurs.
  if (!isAdmin && data.status === "PUBLISHED") {
    return {
      ok: false,
      error: "Seul un administrateur peut publier. Soumettez l'article à validation.",
    };
  }

  const category = await db.category.findUnique({
    where: { id: data.categoryId },
    select: { id: true },
  });
  if (!category) return { ok: false, error: "Catégorie introuvable." };

  const seriesId = data.seriesId || null;
  if (seriesId) {
    const series = await db.series.findUnique({
      where: { id: seriesId },
      select: { id: true },
    });
    if (!series) return { ok: false, error: "Série introuvable." };
  }

  let coverImage: string | undefined;
  const cover = formData.get("cover");
  if (cover instanceof File && cover.size > 0) {
    try {
      coverImage = await saveImage(cover);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Upload impossible.",
      };
    }
  }

  const tagNames = parseTags(data.tags);
  const tagOps = {
    connectOrCreate: tagNames.map((name) => ({
      where: { name },
      create: { name, slug: slugify(name) },
    })),
  };

  let justPublished = false;
  let articleId = id;

  try {
    if (id) {
      const existing = await db.article.findUnique({
        where: { id },
        select: { id: true, publishedAt: true, status: true, authorId: true },
      });
      if (!existing) return { ok: false, error: "Article introuvable." };

      // Un auteur ne touche qu'à ses propres articles non publiés
      if (!isAdmin) {
        if (existing.authorId !== session.user.id) {
          return { ok: false, error: "Vous ne pouvez modifier que vos articles." };
        }
        if (existing.status === "PUBLISHED") {
          return {
            ok: false,
            error: "Article publié : demandez à un administrateur pour le modifier.",
          };
        }
      }

      justPublished = data.status === "PUBLISHED" && !existing.publishedAt;

      await db.article.update({
        where: { id },
        data: {
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          categoryId: data.categoryId,
          status: data.status,
          seriesId,
          seriesPosition: seriesId ? (data.seriesPosition ?? null) : null,
          ...(coverImage && { coverImage }),
          // premier passage en "publié" : on fige la date de publication
          ...(justPublished && { publishedAt: new Date() }),
          tags: { set: [], ...tagOps },
        },
      });
    } else {
      const slug = await uniqueSlug(slugify(data.title), async (candidate) => {
        const found = await db.article.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return found !== null;
      });

      justPublished = data.status === "PUBLISHED";

      const created = await db.article.create({
        data: {
          title: data.title,
          slug,
          excerpt: data.excerpt,
          content: data.content,
          categoryId: data.categoryId,
          status: data.status,
          seriesId,
          seriesPosition: seriesId ? (data.seriesPosition ?? null) : null,
          coverImage: coverImage ?? null,
          publishedAt: justPublished ? new Date() : null,
          authorId: session.user.id,
          tags: tagOps,
        },
        select: { id: true },
      });
      articleId = created.id;
    }

    // Traduction anglaise : créée/mise à jour si fournie, supprimée sinon
    if (articleId) {
      if (hasTranslation) {
        await db.articleTranslation.upsert({
          where: { articleId_locale: { articleId, locale: "en" } },
          create: {
            articleId,
            locale: "en",
            title: data.titleEn,
            excerpt: data.excerptEn,
            content: data.contentEn,
          },
          update: {
            title: data.titleEn,
            excerpt: data.excerptEn,
            content: data.contentEn,
          },
        });
      } else {
        await db.articleTranslation.deleteMany({
          where: { articleId, locale: "en" },
        });
      }
    }
  } catch {
    return { ok: false, error: "Enregistrement impossible. Réessayez." };
  }

  await logAudit({
    action: justPublished
      ? "article.publication"
      : data.status === "SUBMITTED"
        ? "article.soumission"
        : id
          ? "article.modification"
          : "article.creation",
    actorId: session.user.id,
    targetType: "article",
    targetId: articleId ?? undefined,
    detail: data.title,
  });

  // Newsletter : uniquement à la première publication, hors du chemin
  // de réponse pour ne pas ralentir l'enregistrement
  if (justPublished && articleId) {
    const publishedId = articleId;
    after(() => dispatchArticleToSubscribers(publishedId));
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  const session = await getStaffSession();
  if (!session) return { ok: false, error: "Accès refusé." };
  const isAdmin = session.user.role === "admin";

  const article = await db.article.findUnique({
    where: { id },
    select: { authorId: true, status: true, title: true },
  });
  if (!article) return { ok: false, error: "Article introuvable." };

  if (!isAdmin) {
    if (article.authorId !== session.user.id || article.status === "PUBLISHED") {
      return {
        ok: false,
        error: "Vous ne pouvez supprimer que vos articles non publiés.",
      };
    }
  }

  try {
    await db.article.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Suppression impossible." };
  }

  await logAudit({
    action: "article.suppression",
    actorId: session.user.id,
    targetType: "article",
    targetId: id,
    detail: article.title,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function previewMarkdown(
  content: string,
): Promise<{ html: string }> {
  const session = await getStaffSession();
  if (!session) return { html: "<p>Accès refusé.</p>" };
  return { html: await renderMarkdown(content.slice(0, 100_000)) };
}

/**
 * Lien de prévisualisation signé (HMAC, 72 h) pour faire relire un
 * brouillon sans compte. L'URL fonctionne quel que soit le statut.
 */
export async function getPreviewLink(
  id: string,
): Promise<{ url?: string; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { error: "Accès refusé." };

  const article = await db.article.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });
  if (!article) return { error: "Article introuvable." };
  if (session.user.role !== "admin" && article.authorId !== session.user.id) {
    return { error: "Vous ne pouvez partager que vos articles." };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  return {
    url: `${base}/articles/apercu/${article.id}?jeton=${createPreviewToken(article.id)}`,
  };
}
