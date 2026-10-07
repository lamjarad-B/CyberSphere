import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Rôles ayant accès à l'interface d'administration. */
const STAFF_ROLES = ["admin", "author"];

/** Session de la requête courante (mise en cache par requête). */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

type AppSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

function isStaffAccount(session: AppSession | null): session is AppSession {
  return Boolean(
    session &&
      STAFF_ROLES.includes(session.user.role ?? "") &&
      !session.user.banned,
  );
}

/**
 * 2FA obligatoire pour toute action d'administration. Vérifiée ici (couche
 * d'accès aux données) et non seulement dans le layout /admin : les layouts
 * ne sont pas réexécutés lors des navigations client, et les Server Actions
 * ne passent jamais par un layout.
 */
function hasTwoFactor(session: AppSession): boolean {
  return Boolean(session.user.twoFactorEnabled);
}

/** Exige un utilisateur connecté et non banni, sinon redirige. */
export async function requireUser() {
  const session = await getSession();
  if (!session || session.user.banned) redirect("/connexion");
  return session;
}

/** Variante sans redirection pour les Server Actions : null si non admin (2FA incluse). */
export async function getAdminSession() {
  const session = await getSession();
  if (!isStaffAccount(session) || session.user.role !== "admin" || !hasTwoFactor(session)) {
    return null;
  }
  return session;
}

/** Variante sans redirection : null si ni admin ni auteur (2FA incluse). */
export async function getStaffSession() {
  const session = await getSession();
  if (!isStaffAccount(session) || !hasTwoFactor(session)) return null;
  return session;
}

/**
 * Compte admin/auteur, 2FA activée ou non : réservé au layout /admin, qui
 * affiche l'invite d'activation de la 2FA plutôt qu'une redirection.
 */
export async function requireStaffAccount() {
  const session = await getSession();
  if (!isStaffAccount(session)) redirect("/");
  return session;
}

/**
 * Exige un admin ou un auteur avec 2FA. Un membre du staff sans 2FA est
 * renvoyé vers /admin, où le layout l'invite à l'activer.
 */
export async function requireStaff() {
  const session = await getStaffSession();
  if (!session) redirect(isStaffAccount(await getSession()) ? "/admin" : "/");
  return session;
}

/** Exige un administrateur avec 2FA, sinon redirige. */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect(isStaffAccount(await getSession()) ? "/admin" : "/");
  return session;
}
