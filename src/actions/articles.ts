"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getStaffSession } from "@/lib/session";
import { deleteUpload, saveImage } from "@/lib/uploads";
import { renderMarkdown } from "@/lib/markdown";
import { slugify, uniqueSlug } from "@/lib/slug";
import { createPreviewToken } from "@/lib/draft-preview";
import { SITE_URL } from "@/lib/site";
import { dispatchArticleToSubscribers } from "@/lib/newsletter";
import { notifyAdmins } from "@/lib/notifications";
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
    scheduledAt: formData.get("scheduledAt") ?? "",
    coverAlt: formData.get("coverAlt") ?? "",
    coverAltEn: formData.get("coverAltEn") ?? "",
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
  if (!isAdmin && (data.status === "PUBLISHED" || data.status === "SCHEDULED")) {
    return {
      ok: false,
      error: "Seul un administrateur peut publier. Soumettez l'article à validation.",
    };
  }

  // Publication programmée : date future (et raisonnable) obligatoire
  let scheduledAt: Date | null = null;
  if (data.status === "SCHEDULED") {
    scheduledAt = new Date(data.scheduledAt);
    const now = Date.now();
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now + 60_000) {
      return {
        ok: false,
        error: "Programmation : choisissez une date de publication future (au moins dans une minute).",
      };
    }
    if (scheduledAt.getTime() > now + 366 * 24 * 3600 * 1000) {
      return { ok: false, error: "Programmation : un an maximum." };
    }
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

  // Droits vérifiés avant tout upload : un refus ne laisse aucun fichier orphelin
  const existing = id
    ? await db.article.findUnique({
        where: { id },
        select: { publishedAt: true, status: true, authorId: true, coverImage: true },
      })
    : null;
  if (id) {
    if (!existing) return { ok: false, error: "Article introuvable." };
    // Un auteur ne touche qu'à ses propres articles non publiés
    if (!isAdmin) {
      if (existing.authorId !== session.user.id) {
        return { ok: false, error: "Vous ne pouvez modifier que vos articles." };
      }
      if (existing.status === "PUBLISHED" || existing.status === "SCHEDULED") {
        return {
          ok: false,
          error: "Article publié ou programmé : demandez à un administrateur pour le modifier.",
        };
      }
    }
    if (existing.status === "PUBLISHED" && data.status === "SCHEDULED") {
      return {
        ok: false,
        error: "Article déjà publié : repassez-le en brouillon avant de le programmer.",
      };
    }
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

  // Rapprochement par slug (unique) et non par nom : « Web » et « web », ou
  // « C++ » et « C », ont le même slug — une recherche par nom tentait de
  // créer un doublon de slug et faisait échouer tout l'enregistrement.
  const tagsBySlug = new Map(parseTags(data.tags).map((name) => [slugify(name), name]));
  const tagOps = {
    connectOrCreate: [...tagsBySlug].map(([slug, name]) => ({
      where: { slug },
      create: { name, slug },
    })),
  };

  let justPublished = false;
  let articleId = id;
  let replacedCover: string | null = null;

  try {
    if (id && existing) {
      replacedCover = coverImage ? existing.coverImage : null;
      // Première mise en ligne : jamais publié, ou publication programmée
      // avancée à la main (publishedAt portait alors la date prévue)
      justPublished =
        data.status === "PUBLISHED" &&
        (!existing.publishedAt || existing.status === "SCHEDULED");
      // Programmation annulée (retour en brouillon/soumis) : date effacée
      const cancelledSchedule =
        existing.status === "SCHEDULED" &&
        data.status !== "SCHEDULED" &&
        data.status !== "PUBLISHED";

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
          coverAlt: data.coverAlt || null,
          // premier passage en "publié" : on fige la date de publication
          ...(justPublished && { publishedAt: new Date() }),
          ...(scheduledAt && { publishedAt: scheduledAt }),
          ...(cancelledSchedule && { publishedAt: null }),
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
          coverAlt: data.coverAlt || null,
          publishedAt: justPublished ? new Date() : scheduledAt,
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
            coverAlt: data.coverAltEn || null,
          },
          update: {
            title: data.titleEn,
            excerpt: data.excerptEn,
            content: data.contentEn,
            coverAlt: data.coverAltEn || null,
          },
        });
      } else {
        await db.articleTranslation.deleteMany({
          where: { articleId, locale: "en" },
        });
      }
    }
  } catch {
    // La nouvelle couverture n'est référencée nulle part : on la retire
    await deleteUpload(coverImage);
    return { ok: false, error: "Enregistrement impossible. Réessayez." };
  }

  await deleteUpload(replacedCover);

  const justSubmitted = data.status === "SUBMITTED" && existing?.status !== "SUBMITTED";

  await logAudit({
    action: justPublished
      ? "article.publication"
      : scheduledAt
        ? "article.programmation"
        : data.status === "SUBMITTED"
          ? "article.soumission"
          : id
            ? "article.modification"
            : "article.creation",
    actorId: session.user.id,
    targetType: "article",
    targetId: articleId ?? undefined,
    detail: scheduledAt ? `${data.title} (${scheduledAt.toISOString()})` : data.title,
  });

  // Soumission d'un auteur : les administrateurs sont prévenus par e-mail
  if (justSubmitted && !isAdmin && articleId) {
    const submittedId = articleId;
    after(() =>
      notifyAdmins({
        subject: "Article à valider",
        title: "Un article attend votre validation",
        intro: `${session.user.name} a soumis un article à la publication.`,
        path: `/admin/articles/${submittedId}`,
        details: [
          ["Titre", data.title],
          ["Auteur", `${session.user.name} (${session.user.email})`],
        ],
      }),
    );
  }

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
    select: { authorId: true, status: true, title: true, coverImage: true },
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
  await deleteUpload(article.coverImage);

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

  const base = SITE_URL;
  return {
    url: `${base}/articles/apercu/${article.id}?jeton=${createPreviewToken(article.id)}`,
  };
}
