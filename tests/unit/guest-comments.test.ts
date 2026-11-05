import { hkdfSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChallenge, solveChallenge, type Challenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { createAltchaChallenge, verifyAltcha } from "@/lib/altcha";
import { commentPublishedEmail } from "@/lib/email";
import { ipBucket } from "@/lib/rate-limit";
import { cleanText, guestCommentSchema } from "@/lib/validations";

// Base en mémoire : seul le marquage « défi consommé » touche la base
const used = vi.hoisted(() => new Set<string>());
vi.mock("@/lib/db", () => ({
  db: {
    usedCaptchaChallenge: {
      createMany: async ({ data }: { data: { nonce: string }[] }) => {
        const [{ nonce }] = data;
        if (used.has(nonce)) return { count: 0 };
        used.add(nonce);
        return { count: 1 };
      },
    },
  },
}));

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

/** Charge utile telle que le widget l'envoie, pour un défi résolu. */
async function solved(challenge: Challenge) {
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error("Défi non résolu");
  return { challenge, solution };
}

function instanceKey(purpose: string): string {
  const key = hkdfSync("sha256", process.env.BETTER_AUTH_SECRET!, "", `cybersphere/${purpose}`, 32);
  return Buffer.from(key).toString("hex");
}

describe("ALTCHA : vérification serveur", () => {
  beforeEach(() => used.clear());

  it("accepte une solution valide une seule fois : rejouée, elle est refusée", async () => {
    const payload = encode(await solved(await createAltchaChallenge(3)));
    expect(await verifyAltcha(payload)).toBe(true);
    expect(await verifyAltcha(payload)).toBe(false);
  });

  it("n'accepte qu'un seul de deux envois simultanés", async () => {
    const payload = encode(await solved(await createAltchaChallenge(3)));
    const results = await Promise.all([verifyAltcha(payload), verifyAltcha(payload)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("refuse un défi aux paramètres altérés", async () => {
    const { challenge, solution } = await solved(await createAltchaChallenge(3));
    const tampered = {
      ...challenge,
      parameters: { ...challenge.parameters, expiresAt: challenge.parameters.expiresAt! + 3600 },
    };
    expect(await verifyAltcha(encode({ challenge: tampered, solution }))).toBe(false);
  });

  it("refuse une mauvaise solution, sans consommer le défi", async () => {
    const { challenge, solution } = await solved(await createAltchaChallenge(3));
    const wrong = { ...solution, derivedKey: "00".repeat(32) };
    expect(await verifyAltcha(encode({ challenge, solution: wrong }))).toBe(false);
    expect(used.size).toBe(0);
    expect(await verifyAltcha(encode({ challenge, solution }))).toBe(true);
  });

  it("refuse un défi expiré", async () => {
    const payload = encode(await solved(await createAltchaChallenge(3)));
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60_000);
    try {
      expect(await verifyAltcha(payload)).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  it("refuse un défi signé avec une autre clé", async () => {
    const forged = await createChallenge({
      algorithm: "PBKDF2/SHA-256",
      cost: 2_000,
      counter: 3,
      deriveKey,
      expiresAt: new Date(Date.now() + 60_000),
      hmacSignatureSecret: "cle-de-l-attaquant",
      hmacKeySignatureSecret: "autre-cle-de-l-attaquant",
    });
    expect(await verifyAltcha(encode(await solved(forged)))).toBe(false);
  });

  it("refuse un défi correctement signé mais sans expiration", async () => {
    const eternal = await createChallenge({
      algorithm: "PBKDF2/SHA-256",
      cost: 2_000,
      counter: 3,
      deriveKey,
      hmacSignatureSecret: instanceKey("altcha-signature"),
      hmacKeySignatureSecret: instanceKey("altcha-cle"),
    });
    expect(await verifyAltcha(encode(await solved(eternal)))).toBe(false);
  });

  it("refuse un algorithme bon marché, même correctement signé", async () => {
    const { deriveKey: sha } = await import("altcha-lib/algorithms/sha");
    const cheap = await createChallenge({
      algorithm: "SHA-256",
      cost: 1,
      counter: 3,
      deriveKey: sha,
      expiresAt: new Date(Date.now() + 60_000),
      hmacSignatureSecret: instanceKey("altcha-signature"),
      hmacKeySignatureSecret: instanceKey("altcha-cle"),
    });
    const solution = await solveChallenge({ challenge: cheap, deriveKey: sha });
    expect(await verifyAltcha(encode({ challenge: cheap, solution }))).toBe(false);
  });

  it.each([
    ["absent", undefined],
    ["nul", null],
    ["nombre", 42],
    ["objet (opérateur Prisma)", { not: "" }],
    ["tableau", ["a"]],
    ["base64 invalide", "%%%pas-du-base64%%%"],
    ["JSON invalide", Buffer.from("{pas du json").toString("base64")],
    ["trop long", "A".repeat(4097)],
    ["jeton de test du widget", encode({ challenge: null, solution: null, test: true })],
    ["objet vide", encode({})],
  ])("refuse une charge utile invalide : %s", async (_label, payload) => {
    expect(await verifyAltcha(payload)).toBe(false);
  });
});

describe("Formulaire sans compte : validation", () => {
  const valid = {
    articleId: "ckarticle",
    content: "Un commentaire tout à fait normal.",
    name: "Élodie O'Connor-Dupont",
    email: "Elodie@Example.COM",
  };

  it("accepte un formulaire normal et normalise l'e-mail", () => {
    const parsed = guestCommentSchema.parse(valid);
    expect(parsed.email).toBe("elodie@example.com");
    expect(parsed.name).toBe("Élodie O'Connor-Dupont");
    expect(parsed.newsletter).toBe(false);
    expect(parsed.parentId).toBe("");
  });

  it.each(["李小龙", "محمد علي", "J.R. Smith", "Anne_Marie 2"])("accepte le nom %s", (name) => {
    expect(guestCommentSchema.safeParse({ ...valid, name }).success).toBe(true);
  });

  it.each([
    ["trop court", "A"],
    ["trop long", "A".repeat(51)],
    ["vide", "   "],
    ["balise", "<script>alert(1)</script>"],
    ["URL", "https://spam.example"],
    ["domaine", "pilules-pas-cheres.com"],
    ["e-mail", "moi@example.com"],
  ])("refuse le nom : %s", (_label, name) => {
    const parsed = guestCommentSchema.safeParse({ ...valid, name });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path[0]).toBe("name");
  });

  it.each([
    ["plusieurs destinataires", "a@b.fr,d@e.fr"],
    ["injection d'en-tête", "a@b.fr\r\nBcc: victime@example.com"],
    ["sans domaine", "a@"],
    ["trop longue", `${"a".repeat(250)}@b.fr`],
  ])("refuse l'e-mail : %s", (_label, email) => {
    const parsed = guestCommentSchema.safeParse({ ...valid, email });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path[0]).toBe("email");
  });

  it("limite les liens : deux passent, le troisième est refusé", () => {
    const content = (n: number) =>
      Array.from({ length: n }, (_, i) => `https://exemple.fr/${i}`).join(" ");
    expect(guestCommentSchema.safeParse({ ...valid, content: content(2) }).success).toBe(true);
    const refused = guestCommentSchema.safeParse({ ...valid, content: content(3) });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.code).toBe("custom");
  });

  it("borne le commentaire et signale le dépassement (too_big)", () => {
    const refused = guestCommentSchema.safeParse({ ...valid, content: "a".repeat(2001) });
    expect(refused.error?.issues[0]?.code).toBe("too_big");
    expect(guestCommentSchema.safeParse({ ...valid, content: "a" }).success).toBe(false);
  });

  it("garde le HTML comme du texte : React l'échappera à l'affichage", () => {
    const content = "<img src=x onerror=alert(1)>";
    expect(guestCommentSchema.parse({ ...valid, content }).content).toBe(content);
  });

  it.each(["articleId", "parentId", "content", "name", "email"])(
    "refuse un objet à la place de la chaîne %s (injection d'opérateur Prisma)",
    (field) => {
      expect(guestCommentSchema.safeParse({ ...valid, [field]: { not: "" } }).success).toBe(false);
    },
  );

  it("n'accepte qu'un vrai booléen pour la newsletter", () => {
    expect(guestCommentSchema.safeParse({ ...valid, newsletter: "on" }).success).toBe(false);
    expect(guestCommentSchema.parse({ ...valid, newsletter: true }).newsletter).toBe(true);
  });

  it("ignore tout champ non prévu envoyé par le client", () => {
    const parsed = guestCommentSchema.parse({
      ...valid,
      status: "APPROVED",
      authorId: "admin",
      guestIpHash: "x",
    });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("authorId");
    expect(parsed).not.toHaveProperty("guestIpHash");
  });

  it("refuse une entrée qui n'est pas un objet", () => {
    expect(guestCommentSchema.safeParse(null).success).toBe(false);
    expect(guestCommentSchema.safeParse("texte").success).toBe(false);
  });
});

describe("cleanText", () => {
  it("retire les forçages de direction (U+202E) et les isolats", () => {
    expect(cleanText("abc\u202Edef\u2066ghi\u2069")).toBe("abcdefghi");
  });

  it("retire les caractères de largeur nulle et de contrôle", () => {
    expect(cleanText("a\u200Bb\u2060c\uFEFFd\u0000e\u0007f\u0085g")).toBe("abcdefg");
  });

  it("uniformise les fins de ligne et réduit les lignes vides", () => {
    expect(cleanText("  a\r\nb\rc\n\n\n\nd  ")).toBe("a\nb\nc\n\nd");
  });

  it("garde les tabulations, les émojis composés (ZWJ) et le ZWNJ", () => {
    const family = "👨\u200D👩\u200D👧";
    expect(cleanText(`a\tb ${family} می\u200Cخواهم`)).toBe(`a\tb ${family} می\u200Cخواهم`);
  });

  it("normalise en NFC", () => {
    expect(cleanText("é")).toBe("é");
  });
});

describe("ipBucket", () => {
  it.each([
    [null, "inconnue"],
    ["", "inconnue"],
    ["203.0.113.7", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2"],
    ["2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2"],
    ["2001:0DB8:0001:0002::1", "2001:db8:1:2"],
    ["2001:db8::1", "2001:db8:0:0"],
    ["::1", "0:0:0:0"],
    ["fe80::1%eth0", "fe80:0:0:0"],
  ])("%s → %s", (ip, expected) => {
    expect(ipBucket(ip)).toBe(expected);
  });

  it("regroupe toutes les adresses d'un même /64", () => {
    expect(ipBucket("2001:db8:a:b:1::")).toBe(ipBucket("2001:db8:a:b:ffff::1"));
    expect(ipBucket("2001:db8:a:b::")).not.toBe(ipBucket("2001:db8:a:c::"));
  });

  it("ne lève jamais sur une adresse malformée", () => {
    expect(() => ipBucket("1:2:3:4:5:6:7:8:9::a:b")).not.toThrow();
    expect(() => ipBucket("::::")).not.toThrow();
  });
});

describe("E-mail de publication d'un commentaire", () => {
  const base = { articleTitle: '<img src=x onerror="alert(1)">', url: "https://site/a" };

  it("échappe le titre de l'article", () => {
    const { html } = commentPublishedEmail(base);
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("<img src=x");
  });

  it("sans case cochée : ni abonnement annoncé, ni lien de désinscription", () => {
    const { html, text } = commentPublishedEmail(base);
    expect(text).not.toContain("nouvel article");
    expect(html).not.toContain("désabonner");
  });

  it("case cochée : annonce l'abonnement et donne le lien de désinscription", () => {
    const unsubscribeUrl = "https://site/newsletter/desinscription?jeton=abc";
    const { html, text } = commentPublishedEmail({ ...base, unsubscribeUrl });
    expect(text).toContain("à chaque nouvel article");
    expect(text).toContain(unsubscribeUrl);
    expect(html).toContain(`href="${unsubscribeUrl}"`);
  });
});
