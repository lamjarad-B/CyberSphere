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
  status: z.enum(["DRAFT", "SUBMITTED", "PUBLISHED"]),
  seriesId: z.string().trim().default(""),
  seriesPosition: z.coerce
    .number()
    .int("La position doit être un entier")
    .min(1, "La position commence à 1")
    .max(999, "Position trop grande")
    .optional(),
  // Traduction anglaise : facultative, mais complète ou absente
  // (un article à moitié traduit mélangerait les deux langues)
  titleEn: z.string().trim().max(200, "Le titre anglais est limité à 200 caractères").default(""),
  excerptEn: z.string().trim().max(500, "L'extrait anglais est limité à 500 caractères").default(""),
  contentEn: z.string().trim().default(""),
});

export const seriesSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Le titre doit contenir au moins 3 caractères")
    .max(120, "Le titre est limité à 120 caractères"),
  description: z
    .string()
    .trim()
    .max(500, "La description est limitée à 500 caractères")
    .default(""),
  titleEn: z
    .string()
    .trim()
    .max(120, "Le titre anglais est limité à 120 caractères")
    .default(""),
  descriptionEn: z
    .string()
    .trim()
    .max(500, "La description anglaise est limitée à 500 caractères")
    .default(""),
});

export const newsletterSchema = z.object({
  email: z.email("Adresse e-mail invalide"),
  locale: z.enum(["fr", "en"]).default("fr"),
});

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(60, "Le nom est limité à 60 caractères"),
  nameEn: z
    .string()
    .trim()
    .max(60, "Le nom anglais est limité à 60 caractères")
    .default(""),
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
