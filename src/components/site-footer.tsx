import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-accent" aria-hidden>
            &gt;_
          </span>
          <span className="text-sm font-semibold">CyberSphere</span>
          <span className="text-sm text-muted">— blog cybersécurité</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted" aria-label="Pied de page">
          <Link href="/articles" className="transition-colors hover:text-accent">
            Articles
          </Link>
          <Link href="/recherche" className="transition-colors hover:text-accent">
            Recherche
          </Link>
          <a href="/rss.xml" className="transition-colors hover:text-accent">
            RSS
          </a>
        </nav>
        <p className="text-sm text-muted">
          © {new Date().getFullYear()} CyberSphere
        </p>
      </div>
    </footer>
  );
}
