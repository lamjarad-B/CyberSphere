import { SaxesParser } from "saxes";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Éléments de dessin uniquement : ni script, ni lien, ni image, ni contenu HTML. */
const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc",
  "text", "tspan",
  "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "marker", "linearGradient", "radialGradient", "stop", "pattern", "clipPath", "mask",
]);

/** Pas de href, de style ni de on* : rien qui charge une ressource ou exécute du code. */
const ALLOWED_ATTRIBUTES = new Set([
  "xmlns", "version", "viewBox", "preserveAspectRatio", "id", "role", "transform",
  "aria-label", "aria-labelledby", "aria-describedby", "aria-hidden",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy",
  "dx", "dy", "width", "height", "d", "points", "offset",
  "fill", "fill-opacity", "fill-rule", "opacity", "clip-path", "clip-rule", "mask",
  "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stop-color", "stop-opacity",
  "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "word-spacing",
  "text-anchor", "text-decoration", "dominant-baseline", "alignment-baseline", "xml:space",
  "marker-start", "marker-mid", "marker-end", "markerWidth", "markerHeight", "markerUnits",
  "refX", "refY", "orient",
  "gradientUnits", "gradientTransform", "patternUnits", "patternContentUnits", "patternTransform",
  "maskUnits", "maskContentUnits", "clipPathUnits",
]);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Valide un SVG par liste blanche et retourne sa version **ré-écrite** depuis
 * l'arbre analysé : ce qui est stocké est exactement ce qui a été contrôlé,
 * sans écart possible entre l'analyse et le navigateur (commentaires, entités
 * et encodages exotiques disparaissent). Tout ce qui sort de la liste blanche
 * lève une erreur qui nomme le contenu refusé, plutôt que d'être retiré sans
 * prévenir d'un schéma que l'admin croirait intact.
 */
export function sanitizeSvg(source: Buffer): string {
  let text: string;
  try {
    // UTF-8 strict : un SVG en UTF-16 contournerait tout contrôle sur le texte
    text = new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch {
    throw new Error("SVG refusé : le fichier doit être encodé en UTF-8");
  }

  const parser = new SaxesParser({ xmlns: false });
  const open: string[] = [];
  let output = "";
  let hasRoot = false;

  parser.on("error", (error) => {
    throw new Error(`SVG refusé : XML invalide (${error.message})`);
  });
  parser.on("doctype", () => {
    throw new Error("SVG refusé : DOCTYPE et entités interdits");
  });
  parser.on("processinginstruction", () => {
    throw new Error("SVG refusé : instruction de traitement interdite");
  });
  parser.on("opentag", (tag) => {
    if (!ALLOWED_ELEMENTS.has(tag.name)) {
      throw new Error(`SVG refusé : élément <${tag.name}> non autorisé`);
    }
    if (!hasRoot) {
      if (tag.name !== "svg" || tag.attributes.xmlns !== SVG_NAMESPACE) {
        throw new Error("Fichier invalide : ce n'est pas un SVG");
      }
      hasRoot = true;
    }
    let attributes = "";
    for (const [name, value] of Object.entries(tag.attributes) as [string, string][]) {
      if (!ALLOWED_ATTRIBUTES.has(name)) {
        throw new Error(`SVG refusé : attribut « ${name} » non autorisé`);
      }
      if (name === "xmlns" && value !== SVG_NAMESPACE) {
        throw new Error("SVG refusé : espace de noms non autorisé");
      }
      // Seule référence admise : un élément du fichier, url(#id)
      if (/url\s*\(/i.test(value) && !/^url\(#[\w.-]+\)$/.test(value)) {
        throw new Error(`SVG refusé : référence externe dans « ${name} »`);
      }
      attributes += ` ${name}="${escapeXml(value)}"`;
    }
    output += `<${tag.name}${attributes}>`;
    open.push(tag.name);
  });
  parser.on("closetag", (tag) => {
    output += `</${tag.name}>`;
    open.pop();
  });
  parser.on("text", (value) => {
    if (open.length > 0) output += escapeXml(value);
  });
  parser.on("cdata", (value) => {
    if (open.length > 0) output += escapeXml(value);
  });

  parser.write(text).close();
  if (!hasRoot) throw new Error("Fichier invalide : ce n'est pas un SVG");
  return `${output}\n`;
}
