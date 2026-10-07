import { createHmac } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "@/lib/markdown";
import { createPreviewToken, verifyPreviewToken } from "@/lib/draft-preview";
import { safeRedirect } from "@/lib/redirect";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { saveImage, uploadFileName } from "@/lib/uploads";
import { newArticleEmail, securityAlertEmail } from "@/lib/email";
import { productionConfigErrors } from "@/lib/config-check";
import { referrerHostFrom } from "@/lib/stats";
import { confirmNewsletter, unsubscribeNewsletter } from "@/lib/newsletter";

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

  it("signe avec une clé dédiée, jamais avec le secret brut de better-auth", () => {
    const [exp, mac] = createPreviewToken("article-1").split(".");
    const rawSecretMac = createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
      .update(`article-1.${exp}`)
      .digest("base64url");
    expect(mac).not.toBe(rawSecretMac);
  });

  it("refuse un ?jeton= répété (tableau) sans lever d'erreur", () => {
    expect(verifyPreviewToken("article-1", ["a", "b"])).toBe(false);
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

  // Le navigateur supprime \t \n \r : « /\t/evil.com » deviendrait « //evil.com »
  it.each(["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\t\\evil.com", "/a\u0000b"])(
    "rejette les caractères de contrôle (%j)",
    (path) => {
      expect(safeRedirect(path, "/repli")).toBe("/repli");
    },
  );

  it("rejette ?redirection= décodé depuis la query (%09)", () => {
    const target = new URLSearchParams("redirection=/%09/evil.com").get("redirection");
    expect(safeRedirect(target, "/repli")).toBe("/repli");
  });

  it("rejette un paramètre répété (tableau)", () => {
    expect(safeRedirect(["/a", "/b"] as unknown as string, "/repli")).toBe("/repli");
  });
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

/** PNG minimal (IHDR + IDAT vide + IEND) annonçant des dimensions arbitraires. */
function pngHeader(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(0))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("Uploads : bombe de décompression", () => {
  it("refuse dès l'en-tête une image annonçant 16 000 × 16 000 px", async () => {
    const bomb = pngHeader(16_000, 16_000);
    expect(bomb.length).toBeLessThan(100); // quelques dizaines d'octets…
    await expect(
      saveImage(new File([new Uint8Array(bomb)], "bombe.png", { type: "image/png" })),
    ).rejects.toThrow(/trop grande/);
  });
});

describe("Configuration de production", () => {
  const strong = "a".repeat(64);

  it("accepte un secret aléatoire long", () => {
    expect(
      productionConfigErrors({
        BETTER_AUTH_SECRET: strong,
        DATABASE_URL: "postgresql://u:mdp-solide@db:5432/d",
      }),
    ).toEqual([]);
  });

  it.each([undefined, "", "court", "CHANGEZ_MOI", `CHANGEZ_MOI${strong}`])(
    "refuse le secret %j",
    (secret) => {
      expect(productionConfigErrors({ BETTER_AUTH_SECRET: secret })).toHaveLength(1);
    },
  );

  it("refuse le mot de passe de base d'exemple", () => {
    const errors = productionConfigErrors({
      BETTER_AUTH_SECRET: strong,
      DATABASE_URL: "postgresql://u:CHANGEZ_MOI_mot_de_passe_fort@db:5432/d",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("DATABASE_URL");
  });
});

describe("Statistiques : en-tête Referer (donnée client)", () => {
  it.each([
    ["https://www.google.com/search?q=x", "www.google.com"],
    ["https://news.ycombinator.com/item?id=1", "news.ycombinator.com"],
    ["http://localhost:8080/page", "localhost:8080"],
  ])("garde l'hôte de %s", (referer, host) => {
    expect(referrerHostFrom(referer, "cybersphere.example")).toBe(host);
  });

  it.each([
    null,
    "",
    "https://cybersphere.example/articles/x", // le site lui-même
    "pas une url",
    `https://${"a".repeat(120)}.com/`, // trop long : ignoré, pas tronqué
    "http://[::1]:3000/", // hors format d'hôte enregistré
  ])("ignore %j", (referer) => {
    expect(referrerHostFrom(referer, "cybersphere.example")).toBeNull();
  });
});

describe("Newsletter : jeton reçu de l'extérieur", () => {
  // Un objet passé comme jeton deviendrait un filtre Prisma ({ not: "" }
  // viderait la liste) : refusé avant toute requête, sans base de données
  it.each([{ not: "" }, ["jeton"], 42, null, "", "x".repeat(200)])(
    "refuse %j",
    async (token) => {
      expect(await unsubscribeNewsletter(token)).toBe(false);
      expect(await confirmNewsletter(token)).toBe(false);
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
