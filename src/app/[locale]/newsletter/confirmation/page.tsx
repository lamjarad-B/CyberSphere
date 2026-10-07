import type { Metadata } from "next";
import Link from "next/link";
import { confirmNewsletterForm } from "@/actions/newsletter";
import { localeHref, toLocale } from "@/lib/i18n";
import { buttonClass, buttonGhostClass, cardClass } from "@/components/ui";

const copy = {
  fr: {
    metaTitle: "Confirmation d'inscription",
    askTitle: "Confirmer votre inscription",
    askBody:
      "Un dernier clic pour recevoir un e-mail à chaque nouvel article CyberSphere.",
    confirm: "Confirmer mon inscription",
    okTitle: "Inscription confirmée ✓",
    okBody:
      "Vous recevrez désormais un e-mail à chaque nouvel article. Chaque message contient un lien de désinscription.",
    koTitle: "Lien invalide",
    koBody:
      "Ce lien de confirmation est invalide ou a déjà été remplacé par un plus récent. Réinscrivez-vous depuis le pied de page pour recevoir un nouveau lien.",
    home: "Retour à l'accueil",
  },
  en: {
    metaTitle: "Confirm subscription",
    askTitle: "Confirm your subscription",
    askBody: "One last click to receive an email for every new CyberSphere article.",
    confirm: "Confirm my subscription",
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
  searchParams: Promise<{ jeton?: string; statut?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: copy[toLocale((await params).locale)].metaTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * Le lien de l'e-mail n'agit pas seul : la confirmation exige un clic
 * (formulaire POST), pour qu'un scanner de liens ne confirme pas une adresse
 * à l'insu de son propriétaire (le double opt-in perdrait son sens).
 */
export default async function ConfirmationPage({ params, searchParams }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const { jeton, statut } = await searchParams;

  let title = t.koTitle;
  let body = t.koBody;
  if (statut === "ok") {
    title = t.okTitle;
    body = t.okBody;
  } else if (!statut && jeton) {
    title = t.askTitle;
    body = t.askBody;
  }
  const asking = !statut && Boolean(jeton);

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} space-y-4 p-8`}>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted">{body}</p>
        {asking ? (
          <form action={confirmNewsletterForm} className="flex flex-wrap gap-2">
            <input type="hidden" name="jeton" value={jeton} />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className={buttonClass}>
              {t.confirm}
            </button>
            <Link href={localeHref(locale, "/")} className={buttonGhostClass}>
              {t.home}
            </Link>
          </form>
        ) : (
          <Link href={localeHref(locale, "/")} className={buttonClass}>
            {t.home}
          </Link>
        )}
      </div>
    </div>
  );
}
