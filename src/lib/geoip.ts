import path from "node:path";
import maxmind, { type CityResponse, type Reader } from "maxmind";

/**
 * Base DB-IP « IP to City Lite » (CC BY 4.0, attribution sur la page de
 * statistiques), téléchargée par `npm run geoip` et au build de l'image.
 * Consultée sur le serveur : aucune adresse IP n'est envoyée à un service tiers.
 */
const GEOIP_DB_PATH =
  process.env.GEOIP_DB_PATH || path.join(process.cwd(), "geoip", "dbip-city-lite.mmdb");

export type Location = {
  /** Code ISO 3166-1 alpha-2 */
  country: string;
  region: string;
  city: string;
};

/** Adresse absente de la base (réseau privé, plage récente) : lieu inconnu. */
const UNKNOWN: Location = { country: "", region: "", city: "" };

let reader: Promise<Reader<CityResponse> | null> | undefined;

/**
 * Ouverture paresseuse, une seule fois par processus : la base (~130 Mo) est
 * chargée en mémoire à la première visite. Fichier absent : géolocalisation
 * désactivée jusqu'au prochain redémarrage, signalée une fois dans les logs.
 */
function openReader(): Promise<Reader<CityResponse> | null> {
  reader ??= maxmind.open<CityResponse>(GEOIP_DB_PATH).catch((error) => {
    console.warn(`[geoip] base indisponible (${GEOIP_DB_PATH}) — npm run geoip :`, error.message);
    return null;
  });
  return reader;
}

/** Vrai si la base de géolocalisation est chargée (ou chargeable). */
export async function geoipAvailable(): Promise<boolean> {
  return (await openReader()) !== null;
}

/**
 * Pays, région et ville d'une adresse IP, au plus fin à l'échelle de la
 * ville. Null si la base est absente : rien ne doit alors être compté.
 */
export async function locateIp(ip: string): Promise<Location | null> {
  const db = await openReader();
  if (!db) return null;
  // IPv4 vue par une pile IPv6 (::ffff:203.0.113.7) : recherchée en IPv4
  const address = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  if (!maxmind.validate(address)) return UNKNOWN;

  const found = db.get(address);
  if (!found?.country?.iso_code) return UNKNOWN;
  return {
    country: found.country.iso_code,
    region: found.subdivisions?.[0]?.names?.en ?? "",
    city: found.city?.names?.en ?? "",
  };
}
