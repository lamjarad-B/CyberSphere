import type { Metadata } from "next";
import { toLocale } from "@/lib/i18n";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { cardClass } from "@/components/ui";

const copy = {
  fr: {
    metaTitle: "Réinitialisation du mot de passe",
    title: "Nouveau mot de passe",
    intro: "Choisissez un nouveau mot de passe pour votre compte.",
  },
  en: {
    metaTitle: "Password reset",
    title: "New password",
    intro: "Choose a new password for your account.",
  },
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: copy[toLocale((await params).locale)].metaTitle };
}

export default async function ReinitialisationPage({ params, searchParams }: Props) {
  const locale = toLocale((await params).locale);
  const { token } = await searchParams;
  const t = copy[locale];

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} p-8`}>
        <h1 className="mb-1 text-2xl font-bold">{t.title}</h1>
        <p className="mb-6 text-sm text-muted">{t.intro}</p>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
