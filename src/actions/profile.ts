"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionLocale } from "@/lib/action-locale";
import { getSession } from "@/lib/session";
import { deleteUpload, saveImage } from "@/lib/uploads";
import { profileSchema } from "@/lib/validations";
import type { ActionResult } from "./comments";

const messages = {
  fr: {
    loginRequired: "Connectez-vous pour modifier votre profil.",
    invalidName: "Le nom doit contenir entre 2 et 50 caractères.",
    invalidImage: "Image refusée : png, jpg, webp ou gif lisible, 5 Mo maximum.",
  },
  en: {
    loginRequired: "Sign in to edit your profile.",
    invalidName: "Your name must be between 2 and 50 characters.",
    invalidImage: "Image rejected: use a readable png, jpg, webp or gif of 5 MB at most.",
  },
};

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const t = messages[await actionLocale()];
  const session = await getSession();
  if (!session || session.user.banned) {
    return { ok: false, error: t.loginRequired };
  }

  const parsed = profileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: t.invalidName };

  let image: string | undefined;
  const avatar = formData.get("avatar");
  if (avatar instanceof File && avatar.size > 0) {
    try {
      image = await saveImage(avatar);
    } catch {
      return { ok: false, error: t.invalidImage };
    }
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name, ...(image && { image }) },
  });
  // L'ancien avatar n'est plus référencé : on libère le disque
  if (image) await deleteUpload(session.user.image);

  revalidatePath("/membre");
  return { ok: true };
}
