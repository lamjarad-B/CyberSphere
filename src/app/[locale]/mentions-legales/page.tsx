import type { Metadata } from "next";
import Link from "next/link";
import { localeHref, toLocale } from "@/lib/i18n";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { cardClass } from "@/components/ui";

const SITE_HOST = new URL(SITE_URL).host;

const copy = {
  fr: {
    home: "Accueil",
    breadcrumbAria: "Fil d'Ariane",
    title: "Mentions légales",
    metaDescription:
      "Mentions légales de CyberSphere : éditeur et directeur de la publication, hébergeur, propriété intellectuelle.",
    updated: "Dernière mise à jour : 9 novembre 2026",
    publisherTitle: "Éditeur du site",
    publisher: `Le site ${SITE_HOST} (CyberSphere) est édité à titre non professionnel par Brahim Lamjarad, directeur de la publication.`,
    publisherLaw:
      "Conformément à l'article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique, l'éditeur a communiqué ses éléments d'identification à l'hébergeur.",
    contactBefore: "Pour le joindre, utilisez le",
    contactLink: "formulaire de contact",
    contactAfter: ".",
    hostTitle: "Hébergeur",
    phone: "Téléphone : 1007",
    // Typographie française : espace avant les deux-points
    colon: " :",
    ipTitle: "Propriété intellectuelle",
    ip1: "Sauf mention contraire, les textes, schémas et illustrations publiés sur CyberSphere appartiennent à Brahim Lamjarad. Leur reproduction, intégrale ou substantielle, requiert une autorisation préalable.",
    ip2: "Les courtes citations sont libres, à condition d'indiquer la source et de renvoyer vers l'article (article L. 122-5 du Code de la propriété intellectuelle). Les marques, logos et documents de tiers cités restent la propriété de leurs titulaires.",
    moreTitle: "Voir aussi",
    privacy: "Politique de confidentialité",
    privacyHint: "données personnelles, cookies et vos droits",
    security: "Divulgation responsable",
    securityHint: "signaler une vulnérabilité du site",
    reportComment:
      "Un commentaire peut être signalé depuis l'article par un membre connecté, ou par le formulaire de contact.",
  },
  en: {
    home: "Home",
    breadcrumbAria: "Breadcrumb",
    title: "Legal notice",
    metaDescription:
      "CyberSphere legal notice: publisher and editor-in-chief, hosting provider, intellectual property.",
    updated: "Last updated: 9 November 2026",
    publisherTitle: "Publisher",
    publisher: `The website ${SITE_HOST} (CyberSphere) is published in a non-professional capacity by Brahim Lamjarad, who is also its editor-in-chief.`,
    publisherLaw:
      "In accordance with Article 6, III, 2 of French law no. 2004-575 of 21 June 2004 on confidence in the digital economy, the publisher's identification details have been provided to the hosting provider.",
    contactBefore: "To get in touch, please use the",
    contactLink: "contact form",
    contactAfter: ".",
    hostTitle: "Hosting provider",
    phone: "Phone: 1007",
    colon: ":",
    ipTitle: "Intellectual property",
    ip1: "Unless stated otherwise, the texts, diagrams and illustrations published on CyberSphere belong to Brahim Lamjarad. Reproducing them in full or in substantial part requires prior permission.",
    ip2: "Short quotations are welcome, provided the source is credited with a link to the article (Article L. 122-5 of the French Intellectual Property Code). Third-party trademarks, logos and documents remain the property of their respective owners.",
    moreTitle: "See also",
    privacy: "Privacy policy",
    privacyHint: "personal data, cookies and your rights",
    security: "Responsible disclosure",
    securityHint: "report a vulnerability on this site",
    reportComment:
      "A comment can be reported from the article by a signed-in member, or through the contact form.",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  return pageMetadata({
    locale,
    path: "/mentions-legales",
    title: t.title,
    description: t.metaDescription,
  });
}

export default async function MentionsLegalesPage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const href = (path: string) => localeHref(locale, path);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <JsonLd data={breadcrumbJsonLd([{ name: t.home, path: href("/") }, { name: t.title }])} />
      <header className="space-y-3">
        <nav aria-label={t.breadcrumbAria}>
          <ol className="font-mono text-sm text-muted [&>li]:inline">
            <li>
              <Link href={href("/")} className="hover:text-accent">
                {t.home}
              </Link>
              <span aria-hidden>{" / "}</span>
            </li>
            <li aria-current="page" className="text-foreground">
              {t.title}
            </li>
          </ol>
        </nav>
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted">{t.updated}</p>
      </header>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.publisherTitle}</h2>
        <p className="text-sm text-muted">{t.publisher}</p>
        <p className="text-sm text-muted">{t.publisherLaw}</p>
        <p className="text-sm text-muted">
          {t.contactBefore}{" "}
          <Link href={href("/contact")} className="font-medium text-accent hover:underline">
            {t.contactLink}
          </Link>
          {t.contactAfter}
        </p>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.hostTitle}</h2>
        <address className="text-sm not-italic text-muted">
          OVH SAS
          <br />2 rue Kellermann, 59100 Roubaix, France
          <br />
          {t.phone}
        </address>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.ipTitle}</h2>
        <p className="text-sm text-muted">{t.ip1}</p>
        <p className="text-sm text-muted">{t.ip2}</p>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.moreTitle}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            <Link href={href("/confidentialite")} className="font-medium text-accent hover:underline">
              {t.privacy}
            </Link>
            {t.colon} {t.privacyHint}
          </li>
          <li>
            <Link href={href("/securite")} className="font-medium text-accent hover:underline">
              {t.security}
            </Link>
            {t.colon} {t.securityHint}
          </li>
          <li>{t.reportComment}</li>
        </ul>
      </section>
    </div>
  );
}
