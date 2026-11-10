// Télécharge la base DB-IP « IP to City Lite » (format MaxMind, licence
// CC BY 4.0) utilisée par src/lib/geoip.ts. Publiée chaque mois, sans compte.
// Usage : node scripts/download-geoip.mjs [fichier de sortie]
// GEOIP_MONTH=AAAA-MM impose le mois (build Docker) ; par défaut le mois en
// cours, ou le précédent si DB-IP ne l'a pas encore publié (début de mois).
import { mkdir, rename, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const output = path.resolve(process.argv[2] ?? "geoip/dbip-city-lite.mmdb");

function monthsToTry() {
  const requested = process.env.GEOIP_MONTH?.trim();
  const now = requested ? new Date(`${requested}-01T00:00:00Z`) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`GEOIP_MONTH invalide : ${requested}`);
  const month = (offset) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toISOString().slice(0, 7);
  return [month(0), month(1)];
}

await mkdir(path.dirname(output), { recursive: true });
// Fichier temporaire puis renommage : un téléchargement interrompu ne
// remplace jamais une base valide par un fichier tronqué
const partial = `${output}.part`;

for (const month of monthsToTry()) {
  const url = `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
  const response = await fetch(url);
  if (response.status === 404) {
    console.warn(`→ ${month} pas encore publié`);
    continue;
  }
  if (!response.ok || !response.body) throw new Error(`${url} : HTTP ${response.status}`);

  try {
    await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(partial));
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  await rename(partial, output);
  console.log(`✓ DB-IP ${month} → ${output}`);
  process.exit(0);
}

throw new Error("Aucune base DB-IP disponible pour ce mois ni le précédent");
