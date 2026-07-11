"use client";

import { useEffect, useRef } from "react";

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
 */
export function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    const container = containerRef.current;
    if (!container) return;

    let widgetId: string | undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.turnstile) return;
      widgetId = window.turnstile.render(container, {
        sitekey: SITE_KEY,
        theme: "auto",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!script) {
        script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.turnstile = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
