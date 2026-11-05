"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Déclencheur et panneau des thématiques (motif « disclosure »). Le clic ou le
 * clavier épinglent le panneau et son état est exposé par aria-expanded ; le
 * survol reste un confort souris, en CSS. Échap referme dans tous les cas, y
 * compris sous le pointeur (WCAG 1.4.13). Les liens ne sont atteignables au
 * clavier que panneau ouvert : le visiteur ne les traverse que s'il le demande.
 *
 * Le groupe occupe toute la hauteur du header pour que le survol ne se perde
 * pas entre le libellé et le panneau.
 */
export function TopicsMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Neutralise le survol jusqu'au prochain retour du pointeur sur le groupe
  const [hoverDismissed, setHoverDismissed] = useState(false);
  const hoverable = !open && !hoverDismissed;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      setOpen(false);
      setHoverDismissed(true);
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="group flex h-16 items-center"
      onPointerEnter={() => setHoverDismissed(false)}
      onBlur={(event) => {
        // relatedTarget nul (clic sans focus sous Safari, autre fenêtre) : voir onPointerDown
        const next = event.relatedTarget;
        if (next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
          setHoverDismissed(true);
        }}
        className={`flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-accent ${
          open ? "text-accent" : `text-muted ${hoverable ? "group-hover:text-accent" : ""}`
        }`}
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`transition-transform ${
            open ? "rotate-180" : hoverable ? "group-hover:rotate-180" : ""
          }`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        id={panelId}
        // Focus entré dans un panneau affiché au survol : il reste ouvert si le pointeur s'en va
        onFocus={() => setOpen(true)}
        onClick={(event) => {
          // Navigation client : le header n'est pas remonté, le panneau resterait ouvert
          if ((event.target as Element).closest("a")) {
            setOpen(false);
            setHoverDismissed(true);
          }
        }}
        className={`absolute inset-x-4 top-full z-50 grid grid-cols-3 gap-x-6 gap-y-5 rounded-b-xl border border-t-0 border-border bg-surface p-6 shadow-xl transition-all ${
          open
            ? "visible opacity-100"
            : `invisible opacity-0 ${hoverable ? "group-hover:visible group-hover:opacity-100" : ""}`
        }`}
      >
        {children}
      </div>
    </div>
  );
}
