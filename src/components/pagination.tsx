import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/i18n/dictionaries";
import { buttonGhostClass } from "./ui";

type PaginationProps = {
  page: number;
  totalPages: number;
  makeHref: (page: number) => string;
  /** Langue des libellés — l'admin (français uniquement) utilise le défaut. */
  locale?: Locale;
};

export function Pagination({ page, totalPages, makeHref, locale = "fr" }: PaginationProps) {
  if (totalPages <= 1) return null;
  const t = getDictionary(locale).pagination;

  return (
    <nav className="flex items-center justify-center gap-4 pt-8" aria-label="Pagination">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className={buttonGhostClass}>
          {t.previous}
        </Link>
      ) : (
        <span className={`${buttonGhostClass} pointer-events-none opacity-40`}>
          {t.previous}
        </span>
      )}
      <span className="font-mono text-sm text-muted">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={makeHref(page + 1)} className={buttonGhostClass}>
          {t.next}
        </Link>
      ) : (
        <span className={`${buttonGhostClass} pointer-events-none opacity-40`}>
          {t.next}
        </span>
      )}
    </nav>
  );
}
