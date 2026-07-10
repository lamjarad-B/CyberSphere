"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
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
    select: { id: true, role: true, banned: true },
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

  revalidatePath("/admin/membres");
  return { ok: true };
}
