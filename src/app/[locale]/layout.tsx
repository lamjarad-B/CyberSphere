import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/i18n";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default async function PublicLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  // Le proxy ne réécrit que vers fr/en ; toute autre valeur est une URL forgée
  if (!hasLocale(locale)) notFound();

  return (
    <I18nProvider locale={locale}>
      <SiteHeader locale={locale} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </I18nProvider>
  );
}
