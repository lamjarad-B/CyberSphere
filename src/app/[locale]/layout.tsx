import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/i18n";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/components/i18n-provider";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/skip-link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { VisitCounter } from "@/components/visit-counter";

export default async function PublicLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  // Le proxy ne réécrit que vers fr/en ; toute autre valeur est une URL forgée
  if (!hasLocale(locale)) notFound();

  return (
    <I18nProvider locale={locale}>
      <SkipLink label={getDictionary(locale).nav.skipToContent} />
      <SiteHeader locale={locale} />
      <main id={MAIN_CONTENT_ID} className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        {children}
      </main>
      <SiteFooter locale={locale} />
      <VisitCounter />
    </I18nProvider>
  );
}
