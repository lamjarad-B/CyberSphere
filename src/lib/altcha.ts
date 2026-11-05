import { hkdfSync, randomInt } from "node:crypto";
import { createChallenge, verifySolution, type Challenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { z } from "zod";
import { db } from "./db";

const ALGORITHM = "PBKDF2/SHA-256";
/**
 * Effort demandé au navigateur : il essaie en moyenne 4 000 compteurs à 2 000
 * itérations chacun, soit 1 à 3 secondes mesurées sur un ordinateur de bureau.
 * Davantage sur un téléphone : baisser COST si l'attente y devient gênante.
 */
const COST = 2_000;
const COUNTER_MIN = 2_000;
const COUNTER_MAX = 6_000;
const CHALLENGE_TTL_MS = 10 * 60_000;
/** Largement au-dessus d'une charge utile légitime (moins de 1 Ko). */
const MAX_PAYLOAD_LENGTH = 4096;

/**
 * Clés dédiées, dérivées par HKDF-SHA256 du secret de l'instance (séparation
 * des usages, cf. lib/draft-preview). Sans secret, on lève : ni défi émis ni
 * solution acceptée, jamais d'état « désactivé » comme avec Turnstile.
 */
function secret(purpose: string): string {
  const master = process.env.BETTER_AUTH_SECRET;
  if (!master) throw new Error("BETTER_AUTH_SECRET est requis pour signer les défis ALTCHA.");
  return Buffer.from(hkdfSync("sha256", master, "", `cybersphere/${purpose}`, 32)).toString("hex");
}

/**
 * Crée un défi de preuve de travail signé. Mode déterministe : le serveur
 * connaît la réponse dès la création, la vérification ne refait donc aucun
 * calcul coûteux (pas de déni de service par envoi de fausses solutions).
 */
export async function createAltchaChallenge(
  counter: number = randomInt(COUNTER_MIN, COUNTER_MAX),
): Promise<Challenge> {
  return createChallenge({
    algorithm: ALGORITHM,
    cost: COST,
    counter,
    deriveKey,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    hmacSignatureSecret: secret("altcha-signature"),
    hmacKeySignatureSecret: secret("altcha-cle"),
  });
}

const hex = z.string().regex(/^(?:[0-9a-f]{2})+$/);

/**
 * Forme attendue, reçue d'un inconnu. Les paramètres restent ouverts : la
 * signature les couvre tous, en retirer un la ferait échouer. keySignature et
 * expiresAt sont exigés même si la bibliothèque s'en passerait : sans eux, un
 * défi n'expirerait jamais ou la vérification referait le calcul.
 */
const payloadSchema = z.object({
  challenge: z.object({
    parameters: z.looseObject({
      algorithm: z.literal(ALGORITHM),
      nonce: hex,
      salt: hex,
      cost: z.number().int().positive(),
      keyLength: z.number().int().positive(),
      keyPrefix: hex,
      keySignature: hex,
      expiresAt: z.number().int().positive(),
    }),
    signature: hex,
  }),
  solution: z.object({
    counter: z.number().int().nonnegative(),
    derivedKey: hex,
  }),
});

function parsePayload(raw: unknown) {
  if (typeof raw !== "string" || raw.length > MAX_PAYLOAD_LENGTH) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return payloadSchema.safeParse(decoded).data ?? null;
  } catch {
    return null;
  }
}

/**
 * Vérifie une preuve de travail et la consomme : l'insertion atomique du nonce
 * fait qu'une solution ne sert qu'une fois, même envoyée deux fois en même
 * temps. Le nonce n'est écrit qu'après vérification : une fausse solution ne
 * remplit pas la table. Toute erreur vaut refus.
 */
export async function verifyAltcha(raw: unknown): Promise<boolean> {
  const payload = parsePayload(raw);
  if (!payload) return false;
  try {
    const { verified } = await verifySolution({
      challenge: payload.challenge,
      solution: payload.solution,
      deriveKey,
      hmacSignatureSecret: secret("altcha-signature"),
      hmacKeySignatureSecret: secret("altcha-cle"),
    });
    if (!verified) return false;

    const { nonce, expiresAt } = payload.challenge.parameters;
    const { count } = await db.usedCaptchaChallenge.createMany({
      data: [{ nonce, expiresAt: new Date(expiresAt * 1000) }],
      skipDuplicates: true,
    });
    return count === 1;
  } catch (error) {
    console.error("[altcha] vérification impossible :", error);
    return false;
  }
}
