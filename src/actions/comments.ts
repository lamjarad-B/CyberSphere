"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { z } from "zod";
import { db } from "@/lib/db";
import { logAudit, requestIp } from "@/lib/audit";
import { actionLocale } from "@/lib/action-locale";
import { verifyAltcha } from "@/lib/altcha";
import { hashCommentIp } from "@/lib/comments";
import { toLocale } from "@/lib/i18n";
import { notifyAdmins, notifyCommentPublished } from "@/lib/notifications";
import { ipBucket, rateLimit } from "@/lib/rate-limit";
import { getAdminSession, getSession } from "@/lib/session";
import { commentSchema, guestCommentSchema } from "@/lib/validations";

export type ActionResult = { ok: boolean; error?: string };

/** Fenêtre anti-spam : 3 commentaires maximum par minute et par membre. */
const SPAM_WINDOW_MS = 60_000;
const SPAM_MAX_COMMENTS = 3;

/** Tentatives d'un invité par IP : le limiteur en mémoire, avant tout accès à la base. */
const GUEST_ATTEMPTS_MAX = 5;
const GUEST_ATTEMPTS_WINDOW_MS = 10 * 60_000;
/** Commentaires en attente par origine (IP ou e-mail) : survit à un redémarrage. */
const GUEST_PENDING_MAX = 3;
/** Taille maximale de la file : borne la base et le travail de modération. */
const PENDING_QUEUE_MAX = 200;

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
    pendingLimit: "Vos commentaires précédents attendent encore leur relecture. Réessayez plus tard.",
    queueFull: "Les commentaires sont momentanément suspendus. Réessayez plus tard.",
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
    pendingLimit: "Your previous comments are still awaiting review. Please try again later.",
    queueFull: "Comments are temporarily suspended. Please try again later.",
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
    select: { id: true, slug: true, status: true },
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

  revalidatePath(`/articles/${article.slug}`);
  return { ok: true };
}

/**
 * Commentaire sans compte. Rien n'est publié : il attend la relecture d'un
 * admin. Aucun e-mail ne part vers l'adresse saisie, encore invérifiée.
 * Pas de revalidatePath : rien de public ne change, et chaque rendu d'une page
 * d'article compterait une vue.
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
    select: { id: true, title: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: t.articleNotFound };
  }

  const parentId = await resolveParentId(parsed.data.parentId, article.id);
  if (parentId === undefined) return { ok: false, error: t.parentNotFound };

  // Double envoi : le commentaire est déjà dans la file
  const duplicate = await db.comment.findFirst({
    where: { articleId: article.id, status: "PENDING", content },
    select: { id: true },
  });
  if (duplicate) return { ok: true };

  const guestIpHash = hashCommentIp(ip);
  const [fromSameOrigin, queueSize] = await Promise.all([
    db.comment.count({
      where: {
        status: "PENDING",
        OR: [{ guestEmail: email }, ...(guestIpHash ? [{ guestIpHash }] : [])],
      },
    }),
    db.comment.count({ where: { status: "PENDING" } }),
  ]);
  // Même message pour l'IP et l'e-mail : rien n'indique si une adresse est connue
  if (fromSameOrigin >= GUEST_PENDING_MAX) return { ok: false, error: t.pendingLimit };
  if (queueSize >= PENDING_QUEUE_MAX) return { ok: false, error: t.queueFull };

  await db.comment.create({
    data: {
      content,
      status: "PENDING",
      articleId: article.id,
      parentId,
      guestName: name,
      guestEmail: email,
      guestIpHash,
      newsletterOptIn: newsletter,
      guestLocale: locale,
    },
  });

  // File jusque-là vide : les administrateurs sont prévenus une seule fois
  // (un afflux de commentaires ne devient pas un afflux d'e-mails)
  if (queueSize === 0) {
    after(() =>
      notifyAdmins({
        subject: "Commentaire à modérer",
        title: "Un commentaire attend votre relecture",
        intro: "Un visiteur sans compte a laissé un commentaire. Il reste invisible tant qu'il n'est pas approuvé.",
        path: "/admin/commentaires",
        details: [
          ["Article", article.title],
          ["Auteur", name],
          ["Commentaire", content.slice(0, 200)],
        ],
      }),
    );
  }

  return { ok: true };
}

/**
 * Publie un commentaire en attente. L'empreinte d'IP de l'invité est effacée ;
 * son e-mail reste, réservé aux admins, jusqu'à la suppression du commentaire.
 * L'invité est prévenu et, s'il a coché la case, abonné seulement maintenant :
 * tant qu'aucun humain n'a validé le commentaire, le formulaire public ne peut
 * faire envoyer aucun e-mail à un tiers.
 */
export async function approveComment(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };
  if (typeof id !== "string") return { ok: false, error: "Commentaire introuvable." };

  const comment = await db.comment.findUnique({
    where: { id },
    select: {
      guestEmail: true,
      guestLocale: true,
      newsletterOptIn: true,
      article: {
        select: {
          slug: true,
          title: true,
          translations: { where: { locale: "en" }, select: { title: true } },
        },
      },
    },
  });
  if (!comment) return { ok: false, error: "Commentaire introuvable." };

  // Conditionnelle : deux approbations simultanées ne préviennent qu'une fois
  const { count } = await db.comment.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "APPROVED",
      guestIpHash: null,
      guestLocale: null,
      newsletterOptIn: false,
    },
  });
  if (count !== 1) return { ok: true };

  const { article, guestEmail, guestLocale, newsletterOptIn } = comment;
  if (guestEmail) {
    const locale = toLocale(guestLocale ?? "");
    after(() =>
      notifyCommentPublished({
        email: guestEmail,
        locale,
        articleTitle: locale === "en" ? (article.translations[0]?.title ?? article.title) : article.title,
        articleSlug: article.slug,
        subscribe: newsletterOptIn,
      }),
    );
  }

  await logAudit({
    action: "commentaire.approbation",
    actorId: session.user.id,
    targetType: "comment",
    targetId: id,
  });

  revalidatePath(`/articles/${comment.article.slug}`);
  revalidatePath("/admin/commentaires");
  return { ok: true };
}

/**
 * Vide la file d'attente en cas d'attaque : le plafond de la file fermerait
 * sinon le formulaire à tout le monde jusqu'à une suppression une par une.
 */
export async function deletePendingComments(): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const { count } = await db.comment.deleteMany({ where: { status: "PENDING" } });
  await logAudit({
    action: "commentaire.purge_file",
    actorId: session.user.id,
    targetType: "comment",
    detail: `${count} commentaire(s) en attente supprimé(s)`,
  });

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
