import Link from "next/link";
import { localeHref, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/i18n/dictionaries";
import { NewsletterForm } from "@/components/newsletter-form";

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).footer;
  const href = (path: string) => localeHref(locale, path);

  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-accent" aria-hidden>
                &gt;_
              </span>
              <span className="text-sm font-semibold">CyberSphere</span>
              <span className="text-sm text-muted">{t.tagline}</span>
            </div>
            <nav
              className="flex flex-wrap items-center gap-4 text-sm text-muted"
              aria-label={t.aria}
            >
              <Link href={href("/articles")} className="transition-colors hover:text-accent">
                {t.articles}
              </Link>
              <Link href={href("/series")} className="transition-colors hover:text-accent">
                {t.series}
              </Link>
              <Link href={href("/recherche")} className="transition-colors hover:text-accent">
                {t.search}
              </Link>
              <Link href={href("/securite")} className="transition-colors hover:text-accent">
                {t.reportVuln}
              </Link>
              <a href={href("/rss.xml")} className="transition-colors hover:text-accent">
                RSS
              </a>
            </nav>
          </div>
          <NewsletterForm />
        </div>
        <p className="text-sm text-muted">© {new Date().getFullYear()} CyberSphere</p>
      </div>
    </footer>
  );
}
