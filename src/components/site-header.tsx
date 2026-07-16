import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { localeHref, type Locale } from "@/lib/i18n";
import { categoryLabel } from "@/lib/articles";
import { getDictionary } from "@/i18n/dictionaries";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { buttonClass, buttonGhostClass } from "./ui";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
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
  const href = (path: string) => localeHref(locale, path);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href={href("/")} className="flex items-center" aria-label="CyberSphere">
            <Image
              src="/images/Logo/cybersphere-lockup-sombre.png"
              alt="CyberSphere"
              width={1384}
              height={320}
              priority
              className="hidden h-8 w-auto dark:block"
            />
            <Image
              src="/images/Logo/cybersphere-lockup-clair.png"
              alt="CyberSphere"
              width={1384}
              height={320}
              priority
              className="block h-8 w-auto dark:hidden"
            />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label={t.nav.mainAria}>
            <Link
              href={href("/articles")}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-accent"
            >
              {t.nav.articles}
            </Link>
            <Link
              href={href("/series")}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-accent"
            >
              {t.nav.series}
            </Link>
            {categories.map((category) => (
              <div key={category.id} className="group relative">
                <Link
                  href={href(`/categories/${category.slug}`)}
                  className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-accent"
                >
                  {categoryLabel(category, locale)}
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
                        href={href(`/categories/${child.slug}`)}
                        className="block rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                      >
                        {categoryLabel(child, locale)}
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
            href={href("/recherche")}
            aria-label={t.nav.searchAria}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>
          {/* useSearchParams (sélecteur de langue) exige une frontière Suspense */}
          <Suspense fallback={<span className="inline-block h-9 w-14" aria-hidden />}>
            <LanguageSwitcher />
          </Suspense>
          <ThemeToggle />

          {session ? (
            <UserMenu
              name={session.user.name}
              image={session.user.image ?? null}
              isAdmin={
                session.user.role === "admin" || session.user.role === "author"
              }
            />
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href={href("/connexion")} className={buttonGhostClass}>
                {t.nav.login}
              </Link>
              <Link href={href("/inscription")} className={buttonClass}>
                {t.nav.register}
              </Link>
            </div>
          )}

          {/* Menu mobile */}
          <details className="relative md:hidden">
            <summary
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-border text-muted [&::-webkit-details-marker]:hidden"
              aria-label={t.nav.menuAria}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </summary>
            <nav className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-surface p-2 shadow-xl">
              <Link href={href("/articles")} className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/10">
                {t.nav.articles}
              </Link>
              <Link href={href("/series")} className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/10">
                {t.nav.series}
              </Link>
              {categories.map((category) => (
                <div key={category.id}>
                  <Link
                    href={href(`/categories/${category.slug}`)}
                    className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/10"
                  >
                    {categoryLabel(category, locale)}
                  </Link>
                  {category.children.map((child) => (
                    <Link
                      key={child.id}
                      href={href(`/categories/${child.slug}`)}
                      className="block rounded-md py-1.5 pl-7 pr-3 text-sm text-muted hover:bg-accent/10"
                    >
                      {categoryLabel(child, locale)}
                    </Link>
                  ))}
                </div>
              ))}
              {!session && (
                <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                  <Link href={href("/connexion")} className={buttonGhostClass}>
                    {t.nav.login}
                  </Link>
                  <Link href={href("/inscription")} className={buttonClass}>
                    {t.nav.register}
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
