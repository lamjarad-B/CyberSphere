"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { saveImage } from "@/lib/uploads";
import { renderMarkdown } from "@/lib/markdown";
import { slugify, uniqueSlug } from "@/lib/slug";
import { articleSchema, firstError } from "@/lib/validations";
import type { ActionResult } from "./comments";

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && t.length <= 40),
    ),
  ].slice(0, 10);
}

export async function saveArticle(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const parsed = articleSchema.safeParse({
    title: formData.get("title"),
    excerpt: formData.get("excerpt"),
    content: formData.get("content"),
    categoryId: formData.get("categoryId"),
    tags: formData.get("tags") ?? "",
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  const category = await db.category.findUnique({
    where: { id: data.categoryId },
    select: { id: true },
  });
  if (!category) return { ok: false, error: "Catégorie introuvable." };

  let coverImage: string | undefined;
  const cover = formData.get("cover");
  if (cover instanceof File && cover.size > 0) {
    try {
      coverImage = await saveImage(cover);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Upload impossible.",
      };
    }
  }

  const tagNames = parseTags(data.tags);
  const tagOps = {
    connectOrCreate: tagNames.map((name) => ({
      where: { name },
      create: { name, slug: slugify(name) },
    })),
  };

  try {
    if (id) {
      const existing = await db.article.findUnique({
        where: { id },
        select: { id: true, publishedAt: true },
      });
      if (!existing) return { ok: false, error: "Article introuvable." };

      await db.article.update({
        where: { id },
        data: {
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          categoryId: data.categoryId,
          status: data.status,
          ...(coverImage && { coverImage }),
          // premier passage en "publié" : on fige la date de publication
          ...(data.status === "PUBLISHED" &&
            !existing.publishedAt && { publishedAt: new Date() }),
          tags: { set: [], ...tagOps },
        },
      });
    } else {
      const slug = await uniqueSlug(slugify(data.title), async (candidate) => {
        const found = await db.article.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return found !== null;
      });

      await db.article.create({
        data: {
          title: data.title,
          slug,
          excerpt: data.excerpt,
          content: data.content,
          categoryId: data.categoryId,
          status: data.status,
          coverImage: coverImage ?? null,
          publishedAt: data.status === "PUBLISHED" ? new Date() : null,
          authorId: session.user.id,
          tags: tagOps,
        },
      });
    }
  } catch {
    return { ok: false, error: "Enregistrement impossible. Réessayez." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  try {
    await db.article.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Suppression impossible." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function previewMarkdown(
  content: string,
): Promise<{ html: string }> {
  const session = await getAdminSession();
  if (!session) return { html: "<p>Accès refusé.</p>" };
  return { html: await renderMarkdown(content.slice(0, 100_000)) };
}
