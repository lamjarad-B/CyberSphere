import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { localeHref, toLocale } from "@/lib/i18n";
import { LoginForm } from "@/components/auth/login-form";
import { cardClass } from "@/components/ui";

const copy = {
  fr: { title: "Connexion", intro: "Connectez-vous pour commenter les articles." },
  en: { title: "Sign in", intro: "Sign in to comment on articles." },
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirection?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: copy[toLocale((await params).locale)].title };
}

export default async function ConnexionPage({ params, searchParams }: Props) {
  const locale = toLocale((await params).locale);
  const session = await getSession();
  if (session) redirect(localeHref(locale, "/"));

  const { redirection } = await searchParams;
  const t = copy[locale];

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} p-8`}>
        <h1 className="mb-1 text-2xl font-bold">{t.title}</h1>
        <p className="mb-6 text-sm text-muted">{t.intro}</p>
        <LoginForm redirection={redirection} />
      </div>
    </div>
  );
}
