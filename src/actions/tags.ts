"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { slugify } from "@/lib/slug";
import type { ActionResult } from "./comments";

export async function createTag(name: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    return { ok: false, error: "Le nom du tag doit faire entre 2 et 40 caractères." };
  }

  try {
    await db.tag.create({ data: { name: trimmed, slug: slugify(trimmed) } });
  } catch {
    return { ok: false, error: "Ce tag existe déjà." };
  }

  revalidatePath("/admin/tags");
  return { ok: true };
}

export async function deleteTag(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  try {
    await db.tag.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Suppression impossible." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
