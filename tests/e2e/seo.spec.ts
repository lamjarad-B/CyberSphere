import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { db, expect, test, uid } from "./helpers";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1];

/** Signaux d'indexation d'une page : statut, balises du <head>, JSON-LD. */
async function seo(request: APIRequestContext, path: string) {
  const response = await request.get(path, {
    headers: { Accept: "text/html", "User-Agent": BROWSER_UA },
    maxRedirects: 0,
  });
  const html = await response.text();
  const head = html.slice(0, html.indexOf("</head>"));
  const links = [...head.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  const pathOf = (href = "") => new URL(href, "http://x").pathname + new URL(href, "http://x").search;
  return {
    status: response.status(),
    canonical: pathOf(attr(links.find((l) => /rel="canonical"/.test(l)) ?? "", "href")),
    hreflang: links
      .filter((l) => /rel="alternate"/.test(l) && /hreflang=/i.test(l))
      .map((l) => `${attr(l, "hreflang")}=${pathOf(attr(l, "href"))}`),
    robots: [...head.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((m) => m[1]).join(","),
    jsonLdTypes: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .flatMap((m) => {
        const data = JSON.parse(m[1]);
        return (data["@graph"] ?? [data]).map((node: { "@type": string }) => node["@type"]);
      }),
  };
}

async function translatedArticle() {
  return db.article.findFirstOrThrow({
    where: { status: "PUBLISHED", translations: { some: { locale: "en" } } },
    select: { id: true, slug: true },
  });
}

async function untranslatedArticle() {
  return db.article.findFirstOrThrow({
    where: { status: "PUBLISHED", translations: { none: {} } },
    select: { id: true, slug: true },
  });
}

test.describe("Indexation", () => {
  test("article traduit : canonique propre, hreflang et données structurées", async ({ request }) => {
    const { slug } = await translatedArticle();
    const en = await seo(request, `/en/articles/${slug}`);
    expect(en.status).toBe(200);
    expect(en.canonical).toBe(`/en/articles/${slug}`);
    expect(en.hreflang.sort()).toEqual(
      [`en=/en/articles/${slug}`, `fr=/articles/${slug}`, `x-default=/articles/${slug}`].sort(),
    );
    expect(en.jsonLdTypes).toEqual(expect.arrayContaining(["BlogPosting", "BreadcrumbList"]));
    expect(en.robots).not.toContain("noindex");
  });

  test("article non traduit : /en désigne l'original français", async ({ request }) => {
    const { slug } = await untranslatedArticle();
    for (const path of [`/articles/${slug}`, `/en/articles/${slug}`]) {
      const page = await seo(request, path);
      expect(page.status, path).toBe(200);
      expect(page.canonical, path).toBe(`/articles/${slug}`);
      expect(page.hreflang, path).toEqual([]);
    }
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`/articles/${slug}</loc>`);
    expect(sitemap).not.toContain(`/en/articles/${slug}`);
  });

  test("brouillon introuvable et absent du sitemap", async ({ request }) => {
    const source = await db.article.findFirstOrThrow({ select: { authorId: true, categoryId: true } });
    const slug = `brouillon-${uid()}`;
    await db.article.create({
      data: { ...source, slug, title: "Brouillon", excerpt: "x", content: "x", status: "DRAFT" },
    });
    try {
      expect((await seo(request, `/articles/${slug}`)).status).toBe(404);
      expect(await (await request.get("/sitemap.xml")).text()).not.toContain(slug);
    } finally {
      await db.article.delete({ where: { slug } });
    }
  });

  test("listes : paramètres parasites ignorés, page hors limites en 404", async ({ request }) => {
    const list = await seo(request, "/articles?utm_source=newsletter&page=1");
    expect(list.canonical).toBe("/articles");
    expect(list.hreflang).toContain("x-default=/articles");
    expect((await seo(request, "/articles?page=999")).status).toBe(404);
  });

  test("catégorie vide et tag isolé : noindex, hors sitemap", async ({ request }) => {
    const id = uid();
    const category = await db.category.create({ data: { name: `Vide ${id}`, slug: `vide-${id}` } });
    const article = await untranslatedArticle();
    const tag = await db.tag.create({
      data: { name: `seul-${id}`, slug: `seul-${id}`, articles: { connect: { id: article.id } } },
    });
    try {
      const empty = await seo(request, `/categories/${category.slug}`);
      expect(empty.status).toBe(200);
      expect(empty.robots).toContain("noindex");
      expect((await seo(request, `/tags/${tag.slug}`)).robots).toContain("noindex");
      const sitemap = await (await request.get("/sitemap.xml")).text();
      expect(sitemap).not.toContain(category.slug);
      expect(sitemap).not.toContain(tag.slug);
    } finally {
      await db.tag.delete({ where: { id: tag.id } });
      await db.category.delete({ where: { id: category.id } });
    }
  });

  test("recherche et pages de compte hors index", async ({ request }) => {
    for (const path of ["/recherche?q=nis2", "/connexion", "/inscription", "/en/mot-de-passe-oublie"]) {
      expect((await seo(request, path)).robots, path).toContain("noindex");
    }
  });

  test("une vue ne compte pas comme une modification (lastmod)", async ({ request }) => {
    const { id, slug } = await untranslatedArticle();
    const before = await db.article.findUniqueOrThrow({ where: { id }, select: { views: true, updatedAt: true } });
    await seo(request, `/articles/${slug}`);
    // La vue est enregistrée après la réponse (after())
    await expect
      .poll(async () => (await db.article.findUniqueOrThrow({ where: { id } })).views)
      .toBe(before.views + 1);
    const after = await db.article.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
});

test.describe("Auteurs, pages institutionnelles et moteurs", () => {
  test("page auteur indexée, signature reliée", async ({ request }) => {
    const author = await db.user.findFirstOrThrow({
      where: { slug: { not: null }, articles: { some: { status: "PUBLISHED" } } },
      select: { slug: true },
    });
    const page = await seo(request, `/auteurs/${author.slug}`);
    expect(page.status).toBe(200);
    expect(page.canonical).toBe(`/auteurs/${author.slug}`);
    expect(page.jsonLdTypes).toContain("ProfilePage");
    expect(await (await request.get("/sitemap.xml")).text()).toContain(`/auteurs/${author.slug}</loc>`);
    expect((await seo(request, "/auteurs/personne-inconnue")).status).toBe(404);
  });

  test("à propos et pages légales publiées et dans le sitemap", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/a-propos", "/mentions-legales", "/confidentialite", "/en/a-propos"]) {
      const page = await seo(request, path);
      expect(page.status, path).toBe(200);
      expect(page.canonical, path).toBe(path);
      expect(sitemap, path).toContain(`${path}</loc>`);
    }
  });

  test("fichier de clé IndexNow", async ({ request }) => {
    const response = await request.get("/indexnow.txt");
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/^[0-9a-f]{32}$/);
    expect(response.headers()["x-robots-tag"]).toBe("noindex");
  });

  test("couverture SVG : aperçu PNG pour les partages", async ({ request }) => {
    const name = `${Date.now()}-${uid().replace(/[^a-z0-9]/gi, "")}.svg`;
    const file = path.join(process.cwd(), "uploads", name);
    // Dossier absent d'une copie neuve du dépôt (CI) : créé au premier téléversement
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="315"><rect width="600" height="315" fill="#0f1622"/></svg>',
    );
    try {
      const response = await request.get(`/uploads/${name}.png`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      const png = await response.body();
      // Largeur PNG (octets 16-19 de l'en-tête IHDR) : 1200 px
      expect(png.readUInt32BE(16)).toBe(1200);
    } finally {
      await rm(file, { force: true });
      await rm(`${file}.png`, { force: true });
    }
  });

  test("« Mis à jour le » seulement après une vraie modification", async ({ request }) => {
    const { id, slug, publishedAt, contentUpdatedAt } = await db.article.findFirstOrThrow({
      where: { status: "PUBLISHED", translations: { none: {} } },
      select: { id: true, slug: true, publishedAt: true, contentUpdatedAt: true },
    });
    const later = new Date((publishedAt as Date).getTime() + 3 * 24 * 3600 * 1000);
    await db.article.update({ where: { id }, data: { contentUpdatedAt: later } });
    try {
      const html = await (
        await request.get(`/articles/${slug}`, { headers: { "User-Agent": BROWSER_UA } })
      ).text();
      expect(html).toContain("Mis à jour le");
      expect(html).toContain(`dateTime="${later.toISOString()}"`);
    } finally {
      await db.article.update({ where: { id }, data: { contentUpdatedAt } });
    }
  });
});
