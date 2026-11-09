import type { Metadata } from "next";
import { localeHref, type Locale } from "./i18n";
import { SITE_URL } from "./site";

/**
 * Métadonnées d'indexation partagées par les pages publiques : URL canonique,
 * alternatives hreflang, Open Graph et données structurées (JSON-LD).
 *
 * Les chemins passés ici sont toujours les chemins français, sans préfixe
 * (« /articles ») : la version anglaise s'en déduit (`localeHref`), les slugs
 * étant communs aux deux langues.
 */

export const SITE_NAME = "CyberSphere";

/** Graphies sous lesquelles le site est cherché (nom de site dans Google). */
export const SITE_ALTERNATE_NAMES = ["Cyber Sphere", "cyber-sphere.net"];

/** Image de partage des pages sans couverture exploitable (1200 × 630). */
export const DEFAULT_OG_IMAGE = {
  url: "/images/og-default.png",
  width: 1200,
  height: 630,
  alt: "CyberSphere",
};

/** Logo de l'éditeur (données structurées) : carré, 112 px minimum pour Google. */
const LOGO = { url: "/images/Logo/cybersphere-icone.png", width: 1024, height: 1024 };

export const OG_LOCALES: Record<Locale, string> = { fr: "fr_FR", en: "en_US" };

/** Hors index, mais les liens de la page restent suivis. */
export const NOINDEX = { index: false, follow: true } as const;

/**
 * Page indexable : grandes vignettes autorisées (Discover). Posé page par page
 * et non dans le layout racine, sinon une 404 cumulerait ce « index » et le
 * « noindex » que Next y injecte.
 */
const INDEXABLE = { index: true, follow: true, "max-image-preview": "large" } as const;

/**
 * Articles publiés qu'il faut à un tag pour être indexé (et listé dans le
 * sitemap) : en deçà, sa page ne fait que répéter la carte d'un article.
 * Une catégorie, rubrique de navigation, est indexée dès son premier article.
 */
export const TAG_INDEX_MIN_ARTICLES = 2;

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/**
 * Ajoute une chaîne de requête canonique : paramètres vides retirés, et
 * `page=1` omis (la première page d'une liste est la liste elle-même).
 */
export function withQuery(
  path: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "page" && Number(value) <= 1) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Titre d'une page de liste : « Articles — page 2 » au-delà de la première. */
export function pagedTitle(title: string, page: number): string {
  return page > 1 ? `${title} — page ${page}` : title;
}

type AlternatesOptions = {
  /**
   * false : le contenu n'existe qu'en français (article non traduit). La
   * version /en sert ce même texte : elle désigne l'original comme canonique
   * et aucune alternative anglaise n'est annoncée.
   */
  bilingual?: boolean;
  /** Flux RSS propre à la page (catégorie, tag), en plus du flux général. */
  feed?: { path: string; title: string };
};

/** Canonique, hreflang (fr, en, x-default) et flux RSS d'une page publique. */
export function localeAlternates(
  locale: Locale,
  path: string,
  { bilingual = true, feed }: AlternatesOptions = {},
): NonNullable<Metadata["alternates"]> {
  const feeds = [
    { url: localeHref(locale, "/rss.xml"), title: SITE_NAME },
    ...(feed ? [{ url: localeHref(locale, feed.path), title: feed.title }] : []),
  ];
  return {
    canonical: bilingual ? localeHref(locale, path) : path,
    // x-default : l'URL sans préfixe, qui suit la langue du navigateur
    ...(bilingual && {
      languages: { fr: path, en: localeHref("en", path), "x-default": path },
    }),
    types: { "application/rss+xml": feeds },
  };
}

type PageMetadataInput = AlternatesOptions & {
  locale: Locale;
  /** Chemin français canonique, requête comprise (« /articles?page=2 »). */
  path: string;
  title: string;
  description?: string;
  robots?: Metadata["robots"];
  /** Complète l'Open Graph par défaut (type article, dates, image…). */
  openGraph?: Record<string, unknown>;
};

/**
 * Métadonnées complètes d'une page publique. Next fusionne les métadonnées des
 * segments superficiellement : un `openGraph` défini ici remplace entièrement
 * celui du layout, d'où un Open Graph toujours complet.
 */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  robots,
  openGraph,
  bilingual = true,
  feed,
}: PageMetadataInput): Metadata {
  const alternates = localeAlternates(locale, path, { bilingual, feed });
  const og = {
    type: "website",
    siteName: SITE_NAME,
    locale: OG_LOCALES[locale],
    url: alternates.canonical as string,
    title,
    description,
    images: [DEFAULT_OG_IMAGE],
    ...openGraph,
  };
  return {
    title,
    description,
    alternates,
    robots: robots ?? INDEXABLE,
    openGraph: og as Metadata["openGraph"],
    twitter: { card: "summary_large_image" },
  };
}

// ---------- Données structurées (JSON-LD) ----------

type JsonLdNode = Record<string, unknown>;

/**
 * Sérialise pour une balise <script type="application/ld+json"> : `<` est
 * échappé pour qu'un titre contenant « </script> » ne ferme pas la balise.
 */
export function jsonLdString(data: JsonLdNode | JsonLdNode[]): string {
  const body = Array.isArray(data) ? { "@context": "https://schema.org", "@graph": data } : {
    "@context": "https://schema.org",
    ...data,
  };
  return JSON.stringify(body).replace(/</g, "\\u003c");
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** L'éditeur du site. Aucune autre propriété que celles réellement connues. */
export function organizationJsonLd(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: absoluteUrl(LOGO.url), width: LOGO.width, height: LOGO.height },
  };
}

export function websiteJsonLd(locale: Locale, description: string): JsonLdNode {
  const url = absoluteUrl(localeHref(locale, "/"));
  return {
    "@type": "WebSite",
    "@id": `${url}#website`,
    url,
    name: SITE_NAME,
    // Autres graphies du nom, pour que Google relie ces requêtes au site
    alternateName: SITE_ALTERNATE_NAMES,
    description,
    inLanguage: locale,
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/**
 * Fil d'Ariane : chaque étape porte un chemin déjà localisé (`localeHref`).
 * La dernière étape, la page courante, n'a pas besoin d'URL.
 */
export function breadcrumbJsonLd(items: { name: string; path?: string }[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path && { item: absoluteUrl(item.path) }),
    })),
  };
}

/** Image locale ou distante, en URL absolue. */
function absoluteImage(src: string): string {
  return src.startsWith("http") ? src : absoluteUrl(src);
}

/**
 * Profils publics d'un auteur (champ `links` : un lien par ligne). Seules les
 * URL https valides sont retenues : elles deviennent les sameAs du JSON-LD.
 */
export function parseProfileLinks(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      try {
        return new URL(line).protocol === "https:";
      } catch {
        return false;
      }
    });
}

export type PersonJsonLdInput = {
  name: string;
  /** Page auteur, chemin déjà localisé. */
  path?: string;
  description?: string | null;
  image?: string | null;
  sameAs?: string[];
};

/** Auteur : uniquement ce qu'il a lui-même renseigné (nom, bio, profils). */
export function personJsonLd(input: PersonJsonLdInput): JsonLdNode {
  const url = input.path ? absoluteUrl(input.path) : undefined;
  return {
    "@type": "Person",
    ...(url && { "@id": `${url}#person`, url }),
    name: input.name,
    ...(input.description && { description: input.description }),
    ...(input.image && { image: absoluteImage(input.image) }),
    ...(input.sameAs?.length && { sameAs: input.sameAs }),
  };
}

/** Page auteur (/auteurs/[slug]) : le profil en est l'entité principale. */
export function profilePageJsonLd(person: PersonJsonLdInput & { path: string }): JsonLdNode {
  return {
    "@type": "ProfilePage",
    url: absoluteUrl(person.path),
    mainEntity: personJsonLd(person),
  };
}

export type ArticleJsonLdInput = {
  /** Chemin canonique, déjà localisé. */
  path: string;
  headline: string;
  description: string;
  /** Langue du texte servi (« fr » pour un article non traduit lu sous /en). */
  inLanguage: Locale;
  datePublished: Date | null;
  dateModified: Date;
  authorName: string;
  /** Page auteur (chemin localisé) et profils publics, s'ils existent. */
  authorPath?: string;
  authorSameAs?: string[];
  /** Couverture : chemin local ou URL absolue. */
  image?: string | null;
  section?: string;
  keywords?: string[];
  wordCount?: number;
  /** Série dont l'article est un épisode. */
  series?: { name: string; path: string };
};

export function articleJsonLd(input: ArticleJsonLdInput): JsonLdNode {
  const url = absoluteUrl(input.path);
  const image = input.image ? absoluteImage(input.image) : undefined;
  return {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: input.headline,
    description: input.description,
    inLanguage: input.inLanguage,
    ...(input.datePublished && { datePublished: input.datePublished.toISOString() }),
    dateModified: input.dateModified.toISOString(),
    author: personJsonLd({
      name: input.authorName,
      path: input.authorPath,
      sameAs: input.authorSameAs,
    }),
    // Décrit en entier : l'Organization n'est pas un nœud de la page article
    publisher: organizationJsonLd(),
    ...(image && { image: [image] }),
    ...(input.section && { articleSection: input.section }),
    ...(input.keywords?.length && { keywords: input.keywords }),
    ...(input.wordCount && { wordCount: input.wordCount }),
    ...(input.series && {
      isPartOf: {
        "@type": "CreativeWorkSeries",
        name: input.series.name,
        url: absoluteUrl(input.series.path),
      },
    }),
  };
}
