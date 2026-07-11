"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string; exact?: boolean };

const adminLinks: NavLink[] = [
  { href: "/admin", label: "Tableau de bord", exact: true },
  { href: "/admin/articles", label: "Articles" },
  { href: "/admin/series", label: "Séries" },
  { href: "/admin/categories", label: "Catégories" },
  { href: "/admin/tags", label: "Tags" },
  { href: "/admin/commentaires", label: "Commentaires" },
  { href: "/admin/signalements", label: "Signalements" },
  { href: "/admin/membres", label: "Membres" },
  { href: "/admin/statistiques", label: "Statistiques" },
  { href: "/admin/journal", label: "Journal d'audit" },
];

// Les auteurs n'ont accès qu'à la rédaction
const authorLinks: NavLink[] = [{ href: "/admin/articles", label: "Mes articles" }];

export function AdminNav({ role }: { role: string }) {
  const pathname = usePathname();
  const links = role === "admin" ? adminLinks : authorLinks;

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col" aria-label="Administration">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-accent/10 hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
