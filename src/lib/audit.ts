import { headers } from "next/headers";
import { db } from "./db";

export type AuditEntry = {
  /** Action au format "domaine.verbe", ex. "article.publication" */
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string;
  targetId?: string;
  detail?: string;
  ipAddress?: string | null;
};

/**
 * IP du client pour la requête courante (derrière un reverse proxy).
 * Null hors requête HTTP (seed, scripts) : l'audit reste possible sans IP.
 */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim().slice(0, 45);
    return h.get("x-real-ip")?.slice(0, 45) ?? null;
  } catch {
    return null;
  }
}

/**
 * Trace un événement dans le journal d'audit. Ne lève jamais :
 * l'échec de la traçabilité ne doit pas casser l'action métier
 * (mais il est signalé dans les logs serveur).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        detail: entry.detail?.slice(0, 500) ?? null,
        ipAddress: entry.ipAddress ?? (await requestIp()),
      },
    });
  } catch (error) {
    console.error("[audit] écriture impossible :", error);
  }
}
