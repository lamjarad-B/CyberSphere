import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

/**
 * Export des données personnelles du membre connecté (RGPD, art. 15 et 20 :
 * droit d'accès et portabilité), au format JSON. Les secrets (hash du mot de
 * passe, jetons de session, secret TOTP, clés des passkeys) sont exclus.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Non authentifié", { status: 401 });
  const userId = session.user.id;

  const [user, comments, reactions, bookmarks, reports, sessions, passkeys, devices, articles, newsletter, audit] =
    await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          role: true,
          twoFactorEnabled: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.comment.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          content: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
          article: { select: { slug: true, title: true } },
        },
      }),
      db.reaction.findMany({
        where: { userId },
        select: { createdAt: true, article: { select: { slug: true, title: true } } },
      }),
      db.bookmark.findMany({
        where: { userId },
        select: { createdAt: true, article: { select: { slug: true, title: true } } },
      }),
      db.commentReport.findMany({
        where: { reporterId: userId },
        select: { commentId: true, reason: true, createdAt: true, resolvedAt: true },
      }),
      db.session.findMany({
        where: { userId },
        select: { ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
      }),
      db.passkey.findMany({
        where: { userId },
        select: { name: true, deviceType: true, backedUp: true, createdAt: true },
      }),
      db.loginDevice.findMany({
        where: { userId },
        select: { createdAt: true, lastSeenAt: true },
      }),
      db.article.findMany({
        where: { authorId: userId },
        select: { slug: true, title: true, status: true, createdAt: true, publishedAt: true },
      }),
      db.newsletterSubscriber.findUnique({
        where: { email: session.user.email.toLowerCase() },
        select: { email: true, locale: true, confirmed: true, confirmedAt: true, createdAt: true },
      }),
      db.auditLog.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: "asc" },
        select: { action: true, ipAddress: true, createdAt: true },
      }),
    ]);

  await logAudit({ action: "compte.export", actorId: userId });

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      user,
      comments,
      reactions,
      bookmarks,
      commentReports: reports,
      sessions,
      passkeys,
      loginDevices: devices,
      articles,
      newsletter,
      securityLog: audit,
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cybersphere-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
