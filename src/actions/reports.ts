"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getAdminSession, getSession } from "@/lib/session";
import type { ActionResult } from "./comments";

/** Signale un commentaire à la modération (une fois par membre). */
export async function reportComment(
  commentId: string,
  reason: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: "Connectez-vous pour signaler un commentaire." };
  }

  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true },
  });
  if (!comment) return { ok: false, error: "Commentaire introuvable." };
  if (comment.authorId === session.user.id) {
    return { ok: false, error: "Vous ne pouvez pas signaler votre propre commentaire." };
  }

  try {
    await db.commentReport.create({
      data: {
        commentId: comment.id,
        reporterId: session.user.id,
        reason: reason.trim().slice(0, 300) || null,
      },
    });
  } catch {
    // Contrainte unique : déjà signalé par ce membre
    return { ok: false, error: "Vous avez déjà signalé ce commentaire." };
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

  await db.commentReport.update({
    where: { id: report.id },
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
