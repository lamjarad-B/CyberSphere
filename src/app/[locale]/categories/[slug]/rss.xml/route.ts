import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import { buildRssFeed } from "@/lib/rss";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale: rawLocale, slug } = await ctx.params;
  const locale = toLocale(rawLocale);
  const category = await db.category.findUnique({
    where: { slug },
    select: { id: true, name: true, nameEn: true, description: true },
  });
  if (!category) return new Response("Introuvable", { status: 404 });

  const name =
    locale === "en" && category.nameEn ? category.nameEn : category.name;

  return buildRssFeed({
    title: `CyberSphere — ${name}`,
    description:
      locale === "en"
        ? `Articles in the ${name} category.`
        : (category.description ?? `Articles de la catégorie ${name}.`),
    path: localeHref(locale, `/categories/${slug}/rss.xml`),
    locale,
    // Inclut les articles des sous-catégories, comme la page catégorie
    where: {
      OR: [{ categoryId: category.id }, { category: { parentId: category.id } }],
    },
  });
}
