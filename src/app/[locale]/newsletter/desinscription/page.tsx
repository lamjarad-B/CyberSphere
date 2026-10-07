import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeNewsletterForm } from "@/actions/newsletter";
import { localeHref, toLocale } from "@/lib/i18n";
import { buttonClass, buttonDangerClass, cardClass } from "@/components/ui";

const copy = {
  fr: {
    metaTitle: "Désinscription",
    askTitle: "Se désinscrire de la newsletter",
    askBody:
      "Confirmez pour ne plus recevoir d'e-mails de CyberSphere. Votre adresse sera supprimée de la liste.",
    confirm: "Me désinscrire",
    okTitle: "Désinscription effectuée",
    okBody:
      "Votre adresse a été supprimée de la liste : vous ne recevrez plus d'e-mails de CyberSphere.",
    koTitle: "Déjà désinscrit",
    koBody:
      "Ce lien ne correspond à aucune inscription active : vous ne recevrez plus d'e-mails.",
    home: "Retour à l'accueil",
  },
  en: {
    metaTitle: "Unsubscribe",
    askTitle: "Unsubscribe from the newsletter",
    askBody:
      "Confirm to stop receiving emails from CyberSphere. Your address will be removed from the list.",
    confirm: "Unsubscribe me",
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
  searchParams: Promise<{ jeton?: string; statut?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: copy[toLocale((await params).locale)].metaTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * La désinscription exige un clic (formulaire POST) : les scanners de liens
 * des messageries ouvrent les URL des e-mails et désinscriraient sinon les
 * abonnés à leur insu. Les clients mail compatibles utilisent en plus le
 * désabonnement en un clic (RFC 8058, /api/newsletter/desinscription).
 */
export default async function DesinscriptionPage({ params, searchParams }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const { jeton, statut } = await searchParams;

  const asking = !statut && Boolean(jeton);
  const [title, body] = asking
    ? [t.askTitle, t.askBody]
    : statut === "ok"
      ? [t.okTitle, t.okBody]
      : [t.koTitle, t.koBody];

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} space-y-4 p-8`}>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted">{body}</p>
        {asking && (
          <form action={unsubscribeNewsletterForm}>
            <input type="hidden" name="jeton" value={jeton} />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className={buttonDangerClass}>
              {t.confirm}
            </button>
          </form>
        )}
        <Link href={localeHref(locale, "/")} className={buttonClass}>
          {t.home}
        </Link>
      </div>
    </div>
  );
}
