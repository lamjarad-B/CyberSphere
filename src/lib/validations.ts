import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(50, "Le nom est limité à 50 caractères"),
  email: z.email("Adresse e-mail invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(128, "Le mot de passe est limité à 128 caractères"),
});

export const articleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Le titre doit contenir au moins 3 caractères")
    .max(200, "Le titre est limité à 200 caractères"),
  excerpt: z
    .string()
    .trim()
    .min(10, "L'extrait doit contenir au moins 10 caractères")
    .max(500, "L'extrait est limité à 500 caractères"),
  content: z.string().min(10, "Le contenu doit contenir au moins 10 caractères"),
  categoryId: z.string().min(1, "Choisissez une catégorie"),
  tags: z.string().trim().max(300, "Liste de tags trop longue").default(""),
  status: z.enum(["DRAFT", "PUBLISHED"]),
});

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(60, "Le nom est limité à 60 caractères"),
  description: z.string().trim().max(300, "La description est limitée à 300 caractères").default(""),
  parentId: z.string().trim().default(""),
});

export const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(2, "Le commentaire est trop court")
    .max(2000, "Le commentaire est limité à 2000 caractères"),
  articleId: z.string().min(1),
  parentId: z.string().trim().default(""),
});

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(50, "Le nom est limité à 50 caractères"),
});

/** Extrait le premier message d'erreur d'un résultat Zod. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides";
}
