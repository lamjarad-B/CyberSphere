"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { errorClass } from "@/components/ui";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/** Vrai si le CAPTCHA Turnstile est configuré (clé publique présente). */
export const captchaEnabled = Boolean(SITE_KEY);

/** En-têtes à joindre aux appels auth protégés par le plugin captcha. */
export function captchaHeaders(token: string | null): Record<string, string> {
  return token ? { "x-captcha-response": token } : {};
}

/**
 * Widget Cloudflare Turnstile (invisible ou interactif selon le mode choisi
 * côté Cloudflare). Ne rend rien si le CAPTCHA n'est pas configuré.
 * Le script est injecté par un script déjà approuvé par la CSP :
 * 'strict-dynamic' propage la confiance, aucune exception d'origine à ouvrir.
 * Si le script ou le widget échoue (bloqueur, CSP, domaine refusé), le
 * bouton d'envoi resterait grisé sans explication : un message l'indique.
 */
export function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) return;
    const container = containerRef.current;
    if (!container) return;

    let widgetId: string | undefined;
    let cancelled = false;

    const fail = () => {
      if (cancelled) return;
      setFailed(true);
      onToken(null);
    };

    const render = () => {
      if (cancelled) return;
      if (!window.turnstile) return fail();
      widgetId = window.turnstile.render(container, {
        sitekey: SITE_KEY,
        theme: "auto",
        callback: (token: string) => {
          setFailed(false);
          onToken(token);
        },
        "expired-callback": () => onToken(null),
        "error-callback": fail,
      });
    };

    let script: HTMLScriptElement | null = null;
    if (window.turnstile) {
      render();
    } else {
      script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      // Un chargement précédent a échoué : nouvel essai avec un script neuf
      if (script?.dataset.failed) {
        script.remove();
        script = null;
      }
      if (!script) {
        script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.turnstile = "true";
        script.addEventListener("error", (event) => {
          (event.currentTarget as HTMLScriptElement).dataset.failed = "true";
        });
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
      script.addEventListener("error", fail);
    }

    return () => {
      cancelled = true;
      script?.removeEventListener("load", render);
      script?.removeEventListener("error", fail);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return (
    <div className="space-y-2">
      <div ref={containerRef} className="flex justify-center" />
      {failed && (
        <p role="alert" className={errorClass}>
          {t.captcha.error}
        </p>
      )}
    </div>
  );
}
