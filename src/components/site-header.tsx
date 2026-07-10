import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { buttonClass, buttonGhostClass } from "./ui";

export async function SiteHeader() {
  const [categories, session] = await Promise.all([
    db.category.findMany({
      where: { parentId: null },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: {
        children: { orderBy: [{ position: "asc" }, { name: "asc" }] },
      },
    }),
    getSession(),
  ]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-accent" aria-hidden>
              &gt;_
            </span>
            <span className="text-lg font-bold tracking-tight">
              Cyber<span className="text-accent">Sphere</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
            <Link
              href="/articles"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-accent"
            >
              Articles
            </Link>
            {categories.map((category) => (
              <div key={category.id} className="group relative">
                <Link
                  href={`/categories/${category.slug}`}
                  className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-accent"
                >
                  {category.name}
                  {category.children.length > 0 && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  )}
                </Link>
                {category.children.length > 0 && (
                  <div className="invisible absolute left-0 top-full z-50 w-56 rounded-lg border border-border bg-surface p-1.5 opacity-0 shadow-xl transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {category.children.map((child) => (
                      <Link
                        key={child.id}
                        href={`/categories/${child.slug}`}
                        className="block rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/recherche"
            aria-label="Rechercher"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>
          <ThemeToggle />

          {session ? (
            <UserMenu
              name={session.user.name}
              image={session.user.image ?? null}
              isAdmin={session.user.role === "admin"}
            />
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/connexion" className={buttonGhostClass}>
                Connexion
              </Link>
              <Link href="/inscription" className={buttonClass}>
                Inscription
              </Link>
            </div>
          )}

          {/* Menu mobile */}
          <details className="relative md:hidden">
            <summary
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-border text-muted [&::-webkit-details-marker]:hidden"
              aria-label="Menu"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </summary>
            <nav className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-surface p-2 shadow-xl">
              <Link href="/articles" className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/10">
                Articles
              </Link>
              {categories.map((category) => (
                <div key={category.id}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/10"
                  >
                    {category.name}
                  </Link>
                  {category.children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/categories/${child.slug}`}
                      className="block rounded-md py-1.5 pl-7 pr-3 text-sm text-muted hover:bg-accent/10"
                    >
                      {child.name}
                    </Link>
                  ))}
                </div>
              ))}
              {!session && (
                <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                  <Link href="/connexion" className={buttonGhostClass}>
                    Connexion
                  </Link>
                  <Link href="/inscription" className={buttonClass}>
                    Inscription
                  </Link>
                </div>
              )}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
