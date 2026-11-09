import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { localeHref, type Locale } from "@/lib/i18n";
import { buttonClass, buttonGhostClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Page introuvable",
    body: "La page que vous cherchez n'existe pas ou a été déplacée.",
    home: "Retour à l'accueil",
    articles: "Tous les articles",
    search: "Rechercher un article",
  },
  en: {
    title: "Page not found",
    body: "The page you're looking for doesn't exist or has been moved.",
    home: "Back to home",
    articles: "All articles",
    search: "Search articles",
  },
};

/** Posé par le proxy ; repli français si absent (rendu hors requête). */
async function requestLocale(): Promise<Locale> {
  return (await headers()).get("x-locale") === "en" ? "en" : "fr";
}

export async function generateMetadata(): Promise<Metadata> {
  // Next ajoute de lui-même le noindex des pages 404
  return { title: copy[await requestLocale()].title };
}

export default async function NotFound() {
  const locale = await requestLocale();
  const t = copy[locale];

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">HTTP/1.1 404 Not Found</p>
      <h1 className="text-4xl font-bold">{t.title}</h1>
      <p className="max-w-md text-muted">{t.body}</p>
      {/* Hors du layout public (ni en-tête ni pied de page) : quelques
          issues vers le contenu, plutôt qu'une impasse */}
      <nav className="flex flex-wrap items-center justify-center gap-3">
        <Link href={localeHref(locale, "/")} className={buttonClass}>
          {t.home}
        </Link>
        <Link href={localeHref(locale, "/articles")} className={buttonGhostClass}>
          {t.articles}
        </Link>
        <Link href={localeHref(locale, "/recherche")} className={buttonGhostClass}>
          {t.search}
        </Link>
      </nav>
    </main>
  );
}
