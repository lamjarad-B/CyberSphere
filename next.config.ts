import type { NextConfig } from "next";

// La Content-Security-Policy est posée par src/proxy.ts : elle contient un
// nonce généré à chaque requête, impossible à exprimer dans une config statique.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Sortie autonome pour une image Docker minimale (.next/standalone)
  output: "standalone",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
