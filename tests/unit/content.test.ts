import { describe, expect, it } from "vitest";
import { extractToc, readingTimeMinutes, renderMarkdown } from "@/lib/markdown";
import { slugify, uniqueSlug } from "@/lib/slug";
import { localeHref, negotiateLocale, toLocale } from "@/lib/i18n";
import { describeUserAgent } from "@/lib/user-agent";

describe("Slugs", () => {
  it("translittère et ne garde que [a-z0-9-]", () => {
    expect(slugify("Sécurité offensive : l'été !")).toBe("securite-offensive-l-ete");
    expect(slugify("C++ & Rust")).toBe("c-rust");
    expect(slugify("???")).toBe("sans-titre");
    expect(slugify("a".repeat(200))).toHaveLength(80);
  });

  it("suffixe -2, -3… en cas de collision", async () => {
    const taken = new Set(["owasp", "owasp-2"]);
    expect(await uniqueSlug("owasp", async (slug) => taken.has(slug))).toBe("owasp-3");
  });
});

describe("Sommaire : ancres identiques à rehype-slug", () => {
  it("garde les suffixes synchronisés, titres imbriqués compris", async () => {
    const md = "## Intro\n\n> ## Intro\n\n## Intro\n\n### Détails\n\n- liste\n\n  ## Intro\n";
    const tocIds = extractToc(md).map((entry) => entry.id);
    const html = await renderMarkdown(md);
    const htmlIds = [...html.matchAll(/<h[23] id="([^"]+)"/g)].map((match) => match[1]);
    expect(tocIds).toEqual(htmlIds);
    expect(tocIds).toEqual(["intro", "intro-1", "intro-2", "détails", "intro-3"]);
  });

  it("estime le temps de lecture (220 mots/min, minimum 1)", () => {
    expect(readingTimeMinutes("mot ".repeat(10))).toBe(1);
    expect(readingTimeMinutes("mot ".repeat(1100))).toBe(5);
  });

  it("génère numéros et surlignage de lignes sur demande", async () => {
    const html = await renderMarkdown("```bash showLineNumbers {2}\nls\npwd\n```");
    expect(html).toContain("data-line-numbers");
    expect(html).toContain("data-highlighted-line");
  });
});

describe("Langues", () => {
  it.each([
    ["en-US,en;q=0.9,fr;q=0.8", "en"],
    ["fr-CA,fr;q=0.9,en;q=0.5", "fr"],
    ["de-DE,en;q=0.7", "en"],
    ["de-DE,es;q=0.7", "fr"],
    ["en;q=0,fr;q=0.5", "fr"],
    [null, "fr"],
  ])("négocie Accept-Language %s → %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("préfixe les chemins anglais uniquement", () => {
    expect(localeHref("fr", "/articles")).toBe("/articles");
    expect(localeHref("en", "/articles")).toBe("/en/articles");
    expect(localeHref("en", "/")).toBe("/en");
    expect(toLocale("xx")).toBe("fr");
  });
});

describe("User-agent", () => {
  const labels = { unknownDevice: "?", unknownBrowser: "nav?", unknownOs: "os?" };
  it("résume navigateur et système", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
        labels,
      ),
    ).toBe("Edge · Windows");
    expect(describeUserAgent(null, labels)).toBe("?");
    expect(describeUserAgent("curl/8.0", labels)).toBe("nav? · os?");
  });
});
