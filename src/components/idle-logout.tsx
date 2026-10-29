"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/** Dernière activité, partagée entre les onglets du site. */
const STORAGE_KEY = "cybersphere:derniere-activite";
const STORAGE_WRITE_MS = 5_000;
const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];

function readSharedActivity(): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeSharedActivity(at: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    // Stockage indisponible (navigation privée…) : suivi limité à l'onglet
  }
}

type IdleLogoutProps = {
  timeoutSeconds: number;
  refreshSeconds: number;
  /** Page de connexion dans la langue courante. */
  loginPath: string;
};

/**
 * Déconnexion après inactivité (cf. lib/session-timeout). Tant que
 * l'utilisateur interagit, un battement de cœur prolonge la session (et son
 * cookie) ; au-delà du délai sans activité dans aucun onglet, la session est
 * révoquée et la page renvoie vers la connexion. Le serveur reste l'autorité :
 * sans ce composant (JS désactivé, onglet fermé), la session expire d'elle-même.
 */
export function IdleLogout({ timeoutSeconds, refreshSeconds, loginPath }: IdleLogoutProps) {
  useEffect(() => {
    const timeoutMs = timeoutSeconds * 1000;
    const refreshMs = refreshSeconds * 1000;
    let lastActivity = 0;
    let lastStored = 0;
    let lastPing = 0;
    let expired = false;

    async function expire(revoke: boolean) {
      if (expired) return;
      expired = true;
      if (revoke) await authClient.signOut().catch(() => undefined);
      const redirection = `${window.location.pathname}${window.location.search}`;
      // Rechargement complet voulu : purge le cache client des pages privées
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `${loginPath}?raison=inactivite&redirection=${encodeURIComponent(redirection)}`,
      );
    }

    function ping(now: number) {
      lastPing = now;
      // GET /api/auth/get-session : prolonge la session en base et le cookie
      void authClient.getSession().then(({ data, error }) => {
        if (!error && !data) void expire(false);
      });
    }

    function markActivity() {
      if (expired) return;
      const now = Date.now();
      lastActivity = now;
      if (now - lastStored >= STORAGE_WRITE_MS) {
        lastStored = now;
        writeSharedActivity(now);
      }
      if (now - lastPing >= refreshMs) ping(now);
    }

    function check() {
      if (expired) return;
      const last = Math.max(lastActivity, readSharedActivity());
      if (Date.now() - last >= timeoutMs) void expire(true);
    }

    // Les minuteurs des onglets en arrière-plan sont ralentis : contrôle
    // immédiat au retour sur l'onglet (sans compter ce retour comme activité)
    function onVisibility() {
      if (document.visibilityState === "visible") check();
    }

    // Le chargement de la page compte comme activité (et écrase une valeur
    // périmée laissée par une session précédente)
    markActivity();
    const options = { passive: true, capture: true };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, markActivity, options);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActivity, options);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [timeoutSeconds, refreshSeconds, loginPath]);

  return null;
}
