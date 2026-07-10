import { db } from "@/lib/db";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const articles = await db.article.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 20,
    select: {
      title: true,
      slug: true,
      excerpt: true,
      publishedAt: true,
      author: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  const items = articles
    .map(
      (article) => `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${BASE_URL}/articles/${article.slug}</link>
      <guid>${BASE_URL}/articles/${article.slug}</guid>
      <description>${escapeXml(article.excerpt)}</description>
      <category>${escapeXml(article.category.name)}</category>
      <pubDate>${(article.publishedAt ?? new Date()).toUTCString()}</pubDate>
    </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CyberSphere</title>
    <link>${BASE_URL}</link>
    <description>Articles, analyses et tutoriels de cybersécurité.</description>
    <language>fr</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
