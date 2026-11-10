const MAX_SLUG_LENGTH = 80;

export function slugify(input: string): string {
  let slug = input
    .normalize("NFD")
    // retire les diacritiques (é → e, ç → c…)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > MAX_SLUG_LENGTH) {
    // coupe au dernier tiret pour ne pas tronquer un mot (« …-securi ») ;
    // un mot unique plus long que la limite est tronqué net
    const head = slug.slice(0, MAX_SLUG_LENGTH + 1);
    const cut = head.lastIndexOf("-");
    slug = cut > 0 ? head.slice(0, cut) : slug.slice(0, MAX_SLUG_LENGTH);
  }
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
