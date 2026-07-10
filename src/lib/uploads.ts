import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo

/**
 * Enregistre une image uploadée sous un nom aléatoire dans uploads/
 * et retourne son URL publique (/uploads/…).
 */
export async function saveImage(file: File): Promise<string> {
  if (file.size === 0) throw new Error("Fichier vide");
  if (file.size > MAX_SIZE) throw new Error("Image trop lourde (5 Mo maximum)");
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error("Format non supporté (png, jpg, webp ou gif)");

  const name = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}
