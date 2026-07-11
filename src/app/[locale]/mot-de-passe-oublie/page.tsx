import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { localeHref, toLocale } from "@/lib/i18n";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { cardClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Mot de passe oublié",
    intro:
      "Indiquez l'adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.",
  },
  en: {
    title: "Forgot password",
    intro:
      "Enter your account's email address and we'll send you a link to choose a new password.",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: copy[toLocale((await params).locale)].title };
}

export default async function MotDePasseOubliePage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const session = await getSession();
  if (session) redirect(localeHref(locale, "/membre"));

  const t = copy[locale];

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} p-8`}>
        <h1 className="mb-1 text-2xl font-bold">{t.title}</h1>
        <p className="mb-6 text-sm text-muted">{t.intro}</p>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
