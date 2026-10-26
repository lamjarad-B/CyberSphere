// Crée uniquement les catégories, sous-catégories et tags de référence.
//
// Contrairement à `prisma/seed.ts`, ce script ne crée aucun article de
// démonstration, aucun compte et aucun commentaire, et n'a pas besoin des
// variables ADMIN_EMAIL / ADMIN_PASSWORD. Il est donc sûr à lancer contre une
// base déjà en service.
//
// Idempotent : les enregistrements sont créés par `upsert` sur le slug, donc
// relancer le script ne crée pas de doublon.
//
//   npx tsx prisma/seed-taxonomie.ts

import { PrismaClient } from "@prisma/client";
import { slugify } from "../src/lib/slug";

const db = new PrismaClient();

async function category(
  name: string,
  nameEn: string,
  description: string,
  parentId: string | null,
  position: number,
) {
  return db.category.upsert({
    where: { slug: slugify(name) },
    update: { nameEn },
    create: { name, nameEn, slug: slugify(name), description, parentId, position },
  });
}

async function tag(name: string) {
  return db.tag.upsert({
    where: { slug: slugify(name) },
    update: {},
    create: { name, slug: slugify(name) },
  });
}

async function main() {
  // --- Catégories racines ---
  // Les quatre premières portent la ligne éditoriale d'analyse ;
  // « Technique » accueille les articles pratiques occasionnels.
  const menaces = await category(
    "Menaces & cyberattaques",
    "Threats & cyberattacks",
    "Incidents marquants, groupes d'attaquants et économie du cybercrime.",
    null,
    1,
  );
  const geopolitique = await category(
    "Géopolitique & cyberconflits",
    "Geopolitics & cyberconflict",
    "États, guerre hybride, espionnage et souveraineté numérique.",
    null,
    2,
  );
  const regulation = await category(
    "Régulation & conformité",
    "Regulation & compliance",
    "NIS2, DORA, RGPD, AI Act, Cyber Resilience Act : ce que disent les textes et ce qu'ils changent.",
    null,
    3,
  );
  const strategie = await category(
    "Stratégie, économie & tendances",
    "Strategy, economics & trends",
    "Gouvernance du risque, marché de la cybersécurité, IA et prospective.",
    null,
    4,
  );
  const technique = await category(
    "Technique",
    "Technical",
    "Articles pratiques : vulnérabilités, défense et cryptographie, expliquées pas à pas.",
    null,
    5,
  );

  // --- Sous-catégories ---
  await category(
    "Ransomware & cybercrime",
    "Ransomware & cybercrime",
    "Modèles économiques, affiliés et réponse des forces de l'ordre.",
    menaces.id,
    1,
  );
  await category("Groupes APT", "APT groups", "Acteurs étatiques et modes opératoires.", menaces.id, 2);
  await category(
    "Incidents marquants",
    "Notable incidents",
    "Retours sur les attaques qui ont fait date.",
    menaces.id,
    3,
  );

  await category(
    "Cyberconflits",
    "Cyberconflicts",
    "Le cyber dans les conflits armés et la guerre hybride.",
    geopolitique.id,
    1,
  );
  await category(
    "Souveraineté numérique",
    "Digital sovereignty",
    "Cloud, dépendances technologiques et autonomie stratégique.",
    geopolitique.id,
    2,
  );

  await category(
    "Réglementation européenne",
    "EU regulation",
    "NIS2, DORA, Cyber Resilience Act, AI Act.",
    regulation.id,
    1,
  );
  await category(
    "Données personnelles",
    "Personal data",
    "RGPD, CNIL et protection de la vie privée.",
    regulation.id,
    2,
  );

  await category(
    "Gouvernance & risque",
    "Governance & risk",
    "Le cyber vu des comités de direction.",
    strategie.id,
    1,
  );
  await category(
    "Marché de la cybersécurité",
    "Cybersecurity market",
    "Acteurs, investissements et pénurie de talents.",
    strategie.id,
    2,
  );
  await category(
    "IA & prospective",
    "AI & foresight",
    "Ce que l'IA change pour l'attaque comme pour la défense.",
    strategie.id,
    3,
  );

  await category(
    "Attaques & vulnérabilités",
    "Attacks & vulnerabilities",
    "Comprendre une faille pour mieux s'en protéger.",
    technique.id,
    1,
  );
  await category(
    "Défense & durcissement",
    "Defense & hardening",
    "Détection, durcissement et bonnes pratiques.",
    technique.id,
    2,
  );
  await category(
    "Cryptographie",
    "Cryptography",
    "Chiffrement, protocoles et confidentialité.",
    technique.id,
    3,
  );

  // --- Tags ---
  await Promise.all([
    tag("ransomware"),
    tag("cybercrime"),
    tag("nis2"),
    tag("union-europeenne"),
    tag("conformite"),
    tag("owasp"),
    tag("web"),
  ]);

  const categories = await db.category.count();
  const tags = await db.tag.count();
  console.log(`✓ Taxonomie en place : ${categories} catégories, ${tags} tags.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
