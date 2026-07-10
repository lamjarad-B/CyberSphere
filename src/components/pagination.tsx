import Link from "next/link";
import { buttonGhostClass } from "./ui";

type PaginationProps = {
  page: number;
  totalPages: number;
  makeHref: (page: number) => string;
};

export function Pagination({ page, totalPages, makeHref }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-4 pt-8" aria-label="Pagination">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className={buttonGhostClass}>
          ← Précédent
        </Link>
      ) : (
        <span className={`${buttonGhostClass} pointer-events-none opacity-40`}>
          ← Précédent
        </span>
      )}
      <span className="font-mono text-sm text-muted">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={makeHref(page + 1)} className={buttonGhostClass}>
          Suivant →
        </Link>
      ) : (
        <span className={`${buttonGhostClass} pointer-events-none opacity-40`}>
          Suivant →
        </span>
      )}
    </nav>
  );
}
