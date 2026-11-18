// npm audit des dépendances de production, avec une liste d'exceptions
// motivées. Échoue sur toute vulnérabilité high/critical qui n'y figure pas.
// npm audit n'a pas d'option pour ignorer un avis : on filtre son JSON.
import { execFileSync } from "node:child_process";

const LEVELS = new Set(["high", "critical"]);

// Chaque exception dit pourquoi elle est sans risque ici. À retirer dès
// qu'une version corrigée existe (npm audit fix la fera alors disparaître).
const IGNORED = {
  // picomatch <= 4.0.7, aucune version corrigée publiée. Tiré uniquement par
  // vitest (et vite), que better-auth déclare en peer optionnel : npm le
  // compte donc en production, mais il ne sert qu'aux tests et n'est jamais
  // chargé par le site.
  "GHSA-fc5q-39xc-vjpf": "picomatch via vitest, outil de test uniquement",
};

let output;
try {
  output = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  // npm audit sort en code 1 dès qu'il trouve quelque chose
  output = error.stdout;
  if (!output) throw error;
}

const report = JSON.parse(output);
const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via === "object") advisories.set(via.url, via);
  }
}

let failed = false;
for (const [url, advisory] of advisories) {
  const id = url.split("/").pop();
  const line = `${advisory.severity.padEnd(8)} ${advisory.name} — ${advisory.title} (${url})`;
  if (IGNORED[id]) {
    console.log(`ignoré   ${line}\n         → ${IGNORED[id]}`);
  } else if (LEVELS.has(advisory.severity)) {
    console.log(`ÉCHEC    ${line}`);
    failed = true;
  } else {
    console.log(`signalé  ${line}`);
  }
}

for (const id of Object.keys(IGNORED)) {
  if (![...advisories.keys()].some((url) => url.endsWith(id))) {
    console.log(`Exception ${id} devenue inutile : à retirer de scripts/audit.mjs`);
  }
}

if (failed) process.exit(1);
console.log("Aucune vulnérabilité high/critical non traitée.");
