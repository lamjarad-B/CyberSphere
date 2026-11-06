"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requestIp } from "@/lib/audit";
import { actionLocale } from "@/lib/action-locale";
import { verifyAltcha } from "@/lib/altcha";
import { hashCommentIp } from "@/lib/comments";
import { notifyNewComment } from "@/lib/notifications";
import { ipBucket, rateLimit } from "@/lib/rate-limit";
import { getAdminSession, getSession } from "@/lib/session";
import { commentIdsSchema, commentSchema, guestCommentSchema } from "@/lib/validations";

export type ActionResult = { ok: boolean; error?: string };

/** Fenêtre anti-spam : 3 commentaires maximum par minute et par membre. */
const SPAM_WINDOW_MS = 60_000;
const SPAM_MAX_COMMENTS = 3;

/** Tentatives d'un invité par IP : le limiteur en mémoire, avant tout accès à la base. */
const GUEST_ATTEMPTS_MAX = 5;
const GUEST_ATTEMPTS_WINDOW_MS = 10 * 60_000;
/** Commentaires par origine (IP ou e-mail) sur 24 h : survit à un redémarrage. */
const GUEST_DAILY_MAX = 5;
const DAY_MS = 24 * 3600_000;
/** Commentaires d'invités par heure, toutes origines : borne un afflux réparti sur plusieurs IP. */
const GUEST_HOURLY_TOTAL_MAX = 30;
const HOUR_MS = 3600_000;

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
    tooManyLinks: "Deux liens au maximum par commentaire.",
    guestName: "Indiquez un nom valide (2 à 50 caractères, sans adresse web).",
    guestEmail: "Adresse e-mail invalide.",
    rateLimited: "Trop de tentatives. Réessayez dans quelques minutes.",
    captcha: "Vérification anti-robot échouée. Réessayez.",
    dailyLimit: "Vous avez déjà laissé plusieurs commentaires aujourd'hui. Réessayez demain.",
    suspended: "Les commentaires sont momentanément suspendus. Réessayez plus tard.",
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
    tooManyLinks: "Comments are limited to two links.",
    guestName: "Please enter a valid name (2 to 50 characters, no web address).",
    guestEmail: "Invalid email address.",
    rateLimited: "Too many attempts. Please try again in a few minutes.",
    captcha: "Anti-bot check failed. Please try again.",
    dailyLimit: "You've already left several comments today. Please try again tomorrow.",
    suspended: "Comments are temporarily suspended. Please try again later.",
  },
};

type Messages = (typeof messages)["fr"];

/** Valide le texte d'un commentaire, avec un message dans la langue du visiteur. */
function contentError(content: unknown, t: Messages): string | null {
  const parsed = commentSchema.shape.content.safeParse(content);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.code === "too_big" ? t.tooLong : t.tooShort;
}

/** Premier problème du formulaire invité, dans la langue du visiteur. */
function guestInputError(error: z.ZodError, t: Messages): string {
  const issue = error.issues[0];
  switch (issue?.path[0]) {
    case "content":
      if (issue.code === "custom") return t.tooManyLinks;
      return issue.code === "too_big" ? t.tooLong : t.tooShort;
    case "name":
      return t.guestName;
    case "email":
      return t.guestEmail;
    default:
      return t.invalid;
  }
}

/**
 * Parent d'une réponse : un commentaire publié du même article. Les fils
 * restent sur un seul niveau : répondre à une réponse rattache le commentaire
 * au parent d'origine. Undefined si le parent est refusé.
 */
async function resolveParentId(
  parentId: string,
  articleId: string,
): Promise<string | null | undefined> {
  if (!parentId) return null;
  const parent = await db.comment.findUnique({
    where: { id: parentId },
    select: { id: true, articleId: true, parentId: true, status: true },
  });
  if (!parent || parent.articleId !== articleId || parent.status !== "APPROVED") return undefined;
  return parent.parentId ?? parent.id;
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
    select: { id: true, slug: true, title: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: t.articleNotFound };
  }

  const parentId = await resolveParentId(parsed.data.parentId, article.id);
  if (parentId === undefined) return { ok: false, error: t.parentNotFound };

  await db.comment.create({
    data: {
      content: parsed.data.content,
      // Un membre a un e-mail vérifié et peut être banni : publication directe
      status: "APPROVED",
      articleId: article.id,
      authorId: session.user.id,
      parentId,
    },
  });

  // Un admin n'a pas besoin d'être prévenu de ses propres commentaires
  if (session.user.role !== "admin") {
    after(() =>
      notifyNewComment({
        articleTitle: article.title,
        authorName: session.user.name,
        content: parsed.data.content,
      }),
    );
  }

  revalidatePath(`/articles/${article.slug}`);
  return { ok: true };
}

/**
 * Commentaire sans compte, publié aussitôt : un admin peut ensuite le masquer ou
 * le supprimer. Aucun e-mail ne part vers l'adresse saisie, encore invérifiée :
 * l'abonnement newsletter attend 24 h (subscribeCommenters), le temps de pouvoir
 * retirer un commentaire abusif.
 */
export async function addGuestComment(input: {
  articleId: string;
  parentId?: string;
  content: string;
  name: string;
  email: string;
  newsletter?: boolean;
  /** Honeypot : champ invisible pour les humains, rempli par les bots. */
  website?: string;
  /** Preuve de travail ALTCHA, produite par le widget. */
  captcha?: unknown;
}): Promise<ActionResult> {
  // Un bot a rempli le champ piège : on répond « succès » sans rien créer,
  // pour ne pas lui apprendre qu'il est détecté.
  if (input?.website) return { ok: true };

  const locale = await actionLocale();
  const t = messages[locale];

  const ip = await requestIp();
  if (!rateLimit(`comment-guest:${ipBucket(ip)}`, GUEST_ATTEMPTS_MAX, GUEST_ATTEMPTS_WINDOW_MS)) {
    return { ok: false, error: t.rateLimited };
  }

  const parsed = guestCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: guestInputError(parsed.error, t) };
  const { content, name, email, newsletter } = parsed.data;

  if (!(await verifyAltcha(input.captcha))) return { ok: false, error: t.captcha };

  const article = await db.article.findUnique({
    where: { id: parsed.data.articleId },
    select: { id: true, slug: true, title: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: t.articleNotFound };
  }

  const parentId = await resolveParentId(parsed.data.parentId, article.id);
  if (parentId === undefined) return { ok: false, error: t.parentNotFound };

  const dayAgo = new Date(Date.now() - DAY_MS);

  // Double envoi : le commentaire est déjà enregistré
  const duplicate = await db.comment.findFirst({
    where: { articleId: article.id, authorId: null, content, createdAt: { gt: dayAgo } },
    select: { id: true },
  });
  if (duplicate) return { ok: true };

  const guestIpHash = hashCommentIp(ip);
  const [fromSameOrigin, lastHour] = await Promise.all([
    db.comment.count({
      where: {
        authorId: null,
        createdAt: { gt: dayAgo },
        OR: [{ guestEmail: email }, ...(guestIpHash ? [{ guestIpHash }] : [])],
      },
    }),
    db.comment.count({
      where: { authorId: null, createdAt: { gt: new Date(Date.now() - HOUR_MS) } },
    }),
  ]);
  // Même message pour l'IP et l'e-mail : rien n'indique si une adresse est connue
  if (fromSameOrigin >= GUEST_DAILY_MAX) return { ok: false, error: t.dailyLimit };
  if (lastHour >= GUEST_HOURLY_TOTAL_MAX) return { ok: false, error: t.suspended };

  await db.comment.create({
    data: {
      content,
      status: "APPROVED",
      articleId: article.id,
      parentId,
      guestName: name,
      guestEmail: email,
      guestIpHash,
      newsletterOptIn: newsletter,
      guestLocale: locale,
    },
  });

  after(() =>
    notifyNewComment({
      articleTitle: article.title,
      authorName: `${name} (invité)`,
      content,
    }),
  );

  revalidatePath(`/articles/${article.slug}`);
  return { ok: true };
}

/** Change la visibilité d'un commentaire : session admin complète, audité. */
async function setCommentStatus(
  id: string,
  status: "APPROVED" | "HIDDEN",
  action: string,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };
  if (typeof id !== "string") return { ok: false, error: "Commentaire introuvable." };

  const comment = await db.comment.findUnique({
    where: { id },
    select: { article: { select: { slug: true } } },
  });
  if (!comment) return { ok: false, error: "Commentaire introuvable." };

  const { count } = await db.comment.updateMany({
    where: { id, status: { not: status } },
    data: { status },
  });
  if (count !== 1) return { ok: true };

  await logAudit({ action, actorId: session.user.id, targetType: "comment", targetId: id });

  revalidatePath(`/articles/${comment.article.slug}`);
  revalidatePath("/admin/commentaires");
  return { ok: true };
}

/** Retire un commentaire du site sans le supprimer : il peut revenir. */
export async function hideComment(id: string): Promise<ActionResult> {
  return setCommentStatus(id, "HIDDEN", "commentaire.masquage");
}

/** Remet en ligne un commentaire masqué. */
export async function showComment(id: string): Promise<ActionResult> {
  return setCommentStatus(id, "APPROVED", "commentaire.reaffichage");
}

/** Supprime d'un coup les commentaires cochés, réponses comprises (vague de spam). */
export async function deleteComments(ids: string[]): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const parsed = commentIdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Sélection invalide." };

  const comments = await db.comment.findMany({
    where: { id: { in: parsed.data } },
    select: { article: { select: { slug: true } } },
  });
  const { count } = await db.comment.deleteMany({ where: { id: { in: parsed.data } } });

  await logAudit({
    action: "commentaire.suppression_groupee",
    actorId: session.user.id,
    targetType: "comment",
    detail: `${count} commentaire(s) supprimé(s)`,
  });

  for (const slug of new Set(comments.map((comment) => comment.article.slug))) {
    revalidatePath(`/articles/${slug}`);
  }
  revalidatePath("/admin/commentaires");
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

  await db.comment.update({
    where: { id },
    data: { content: commentSchema.shape.content.parse(content) },
  });
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
