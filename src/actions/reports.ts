"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getAdminSession, getSession } from "@/lib/session";
import { actionLocale } from "@/lib/action-locale";
import { notifyAdmins } from "@/lib/notifications";
import type { ActionResult } from "./comments";

const messages = {
  fr: {
    loginToReport: "Connectez-vous pour signaler un commentaire.",
    commentNotFound: "Commentaire introuvable.",
    ownComment: "Vous ne pouvez pas signaler votre propre commentaire.",
    alreadyReported: "Vous avez déjà signalé ce commentaire.",
  },
  en: {
    loginToReport: "Sign in to report a comment.",
    commentNotFound: "Comment not found.",
    ownComment: "You can't report your own comment.",
    alreadyReported: "You've already reported this comment.",
  },
};

/** Signale un commentaire à la modération (une fois par membre). */
export async function reportComment(
  commentId: string,
  reason: string,
): Promise<ActionResult> {
  const t = messages[await actionLocale()];
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: t.loginToReport };
  }

  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      authorId: true,
      content: true,
      author: { select: { name: true } },
      article: { select: { status: true, title: true } },
    },
  });
  if (!comment || comment.article.status !== "PUBLISHED") {
    return { ok: false, error: t.commentNotFound };
  }
  if (comment.authorId === session.user.id) {
    return { ok: false, error: t.ownComment };
  }

  try {
    await db.commentReport.create({
      data: {
        commentId: comment.id,
        reporterId: session.user.id,
        reason: String(reason ?? "").trim().slice(0, 300) || null,
      },
    });
  } catch {
    // Contrainte unique : déjà signalé par ce membre
    return { ok: false, error: t.alreadyReported };
  }

  // Premier signalement de ce commentaire : les administrateurs sont prévenus
  // (les suivants ne font qu'incrémenter le compteur dans la file)
  const pending = await db.commentReport.count({
    where: { commentId: comment.id, resolvedAt: null },
  });
  if (pending === 1) {
    after(() =>
      notifyAdmins({
        subject: "Commentaire signalé",
        title: "Un commentaire a été signalé",
        intro: "Un membre a signalé un commentaire à la modération.",
        path: "/admin/signalements",
        details: [
          ["Article", comment.article.title],
          ["Auteur", comment.author.name],
          ["Commentaire", comment.content.slice(0, 200)],
          ["Motif", String(reason ?? "").trim().slice(0, 300) || "—"],
        ],
      }),
    );
  }

  revalidatePath("/admin/signalements");
  return { ok: true };
}

/** Classe un signalement sans suite (le commentaire reste en ligne). */
export async function dismissReport(reportId: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const report = await db.commentReport.findUnique({
    where: { id: reportId },
    select: { id: true, commentId: true },
  });
  if (!report) return { ok: false, error: "Signalement introuvable." };

  // La décision porte sur le commentaire : tous ses signalements en attente
  // sont classés, sinon il réapparaîtrait aussitôt dans la file.
  await db.commentReport.updateMany({
    where: { commentId: report.commentId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  await logAudit({
    action: "signalement.classement",
    actorId: session.user.id,
    targetType: "comment",
    targetId: report.commentId,
  });

  revalidatePath("/admin/signalements");
  return { ok: true };
}
