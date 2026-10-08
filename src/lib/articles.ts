import type { Locale } from "./i18n";
import type { ArticleCardData } from "@/components/article-card";

export const PAGE_SIZE = 9;

// ---------- Type d'article ----------

/** Valeurs de l'enum Prisma `ArticleKind`, dans l'ordre d'affichage. */
export const ARTICLE_KINDS = ["ANALYSIS", "EXPLAINER", "OPINION", "BRIEF", "TUTORIAL"] as const;
export type ArticleKindValue = (typeof ARTICLE_KINDS)[number];

const kindLabels: Record<Locale, Record<ArticleKindValue, string>> = {
  fr: {
    ANALYSIS: "Analyse",
    EXPLAINER: "Décryptage",
    OPINION: "Point de vue",
    BRIEF: "En bref",
    TUTORIAL: "Tutoriel",
  },
  en: {
    ANALYSIS: "Analysis",
    EXPLAINER: "Explainer",
    OPINION: "Opinion",
    BRIEF: "Brief",
    TUTORIAL: "Tutorial",
  },
};

export function kindLabel(kind: ArticleKindValue, locale: Locale): string {
  return kindLabels[locale][kind];
}

/** Paramètre d'URL `?type=analysis` → valeur de l'enum (ou undefined). */
export function parseKindParam(raw: string | undefined): ArticleKindValue | undefined {
  const value = raw?.toUpperCase();
  return ARTICLE_KINDS.find((kind) => kind === value);
}

/** Encadré « Points clés » : un point par ligne non vide, puces retirées. */
export function parseKeyPoints(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/**
 * Champs nécessaires aux cartes d'article des listes publiques.
 * La traduction anglaise (titre + extrait) est jointe : `localizeCard`
 * choisit la bonne langue avec repli sur le français.
 */
export const articleCardSelect = {
  slug: true,
  title: true,
  excerpt: true,
  kind: true,
  coverImage: true,
  publishedAt: true,
  category: { select: { name: true, nameEn: true, slug: true } },
  author: { select: { name: true } },
  translations: {
    where: { locale: "en" },
    select: { title: true, excerpt: true },
  },
} as const;

type ArticleCardRow = {
  slug: string;
  title: string;
  excerpt: string;
  kind: ArticleKindValue;
  coverImage: string | null;
  publishedAt: Date | null;
  category: { name: string; nameEn: string | null; slug: string };
  author: { name: string };
  translations: { title: string; excerpt: string }[];
};

/** Nom de catégorie dans la langue demandée (repli : français). */
export function categoryLabel(
  category: { name: string; nameEn: string | null },
  locale: Locale,
): string {
  return locale === "en" && category.nameEn ? category.nameEn : category.name;
}

/** Projette une ligne `articleCardSelect` dans la langue demandée. */
export function localizeCard(row: ArticleCardRow, locale: Locale): ArticleCardData {
  const translation = locale === "en" ? row.translations[0] : undefined;
  return {
    slug: row.slug,
    title: translation?.title ?? row.title,
    excerpt: translation?.excerpt ?? row.excerpt,
    kind: kindLabel(row.kind, locale),
    coverImage: row.coverImage,
    publishedAt: row.publishedAt,
    category: { name: categoryLabel(row.category, locale), slug: row.category.slug },
    author: { name: row.author.name },
  };
}

export function pageNumber(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}
