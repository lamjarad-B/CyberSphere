import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import GithubSlugger from "github-slugger";
import type { Locale } from "./i18n";
import { localImageSize } from "./images";

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * Rejette les schémas d'URL exécutables (`javascript:`, `data:`, `vbscript:`…)
 * tout en laissant passer http(s), mailto, tel, les ancres et les chemins
 * relatifs. Le HTML brut est déjà ignoré par remark-rehype ; ceci ferme le
 * seul vecteur restant — un lien Markdown `[x](javascript:…)` — sans dépendre
 * de la seule CSP (protège aussi les rendus hors navigateur).
 */
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^(https?:|mailto:|tel:|#|\/|\.)/i.test(trimmed)) return value;
  // Toute autre chaîne « schéma: » est refusée ; le relatif sans schéma passe.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return value;
}

function sanitizeUrls(node: HastNode): void {
  if (node.type === "element" && node.properties) {
    for (const attr of ["href", "src"] as const) {
      if (attr in node.properties) {
        const cleaned = safeUrl(node.properties[attr]);
        if (cleaned === null) delete node.properties[attr];
        else node.properties[attr] = cleaned;
      }
    }
  }
  node.children?.forEach(sanitizeUrls);
}

/** Plugin rehype : assainit les URL de tous les nœuds de l'arbre HTML. */
function rehypeSafeUrls() {
  return (tree: HastNode) => sanitizeUrls(tree);
}

function linkImages(node: HastNode, insideLink = false): void {
  const inside = insideLink || node.tagName === "a";
  node.children = node.children?.map((child) => {
    const { src, alt } = child.properties ?? {};
    // Sans texte alternatif, le lien n'aurait pas de nom (WCAG 2.4.4)
    if (child.tagName === "img" && !inside && src && alt) {
      return { type: "element", tagName: "a", properties: { href: src }, children: [child] };
    }
    linkImages(child, inside);
    return child;
  });
}

/**
 * Plugin rehype : chaque image mène à son fichier, pour lire un schéma en grand
 * sur téléphone. À placer avant rehypeSafeUrls, qui filtre aussi ce lien.
 */
function rehypeImageLinks() {
  return (tree: HastNode) => linkImages(tree);
}

function collectImages(node: HastNode, images: HastNode[]): void {
  if (node.tagName === "img") images.push(node);
  node.children?.forEach((child) => collectImages(child, images));
}

/**
 * Plugin rehype : les images du texte se chargent à l'approche de la zone
 * visible, et celles servies par le site reçoivent leurs dimensions, qui
 * réservent leur place avant chargement (pas de décalage de mise en page ;
 * le CSS garde `height: auto`). À placer après rehypeSafeUrls.
 */
function rehypeImageAttributes() {
  return async (tree: HastNode) => {
    const images: HastNode[] = [];
    collectImages(tree, images);
    await Promise.all(
      images.map(async (image) => {
        const properties = (image.properties ??= {});
        properties.loading = "lazy";
        properties.decoding = "async";
        if (typeof properties.src !== "string") return;
        const size = await localImageSize(properties.src);
        if (size) {
          properties.width = size.width;
          properties.height = size.height;
        }
      }),
    );
  };
}

// Les notes de bas de page GFM (`[^1]`) servent à citer les sources : la
// section générée en fin d'article porte un libellé propre à chaque langue.
// Chaque lien de retour a son propre nom, qui reprend le numéro affiché quand
// une note est citée plusieurs fois (↩², WCAG 2.5.3).
const footnoteLabels: Record<
  Locale,
  { label: string; backLabel: (note: number, call: number) => string }
> = {
  fr: {
    label: "Sources et notes",
    backLabel: (note, call) => `Retour au texte, note ${note}${call > 1 ? `, appel ${call}` : ""}`,
  },
  en: {
    label: "Sources & notes",
    backLabel: (note, call) => `Back to content, note ${note}${call > 1 ? `, reference ${call}` : ""}`,
  },
};

// remark-rehype sans `allowDangerousHtml` : le HTML brut écrit dans le
// Markdown est ignoré, ce qui neutralise toute injection de script.
function createProcessor(locale: Locale) {
  const { label, backLabel } = footnoteLabels[locale];
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, {
      footnoteLabel: label,
      footnoteBackLabel: (referenceIndex, rereferenceIndex) =>
        backLabel(referenceIndex + 1, rereferenceIndex),
      // Titre visible (remark-rehype le masque par défaut avec `sr-only`)
      footnoteLabelProperties: { className: ["footnotes-title"] },
    })
    .use(rehypeSlug)
    .use(rehypePrettyCode, {
      theme: "github-dark-default",
      keepBackground: true,
      defaultLang: "text",
    })
    .use(rehypeImageLinks)
    .use(rehypeSafeUrls)
    .use(rehypeImageAttributes)
    .use(rehypeStringify);
}

const processors = { fr: createProcessor("fr"), en: createProcessor("en") };

export async function renderMarkdown(markdown: string, locale: Locale = "fr"): Promise<string> {
  const file = await processors[locale].process(markdown);
  return String(file);
}

// ---------- Table des matières & temps de lecture ----------

export type TocEntry = { id: string; text: string; depth: 2 | 3 };

type MdNode = {
  type: string;
  depth?: number;
  value?: string;
  children?: MdNode[];
};

function textOf(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

/**
 * Extrait les titres de niveau 2 et 3 du Markdown. Les identifiants sont
 * générés avec github-slugger, exactement comme rehype-slug côté rendu :
 * les ancres de la table des matières correspondent donc toujours.
 */
export function extractToc(markdown: string): TocEntry[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdNode;
  const slugger = new GithubSlugger();
  const entries: TocEntry[] = [];

  // Parcours de tout l'arbre dans l'ordre du document : rehype-slug attribue
  // un id à tous les titres h1-h6, y compris dans une citation ou une liste.
  // Le slugger doit les voir tous pour que les suffixes -1, -2… coïncident.
  const visit = (node: MdNode) => {
    if (node.type === "heading") {
      const depth = node.depth ?? 0;
      const text = textOf(node).trim();
      if (!text) return;
      const id = slugger.slug(text);
      if (depth === 2 || depth === 3) entries.push({ id, text, depth });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return entries;
}

/** Nombre de mots du texte (Markdown brut : approximation). */
export function wordCount(markdown: string): number {
  return markdown.split(/\s+/).filter(Boolean).length;
}

/** Temps de lecture estimé, en minutes (220 mots/min, minimum 1). */
export function readingTimeMinutes(markdown: string): number {
  return Math.max(1, Math.round(wordCount(markdown) / 220));
}
