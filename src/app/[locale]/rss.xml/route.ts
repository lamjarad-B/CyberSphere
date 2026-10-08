import { localeHref, toLocale } from "@/lib/i18n";
import { buildRssFeed } from "@/lib/rss";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ locale: string }> },
) {
  const locale = toLocale((await ctx.params).locale);
  return buildRssFeed({
    title: "CyberSphere",
    description:
      locale === "en"
        ? "Cybersecurity analysis and explainers."
        : "Analyses et décryptages de la cybersécurité.",
    path: localeHref(locale, "/rss.xml"),
    locale,
  });
}
