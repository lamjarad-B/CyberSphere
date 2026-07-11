"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getAdminSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";
import { seriesSchema, firstError } from "@/lib/validations";
import type { ActionResult } from "./comments";

export async function saveSeries(
  id: string | null,
  input: { title: string; description: string; titleEn: string; descriptionEn: string },
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const parsed = seriesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  try {
    if (id) {
      await db.series.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description || null,
          titleEn: data.titleEn || null,
          descriptionEn: data.descriptionEn || null,
        },
      });
    } else {
      const slug = await uniqueSlug(slugify(data.title), async (candidate) => {
        const found = await db.series.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return found !== null;
      });
      await db.series.create({
        data: {
          title: data.title,
          slug,
          description: data.description || null,
          titleEn: data.titleEn || null,
          descriptionEn: data.descriptionEn || null,
        },
      });
    }
  } catch {
    return { ok: false, error: "Enregistrement impossible. Réessayez." };
  }

  await logAudit({
    action: id ? "serie.modification" : "serie.creation",
    actorId: session.user.id,
    targetType: "series",
    targetId: id ?? undefined,
    detail: data.title,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteSeries(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  try {
    // Les articles de la série ne sont pas supprimés : seriesId → null
    await db.series.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Suppression impossible." };
  }

  await logAudit({
    action: "serie.suppression",
    actorId: session.user.id,
    targetType: "series",
    targetId: id,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
