import { describe, expect, it } from "vitest";
import {
  NOINDEX,
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  jsonLdString,
  localeAlternates,
  pageMetadata,
  pagedTitle,
  parseProfileLinks,
  personJsonLd,
  profilePageJsonLd,
  withQuery,
} from "@/lib/seo";
import { shareableImage } from "@/components/cover-image";
import { articlePaths, indexNowKey, indexNowPayload } from "@/lib/indexnow";

describe("URL canoniques des listes", () => {
  it("omet page=1 et les paramètres vides", () => {
    expect(withQuery("/articles", { page: 1 })).toBe("/articles");
    expect(withQuery("/articles", { type: undefined, page: 2 })).toBe("/articles?page=2");
    expect(withQuery("/articles", { type: "tutorial", page: 3 })).toBe(
      "/articles?type=tutorial&page=3",
    );
    expect(withQuery("/articles", { type: "", page: null })).toBe("/articles");
  });

  it("distingue le titre des pages suivantes", () => {
    expect(pagedTitle("Articles", 1)).toBe("Articles");
    expect(pagedTitle("Articles", 2)).toBe("Articles — page 2");
  });
});

describe("Canonique et hreflang", () => {
  it("page bilingue : canonique dans sa langue, fr/en/x-default", () => {
    const fr = localeAlternates("fr", "/articles?page=2");
    expect(fr.canonical).toBe("/articles?page=2");
    expect(fr.languages).toEqual({
      fr: "/articles?page=2",
      en: "/en/articles?page=2",
      "x-default": "/articles?page=2",
    });
    expect(localeAlternates("en", "/").canonical).toBe("/en");
    expect(localeAlternates("en", "/articles/x").canonical).toBe("/en/articles/x");
  });

  it("article non traduit : /en désigne l'original français, sans hreflang", () => {
    const en = localeAlternates("en", "/articles/x", { bilingual: false });
    expect(en.canonical).toBe("/articles/x");
    expect(en.languages).toBeUndefined();
  });

  it("annonce le flux RSS de la langue, plus celui de la page", () => {
    const feeds = localeAlternates("en", "/tags/nis2", {
      feed: { path: "/tags/nis2/rss.xml", title: "NIS2" },
    }).types?.["application/rss+xml"];
    expect(feeds).toEqual([
      { url: "/en/rss.xml", title: "CyberSphere" },
      { url: "/en/tags/nis2/rss.xml", title: "NIS2" },
    ]);
  });

  it("Open Graph complet, page indexable sauf demande contraire", () => {
    const meta = pageMetadata({ locale: "en", path: "/series", title: "Series" });
    expect(meta.robots).toEqual({ index: true, follow: true, "max-image-preview": "large" });
    expect(meta.openGraph).toMatchObject({
      siteName: "CyberSphere",
      locale: "en_US",
      url: "/en/series",
      title: "Series",
    });
    const hidden = pageMetadata({ locale: "fr", path: "/recherche", title: "x", robots: NOINDEX });
    expect(hidden.robots).toEqual({ index: false, follow: true });
  });
});

describe("Données structurées", () => {
  it("échappe < pour ne jamais fermer la balise script", () => {
    const json = jsonLdString({ "@type": "Thing", name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json).name).toBe("</script><script>alert(1)</script>");
    expect(JSON.parse(json)["@context"]).toBe("https://schema.org");
  });

  it("regroupe plusieurs nœuds dans un @graph", () => {
    const graph = JSON.parse(jsonLdString([{ "@type": "A" }, { "@type": "B" }]));
    expect(graph["@graph"]).toHaveLength(2);
  });

  it("fil d'Ariane : positions et URL absolues, dernière étape sans lien", () => {
    const crumbs = breadcrumbJsonLd([
      { name: "Accueil", path: "/" },
      { name: "NIS2" },
    ]) as { itemListElement: Record<string, unknown>[] };
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Accueil", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "NIS2" },
    ]);
  });

  it("article : uniquement les champs connus, image absolue", () => {
    const node = articleJsonLd({
      path: "/en/articles/x",
      headline: "Title",
      description: "Excerpt",
      inLanguage: "en",
      datePublished: new Date("2026-01-02T00:00:00Z"),
      dateModified: new Date("2026-02-03T00:00:00Z"),
      authorName: "Jane",
      image: "/uploads/a.webp",
    });
    expect(node).toMatchObject({
      "@type": "BlogPosting",
      url: absoluteUrl("/en/articles/x"),
      datePublished: "2026-01-02T00:00:00.000Z",
      dateModified: "2026-02-03T00:00:00.000Z",
      author: { "@type": "Person", name: "Jane" },
      image: [absoluteUrl("/uploads/a.webp")],
    });
    expect(node).not.toHaveProperty("keywords");
    expect(node).not.toHaveProperty("isPartOf");
  });
});

describe("Auteurs et images de partage", () => {
  it("ne garde que les profils https valides", () => {
    expect(
      parseProfileLinks("https://github.com/x\n\nhttp://insecure.example\njavascript:alert(1)\n  https://www.linkedin.com/in/y  "),
    ).toEqual(["https://github.com/x", "https://www.linkedin.com/in/y"]);
    expect(parseProfileLinks(null)).toEqual([]);
  });

  it("auteur d'article relié à sa page et à ses profils", () => {
    const node = articleJsonLd({
      path: "/articles/x",
      headline: "T",
      description: "D",
      inLanguage: "fr",
      datePublished: null,
      dateModified: new Date("2026-02-03T00:00:00Z"),
      authorName: "Jane Doe",
      authorPath: "/auteurs/jane-doe",
      authorSameAs: ["https://github.com/jane"],
    });
    expect(node.author).toEqual({
      "@type": "Person",
      "@id": `${absoluteUrl("/auteurs/jane-doe")}#person`,
      url: absoluteUrl("/auteurs/jane-doe"),
      name: "Jane Doe",
      sameAs: ["https://github.com/jane"],
    });
  });

  it("page auteur : ProfilePage centrée sur la personne, sans champ vide", () => {
    const page = profilePageJsonLd({ name: "Jane Doe", path: "/en/auteurs/jane-doe", description: null });
    expect(page).toMatchObject({ "@type": "ProfilePage", mainEntity: { "@type": "Person", name: "Jane Doe" } });
    expect(page.mainEntity).not.toHaveProperty("description");
    expect(personJsonLd({ name: "Jane" })).toEqual({ "@type": "Person", name: "Jane" });
  });

  it("SVG téléversé remplacé par son aperçu PNG, autre SVG écarté", () => {
    expect(shareableImage("/uploads/1-abc.svg")).toBe("/uploads/1-abc.svg.png");
    expect(shareableImage("/uploads/1-abc.webp")).toBe("/uploads/1-abc.webp");
    expect(shareableImage("/covers/bienvenue.svg")).toBeNull();
    expect(shareableImage(null)).toBeNull();
  });
});

describe("IndexNow", () => {
  it("URL absolues sans doublon, anglais seulement si traduit", () => {
    expect(articlePaths("x", false)).toEqual(["/articles/x"]);
    expect(articlePaths("x", true)).toEqual(["/articles/x", "/en/articles/x"]);
    const payload = indexNowPayload(["/articles/x", "/articles/x", "/en/articles/x"], "k");
    expect(payload.urlList).toEqual([absoluteUrl("/articles/x"), absoluteUrl("/en/articles/x")]);
    expect(payload.keyLocation).toBe(absoluteUrl("/indexnow.txt"));
  });

  it("clé stable dérivée du secret, jamais le secret lui-même", () => {
    const previous = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = "s".repeat(40);
    const key = indexNowKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(indexNowKey()).toBe(key);
    expect(key).not.toContain("ssss");
    process.env.BETTER_AUTH_SECRET = previous;
  });
});
