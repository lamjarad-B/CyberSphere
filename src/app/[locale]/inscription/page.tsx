import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { localeHref, toLocale } from "@/lib/i18n";
import { RegisterForm } from "@/components/auth/register-form";
import { cardClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Inscription",
    intro: "Créez votre compte pour rejoindre la communauté, commenter sous votre nom et garder vos signets.",
  },
  en: {
    title: "Sign up",
    intro: "Create your account to join the community, comment under your name and keep your bookmarks.",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: copy[toLocale((await params).locale)].title };
}

export default async function InscriptionPage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const session = await getSession();
  if (session) redirect(localeHref(locale, "/"));

  const t = copy[locale];

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} p-8`}>
        <h1 className="mb-1 text-2xl font-bold">{t.title}</h1>
        <p className="mb-6 text-sm text-muted">{t.intro}</p>
        <RegisterForm />
      </div>
    </div>
  );
}
