"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Tableau de bord", exact: true },
  { href: "/admin/articles", label: "Articles" },
  { href: "/admin/categories", label: "Catégories" },
  { href: "/admin/tags", label: "Tags" },
  { href: "/admin/commentaires", label: "Commentaires" },
  { href: "/admin/membres", label: "Membres" },
];

export function AdminNav() {
  const pathname = usePathname();

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
