export const PAGE_SIZE = 9;

/** Champs nécessaires aux cartes d'article des listes publiques. */
export const articleCardSelect = {
  slug: true,
  title: true,
  excerpt: true,
  coverImage: true,
  publishedAt: true,
  category: { select: { name: true, slug: true } },
  author: { select: { name: true } },
} as const;

export function pageNumber(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}
