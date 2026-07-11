import Link from "next/link";
import { headers } from "next/headers";
import { localeHref, type Locale } from "@/lib/i18n";
import { buttonClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Page introuvable",
    body: "La page que vous cherchez n'existe pas ou a été déplacée.",
    home: "Retour à l'accueil",
  },
  en: {
    title: "Page not found",
    body: "The page you're looking for doesn't exist or has been moved.",
    home: "Back to home",
  },
};

export default async function NotFound() {
  // Posé par le proxy ; repli français si absent (rendu hors requête)
  const locale: Locale =
    (await headers()).get("x-locale") === "en" ? "en" : "fr";
  const t = copy[locale];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">HTTP/1.1 404 Not Found</p>
      <h1 className="text-4xl font-bold">{t.title}</h1>
      <p className="max-w-md text-muted">{t.body}</p>
      <Link href={localeHref(locale, "/")} className={buttonClass}>
        {t.home}
      </Link>
    </div>
  );
}
