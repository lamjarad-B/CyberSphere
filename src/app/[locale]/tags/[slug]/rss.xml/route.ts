import { db } from "@/lib/db";
import { localeHref, toLocale } from "@/lib/i18n";
import { buildRssFeed } from "@/lib/rss";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale: rawLocale, slug } = await ctx.params;
  const locale = toLocale(rawLocale);
  const tag = await db.tag.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!tag) return new Response("Introuvable", { status: 404 });

  return buildRssFeed({
    title: `CyberSphere — #${tag.name}`,
    description:
      locale === "en"
        ? `Articles tagged ${tag.name}.`
        : `Articles portant le tag ${tag.name}.`,
    path: localeHref(locale, `/tags/${slug}/rss.xml`),
    locale,
    where: { tags: { some: { id: tag.id } } },
  });
}
