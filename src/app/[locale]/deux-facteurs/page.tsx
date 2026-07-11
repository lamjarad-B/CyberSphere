import type { Metadata } from "next";
import { toLocale } from "@/lib/i18n";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { cardClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Vérification en deux étapes",
    intro:
      "Saisissez le code affiché par votre application d'authentification (Google Authenticator, Aegis, Bitwarden…).",
  },
  en: {
    title: "Two-step verification",
    intro:
      "Enter the code shown by your authenticator app (Google Authenticator, Aegis, Bitwarden…).",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: copy[toLocale((await params).locale)].title };
}

export default async function DeuxFacteursPage({ params }: Props) {
  const t = copy[toLocale((await params).locale)];

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} p-8`}>
        <h1 className="mb-1 text-2xl font-bold">{t.title}</h1>
        <p className="mb-6 text-sm text-muted">{t.intro}</p>
        <TwoFactorForm />
      </div>
    </div>
  );
}
