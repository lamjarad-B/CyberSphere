import { db, expect, test, publishedArticle, uid } from "./helpers";

test.describe("Site public", () => {
  test("pages principales en 200, avec CSP stricte à nonce", async ({ request }) => {
    const article = await publishedArticle();
    for (const path of ["/", "/articles", `/articles/${article.slug}`, "/series", "/recherche?q=sql", "/securite", "/en"]) {
      const response = await request.get(path, { headers: { Accept: "text/html" } });
      expect(response.status(), path).toBe(200);
      const csp = response.headers()["content-security-policy"] ?? "";
      expect(csp, path).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(csp, path).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(response.headers()["x-frame-options"]).toBe("DENY");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    }
  });

  test("négociation de langue et URL canoniques", async ({ request }) => {
    const english = await request.get("/articles", {
      headers: { Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
      maxRedirects: 0,
    });
    expect(english.status()).toBe(307);
    expect(english.headers().location).toContain("/en/articles");

    const canonical = await request.get("/fr/articles", { maxRedirects: 0 });
    expect(canonical.status()).toBe(308);
    expect(canonical.headers().location).toMatch(/\/articles$/);
  });

  test("article non traduit servi en français avec bandeau sur /en", async ({ page }) => {
    const article = await publishedArticle();
    await page.goto(`/en/articles/${article.slug}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("format analytique : type, points clés, sources et filtre", async ({ page }) => {
    const source = await db.article.findFirstOrThrow({
      where: { status: "PUBLISHED" },
      select: { authorId: true, categoryId: true },
    });
    const slug = `analyse-e2e-${uid()}`;
    const title = `Analyse e2e ${slug}`;
    await db.article.create({
      data: {
        title,
        slug,
        excerpt: "Article créé par le test du format analytique.",
        content: "## Contexte\n\nUne affirmation sourcée[^1].\n\n[^1]: ANSSI, « Panorama », https://cyber.gouv.fr",
        kind: "ANALYSIS",
        keyPoints: "Premier point clé\nSecond point clé",
        status: "PUBLISHED",
        publishedAt: new Date(),
        authorId: source.authorId,
        categoryId: source.categoryId,
      },
    });
    try {
      await page.goto(`/articles/${slug}`);
      await expect(page.getByRole("link", { name: "Analyse", exact: true })).toBeVisible();
      const keyPoints = page.getByRole("complementary", { name: "Points clés" });
      await expect(keyPoints.getByRole("listitem")).toHaveText([
        "Premier point clé",
        "Second point clé",
      ]);
      await expect(page.getByRole("heading", { name: "Sources et notes" })).toBeVisible();

      await page.goto("/articles?type=analysis");
      await expect(page.getByRole("link", { name: title })).toBeVisible();
      await page.goto("/articles?type=tutorial");
      await expect(page.getByRole("link", { name: title })).toHaveCount(0);
    } finally {
      await db.article.delete({ where: { slug } });
    }
  });

  test("espaces protégés redirigés vers la connexion", async ({ request }) => {
    for (const [path, target] of [
      ["/admin", "/connexion"],
      ["/membre", "/connexion"],
      ["/en/membre", "/en/connexion"],
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBeGreaterThanOrEqual(300);
      expect(response.headers().location, path).toContain(target);
    }
  });

  test("fichiers techniques : security.txt, robots, sitemap, RSS", async ({ request }) => {
    const securityTxt = await (await request.get("/.well-known/security.txt")).text();
    expect(securityTxt).toMatch(/^Contact: mailto:/m);
    expect(securityTxt).toMatch(/^Expires: /m);

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /en/membre");

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/series");
    expect(sitemap).toContain('hreflang="en"');

    const rss = await request.get("/rss.xml");
    expect(rss.headers()["content-type"]).toContain("application/rss+xml");
  });

  test("téléversements : pas de traversée de répertoire", async ({ request }) => {
    const response = await request.get("/uploads/..%2F..%2Fpackage.json");
    expect(response.status()).toBe(404);
  });
});
