import { createHmac, hkdfSync } from "node:crypto";
import { ipBucket } from "./rate-limit";

/** Nom affiché : le membre, sinon le nom saisi par l'invité (contrainte CHECK en base). */
export function commentAuthorName(comment: {
  author?: { name: string } | null;
  guestName?: string | null;
}): string {
  return comment.author?.name ?? comment.guestName ?? "—";
}

/**
 * Empreinte de l'adresse IP d'un invité : assez pour compter ses commentaires
 * en attente et repérer une même origine en modération, sans conserver l'IP.
 * HMAC à clé dédiée (HKDF) : un simple hash se retrouverait par force brute,
 * les adresses IPv4 étant peu nombreuses.
 */
export function hashCommentIp(ip: string | null): string | null {
  if (!ip) return null;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET est requis pour l'empreinte des adresses IP.");
  const key = Buffer.from(hkdfSync("sha256", secret, "", "cybersphere/commentaire-ip", 32));
  return createHmac("sha256", key).update(ipBucket(ip)).digest("hex");
}
