"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { saveImage } from "@/lib/uploads";
import { profileSchema, firstError } from "@/lib/validations";
import type { ActionResult } from "./comments";

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: "Connectez-vous pour modifier votre profil." };
  }

  const parsed = profileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  let image: string | undefined;
  const avatar = formData.get("avatar");
  if (avatar instanceof File && avatar.size > 0) {
    try {
      image = await saveImage(avatar);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Upload impossible.",
      };
    }
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name, ...(image && { image }) },
  });

  revalidatePath("/membre");
  return { ok: true };
}
