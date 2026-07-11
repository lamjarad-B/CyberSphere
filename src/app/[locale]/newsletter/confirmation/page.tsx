import type { Metadata } from "next";
import Link from "next/link";
import { confirmNewsletter } from "@/actions/newsletter";
import { localeHref, toLocale } from "@/lib/i18n";
import { buttonClass, cardClass } from "@/components/ui";

const copy = {
  fr: {
    metaTitle: "Confirmation d'inscription",
    okTitle: "Inscription confirmée ✓",
    okBody:
      "Vous recevrez désormais un e-mail à chaque nouvel article. Chaque message contient un lien de désinscription.",
    koTitle: "Lien invalide",
    koBody:
      "Ce lien de confirmation est invalide ou a déjà été remplacé par un plus récent. Réinscrivez-vous depuis le pied de page pour recevoir un nouveau lien.",
    home: "Retour à l'accueil",
  },
  en: {
    metaTitle: "Subscription confirmed",
    okTitle: "Subscription confirmed ✓",
    okBody:
      "You'll now receive an email for every new article. Each message contains an unsubscribe link.",
    koTitle: "Invalid link",
    koBody:
      "This confirmation link is invalid or has been replaced by a more recent one. Subscribe again from the footer to receive a new link.",
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

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const { jeton } = await searchParams;
  const ok = await confirmNewsletter(jeton ?? "");

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
