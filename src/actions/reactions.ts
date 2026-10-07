"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionLocale } from "@/lib/action-locale";
import { getSession } from "@/lib/session";
import type { ActionResult } from "./comments";

const messages = {
  fr: {
    loginToReact: "Connectez-vous pour réagir.",
    loginToBookmark: "Connectez-vous pour enregistrer un signet.",
    articleNotFound: "Article introuvable.",
  },
  en: {
    loginToReact: "Sign in to react.",
    loginToBookmark: "Sign in to bookmark this article.",
    articleNotFound: "Article not found.",
  },
};

/** Ajoute ou retire la mention « utile » du membre sur un article publié. */
export async function toggleReaction(articleId: string): Promise<ActionResult> {
  const t = messages[await actionLocale()];
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: t.loginToReact };
  }

  const article = await db.article.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: t.articleNotFound };
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
  const t = messages[await actionLocale()];
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: t.loginToBookmark };
  }

  const article = await db.article.findUnique({
    where: { id: articleId },
    select: { id: true, slug: true, status: true },
  });
  if (!article || article.status !== "PUBLISHED") {
    return { ok: false, error: t.articleNotFound };
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
