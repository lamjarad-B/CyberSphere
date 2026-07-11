"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { ActionResult } from "./comments";

/** Ajoute ou retire la mention « utile » du membre sur un article publié. */
export async function toggleReaction(articleId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: "Connectez-vous pour réagir." };
  }

  const article = await db.article.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: "Article introuvable." };
  }

  const key = { articleId: article.id, userId: session.user.id };
  const existing = await db.reaction.findUnique({
    where: { articleId_userId: key },
    select: { id: true },
  });
  if (existing) {
    await db.reaction.delete({ where: { id: existing.id } });
  } else {
    await db.reaction.create({ data: key });
  }

  revalidatePath(`/articles/${article.slug}`);
  return { ok: true };
}

/** Ajoute ou retire l'article des signets du membre. */
export async function toggleBookmark(articleId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: "Connectez-vous pour enregistrer un signet." };
  }

  const article = await db.article.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: "Article introuvable." };
  }

  const key = { articleId: article.id, userId: session.user.id };
  const existing = await db.bookmark.findUnique({
    where: { articleId_userId: key },
    select: { id: true },
  });
  if (existing) {
    await db.bookmark.delete({ where: { id: existing.id } });
  } else {
    await db.bookmark.create({ data: key });
  }

  revalidatePath(`/articles/${article.slug}`);
  revalidatePath("/membre");
  return { ok: true };
}
