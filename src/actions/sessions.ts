"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { ActionResult } from "./comments";

/**
 * Révoque une autre session du membre, désignée par son identifiant. Les
 * jetons de session — des secrets d'authentification — ne quittent ainsi
 * jamais le serveur (la page « Mes sessions » n'expose que des identifiants).
 */
export async function revokeMySession(sessionId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false };
  // La session courante se ferme par la déconnexion, pas par ici
  if (sessionId === session.session.id) return { ok: false };

  const { count } = await db.session.deleteMany({
    where: { id: sessionId, userId: session.user.id },
  });

  revalidatePath("/membre");
  return { ok: count > 0 };
}
