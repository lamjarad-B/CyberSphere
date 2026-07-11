import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const MAX_DIMENSION = 2560; // px, côté le plus long

/**
 * Enregistre une image téléversée dans uploads/ et retourne son URL
 * publique (/uploads/…). L'image est systématiquement **ré-encodée** en WebP
 * via sharp : les métadonnées (EXIF, GPS…) sont supprimées et un fichier
 * polyglotte (image + code) ne survit pas au ré-encodage. Le nom de fichier
 * est aléatoire — jamais celui fourni par le client.
 */
export async function saveImage(file: File): Promise<string> {
  if (file.size === 0) throw new Error("Fichier vide");
  if (file.size > MAX_SIZE) throw new Error("Image trop lourde (5 Mo maximum)");
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Format non supporté (png, jpg, webp ou gif)");
  }

  const source = Buffer.from(await file.arrayBuffer());
  let encoded: Buffer;
  try {
    // `animated` préserve les GIF/WebP animés ; sharp ignore les métadonnées
    // par défaut et échoue si le contenu n'est pas une image valide.
    encoded = await sharp(source, { animated: true })
      .rotate() // applique l'orientation EXIF avant de la supprimer
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new Error("Fichier invalide : ce n'est pas une image lisible");
  }

  const name = `${Date.now()}-${randomBytes(8).toString("hex")}.webp`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), encoded);
  return `/uploads/${name}`;
}
