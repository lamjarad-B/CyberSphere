"use client";

import { useEffect, useId, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/components/i18n-provider";
import { buttonClass, cardClass } from "@/components/ui";

/** Dernière activité, partagée entre les onglets du site. */
const STORAGE_KEY = "cybersphere:derniere-activite";
const STORAGE_WRITE_MS = 5_000;
const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "click"];
/**
 * Préavis avant déconnexion (WCAG 2.2.1 : 20 s minimum). Deux minutes : un
 * onglet longtemps masqué ne contrôle plus l'échéance qu'une fois par minute.
 */
const WARNING_MS = 120_000;

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

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
 * cookie) ; sans activité dans aucun onglet, un dialogue propose de rester
 * connecté, puis la session est révoquée et la page renvoie vers la connexion.
 * Le serveur reste l'autorité : sans ce composant (JS désactivé, onglet fermé),
 * la session expire d'elle-même.
 */
export function IdleLogout({ timeoutSeconds, refreshSeconds, loginPath }: IdleLogoutProps) {
  const { t } = useI18n();
  const labels = t.idleLogout;
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const warning = secondsLeft !== null;

  useEffect(() => {
    // La session n'est prolongée qu'une fois par intervalle, et un battement
    // arrivé un peu tôt est ignoré : elle peut expirer jusqu'à deux intervalles
    // avant « dernière activité + délai ». On déconnecte avant cette limite :
    // « Rester connecté » doit toujours trouver une session vivante.
    const logoutAfterMs = (timeoutSeconds - 2 * refreshSeconds) * 1000;
    const refreshMs = refreshSeconds * 1000;
    const dialog = dialogRef.current;
    let lastActivity = 0;
    let lastStored = 0;
    let lastPing = 0;
    let expired = false;
    let timer = 0;

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

    function recordActivity() {
      const now = Date.now();
      lastActivity = now;
      if (now - lastStored >= STORAGE_WRITE_MS) {
        lastStored = now;
        writeSharedActivity(now);
      }
      if (now - lastPing >= refreshMs) ping(now);
    }

    function onActivity(event: Event) {
      if (expired) return;
      // Dialogue ouvert : seuls un clic abouti ou Échap le referment. Le fermer
      // dès keydown rendrait le focus à l'élément d'origine juste avant que la
      // touche Entrée ne l'active, avec le risque d'un clic involontaire.
      if (dialog?.open && event.type !== "click" && event.type !== "cancel") return;
      recordActivity();
      setSecondsLeft(null);
    }

    function check() {
      window.clearTimeout(timer);
      if (expired) return;
      const last = Math.max(lastActivity, readSharedActivity());
      const remaining = logoutAfterMs - (Date.now() - last);
      if (remaining <= 0) {
        void expire(true);
        return;
      }
      const warn = remaining <= WARNING_MS;
      setSecondsLeft(warn ? Math.ceil(remaining / 1000) : null);
      timer = window.setTimeout(check, warn ? 1_000 : CHECK_INTERVAL_MS);
    }

    // Les minuteurs des onglets en arrière-plan sont ralentis : contrôle
    // immédiat au retour sur l'onglet (sans compter ce retour comme activité)
    function onVisibility() {
      if (document.visibilityState === "visible") check();
    }

    // Le chargement de la page compte comme activité (et écrase une valeur
    // périmée laissée par une session précédente)
    recordActivity();
    const options = { passive: true, capture: true };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, options);
    dialog?.addEventListener("cancel", onActivity);
    document.addEventListener("visibilitychange", onVisibility);
    timer = window.setTimeout(check, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, options);
      dialog?.removeEventListener("cancel", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
    };
  }, [timeoutSeconds, refreshSeconds, loginPath]);

  const tabAlert = `${labels.tabAlert} — `;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!warning || !dialog) return;
    // showModal : focus sur le bouton, reste de la page inerte ; close rend le
    // focus à l'élément d'origine
    dialog.showModal();
    // L'utilisateur inactif est souvent sur un autre onglet : seul le titre le prévient
    document.title = `${tabAlert}${document.title}`;
    return () => {
      if (dialog.open) dialog.close();
      document.title = document.title.replace(tabAlert, "");
    };
  }, [warning, tabAlert]);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`${cardClass} m-auto w-[calc(100%-2rem)] max-w-sm space-y-4 p-6 text-foreground shadow-xl backdrop:bg-black/60`}
    >
      {secondsLeft !== null && (
        <>
          <h2 id={titleId} className="text-lg font-bold">
            {labels.title}
          </h2>
          <div id={descriptionId} className="space-y-1 text-sm">
            <p className="text-muted">{labels.description}</p>
            {/* role="timer" : consultable à la demande, sans annonce à chaque seconde */}
            <p role="timer" className="font-mono font-semibold tabular-nums">
              {labels.remaining(formatCountdown(secondsLeft))}
            </p>
          </div>
          {/* Sans gestionnaire propre : le clic compte comme activité (onActivity) */}
          <button type="button" className={`${buttonClass} w-full`}>
            {labels.stay}
          </button>
        </>
      )}
    </dialog>
  );
}
