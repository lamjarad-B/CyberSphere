import { jsonLdString } from "@/lib/seo";

/**
 * Données structurées schema.org. Bloc de données, jamais exécuté : la CSP
 * ne s'y applique pas et aucun nonce n'est nécessaire.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Sérialisation échappée (voir jsonLdString) : aucun HTML interprété
      dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
    />
  );
}
