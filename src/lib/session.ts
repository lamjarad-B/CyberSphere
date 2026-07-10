import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Session de la requête courante (mise en cache par requête). */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Exige un utilisateur connecté et non banni, sinon redirige. */
export async function requireUser() {
  const session = await getSession();
  if (!session || session.user.banned) redirect("/connexion");
  return session;
}

/** Variante sans redirection pour les Server Actions : null si non admin. */
export async function getAdminSession() {
  const session = await getSession();
  if (!session || session.user.role !== "admin" || session.user.banned) {
    return null;
  }
  return session;
}

/** Exige un administrateur, sinon redirige vers l'accueil. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.user.role !== "admin" || session.user.banned) {
    redirect("/");
  }
  return session;
}
