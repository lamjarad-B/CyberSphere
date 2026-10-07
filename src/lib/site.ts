/**
 * URL publique du site (sans slash final). Repli : le serveur de
 * développement, fixé au port 3001 par le script `dev`.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);
