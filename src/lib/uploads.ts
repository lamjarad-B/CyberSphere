import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

/** Résolution de rendu d'un SVG à sa taille déclarée (défaut de librsvg). */
const SVG_BASE_DENSITY = 72;

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const MAX_DIMENSION = 2560; // px, côté le plus long
/**
 * Pixels décodés au maximum, toutes images d'une animation comprises
 * (≈ 6300 × 6300, ou 100 images de 630 × 630). Le défaut de sharp (~268 Mpx)
 * laisse passer une « bombe » : un PNG de quelques dizaines d'octets peut
 * annoncer 16 000 × 16 000 px, soit ~1 Go à décoder. sharp vérifie cette
 * limite dès la lecture de l'en-tête, avant tout décodage.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Enregistre une image téléversée dans uploads/ et retourne son URL
 * publique (/uploads/…). L'image est systématiquement **ré-encodée** en WebP
 * via sharp : les métadonnées (EXIF, GPS…) sont supprimées et un fichier
 * polyglotte (image + code) ne survit pas au ré-encodage. Le nom de fichier
 * est aléatoire — jamais celui fourni par le client.
 *
 * Un SVG est **rastérisé** (librsvg) puis ré-encodé de même : aucun SVG
 * n'est jamais servi depuis /uploads, donc aucun <script> ni gestionnaire
 * d'événement embarqué ne peut s'exécuter dans l'origine du site.
 */
export async function saveImage(file: File): Promise<string> {
  if (file.size === 0) throw new Error("Fichier vide");
  if (file.size > MAX_SIZE) throw new Error("Image trop lourde (5 Mo maximum)");
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Format non supporté (png, jpg, webp, gif ou svg)");
  }

  const source = Buffer.from(await file.arrayBuffer());
  let encoded: Buffer;
  try {
    const density = file.type === "image/svg+xml" ? await svgDensity(source) : undefined;
    // `animated` préserve les GIF/WebP animés ; sharp ignore les métadonnées
    // par défaut et échoue si le contenu n'est pas une image valide.
    encoded = await sharp(source, {
      animated: density === undefined,
      density,
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      // Un SVG peut être coûteux à rendre (filtres imbriqués) pour un poids
      // minime : on borne le temps de traitement.
      .timeout({ seconds: 10 })
      .rotate() // applique l'orientation EXIF avant de la supprimer
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    if (error instanceof Error && error.message.includes("pixel limit")) {
      throw new Error("Image trop grande : 40 mégapixels maximum (animation comprise)");
    }
    throw new Error("Fichier invalide : ce n'est pas une image lisible");
  }

  const name = `${Date.now()}-${randomBytes(8).toString("hex")}.webp`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), encoded);
  return `/uploads/${name}`;
}

/**
 * Densité de rendu qui amène le plus long côté d'un SVG à MAX_DIMENSION :
 * un vecteur de 24 × 24 n'est pas rendu en vignette floue, et un SVG
 * annonçant 100 000 px est réduit au lieu d'être refusé.
 */
async function svgDensity(source: Buffer): Promise<number> {
  const { width, height } = await sharp(source).metadata();
  const longest = Math.max(width ?? 0, height ?? 0);
  if (!longest) return SVG_BASE_DENSITY;
  return Math.min(Math.max((SVG_BASE_DENSITY * MAX_DIMENSION) / longest, 1), 100_000);
}

/**
 * Nom du fichier désigné par une URL /uploads/…, ou null si l'URL ne
 * désigne pas un fichier téléversé. Nom simple uniquement : ni « / » ni
 * « .. » — aucune traversée de répertoire possible.
 */
export function uploadFileName(url: string | null | undefined): string | null {
  return url?.match(/^\/uploads\/([\w-]+\.(?:webp|png|jpe?g|gif))$/i)?.[1] ?? null;
}

/**
 * Supprime un fichier téléversé devenu orphelin (avatar ou couverture
 * remplacés, article supprimé). Ignore toute URL hors de /uploads/ (images
 * du dépôt, valeurs inattendues) et ne lève jamais.
 */
export async function deleteUpload(url: string | null | undefined): Promise<void> {
  const fileName = uploadFileName(url);
  if (!fileName) return;
  try {
    await unlink(path.join(UPLOAD_DIR, fileName));
  } catch {
    // déjà absent : rien à faire
  }
}
