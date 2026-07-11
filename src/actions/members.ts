"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getAdminSession } from "@/lib/session";
import type { ActionResult } from "./comments";

export async function toggleBan(userId: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  if (userId === session.user.id) {
    return { ok: false, error: "Vous ne pouvez pas vous bannir vous-même." };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, banned: true, email: true },
  });
  if (!target) return { ok: false, error: "Membre introuvable." };
  if (target.role === "admin") {
    return { ok: false, error: "Impossible de bannir un administrateur." };
  }

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        banned: !target.banned,
        banReason: target.banned ? null : "Banni par un administrateur",
      },
    }),
    // Révoque immédiatement toutes les sessions actives du membre banni
    ...(!target.banned
      ? [db.session.deleteMany({ where: { userId } })]
      : []),
  ]);

  await logAudit({
    action: target.banned ? "membre.debannissement" : "membre.bannissement",
    actorId: session.user.id,
    targetType: "user",
    targetId: userId,
    detail: target.email,
  });

  revalidatePath("/admin/membres");
  return { ok: true };
}

/** Bascule un membre entre les rôles « user » et « author ». */
export async function toggleAuthorRole(userId: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, banned: true, email: true },
  });
  if (!target) return { ok: false, error: "Membre introuvable." };
  if (target.role === "admin") {
    return { ok: false, error: "Le rôle d'un administrateur ne se change pas ici." };
  }
  if (target.banned) {
    return { ok: false, error: "Débannissez ce membre avant de changer son rôle." };
  }

  const newRole = target.role === "author" ? "user" : "author";
  await db.user.update({ where: { id: userId }, data: { role: newRole } });

  await logAudit({
    action: newRole === "author" ? "membre.promotion_auteur" : "membre.retrait_auteur",
    actorId: session.user.id,
    targetType: "user",
    targetId: userId,
    detail: target.email,
  });

  revalidatePath("/admin/membres");
  return { ok: true };
}
