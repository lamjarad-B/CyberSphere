import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeNewsletter } from "@/actions/newsletter";
import { localeHref, toLocale } from "@/lib/i18n";
import { buttonClass, cardClass } from "@/components/ui";

const copy = {
  fr: {
    metaTitle: "Désinscription",
    okTitle: "Désinscription effectuée",
    okBody:
      "Votre adresse a été supprimée de la liste : vous ne recevrez plus d'e-mails de CyberSphere.",
    koTitle: "Déjà désinscrit",
    koBody:
      "Ce lien ne correspond à aucune inscription active : vous ne recevrez plus d'e-mails.",
    home: "Retour à l'accueil",
  },
  en: {
    metaTitle: "Unsubscribed",
    okTitle: "You've been unsubscribed",
    okBody:
      "Your address has been removed from the list: you won't receive any more emails from CyberSphere.",
    koTitle: "Already unsubscribed",
    koBody:
      "This link doesn't match any active subscription: you won't receive any more emails.",
    home: "Back to home",
  },
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jeton?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: copy[toLocale((await params).locale)].metaTitle,
    robots: { index: false, follow: false },
  };
}

export default async function DesinscriptionPage({ params, searchParams }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const { jeton } = await searchParams;
  const ok = await unsubscribeNewsletter(jeton ?? "");

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} space-y-4 p-8`}>
        {ok ? (
          <>
            <h1 className="text-2xl font-bold">{t.okTitle}</h1>
            <p className="text-sm text-muted">{t.okBody}</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">{t.koTitle}</h1>
            <p className="text-sm text-muted">{t.koBody}</p>
          </>
        )}
        <Link href={localeHref(locale, "/")} className={buttonClass}>
          {t.home}
        </Link>
      </div>
    </div>
  );
}
