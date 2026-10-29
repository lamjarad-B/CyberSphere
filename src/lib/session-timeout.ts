/**
 * Déconnexion après inactivité, pour tous les comptes (membres, auteurs,
 * admins). Une session expire IDLE_TIMEOUT_SECONDS après la dernière
 * activité : better-auth la prolonge (expiration glissante) au plus une fois
 * par SESSION_REFRESH_SECONDS, sur le battement de cœur envoyé par
 * <IdleLogout> tant que l'utilisateur interagit avec la page.
 *
 * Délai réglable par SESSION_IDLE_TIMEOUT_MINUTES (30 min par défaut,
 * borné entre 5 min et 24 h).
 */

const DEFAULT_MINUTES = 30;
const MIN_MINUTES = 5;
const MAX_MINUTES = 24 * 60;

function idleTimeoutMinutes(raw: string | undefined): number {
  const minutes = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(minutes)) return DEFAULT_MINUTES;
  return Math.min(Math.max(minutes, MIN_MINUTES), MAX_MINUTES);
}

export const IDLE_TIMEOUT_SECONDS =
  idleTimeoutMinutes(process.env.SESSION_IDLE_TIMEOUT_MINUTES) * 60;

/** Intervalle minimal entre deux prolongations de session (écriture en base). */
export const SESSION_REFRESH_SECONDS = 60;
