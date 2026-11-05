/** Identifiant à poser sur le <main> de chaque gabarit qui affiche <SkipLink>. */
export const MAIN_CONTENT_ID = "contenu";

/** Premier arrêt de tabulation, visible seulement au focus : évite de retraverser le menu (WCAG 2.4.1). */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-contrast"
    >
      {label}
    </a>
  );
}
