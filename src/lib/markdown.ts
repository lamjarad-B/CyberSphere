import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import GithubSlugger from "github-slugger";

// remark-rehype sans `allowDangerousHtml` : le HTML brut écrit dans le
// Markdown est ignoré, ce qui neutralise toute injection de script.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypePrettyCode, {
    theme: "github-dark-default",
    keepBackground: true,
    defaultLang: "text",
  })
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
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

  for (const node of tree.children ?? []) {
    if (node.type !== "heading") continue;
    const depth = node.depth ?? 0;
    const text = textOf(node).trim();
    if (!text) continue;
    // rehype-slug attribue un id à tous les titres : maintenir le slugger
    // synchronisé sur h1-h6 pour que les suffixes -1, -2… coïncident
    const id = slugger.slug(text);
    if (depth === 2 || depth === 3) entries.push({ id, text, depth });
  }
  return entries;
}

/** Temps de lecture estimé, en minutes (220 mots/min, minimum 1). */
export function readingTimeMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
