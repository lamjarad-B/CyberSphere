import { createHmac } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "@/lib/markdown";
import { createPreviewToken, verifyPreviewToken } from "@/lib/draft-preview";
import { safeRedirect } from "@/lib/redirect";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  deleteUpload,
  saveImage,
  UPLOAD_DIR,
  uploadFileName,
  uploadUrlsIn,
} from "@/lib/uploads";
import { sanitizeSvg } from "@/lib/svg";
import { contactMessageEmail, newArticleEmail, securityAlertEmail } from "@/lib/email";
import { contactSchema } from "@/lib/validations";
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

describe("Images de corps citées dans le Markdown", () => {
  it("extrait les URL /uploads/… sans doublon ni chemin hors uploads", () => {
    const markdown = [
      "![capture](/uploads/1-aa.webp)",
      "![bis](/uploads/1-aa.webp) et [lien](/uploads/2-bb.png)",
      "![schéma](/schemas/flux.svg)",
      "![piège](/uploads/../.env) ![autre](/uploads/3-cc.webp.sh)",
    ].join("\n");
    expect(uploadUrlsIn(markdown)).toEqual(["/uploads/1-aa.webp", "/uploads/2-bb.png"]);
    expect(uploadUrlsIn(null)).toEqual([]);
  });
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

describe("Uploads : SVG rastérisé", () => {
  it("convertit un SVG (même piégé) en WebP, sans jamais stocker de SVG", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" onload="alert(1)">' +
      '<script>alert(1)</script><rect width="24" height="24" fill="#0af"/></svg>';
    const url = await saveImage(new File([svg], "piege.svg", { type: "image/svg+xml" }));
    expect(url).toMatch(/^\/uploads\/[\w-]+\.webp$/);

    const stored = await readFile(path.join(UPLOAD_DIR, uploadFileName(url)!));
    expect(stored.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(stored.subarray(12, 16).toString("ascii")).toBe("VP8L"); // sans perte
    expect(stored.toString("latin1")).not.toContain("alert");
    // rendu à pleine résolution, pas en vignette de 24 px
    expect((await sharp(stored).metadata()).width).toBe(2560);
    await deleteUpload(url);
  });

  it("refuse un faux SVG", async () => {
    await expect(
      saveImage(new File(["pas du svg"], "x.svg", { type: "image/svg+xml" })),
    ).rejects.toThrow(/invalide/);
  });
});

describe("Uploads : SVG conservé (administrateurs)", () => {
  const xmlns = 'xmlns="http://www.w3.org/2000/svg"';
  const svgFile = (svg: string) => new File([svg], "s.svg", { type: "image/svg+xml" });

  it("stocke un schéma en SVG, sans perdre son contenu", async () => {
    const svg = `<svg ${xmlns} viewBox="0 0 9 9"><defs><marker id="a"><path d="M0 0"/></marker></defs><line x2="9" marker-end="url(#a)"/><text>Été &amp; hiver</text></svg>`;
    const url = await saveImage(svgFile(svg), { keepSvg: true });
    expect(url).toMatch(/^\/uploads\/[\w-]+\.svg$/);
    expect(uploadFileName(url)).not.toBeNull();
    expect(uploadUrlsIn(`![x](${url})`)).toEqual([url]);

    const stored = await readFile(path.join(UPLOAD_DIR, uploadFileName(url)!), "utf8");
    expect(stored).toContain('marker-end="url(#a)"');
    expect(stored).toContain("Été &amp; hiver");
    await deleteUpload(url);
  });

  it("rastérise toujours sans keepSvg (avatars, auteurs)", async () => {
    const url = await saveImage(svgFile(`<svg ${xmlns} width="9" height="9"><rect width="9" height="9"/></svg>`));
    expect(url).toMatch(/\.webp$/);
    await deleteUpload(url);
  });

  it.each([
    [`<svg ${xmlns}><script>alert(1)</script></svg>`, /script/],
    [`<svg ${xmlns}><SCRIPT>alert(1)</SCRIPT></svg>`, /SCRIPT/],
    [`<svg ${xmlns} onload="alert(1)"/>`, /onload/],
    [`<svg ${xmlns} ONLOAD="alert(1)"/>`, /ONLOAD/],
    [`<svg ${xmlns}><foreignObject/></svg>`, /foreignObject/],
    [`<svg ${xmlns}><a href="javascript:alert(1)"><text>x</text></a></svg>`, /<a>/],
    [`<svg ${xmlns}><image href="https://evil.test/x.png"/></svg>`, /image/],
    [`<svg ${xmlns}><use href="#a"/></svg>`, /use/],
    [`<svg ${xmlns}><set attributeName="onmouseover" to="alert(1)"/></svg>`, /set/],
    [`<svg ${xmlns}><animate attributeName="href" to="javascript:alert(1)"/></svg>`, /animate/],
    [`<svg ${xmlns}><style>*{fill:red}</style></svg>`, /style/],
    [`<svg ${xmlns} style="fill:url(https://evil.test)"/>`, /style/],
    [`<svg ${xmlns}><rect fill="url(https://evil.test/a#b)"/></svg>`, /externe/],
    [`<svg ${xmlns}><html:script xmlns:html="http://www.w3.org/1999/xhtml"/></svg>`, /html:script/],
    [`<!DOCTYPE svg [<!ENTITY x "y">]><svg ${xmlns}>&x;</svg>`, /DOCTYPE/],
    [`<?xml-stylesheet href="https://evil.test/a.xsl"?><svg ${xmlns}/>`, /instruction/],
    ["<svg/>", /pas un SVG/],
    ["<html/>", /html/],
    ["pas du svg", /XML invalide/],
    [`<svg ${xmlns}>`, /XML invalide/],
  ])("refuse %s", (svg, message) => {
    expect(() => sanitizeSvg(Buffer.from(svg))).toThrow(message);
  });

  it("refuse un SVG en UTF-16 (contournement de filtre)", () => {
    const svg = `<svg ${xmlns}><script>alert(1)</script></svg>`;
    expect(() => sanitizeSvg(Buffer.from(`\ufeff${svg}`, "utf16le"))).toThrow(/UTF-8/);
  });

  it("n'écrit aucun fichier pour un SVG refusé, et neutralise les commentaires", async () => {
    await expect(
      saveImage(svgFile(`<svg ${xmlns}><script/></svg>`), { keepSvg: true }),
    ).rejects.toThrow(/script/);
    expect(sanitizeSvg(Buffer.from(`<svg ${xmlns}><!-- <script>x</script> --></svg>`))).not.toContain("script");
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

  it("échappe le contenu d'un message de contact (saisi par le visiteur)", () => {
    const { html } = contactMessageEmail({
      name: "<b>Eve</b>",
      email: "eve@example.com",
      subject: "<img src=x onerror=alert(1)>",
      message: "<script>alert(1)</script>",
      locale: "fr",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Eve</b>");
  });
});

describe("Formulaire de contact : validation", () => {
  const valid = {
    name: "Eve",
    email: "eve@example.com",
    subject: "Bonjour",
    message: "Un message assez long.",
  };

  it("aplatit les retours chariot du sujet (anti-injection d'en-têtes)", () => {
    const parsed = contactSchema.parse({ ...valid, subject: "Salut\r\nBcc: victime@example.com" });
    expect(parsed.subject).toBe("Salut Bcc: victime@example.com");
  });

  it("refuse un message trop court ou une adresse invalide", () => {
    expect(contactSchema.safeParse({ ...valid, message: "court" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, email: "pas-une-adresse" }).success).toBe(false);
  });
});
