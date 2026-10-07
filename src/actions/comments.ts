"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { actionLocale } from "@/lib/action-locale";
import { getAdminSession, getSession } from "@/lib/session";
import { commentSchema } from "@/lib/validations";

export type ActionResult = { ok: boolean; error?: string };

/** Fenêtre anti-spam : 3 commentaires maximum par minute et par membre. */
const SPAM_WINDOW_MS = 60_000;
const SPAM_MAX_COMMENTS = 3;

const messages = {
  fr: {
    loginToComment: "Connectez-vous pour commenter.",
    loginToEdit: "Connectez-vous pour modifier ce commentaire.",
    loginToDelete: "Connectez-vous pour supprimer ce commentaire.",
    tooShort: "Le commentaire est trop court.",
    tooLong: "Le commentaire est limité à 2000 caractères.",
    tooFast: "Vous commentez trop vite. Patientez une minute avant de réessayer.",
    articleNotFound: "Article introuvable.",
    parentNotFound: "Commentaire parent introuvable.",
    commentNotFound: "Commentaire introuvable.",
    onlyOwnEdit: "Vous ne pouvez modifier que vos commentaires.",
    onlyOwnDelete: "Vous ne pouvez supprimer que vos commentaires.",
    invalid: "Données invalides.",
  },
  en: {
    loginToComment: "Sign in to comment.",
    loginToEdit: "Sign in to edit this comment.",
    loginToDelete: "Sign in to delete this comment.",
    tooShort: "Your comment is too short.",
    tooLong: "Comments are limited to 2,000 characters.",
    tooFast: "You're commenting too fast. Please wait a minute and try again.",
    articleNotFound: "Article not found.",
    parentNotFound: "The comment you're replying to no longer exists.",
    commentNotFound: "Comment not found.",
    onlyOwnEdit: "You can only edit your own comments.",
    onlyOwnDelete: "You can only delete your own comments.",
    invalid: "Invalid data.",
  },
};

type Messages = (typeof messages)["fr"];

/** Valide le texte d'un commentaire, avec un message dans la langue du visiteur. */
function contentError(content: unknown, t: Messages): string | null {
  const parsed = commentSchema.shape.content.safeParse(content);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.code === "too_big" ? t.tooLong : t.tooShort;
}

export async function addComment(input: {
  articleId: string;
  parentId?: string;
  content: string;
  /** Honeypot : champ invisible pour les humains, rempli par les bots. */
  website?: string;
}): Promise<ActionResult> {
  const t = messages[await actionLocale()];
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: t.loginToComment };
  }

  // Un bot a rempli le champ piège : on répond « succès » sans rien créer,
  // pour ne pas lui apprendre qu'il est détecté.
  if (input.website) return { ok: true };

  const invalidContent = contentError(input.content, t);
  if (invalidContent) return { ok: false, error: invalidContent };
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t.invalid };

  const recentCount = await db.comment.count({
    where: {
      authorId: session.user.id,
      createdAt: { gt: new Date(Date.now() - SPAM_WINDOW_MS) },
    },
  });
  if (recentCount >= SPAM_MAX_COMMENTS) {
    return { ok: false, error: t.tooFast };
  }

  const article = await db.article.findUnique({
    where: { id: parsed.data.articleId },
    select: { id: true, slug: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: t.articleNotFound };
  }

  let parentId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await db.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, articleId: true, parentId: true },
    });
    if (!parent || parent.articleId !== article.id) {
      return { ok: false, error: t.parentNotFound };
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
  const t = messages[await actionLocale()];
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: t.loginToEdit };
  }

  const invalidContent = contentError(content, t);
  if (invalidContent) return { ok: false, error: invalidContent };

  const comment = await db.comment.findUnique({
    where: { id },
    select: { authorId: true, article: { select: { slug: true } } },
  });
  if (!comment) return { ok: false, error: t.commentNotFound };
  if (comment.authorId !== session.user.id) {
    return { ok: false, error: t.onlyOwnEdit };
  }

  await db.comment.update({ where: { id }, data: { content: content.trim() } });
  revalidatePath(`/articles/${comment.article.slug}`);
  return { ok: true };
}

export async function deleteComment(id: string): Promise<ActionResult> {
  const t = messages[await actionLocale()];
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: t.loginToDelete };
  }

  const comment = await db.comment.findUnique({
    where: { id },
    select: { authorId: true, article: { select: { slug: true } } },
  });
  if (!comment) return { ok: false, error: t.commentNotFound };

  const isOwner = comment.authorId === session.user.id;
  // Supprimer le commentaire d'autrui est un acte de modération : il exige
  // une session admin complète (2FA comprise), comme toute action d'admin.
  if (!isOwner && !(await getAdminSession())) {
    return { ok: false, error: t.onlyOwnDelete };
  }

  await db.comment.delete({ where: { id } });

  // Seule la modération (suppression du commentaire d'autrui) est auditée
  if (!isOwner) {
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
