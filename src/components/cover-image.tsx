import Image from "next/image";

/** SVG : servi tel quel, l'optimiseur d'images de Next ne traite pas le vectoriel. */
export function isVectorImage(src: string): boolean {
  return /\.svg(?:[?#]|$)/i.test(src);
}

/**
 * Image utilisable en aperçu de lien et en données structurées, où le SVG
 * n'est pas accepté : un SVG téléversé est remplacé par son aperçu PNG
 * (`x.svg.png`, servi par la route /uploads), un autre SVG est écarté.
 */
export function shareableImage(src: string | null | undefined): string | null {
  if (!src) return null;
  if (!isVectorImage(src)) return src;
  return /^\/uploads\/[\w-]+\.svg$/i.test(src) ? `${src}.png` : null;
}

/**
 * Couverture décorative qui remplit son conteneur (positionné et dimensionné
 * par le parent). `sizes` décrit la largeur affichée : le navigateur choisit
 * la variante redimensionnée adaptée au lieu du fichier original.
 */
export function CoverFill({
  src,
  sizes,
  preload = false,
}: {
  src: string;
  sizes: string;
  /** Image principale au-dessus de la ligne de flottaison (LCP). */
  preload?: boolean;
}) {
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      preload={preload}
      unoptimized={isVectorImage(src)}
      className="object-cover"
    />
  );
}
