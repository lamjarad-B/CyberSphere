"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionLocale } from "@/lib/action-locale";
import { rateLimit } from "@/lib/rate-limit";
import { ensureAuthorSlug } from "@/lib/authors";
import { getSession, isStaffAccount } from "@/lib/session";
import { deleteUpload, saveImage } from "@/lib/uploads";
import { authorProfileSchema, profileSchema } from "@/lib/validations";
import type { ActionResult } from "./comments";

const messages = {
  fr: {
    loginRequired: "Connectez-vous pour modifier votre profil.",
    invalidName: "Le nom doit contenir entre 2 et 50 caractères.",
    invalidImage:
      "Image refusée : png, jpg, webp, gif ou svg lisible, 5 Mo et 40 mégapixels maximum.",
    tooManyAvatars: "Trop de changements d'avatar. Réessayez dans une heure.",
    invalidBio: "La bio est limitée à 600 caractères par langue.",
    invalidLinks: "Liens : 5 au maximum, une adresse https complète par ligne.",
  },
  en: {
    loginRequired: "Sign in to edit your profile.",
    invalidName: "Your name must be between 2 and 50 characters.",
    invalidImage:
      "Image rejected: use a readable png, jpg, webp, gif or svg of 5 MB and 40 megapixels at most.",
    tooManyAvatars: "Too many avatar changes. Please try again in an hour.",
    invalidBio: "The bio is limited to 600 characters per language.",
    invalidLinks: "Links: 5 at most, one full https address per line.",
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
    // Le ré-encodage coûte du CPU et de la mémoire : 10 avatars par heure
    // et par membre, pour qu'un compte ne puisse pas saturer le serveur
    if (!rateLimit(`avatar:${session.user.id}`, 10, 60 * 60_000)) {
      return { ok: false, error: t.tooManyAvatars };
    }
    try {
      image = await saveImage(avatar);
    } catch {
      return { ok: false, error: t.invalidImage };
    }
  }

  // Page auteur publique : réservée à l'équipe, ignorée pour un simple membre
  // même si le formulaire a été forgé
  const staff = isStaffAccount(session);
  let author: { bio: string | null; bioEn: string | null; links: string | null } | undefined;
  if (staff) {
    const authorParsed = authorProfileSchema.safeParse({
      bio: formData.get("bio") ?? "",
      bioEn: formData.get("bioEn") ?? "",
      links: formData.get("links") ?? "",
    });
    if (!authorParsed.success) {
      const field = authorParsed.error.issues[0]?.path[0];
      return { ok: false, error: field === "links" ? t.invalidLinks : t.invalidBio };
    }
    const { bio, bioEn, links } = authorParsed.data;
    author = { bio: bio || null, bioEn: bioEn || null, links: links.join("\n") || null };
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name, ...(image && { image }), ...author },
  });
  // L'ancien avatar n'est plus référencé : on libère le disque
  if (image) await deleteUpload(session.user.image);
  // L'adresse de la page auteur existe dès le premier enregistrement
  if (staff) await ensureAuthorSlug(session.user.id);

  revalidatePath("/membre");
  return { ok: true };
}
