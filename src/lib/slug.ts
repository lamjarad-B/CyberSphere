export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    // retire les diacritiques (é → e, ç → c…)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "sans-titre";
}

/** Rend un slug unique en suffixant -2, -3… si nécessaire. */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base;
  let i = 2;
  while (await exists(candidate)) {
    candidate = `${base}-${i}`;
    i++;
  }
  return candidate;
}
