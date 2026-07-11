"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getSession } from "@/lib/session";
import { commentSchema, firstError } from "@/lib/validations";

export type ActionResult = { ok: boolean; error?: string };

/** Fenêtre anti-spam : 3 commentaires maximum par minute et par membre. */
const SPAM_WINDOW_MS = 60_000;
const SPAM_MAX_COMMENTS = 3;

export async function addComment(input: {
  articleId: string;
  parentId?: string;
  content: string;
  /** Honeypot : champ invisible pour les humains, rempli par les bots. */
  website?: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: "Connectez-vous pour commenter." };
  }

  // Un bot a rempli le champ piège : on répond « succès » sans rien créer,
  // pour ne pas lui apprendre qu'il est détecté.
  if (input.website) return { ok: true };

  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const recentCount = await db.comment.count({
    where: {
      authorId: session.user.id,
      createdAt: { gt: new Date(Date.now() - SPAM_WINDOW_MS) },
    },
  });
  if (recentCount >= SPAM_MAX_COMMENTS) {
    return {
      ok: false,
      error: "Vous commentez trop vite. Patientez une minute avant de réessayer.",
    };
  }

  const article = await db.article.findUnique({
    where: { id: parsed.data.articleId },
    select: { id: true, slug: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: "Article introuvable." };
  }

  let parentId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await db.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, articleId: true, parentId: true },
    });
    if (!parent || parent.articleId !== article.id) {
      return { ok: false, error: "Commentaire parent introuvable." };
    }
    // Les fils restent sur un seul niveau : répondre à une réponse
    // rattache le commentaire au parent d'origine.
    parentId = parent.parentId ?? parent.id;
  }

  await db.comment.create({
    data: {
      content: parsed.data.content,
      articleId: article.id,
      authorId: session.user.id,
      parentId,
    },
  });

  revalidatePath(`/articles/${article.slug}`);
  return { ok: true };
}

export async function updateComment(
  id: string,
  content: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: "Connectez-vous pour modifier ce commentaire." };
  }

  const parsedContent = commentSchema.shape.content.safeParse(content);
  if (!parsedContent.success) {
    return { ok: false, error: firstError(parsedContent.error) };
  }

  const comment = await db.comment.findUnique({
    where: { id },
    select: { authorId: true, article: { select: { slug: true } } },
  });
  if (!comment) return { ok: false, error: "Commentaire introuvable." };
  if (comment.authorId !== session.user.id) {
    return { ok: false, error: "Vous ne pouvez modifier que vos commentaires." };
  }

  await db.comment.update({ where: { id }, data: { content: parsedContent.data } });
  revalidatePath(`/articles/${comment.article.slug}`);
  return { ok: true };
}

export async function deleteComment(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: "Connectez-vous pour supprimer ce commentaire." };
  }

  const comment = await db.comment.findUnique({
    where: { id },
    select: { authorId: true, article: { select: { slug: true } } },
  });
  if (!comment) return { ok: false, error: "Commentaire introuvable." };

  const isAdmin = session.user.role === "admin";
  if (comment.authorId !== session.user.id && !isAdmin) {
    return { ok: false, error: "Vous ne pouvez supprimer que vos commentaires." };
  }

  await db.comment.delete({ where: { id } });

  // Seule la modération (suppression du commentaire d'autrui) est auditée
  if (comment.authorId !== session.user.id) {
    await logAudit({
      action: "commentaire.moderation",
      actorId: session.user.id,
      targetType: "comment",
      targetId: id,
    });
  }

  revalidatePath(`/articles/${comment.article.slug}`);
  revalidatePath("/admin/commentaires");
  return { ok: true };
}
