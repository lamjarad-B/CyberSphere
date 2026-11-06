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
  content: z
    .string()
    .min(10, "Le contenu doit contenir au moins 10 caractères")
    .max(200_000, "Le contenu est limité à 200 000 caractères"),
  categoryId: z.string().min(1, "Choisissez une catégorie"),
  tags: z.string().trim().max(300, "Liste de tags trop longue").default(""),
  status: z.enum(["DRAFT", "SUBMITTED", "SCHEDULED", "PUBLISHED"]),
  kind: z.enum(["ANALYSIS", "EXPLAINER", "OPINION", "BRIEF", "TUTORIAL"]).default("ANALYSIS"),
  // Encadré « Points clés » : un point par ligne (facultatif)
  keyPoints: z.string().trim().max(2_000, "Les points clés sont limités à 2 000 caractères").default(""),
  keyPointsEn: z
    .string()
    .trim()
    .max(2_000, "Les points clés anglais sont limités à 2 000 caractères")
    .default(""),
  // Date de mise en ligne (ISO 8601) si status = SCHEDULED
  scheduledAt: z.string().trim().max(40).default(""),
  // Fin de l'épinglage « À la une » (ISO 8601), vide : non épinglé
  featuredUntil: z.string().trim().max(40).default(""),
  // Pas de longueur maximale : un schéma peut demander une longue description
  coverAlt: z.string().trim().default(""),
  coverAltEn: z.string().trim().default(""),
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
  contentEn: z
    .string()
    .trim()
    .max(200_000, "Le contenu anglais est limité à 200 000 caractères")
    .default(""),
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

/** Une ligne : pas de retour chariot (le sujet finit dans un en-tête SMTP). */
const singleLine = (min: number, max: number) =>
  z
    .string()
    .transform((value) => value.replace(/[\r\n]+/g, " ").trim())
    .pipe(z.string().min(min).max(max));

export const contactSchema = z.object({
  name: singleLine(2, 80),
  email: z.email(),
  subject: singleLine(3, 120),
  message: z.string().trim().min(10).max(5000),
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

/**
 * Nettoie un texte destiné au public. Retire ce qui trompe sans se voir :
 * caractères de contrôle, espaces de largeur nulle et forçages de direction
 * (U+202E affiche le texte à l'envers). ZWJ et ZWNJ restent : les émojis
 * composés et le persan en ont besoin.
 */
export function cleanText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const commentText = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(2, "Le commentaire est trop court")
      .max(2000, "Le commentaire est limité à 2000 caractères"),
  );

export const commentSchema = z.object({
  content: commentText,
  articleId: z.string().min(1),
  parentId: z.string().trim().default(""),
});

/** Au-delà, un commentaire d'invité ressemble à du spam publicitaire. */
const MAX_GUEST_LINKS = 2;

/** Formulaire sans compte : tout vient d'un inconnu, rien n'est libre de forme. */
export const guestCommentSchema = z.object({
  articleId: z.string().min(1).max(64),
  parentId: z.string().trim().max(64).default(""),
  content: commentText.refine(
    (value) => (value.match(/https?:\/\/|www\./gi)?.length ?? 0) <= MAX_GUEST_LINKS,
  ),
  // Lettres de toutes les langues, sans balise, adresse ni nom de domaine
  name: z
    .string()
    .transform((value) => cleanText(value).replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2)
        .max(50)
        .regex(/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'’_-]*$/u)
        .refine((value) => !/\p{L}{2,}\.\p{L}{2,}/u.test(value)),
    ),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  newsletter: z.boolean().default(false),
});

/** Suppression groupée : des identifiants et rien d'autre, une page d'administration au plus. */
export const commentIdsSchema = z.array(z.string().min(1).max(64)).min(1).max(100);

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
