import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "@/lib/markdown";
import { createPreviewToken, verifyPreviewToken } from "@/lib/draft-preview";
import { safeRedirect } from "@/lib/redirect";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { uploadFileName } from "@/lib/uploads";
import { newArticleEmail, securityAlertEmail } from "@/lib/email";

describe("Markdown : assainissement des URL (rehypeSafeUrls)", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
  ])("supprime le href exécutable %s", async (url) => {
    const html = await renderMarkdown(`[clic](${url})`);
    expect(html).toContain("<a>clic</a>");
    expect(html.toLowerCase()).not.toContain("script:");
  });

  it.each([
    ["https://example.com", 'href="https://example.com"'],
    ["mailto:a@b.c", 'href="mailto:a@b.c"'],
    ["#section", 'href="#section"'],
    ["/articles/x", 'href="/articles/x"'],
  ])("conserve le lien légitime %s", async (url, expected) => {
    expect(await renderMarkdown(`[lien](${url})`)).toContain(expected);
  });

  it("ignore le HTML brut écrit dans le Markdown", async () => {
    const html = await renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("supprime une image data:", async () => {
    const html = await renderMarkdown("![x](data:image/svg+xml;base64,PHN2Zz4=)");
    expect(html).toContain("<img");
    expect(html).not.toContain("src=");
  });
});

describe("Liens d'aperçu signés (HMAC)", () => {
  afterEach(() => vi.useRealTimers());

  it("accepte un jeton valide pour le bon article", () => {
    const token = createPreviewToken("article-1");
    expect(verifyPreviewToken("article-1", token)).toBe(true);
  });

  it("refuse le jeton d'un autre article", () => {
    expect(verifyPreviewToken("article-2", createPreviewToken("article-1"))).toBe(false);
  });

  it("refuse une signature ou une expiration falsifiée", () => {
    const [exp, mac] = createPreviewToken("article-1").split(".");
    expect(verifyPreviewToken("article-1", `${Number(exp) + 3600}.${mac}`)).toBe(false);
    expect(verifyPreviewToken("article-1", `${exp}.${mac.slice(0, -2)}AA`)).toBe(false);
    expect(verifyPreviewToken("article-1", "n'importe quoi")).toBe(false);
  });

  it("refuse un jeton expiré", () => {
    const token = createPreviewToken("article-1", 60);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    expect(verifyPreviewToken("article-1", token)).toBe(false);
  });
});

describe("Redirection après connexion (anti open-redirect)", () => {
  it.each(["/membre", "/en/articles/x?y=1", "/"])("accepte le chemin interne %s", (path) => {
    expect(safeRedirect(path, "/repli")).toBe(path);
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "", null, undefined])(
    "rejette %s",
    (path) => {
      expect(safeRedirect(path, "/repli")).toBe("/repli");
    },
  );
});

describe("Limiteur de débit", () => {
  afterEach(() => resetRateLimits());

  it("bloque au-delà du quota puis rouvre après la fenêtre", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, now)).toBe(true);
    expect(rateLimit("k", 3, 1000, now)).toBe(false);
    expect(rateLimit("autre", 3, 1000, now)).toBe(true);
    expect(rateLimit("k", 3, 1000, now + 1001)).toBe(true);
  });
});

describe("Suppression de fichiers téléversés (anti-traversée)", () => {
  it("reconnaît un fichier téléversé", () => {
    expect(uploadFileName("/uploads/1700000000000-0123456789abcdef.webp")).toBe(
      "1700000000000-0123456789abcdef.webp",
    );
  });

  it.each(["/uploads/../.env", "/uploads/..", "/uploads/a/b.webp", "/covers/a.svg", "/uploads/x.sh", null])(
    "refuse %s",
    (url) => {
      expect(uploadFileName(url)).toBeNull();
    },
  );
});

describe("E-mails : échappement HTML", () => {
  it("échappe titre et extrait de la newsletter", () => {
    const { html } = newArticleEmail({
      title: '<b>Titre</b> "piégé"',
      excerpt: "<img src=x onerror=alert(1)>",
      url: "https://site/a",
      unsubscribeUrl: "https://site/d",
    });
    expect(html).toContain("&lt;b&gt;Titre&lt;/b&gt; &quot;piégé&quot;");
    expect(html).not.toContain("<img src=x");
  });

  it("échappe les détails d'une alerte de sécurité (user-agent contrôlé par le client)", () => {
    const { html } = securityAlertEmail({
      kind: "new_device",
      locale: "fr",
      accountUrl: "https://site/membre",
      details: [["Appareil", "<script>alert(1)</script>"]],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
