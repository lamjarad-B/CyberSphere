import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { localeHref, toLocale } from "@/lib/i18n";
import { ContactForm } from "@/components/contact-form";
import { cardClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Contact",
    metaDescription: "Écrivez à l'équipe CyberSphere : question, suggestion d'article, partenariat…",
    intro:
      "Une question, une suggestion d'article, une erreur repérée ? Écrivez-nous, nous répondons par e-mail.",
    vuln1: "Pour signaler une vulnérabilité, suivez plutôt notre",
    vuln2: "politique de divulgation responsable",
  },
  en: {
    title: "Contact",
    metaDescription: "Write to the CyberSphere team: questions, article ideas, partnerships…",
    intro:
      "A question, an article idea, a mistake you spotted? Write to us — we reply by email.",
    vuln1: "To report a vulnerability, please follow our",
    vuln2: "responsible disclosure policy",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = copy[toLocale((await params).locale)];
  return { title: t.title, description: t.metaDescription };
}

export default async function ContactPage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const session = await getSession();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-muted">{t.intro}</p>
        <p className="mt-2 text-sm text-muted">
          {t.vuln1}{" "}
          <Link href={localeHref(locale, "/securite")} className="text-accent hover:underline">
            {t.vuln2}
          </Link>
          .
        </p>
      </header>

      <section className={`${cardClass} p-6`}>
        <ContactForm defaultName={session?.user.name} defaultEmail={session?.user.email} />
      </section>
    </div>
  );
}
