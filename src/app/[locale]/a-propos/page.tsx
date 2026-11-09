import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { authorHref } from "@/lib/authors";
import { localeHref, toLocale } from "@/lib/i18n";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  organizationJsonLd,
  pageMetadata,
} from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { cardClass } from "@/components/ui";

/** Éditeur et directeur de la publication (mentions légales). */
const EDITOR_NAME = "Brahim Lamjarad";

const copy = {
  fr: {
    home: "Accueil",
    breadcrumbAria: "Fil d'Ariane",
    title: "À propos",
    metaTitle: "À propos de CyberSphere",
    metaDescription:
      "CyberSphere, blog d'analyse de la cybersécurité : sujets couverts, méthode éditoriale, sources, usage de l'IA et versions anglaises.",
    intro:
      "CyberSphere est un blog d'analyse de la cybersécurité. Il cherche à expliquer ce qui se passe, comment on le sait et ce que cela change, plutôt qu'à compiler l'actualité.",
    coverageTitle: "Ce que couvre le blog",
    coverageIntro: "L'analyse en est la colonne vertébrale, autour de cinq thèmes :",
    coverage: [
      "les cybermenaces et les opérations malveillantes ;",
      "la géopolitique et les cyberconflits ;",
      "la régulation et les politiques publiques ;",
      "la stratégie et la gouvernance de la cybersécurité ;",
      "les évolutions de fond de l'écosystème cyber.",
    ],
    coverageTech:
      "Les articles techniques viennent en appui : ils expliquent un mécanisme, ses conditions d'exploitation et ce qu'il implique pour la défense. Le renseignement sur la menace, qui étudie les tactiques, techniques et procédures des groupes d'attaquants, fait souvent le lien entre technique, géopolitique et stratégie.",
    methodTitle: "Méthode éditoriale",
    method: [
      "Les sources primaires sont privilégiées (autorités, rapports techniques, textes officiels) et les informations importantes sont recoupées.",
      "Chaque article cite ses sources en notes, regroupées en fin de texte dans la section « Sources et notes ».",
      "Les articles distinguent les faits établis, les informations rapportées par une seule source, les revendications non vérifiées et les hypothèses.",
      "La date de publication figure sur chaque article, ainsi que la date de mise à jour lorsque le texte a été modifié depuis.",
      "Une erreur signalée est corrigée dans l'article lui-même, dont la date de mise à jour change alors.",
    ],
    aiTitle: "Rédaction et intelligence artificielle",
    ai: "Les articles sont préparés avec un assistant de rédaction fondé sur l'intelligence artificielle, sous la direction, la vérification et la responsabilité éditoriale de Brahim Lamjarad.",
    translationTitle: "Versions anglaises",
    translation:
      "Les articles sont publiés en français et traduits en anglais ; chaque traduction est relue avant publication. Un article pas encore traduit s'affiche en français sur le site anglais, avec un avertissement.",
    whoTitle: "Qui publie CyberSphere",
    who: "CyberSphere est édité par Brahim Lamjarad, directeur de la publication.",
    authorLink: "Voir sa page auteur et ses articles",
    contactTitle: "Nous écrire",
    contactBefore: "Une question, une suggestion d'article ou une correction : le",
    contactLink: "formulaire de contact",
    securityBefore: "Une vulnérabilité sur le site : la",
    securityLink: "politique de divulgation responsable",
  },
  en: {
    home: "Home",
    breadcrumbAria: "Breadcrumb",
    title: "About",
    metaTitle: "About CyberSphere",
    metaDescription:
      "CyberSphere, a cybersecurity analysis blog: topics covered, editorial method, sources, use of AI and English versions.",
    intro:
      "CyberSphere is a cybersecurity analysis blog. It sets out to explain what is happening, how we know it and what it changes, rather than to compile the news.",
    coverageTitle: "What the blog covers",
    coverageIntro: "Analysis is its backbone, across five themes:",
    coverage: [
      "cyber threats and malicious operations;",
      "geopolitics and cyber conflict;",
      "regulation and public policy;",
      "cybersecurity strategy and governance;",
      "long-term shifts in the cyber ecosystem.",
    ],
    coverageTech:
      "Technical articles play a supporting role: they explain a mechanism, the conditions for exploiting it and what it means for defenders. Threat intelligence, which studies the tactics, techniques and procedures of attacker groups, often ties the technical, geopolitical and strategic angles together.",
    methodTitle: "Editorial method",
    method: [
      "Primary sources come first (authorities, technical reports, official texts), and important information is cross-checked.",
      "Every article cites its sources in notes, gathered at the end under “Sources & notes”.",
      "Articles distinguish established facts, information reported by a single source, unverified claims and hypotheses.",
      "Each article shows its publication date, and its update date when the text has changed since.",
      "A reported error is corrected in the article itself, whose update date then changes.",
    ],
    aiTitle: "Writing and artificial intelligence",
    ai: "Articles are prepared with an AI-based writing assistant, under the direction, verification and editorial responsibility of Brahim Lamjarad.",
    translationTitle: "English versions",
    translation:
      "Articles are published in French and translated into English; every translation is reviewed before publication. An article not yet translated is shown in French on the English site, with a notice.",
    whoTitle: "Who publishes CyberSphere",
    who: "CyberSphere is published by Brahim Lamjarad, its editor-in-chief.",
    authorLink: "See Brahim Lamjarad's author page and articles",
    contactTitle: "Get in touch",
    contactBefore: "A question, an article idea or a correction: use the",
    contactLink: "contact form",
    securityBefore: "A vulnerability on the site: see the",
    securityLink: "responsible disclosure policy",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  return pageMetadata({
    locale,
    path: "/a-propos",
    title: t.metaTitle,
    description: t.metaDescription,
  });
}

export default async function AProposPage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const href = (path: string) => localeHref(locale, path);

  // Page auteur de l'éditeur, seulement si elle existe (slug et article publié)
  const editor = await db.user.findFirst({
    where: {
      name: { equals: EDITOR_NAME, mode: "insensitive" },
      slug: { not: null },
      articles: { some: { status: "PUBLISHED" } },
    },
    select: { slug: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <JsonLd
        data={[
          {
            "@type": "AboutPage",
            url: absoluteUrl(href("/a-propos")),
            about: organizationJsonLd(),
          },
          breadcrumbJsonLd([{ name: t.home, path: href("/") }, { name: t.title }]),
        ]}
      />
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
        <h1 className="text-3xl font-bold">{t.metaTitle}</h1>
        <p className="text-muted">{t.intro}</p>
      </header>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.coverageTitle}</h2>
        <p className="text-sm text-muted">{t.coverageIntro}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {t.coverage.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-sm text-muted">{t.coverageTech}</p>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.methodTitle}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          {t.method.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.aiTitle}</h2>
        <p className="text-sm text-muted">{t.ai}</p>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.translationTitle}</h2>
        <p className="text-sm text-muted">{t.translation}</p>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.whoTitle}</h2>
        <p className="text-sm text-muted">{t.who}</p>
        {editor?.slug && (
          <p className="text-sm">
            <Link
              href={authorHref(editor.slug, locale)}
              className="font-medium text-accent hover:underline"
            >
              {t.authorLink}
            </Link>
          </p>
        )}
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.contactTitle}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            {t.contactBefore}{" "}
            <Link href={href("/contact")} className="font-medium text-accent hover:underline">
              {t.contactLink}
            </Link>
            .
          </li>
          <li>
            {t.securityBefore}{" "}
            <Link href={href("/securite")} className="font-medium text-accent hover:underline">
              {t.securityLink}
            </Link>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}
