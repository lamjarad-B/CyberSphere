// Classes partagées pour garder des formulaires et boutons cohérents.

export const inputClass =
  "w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent";

export const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export const buttonGhostClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

export const buttonDangerClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50";

export const cardClass = "rounded-xl border border-border bg-surface";

export const errorClass =
  "rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-danger";

export const successClass =
  "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-success";

/**
 * Conteneur role="status" : il doit exister avant son message pour que les
 * lecteurs d'écran l'annoncent, sans décaler la mise en page tant qu'il est vide.
 */
export const statusRegionClass = "empty:absolute";

/**
 * Ref d'un message qui remplace le formulaire envoyé : le bouton qui portait
 * le focus a disparu, ce message le reprend et les lecteurs d'écran le lisent.
 */
export function focusOnMount(element: HTMLElement | null) {
  element?.focus();
}
