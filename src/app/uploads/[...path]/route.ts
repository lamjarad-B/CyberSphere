import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/uploads";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await ctx.params;
  const filePath = path.normalize(path.join(UPLOAD_DIR, ...segments));

  // Bloque toute traversée de répertoire
  if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {
    return new Response("Introuvable", { status: 404 });
  }

  const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
  if (!type) return new Response("Introuvable", { status: 404 });

  try {
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
