"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n-provider";

/**
 * Ajoute un bouton « Copier » sur chaque bloc de code de l'article.
 * Le HTML de l'article vient de dangerouslySetInnerHTML (hors React) :
 * l'enrichissement DOM direct est donc sans conflit de réconciliation.
 */
export function CodeCopy({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const labels = t.codeCopy;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const buttons: HTMLButtonElement[] = [];
    for (const pre of container.querySelectorAll("pre")) {
      const parent = pre.parentElement;
      if (!parent || parent.querySelector("[data-copy-button]")) continue;

      parent.style.position = "relative";
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.copyButton = "true";
      button.textContent = labels.copy;
      button.setAttribute("aria-label", labels.aria);
      button.className =
        "absolute right-2 top-2 rounded border border-white/15 bg-white/10 px-2 py-1 font-mono text-[11px] text-white/80 opacity-0 transition-opacity hover:bg-white/20 focus:opacity-100 group-hover:opacity-100";
      parent.classList.add("group");

      // Le nom accessible vient d'aria-label : il change avec le texte visible,
      // sinon le résultat de la copie n'est pas annoncé
      const show = (text: string, aria: string) => {
        button.textContent = text;
        button.setAttribute("aria-label", aria);
      };

      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(pre.textContent ?? "");
          show(labels.copied, labels.copied);
        } catch {
          show(labels.failed, labels.failed);
        }
        setTimeout(() => show(labels.copy, labels.aria), 1500);
      });

      parent.appendChild(button);
      buttons.push(button);
    }

    return () => buttons.forEach((button) => button.remove());
  }, [children, labels]);

  return <div ref={containerRef}>{children}</div>;
}
