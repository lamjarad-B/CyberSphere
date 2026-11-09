import { db } from "./db";
import { localeHref, type Locale } from "./i18n";
import { slugify, uniqueSlug } from "./slug";

/** Page publique d'un auteur, dans la langue demandée. */
export function authorHref(slug: string, locale: Locale): string {
  return localeHref(locale, `/auteurs/${slug}`);
}

/**
 * Slug de la page auteur, créé au premier besoin (première publication,
 * première saisie de la bio) puis figé : l'URL reste stable même si le nom
 * affiché change ensuite. Les auteurs ayant publié avant la v2.10 l'ont reçu
 * de la migration.
 */
export async function ensureAuthorSlug(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { slug: true, name: true },
  });
  if (user.slug) return user.slug;

  const slug = await uniqueSlug(slugify(user.name), async (candidate) =>
    Boolean(await db.user.findUnique({ where: { slug: candidate }, select: { id: true } })),
  );
  // Condition slug: null : deux appels simultanés ne se marchent pas dessus
  const { count } = await db.user.updateMany({ where: { id: userId, slug: null }, data: { slug } });
  if (count === 1) return slug;
  return (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { slug: true } }))
    .slug as string;
}
