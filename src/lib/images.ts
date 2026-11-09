import path from "node:path";
import sharp from "sharp";
import { UPLOAD_DIR } from "./uploads";

export type ImageSize = { width: number; height: number };

const PUBLIC_DIR = path.join(process.cwd(), "public");

/**
 * Dimensions déjà lues, par fichier. Les noms téléversés sont aléatoires et
 * jamais réécrits : une taille lue reste vraie. Borné pour que des URL
 * forgées dans un article ne fassent pas grossir la mémoire sans fin.
 */
const sizes = new Map<string, ImageSize>();
const MAX_CACHED_SIZES = 1000;

/** Fichier local d'une URL d'image (/uploads/… ou public/), sinon null. */
function localFile(src: string): string | null {
  // URL absolue, protocole relatif (//hôte) ou chemin relatif : pas un fichier du site
  if (!src.startsWith("/") || src.startsWith("//")) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(src.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  const [base, relative] = pathname.startsWith("/uploads/")
    ? [UPLOAD_DIR, pathname.slice("/uploads/".length)]
    : [PUBLIC_DIR, pathname.slice(1)];
  const file = path.resolve(base, relative);
  // Bloque toute traversée de répertoire (« /uploads/../.env »)
  return file.startsWith(base + path.sep) ? file : null;
}

/**
 * Dimensions intrinsèques d'une image servie par le site, lues dans l'en-tête
 * du fichier (sharp, SVG compris) : elles réservent la place de l'image avant
 * son chargement (CLS). null pour une image distante, absente ou illisible.
 */
export async function localImageSize(src: string): Promise<ImageSize | null> {
  const file = localFile(src);
  if (!file) return null;
  const cached = sizes.get(file);
  if (cached) return cached;

  try {
    const { width, height, orientation } = await sharp(file).metadata();
    if (!width || !height) return null;
    // Orientation EXIF 5 à 8 : l'image s'affiche pivotée d'un quart de tour
    const size = orientation && orientation >= 5 ? { width: height, height: width } : { width, height };
    if (sizes.size >= MAX_CACHED_SIZES) sizes.delete(sizes.keys().next().value as string);
    sizes.set(file, size);
    return size;
  } catch {
    return null;
  }
}

/**
 * Dimensions d'une image de partage (shareableImage) : l'aperçu PNG d'un SVG
 * est rendu sur 1200 px de large (svgPreview), proportions du SVG conservées.
 */
export async function shareableImageSize(src: string): Promise<ImageSize | null> {
  if (!src.endsWith(".svg.png")) return localImageSize(src);
  const svg = await localImageSize(src.slice(0, -".png".length));
  return svg ? { width: 1200, height: Math.round((1200 * svg.height) / svg.width) } : null;
}
