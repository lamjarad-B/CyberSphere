"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getStaffSession } from "@/lib/session";
import { deleteUpload, saveImage, uploadUrlsIn } from "@/lib/uploads";
import { renderMarkdown } from "@/lib/markdown";
import { slugify, uniqueSlug } from "@/lib/slug";
import { ensureAuthorSlug } from "@/lib/authors";
import { articlePaths, notifyIndexNow } from "@/lib/indexnow";
import { createPreviewToken } from "@/lib/draft-preview";
import { rateLimit } from "@/lib/rate-limit";
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

type ContentFields = Record<string, string | null>;

/**
 * Vrai si un champ de contenu diffère de la valeur enregistrée (vide et
 * absent équivalents). Seul un vrai changement de texte date une mise à jour :
 * statut, catégorie, tags ou épinglage n'en sont pas une.
 */
function contentChanged(stored: ContentFields, submitted: ContentFields): boolean {
  return Object.keys(submitted).some((key) => (stored[key] ?? "") !== (submitted[key] ?? ""));
}

/** URL /uploads/… du corps d'un article, français et traductions. */
function bodyUploads(article: {
  content: string;
  translations: { content: string }[];
}): string[] {
  return uploadUrlsIn([article.content, ...article.translations.map((t) => t.content)].join("\n"));
}

/**
 * Supprime les images de corps qui ne sont plus citées nulle part : une
 * même URL peut avoir été recopiée dans un autre article, sa traduction,
 * ou servir de couverture — on ne retire que les fichiers sans référence.
 */
async function deleteUnreferencedUploads(urls: string[]): Promise<void> {
  for (const url of urls) {
    const [article, user] = await Promise.all([
      db.article.findFirst({
        where: {
          OR: [
            { content: { contains: url } },
            { coverImage: url },
            { translations: { some: { content: { contains: url } } } },
          ],
        },
        select: { id: true },
      }),
      db.user.findFirst({ where: { image: url }, select: { id: true } }),
    ]);
    if (!article && !user) await deleteUpload(url);
  }
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
    kind: formData.get("kind") ?? undefined,
    keyPoints: formData.get("keyPoints") ?? "",
    keyPointsEn: formData.get("keyPointsEn") ?? "",
    seriesId: formData.get("seriesId") ?? "",
    seriesPosition: formData.get("seriesPosition") || undefined,
    titleEn: formData.get("titleEn") ?? "",
    excerptEn: formData.get("excerptEn") ?? "",
    contentEn: formData.get("contentEn") ?? "",
    scheduledAt: formData.get("scheduledAt") ?? "",
    featuredUntil: formData.get("featuredUntil") ?? "",
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

  // Épinglage « À la une » : réservé aux administrateurs, un an maximum
  let featuredUntil: Date | null = null;
  if (data.featuredUntil) {
    featuredUntil = new Date(data.featuredUntil);
    if (Number.isNaN(featuredUntil.getTime())) {
      return { ok: false, error: "À la une : date de fin invalide." };
    }
    if (featuredUntil.getTime() > Date.now() + 366 * 24 * 3600 * 1000) {
      return { ok: false, error: "À la une : un an maximum." };
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
        select: {
          slug: true,
          publishedAt: true,
          status: true,
          authorId: true,
          coverImage: true,
          title: true,
          excerpt: true,
          content: true,
          keyPoints: true,
          coverAlt: true,
          translations: {
            select: {
              locale: true,
              title: true,
              excerpt: true,
              content: true,
              keyPoints: true,
              coverAlt: true,
            },
          },
        },
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
      coverImage = await saveImage(cover, { keepSvg: isAdmin });
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
  let articleSlug = existing?.slug;
  // Texte (français ou anglais) réellement modifié : à signaler aux moteurs
  let textChanged = false;
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
      // Date de mise à jour (sitemap, données structurées, « Mis à jour le ») :
      // seulement si le texte ou la couverture changent réellement
      const contentEdited =
        Boolean(coverImage) ||
        contentChanged(
          {
            title: existing.title,
            excerpt: existing.excerpt,
            content: existing.content,
            keyPoints: existing.keyPoints,
            coverAlt: existing.coverAlt,
          },
          {
            title: data.title,
            excerpt: data.excerpt,
            content: data.content,
            keyPoints: data.keyPoints || null,
            coverAlt: data.coverAlt || null,
          },
        );
      textChanged = contentEdited;

      await db.article.update({
        where: { id },
        data: {
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          kind: data.kind,
          keyPoints: data.keyPoints || null,
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
          ...(isAdmin && { featuredUntil }),
          ...(contentEdited && { contentUpdatedAt: new Date() }),
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
          kind: data.kind,
          keyPoints: data.keyPoints || null,
          categoryId: data.categoryId,
          status: data.status,
          seriesId,
          seriesPosition: seriesId ? (data.seriesPosition ?? null) : null,
          coverImage: coverImage ?? null,
          coverAlt: data.coverAlt || null,
          publishedAt: justPublished ? new Date() : scheduledAt,
          contentUpdatedAt: new Date(),
          featuredUntil: isAdmin ? featuredUntil : null,
          authorId: session.user.id,
          tags: tagOps,
        },
        select: { id: true },
      });
      articleId = created.id;
      articleSlug = slug;
    }

    // Traduction anglaise : créée/mise à jour si fournie, supprimée sinon.
    // Réécrite seulement si elle change : son updatedAt date alors la
    // dernière modification du texte anglais.
    if (articleId) {
      const translation = {
        title: data.titleEn,
        excerpt: data.excerptEn,
        content: data.contentEn,
        keyPoints: data.keyPointsEn || null,
        coverAlt: data.coverAltEn || null,
      };
      const storedTranslation = existing?.translations.find((t) => t.locale === "en");
      if (hasTranslation) {
        if (!storedTranslation || contentChanged(storedTranslation, translation)) {
          await db.articleTranslation.upsert({
            where: { articleId_locale: { articleId, locale: "en" } },
            create: { articleId, locale: "en", ...translation },
            update: translation,
          });
          textChanged = true;
        }
      } else {
        await db.articleTranslation.deleteMany({
          where: { articleId, locale: "en" },
        });
        if (storedTranslation) textChanged = true;
      }
    }
  } catch {
    // La nouvelle couverture n'est référencée nulle part : on la retire
    await deleteUpload(coverImage);
    return { ok: false, error: "Enregistrement impossible. Réessayez." };
  }

  await deleteUpload(replacedCover);
  // Images retirées du texte : l'article est déjà enregistré, celles qu'il
  // cite encore sont donc conservées par la vérification de références
  if (existing) await deleteUnreferencedUploads(bodyUploads(existing));

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

  // Article en ligne : son auteur a désormais une page publique
  if (data.status === "PUBLISHED") {
    await ensureAuthorSlug(existing?.authorId ?? session.user.id).catch((error) => {
      console.error("[auteurs] slug non attribué :", error);
    });
  }

  // Mise en ligne ou texte modifié d'un article publié : Bing et les autres
  // moteurs IndexNow sont prévenus sans attendre leur prochain passage
  if (data.status === "PUBLISHED" && articleSlug && (justPublished || textChanged)) {
    const paths = articlePaths(articleSlug, hasTranslation);
    after(() => notifyIndexNow(paths));
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
    select: {
      slug: true,
      authorId: true,
      status: true,
      title: true,
      coverImage: true,
      content: true,
      translations: { select: { content: true } },
    },
  });
  if (!article) return { ok: false, error: "Article introuvable." };

  // Même règle que saveArticle : un article publié ou programmé (validé par
  // un admin) échappe à son auteur — il ne peut ni le modifier ni le retirer.
  if (!isAdmin) {
    if (
      article.authorId !== session.user.id ||
      article.status === "PUBLISHED" ||
      article.status === "SCHEDULED"
    ) {
      return {
        ok: false,
        error: "Vous ne pouvez supprimer que vos articles non publiés et non programmés.",
      };
    }
  }

  try {
    await db.article.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Suppression impossible." };
  }
  await deleteUpload(article.coverImage);
  await deleteUnreferencedUploads(bodyUploads(article));

  await logAudit({
    action: "article.suppression",
    actorId: session.user.id,
    targetType: "article",
    targetId: id,
    detail: article.title,
  });

  // Page retirée : les moteurs constatent la 404 sans attendre leur passage
  if (article.status === "PUBLISHED") {
    const paths = articlePaths(article.slug, article.translations.length > 0);
    after(() => notifyIndexNow(paths));
  }

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
 * Image de corps d'article (capture, photo, schéma SVG) : même traitement que la
 * couverture — ré-encodage WebP, EXIF supprimés. Un SVG reste vectoriel pour un
 * administrateur et est rastérisé en haute résolution pour un auteur.
 */
export async function uploadArticleImage(
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { error: "Accès refusé." };
  if (!rateLimit(`article-image:${session.user.id}`, 30, 10 * 60_000)) {
    return { error: "Trop d'images envoyées. Réessayez dans quelques minutes." };
  }

  const image = formData.get("image");
  if (!(image instanceof File)) return { error: "Aucune image reçue." };
  try {
    return { url: await saveImage(image, { keepSvg: session.user.role === "admin" }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload impossible." };
  }
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
