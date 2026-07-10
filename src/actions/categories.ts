"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";
import { categorySchema, firstError } from "@/lib/validations";
import type { ActionResult } from "./comments";

export async function saveCategory(
  id: string | null,
  input: { name: string; description: string; parentId: string },
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  const parentId = data.parentId || null;
  if (parentId) {
    if (parentId === id) {
      return { ok: false, error: "Une catégorie ne peut pas être son propre parent." };
    }
    const parent = await db.category.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (!parent) return { ok: false, error: "Catégorie parente introuvable." };
    if (parent.parentId) {
      return {
        ok: false,
        error: "Deux niveaux maximum : une sous-catégorie ne peut pas avoir d'enfants.",
      };
    }
    if (id) {
      const childCount = await db.category.count({ where: { parentId: id } });
      if (childCount > 0) {
        return {
          ok: false,
          error: "Cette catégorie a des sous-catégories : elle doit rester au premier niveau.",
        };
      }
    }
  }

  try {
    if (id) {
      await db.category.update({
        where: { id },
        data: { name: data.name, description: data.description || null, parentId },
      });
    } else {
      const slug = await uniqueSlug(slugify(data.name), async (candidate) => {
        const found = await db.category.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return found !== null;
      });
      await db.category.create({
        data: { name: data.name, slug, description: data.description || null, parentId },
      });
    }
  } catch {
    return { ok: false, error: "Enregistrement impossible. Réessayez." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const articleCount = await db.article.count({
    where: {
      OR: [{ categoryId: id }, { category: { parentId: id } }],
    },
  });
  if (articleCount > 0) {
    return {
      ok: false,
      error: `Impossible : ${articleCount} article(s) utilisent cette catégorie ou ses sous-catégories.`,
    };
  }

  try {
    await db.category.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Suppression impossible." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
