import { PrismaClient, type ArticleKind } from "@prisma/client";
import { auth } from "../src/lib/auth";
import { slugify } from "../src/lib/slug";

const db = new PrismaClient();

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans .env");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Un compte non vérifié a pu être créé par n'importe qui via l'inscription
    // publique, avec un mot de passe que l'opérateur ignore : on ne le
    // promeut pas administrateur.
    if (!existing.emailVerified) {
      throw new Error(
        `Le compte ${email} existe mais son e-mail n'est pas vérifié : vérifiez-le ou supprimez-le, puis relancez le seed.`,
      );
    }
    if (existing.role !== "admin") {
      await db.user.update({ where: { id: existing.id }, data: { role: "admin" } });
    }
    console.log(`✓ Admin déjà présent : ${email}`);
    return existing.id;
  }

  // Passe par l'API better-auth pour un hachage de mot de passe correct
  await auth.api.signUpEmail({ body: { email, password, name } });
  const user = await db.user.update({
    where: { email },
    data: { role: "admin", emailVerified: true },
  });
  console.log(`✓ Admin créé : ${email}`);
  return user.id;
}

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
  const adminId = await ensureAdmin();

  // --- Catégories et sous-catégories ---
  // Blog d'analyse d'abord : quatre grands thèmes, puis une rubrique
  // « Technique » pour les articles pratiques occasionnels.
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

  const ransomware = await category(
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
  const reglementationUe = await category(
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
  const attaques = await category(
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
  const [tRansomware, tCybercrime, tNis2, tUe, tConformite, tOwasp, tWeb] = await Promise.all([
    tag("ransomware"),
    tag("cybercrime"),
    tag("nis2"),
    tag("union-europeenne"),
    tag("conformite"),
    tag("owasp"),
    tag("web"),
  ]);

  // --- Articles de démonstration ---
  type SeedTranslation = { title: string; excerpt: string; keyPoints?: string; content: string };
  const articles: {
    title: string;
    excerpt: string;
    kind: ArticleKind;
    keyPoints?: string;
    categoryId: string;
    coverImage?: string;
    tags: string[];
    content: string;
    en?: SeedTranslation;
  }[] = [
    {
      title: "Bienvenue sur CyberSphere",
      excerpt:
        "Présentation du blog et de sa ligne éditoriale : comprendre la cybersécurité par l'analyse — menaces, géopolitique, régulation et stratégie.",
      kind: "OPINION",
      categoryId: strategie.id,
      coverImage: "/covers/bienvenue.svg",
      tags: [],
      content: `## Bienvenue !

**CyberSphere** est un blog indépendant consacré à la **cybersécurité**, avec un parti pris : prendre du recul. Plutôt que d'empiler les actualités ou les tutoriels, on cherche à **comprendre** — pourquoi une attaque réussit, ce qu'elle révèle, ce que change une nouvelle réglementation, qui gagne et qui perd quand le rapport de force évolue.

Décideur, juriste, étudiant, professionnel de la sécurité ou simple curieux : l'objectif est de vous donner des clés de lecture, pas seulement des faits.

## La ligne éditoriale

Trois principes guident chaque publication :

- **Analyser plutôt que relayer.** Un incident ou un texte de loi n'est que le point de départ : ce qui compte, c'est ce qu'il dit des tendances de fond.
- **Sourcer.** Chaque affirmation importante renvoie à une source vérifiable, listée en fin d'article.
- **Rester lisible.** Pas de jargon gratuit : quand un terme technique est nécessaire, il est expliqué.

> La sécurité n'est pas un produit, mais un processus. — Bruce Schneier

## Au programme

Les articles s'organisent autour de quatre grands thèmes :

### Menaces & cyberattaques

Ransomware, groupes étatiques, incidents marquants : comment fonctionnent les écosystèmes criminels et ce que les grandes attaques nous apprennent.

### Géopolitique & cyberconflits

Le cyberespace comme terrain de rivalité entre États : guerre hybride, espionnage, souveraineté numérique.

### Régulation & conformité

NIS2, DORA, RGPD, AI Act, Cyber Resilience Act : ce que disent les textes, et ce qu'ils changent concrètement pour les organisations.

### Stratégie, économie & tendances

Gouvernance du risque, marché de la cybersécurité, impact de l'IA : la cybersécurité vue sous l'angle des choix et des arbitrages.

Et parce qu'il faut parfois mettre les mains dans le moteur, une rubrique **Technique** accueille de temps en temps des articles plus pratiques.

## Des formats pour chaque besoin

Chaque article porte un type : **Analyse** pour le fond, **Décryptage** pour expliquer un sujet complexe, **Point de vue** pour une prise de position assumée, **En bref** pour un éclairage rapide, **Tutoriel** pour la pratique. Les analyses s'ouvrent sur un encadré **Points clés** et se terminent par leurs **sources**.

Certains sujets s'étalent sur plusieurs épisodes : ce sont les **séries**, comme « Comprendre NIS2 ».

## En français et en anglais

CyberSphere est **bilingue** : la langue est détectée automatiquement et vous pouvez basculer entre 🇫🇷 et 🇬🇧 à tout moment depuis l'en-tête. Les traductions sont **relues par un humain**, jamais publiées à l'aveugle.

## Participez

La lecture est libre pour tout le monde. En créant un **compte membre** (gratuit), vous pouvez **commenter** et débattre, marquer un article comme **utile**, le mettre en **signets** et **signaler** une erreur.

Bonne lecture — et le débat est ouvert dans les commentaires ! 🛡️`,
    },
    {
      title: "Ransomware : une économie criminelle qui se réorganise",
      excerpt:
        "Moins de rançons payées, mais toujours plus de victimes : comment le modèle d'affiliation, les opérations policières et le refus de payer redessinent l'économie du ransomware.",
      kind: "ANALYSIS",
      keyPoints: `Le ransomware fonctionne comme une économie de services : des développeurs louent leur outil à des affiliés qui mènent les attaques.
Les montants versés aux attaquants ont nettement reculé en 2024, alors que le nombre de victimes revendiquées restait élevé.
Les opérations policières, comme Cronos contre LockBit, frappent autant la réputation des groupes que leur infrastructure.
La fragmentation de l'écosystème rend la menace moins concentrée, mais pas moins présente.`,
      categoryId: ransomware.id,
      tags: [tRansomware.id, tCybercrime.id],
      content: `## Un modèle d'affaires avant d'être une technique

On décrit souvent le ransomware comme un logiciel malveillant. C'est d'abord un **modèle économique**. Depuis le milieu des années 2010, l'écosystème s'est structuré en *ransomware-as-a-service* (RaaS) : un groupe développe et maintient l'outil de chiffrement, l'infrastructure de négociation et le site de publication des données volées ; des **affiliés** louent ce kit, mènent les intrusions et reversent une commission.

Cette division du travail explique la résilience du phénomène. Lorsqu'un groupe disparaît, ses affiliés — qui détiennent le savoir-faire opérationnel — migrent vers une autre plateforme.

## Moins d'argent, autant de victimes

Les chiffres disponibles dessinent un paradoxe. Selon Chainalysis, les paiements de rançon ont nettement reculé en 2024 par rapport au record de 2023[^1]. Dans le même temps, le nombre de victimes revendiquées sur les sites de fuite est resté élevé.

Plusieurs facteurs se combinent :

- **le refus de payer progresse**, porté par de meilleures sauvegardes, la pression des assureurs et la conviction croissante qu'un paiement ne garantit ni la restitution ni la suppression des données[^2] ;
- **la double extorsion** (chiffrement *et* menace de publication) ne suffit plus toujours à faire céder les victimes ;
- **les cibles se diversifient** : moins de « gros poissons », davantage de PME, moins bien protégées mais aussi moins solvables.

## L'effet des opérations policières

En février 2024, l'opération **Cronos**, menée par la National Crime Agency britannique avec Europol et le FBI, a pris le contrôle de l'infrastructure de LockBit, alors le groupe le plus actif au monde[^3]. Au-delà des serveurs saisis, l'opération a visé la **réputation** du groupe : publication de ses propres méthodes, exposition de son chef présumé, démonstration qu'il conservait les données qu'il prétendait supprimer.

C'est là un tournant stratégique. Dans une économie fondée sur la confiance entre criminels — et sur la « parole » donnée aux victimes —, saper la crédibilité d'un groupe peut être plus efficace que d'éteindre ses serveurs.

## Une menace fragmentée

La chute des grands groupes n'a pas fait disparaître la menace : elle l'a **fragmentée**. De nombreux petits groupes, parfois éphémères, occupent désormais l'espace. Pour les défenseurs, cela signifie des modes opératoires plus variés et une attribution plus difficile.

## Ce qu'il faut retenir

Le ransomware reste moins un problème technique qu'un **problème d'incitations**. Tant que certaines victimes paient, le modèle reste rentable. Les leviers les plus efficaces sont donc économiques et collectifs : rendre le paiement moins nécessaire (sauvegardes, plans de reprise), moins attractif (transparence, politiques publiques) et l'activité plus risquée (coopération internationale).

[^1]: Chainalysis, *The 2025 Crypto Crime Report*, février 2025 — https://www.chainalysis.com
[^2]: Coveware, rapports trimestriels sur le ransomware — https://www.coveware.com
[^3]: Europol, communiqué sur l'opération Cronos contre LockBit, 20 février 2024 — https://www.europol.europa.eu`,
      en: {
        title: "Ransomware: a criminal economy reorganizing itself",
        excerpt:
          "Fewer ransoms paid, yet ever more victims: how the affiliate model, law-enforcement operations and the refusal to pay are reshaping the ransomware economy.",
        keyPoints: `Ransomware runs as a service economy: developers rent their tooling to affiliates who carry out the attacks.
Payments to attackers dropped sharply in 2024, while the number of claimed victims stayed high.
Law-enforcement operations such as Cronos against LockBit hit a group's reputation as much as its infrastructure.
A fragmented ecosystem makes the threat less concentrated, but no less present.`,
        content: `## A business model before a technique

Ransomware is often described as malware. It is first and foremost a **business model**. Since the mid-2010s, the ecosystem has organized itself as *ransomware-as-a-service* (RaaS): one group develops and maintains the encryption tool, the negotiation infrastructure and the leak site; **affiliates** rent this kit, carry out the intrusions and pay a commission.

This division of labor explains the phenomenon's resilience. When a group disappears, its affiliates — who hold the operational know-how — move to another platform.

## Less money, just as many victims

The available figures paint a paradox. According to Chainalysis, ransom payments fell sharply in 2024 compared with the 2023 record[^1]. At the same time, the number of victims claimed on leak sites stayed high.

Several factors combine:

- **more victims refuse to pay**, helped by better backups, pressure from insurers and a growing conviction that paying guarantees neither recovery nor deletion of the data[^2];
- **double extortion** (encryption *and* the threat of publication) no longer always makes victims give in;
- **targets are diversifying**: fewer "big fish", more small businesses, less well protected but also less able to pay.

## The impact of law-enforcement operations

In February 2024, **Operation Cronos**, led by the UK's National Crime Agency with Europol and the FBI, took control of the infrastructure of LockBit, then the most active group in the world[^3]. Beyond the seized servers, the operation targeted the group's **reputation**: publishing its own methods, exposing its alleged leader, and showing that it kept the data it claimed to delete.

This marks a strategic shift. In an economy built on trust between criminals — and on the "word" given to victims — undermining a group's credibility can be more effective than taking down its servers.

## A fragmented threat

The fall of the big groups has not made the threat disappear: it has **fragmented** it. Many smaller, sometimes short-lived groups now occupy the space. For defenders, this means more varied tactics and harder attribution.

## The takeaway

Ransomware is less a technical problem than an **incentive problem**. As long as some victims pay, the model stays profitable. The most effective levers are therefore economic and collective: make paying less necessary (backups, recovery plans), less attractive (transparency, public policy) and the activity riskier (international cooperation).

[^1]: Chainalysis, *The 2025 Crypto Crime Report*, February 2025 — https://www.chainalysis.com
[^2]: Coveware, quarterly ransomware reports — https://www.coveware.com
[^3]: Europol, press release on Operation Cronos against LockBit, 20 February 2024 — https://www.europol.europa.eu`,
      },
    },
    {
      title: "NIS2 : ce que la directive change vraiment",
      excerpt:
        "Plus de secteurs, plus d'entités, des dirigeants responsables et des sanctions alignées sur le RGPD : décryptage de la directive européenne qui fait entrer des milliers d'organisations dans la régulation cyber.",
      kind: "EXPLAINER",
      keyPoints: `NIS2 élargit fortement le périmètre de la première directive NIS : de quelques centaines d'opérateurs à des milliers d'entités en France.
Les organisations sont classées en entités « essentielles » ou « importantes », avec des obligations communes mais une supervision différente.
Les organes de direction deviennent responsables de la gestion des risques cyber et doivent être formés.
Les incidents significatifs doivent être signalés selon un calendrier strict : 24 heures, 72 heures, puis un mois.`,
      categoryId: reglementationUe.id,
      tags: [tNis2.id, tUe.id, tConformite.id],
      content: `## Pourquoi une nouvelle directive ?

La première directive NIS, adoptée en 2016, a posé les bases d'une régulation européenne de la cybersécurité. Mais son périmètre restait étroit, et chaque État membre l'appliquait à sa manière. **NIS2**, la directive (UE) 2022/2555 adoptée en décembre 2022[^1], vise à corriger ces deux faiblesses : élargir le champ et harmoniser les règles.

## Un périmètre beaucoup plus large

NIS2 couvre **dix-huit secteurs**, répartis entre secteurs « hautement critiques » (énergie, transports, santé, banque, infrastructures numériques, administration publique…) et « autres secteurs critiques » (services postaux, gestion des déchets, industrie manufacturière, fournisseurs numériques…).

Surtout, le critère de taille devient central : en règle générale, **les moyennes et grandes entreprises** de ces secteurs sont concernées. En France, l'ANSSI estime que plusieurs milliers d'entités entrent dans le périmètre, contre quelques centaines sous NIS1[^2].

## Entités essentielles et entités importantes

Les organisations concernées sont classées en deux catégories :

| | Entités essentielles | Entités importantes |
|---|---|---|
| Profil | Grandes entités des secteurs hautement critiques | Autres entités du périmètre |
| Supervision | *Ex ante* : contrôles possibles à tout moment | *Ex post* : contrôles après un incident ou un signalement |
| Amende maximale | 10 M€ ou 2 % du CA mondial | 7 M€ ou 1,4 % du CA mondial |

Les obligations de fond — gestion des risques, signalement des incidents — sont les mêmes ; c'est l'intensité du contrôle qui diffère.

## Des dirigeants en première ligne

C'est sans doute le changement le plus profond. NIS2 impose aux **organes de direction** d'approuver les mesures de gestion des risques, d'en superviser la mise en œuvre et de **se former**. Ils peuvent être tenus responsables en cas de manquement.

La cybersécurité cesse ainsi d'être un sujet délégué à la DSI pour devenir une question de gouvernance.

## Signaler vite, en trois temps

Tout incident ayant un impact significatif doit être notifié à l'autorité compétente (l'ANSSI en France) selon un calendrier précis :

1. une **alerte précoce** dans les 24 heures ;
2. une **notification d'incident** dans les 72 heures, avec une première évaluation ;
3. un **rapport final** dans un délai d'un mois.

## Une transposition qui prend du temps

Les États membres devaient transposer la directive au plus tard le **17 octobre 2024**. Plusieurs d'entre eux, dont la France, ont pris du retard. Pour les organisations, l'attente n'est pas une raison de différer : les exigences de fond sont connues, et les mettre en œuvre prend du temps.

## En résumé

NIS2 marque le passage d'une régulation de niche à une régulation de masse. Son véritable enjeu n'est pas la conformité documentaire, mais la **maturité** : faire de la gestion du risque cyber une discipline pilotée au plus haut niveau.

[^1]: Directive (UE) 2022/2555 du 14 décembre 2022 (NIS2), Journal officiel de l'UE — https://eur-lex.europa.eu/eli/dir/2022/2555/oj
[^2]: ANSSI, MonEspaceNIS2 — https://monespacenis2.cyber.gouv.fr`,
      en: {
        title: "NIS2: what the directive really changes",
        excerpt:
          "More sectors, more entities, accountable leadership and GDPR-level fines: an explainer on the EU directive that brings thousands of organizations into cyber regulation.",
        keyPoints: `NIS2 greatly widens the scope of the first NIS directive: from a few hundred operators to thousands of entities in France.
Organizations are classified as "essential" or "important" entities, with shared obligations but different supervision.
Management bodies become accountable for cyber risk management and must be trained.
Significant incidents must be reported on a strict timeline: 24 hours, 72 hours, then one month.`,
        content: `## Why a new directive?

The first NIS directive, adopted in 2016, laid the groundwork for EU cybersecurity regulation. But its scope remained narrow, and each member state applied it in its own way. **NIS2**, Directive (EU) 2022/2555 adopted in December 2022[^1], aims to fix both weaknesses: widen the scope and harmonize the rules.

## A much wider scope

NIS2 covers **eighteen sectors**, split between "sectors of high criticality" (energy, transport, health, banking, digital infrastructure, public administration…) and "other critical sectors" (postal services, waste management, manufacturing, digital providers…).

Above all, size becomes the key criterion: as a general rule, **medium and large companies** in these sectors are in scope. In France, ANSSI estimates that several thousand entities fall within scope, compared with a few hundred under NIS1[^2].

## Essential and important entities

Organizations in scope fall into two categories:

| | Essential entities | Important entities |
|---|---|---|
| Profile | Large entities in sectors of high criticality | Other entities in scope |
| Supervision | *Ex ante*: inspections possible at any time | *Ex post*: inspections after an incident or a report |
| Maximum fine | €10M or 2% of worldwide turnover | €7M or 1.4% of worldwide turnover |

The substantive obligations — risk management, incident reporting — are the same; what differs is the intensity of supervision.

## Leadership on the front line

This is arguably the most profound change. NIS2 requires **management bodies** to approve risk-management measures, oversee their implementation and **get trained**. They can be held liable for failures.

Cybersecurity thus stops being a topic delegated to IT and becomes a governance matter.

## Report fast, in three steps

Any incident with a significant impact must be reported to the competent authority (ANSSI in France) on a precise timeline:

1. an **early warning** within 24 hours;
2. an **incident notification** within 72 hours, with an initial assessment;
3. a **final report** within one month.

## A transposition that takes time

Member states had to transpose the directive by **17 October 2024**. Several of them, including France, fell behind. For organizations, the wait is no reason to delay: the substantive requirements are known, and implementing them takes time.

## In short

NIS2 marks the shift from niche regulation to mass regulation. Its real stake is not paperwork compliance but **maturity**: turning cyber risk management into a discipline steered from the top.

[^1]: Directive (EU) 2022/2555 of 14 December 2022 (NIS2), Official Journal of the EU — https://eur-lex.europa.eu/eli/dir/2022/2555/oj
[^2]: ANSSI, MonEspaceNIS2 — https://monespacenis2.cyber.gouv.fr`,
      },
    },
    {
      title: "Comprendre les injections SQL et s'en protéger",
      excerpt:
        "Anatomie d'une injection SQL, démonstration sur une application vulnérable et contre-mesures : requêtes préparées, principe du moindre privilège.",
      kind: "TUTORIAL",
      categoryId: attaques.id,
      tags: [tOwasp.id, tWeb.id],
      content: `## Qu'est-ce qu'une injection SQL ?

Une **injection SQL** survient lorsqu'une entrée utilisateur est concaténée sans contrôle dans une requête.

### Exemple vulnérable

\`\`\`php
$query = "SELECT * FROM users WHERE email = '" . $_GET['email'] . "'";
\`\`\`

Un attaquant peut saisir \`' OR '1'='1\` pour contourner l'authentification.

### La bonne pratique : requêtes préparées

\`\`\`python
cursor.execute(
    "SELECT * FROM users WHERE email = %s",
    (email,),
)
\`\`\`

Les paramètres ne sont **jamais** interprétés comme du code SQL.

### Checklist de défense

1. Requêtes préparées / ORM
2. Principe du moindre privilège sur le compte SQL
3. Validation stricte des entrées (allow-list)
4. WAF en défense en profondeur`,
      en: {
        title: "Understanding SQL injection and defending against it",
        excerpt:
          "How SQL injection works, why it still tops vulnerability rankings, and how to protect your applications for good.",
        content: `## What is a SQL injection?

A SQL injection happens when user input is concatenated into a SQL query without any escaping. An attacker can then alter the query's logic.

\`\`\`sql
-- Vulnerable query
SELECT * FROM users WHERE login = '$login' AND password = '$password';
-- With $login = admin' --
SELECT * FROM users WHERE login = 'admin' --' AND password = '';
\`\`\`

The \`--\` comments out the rest of the query: authentication is bypassed.

## How to protect yourself

### Parameterized queries

The one fix that matters: never concatenate, always bind parameters.

\`\`\`js
// With Prisma, queries are parameterized by design
const user = await prisma.user.findUnique({ where: { login } });
\`\`\`

### Least privilege

The application's database account should only hold the permissions it needs. No \`DROP\`, no \`GRANT\`, no access to other schemas.

### Defense in depth

- Validate input server-side (allow-lists);
- Log and monitor database errors;
- A WAF can slow an attacker down, but never replaces the fixes above.

## Testing your application

Tools like sqlmap automate detection — **only on applications you are authorized to test**.`,
      },
    },
  ];

  for (const [i, article] of articles.entries()) {
    const slug = slugify(article.title);
    const saved = await db.article.upsert({
      where: { slug },
      update: {},
      create: {
        title: article.title,
        slug,
        excerpt: article.excerpt,
        content: article.content,
        kind: article.kind,
        keyPoints: article.keyPoints ?? null,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - i * 86_400_000),
        views: Math.floor(Math.random() * 200),
        authorId: adminId,
        categoryId: article.categoryId,
        ...(article.coverImage && { coverImage: article.coverImage }),
        tags: { connect: article.tags.map((id) => ({ id })) },
      },
      select: { id: true },
    });

    // Traduction anglaise de démonstration (créée une seule fois)
    if (article.en) {
      await db.articleTranslation.upsert({
        where: { articleId_locale: { articleId: saved.id, locale: "en" } },
        update: {},
        create: {
          articleId: saved.id,
          locale: "en",
          title: article.en.title,
          excerpt: article.en.excerpt,
          keyPoints: article.en.keyPoints ?? null,
          content: article.en.content,
        },
      });
    }
  }

  // L'article de présentation est le seul dont le contenu et la couverture
  // font office de « vitrine » : on les resynchronise même si l'article existe
  // déjà (l'upsert ci-dessus ne touche pas les articles existants).
  const welcomeSeed = articles[0];
  await db.article.update({
    where: { slug: slugify(welcomeSeed.title) },
    data: {
      excerpt: welcomeSeed.excerpt,
      content: welcomeSeed.content,
      kind: welcomeSeed.kind,
      coverImage: welcomeSeed.coverImage ?? null,
    },
  });

  // --- Série de démonstration ---
  const nis2Series = "Comprendre NIS2";
  const serie = await db.series.upsert({
    where: { slug: slugify(nis2Series) },
    update: {},
    create: {
      title: nis2Series,
      slug: slugify(nis2Series),
      description:
        "La directive NIS2 décryptée en plusieurs épisodes : périmètre, obligations, gouvernance et mise en œuvre.",
      titleEn: "Understanding NIS2",
      descriptionEn:
        "The NIS2 directive explained over several episodes: scope, obligations, governance and implementation.",
    },
  });
  await db.article.updateMany({
    where: { slug: slugify("NIS2 : ce que la directive change vraiment"), seriesId: null },
    data: { seriesId: serie.id, seriesPosition: 1 },
  });

  // --- Comptes de démonstration ---
  // Jamais en production : leurs mots de passe figurent en clair dans ce
  // dépôt, ce serait une porte d'entrée authentifiée (dont un compte "author"
  // avec accès à l'administration). NODE_ENV ne suffit pas à le garantir :
  // un seed lancé à la main contre la base de production ne le définit
  // généralement pas. Ils ne sont donc créés que pour une instance locale
  // (NEXT_PUBLIC_APP_URL en http://localhost ou 127.0.0.1) hors production.
  // Forcer malgré tout avec SEED_DEMO=1 (base jetable uniquement).
  const localSite = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(
    process.env.NEXT_PUBLIC_APP_URL ?? "",
  );
  if ((localSite && process.env.NODE_ENV !== "production") || process.env.SEED_DEMO === "1") {
    // --- Membre de démonstration + commentaires ---
    // NB : mot de passe volontairement atypique — le plugin haveIBeenPwned
    // rejette les mots de passe présents dans des fuites connues.
    let member = await db.user.findUnique({ where: { email: "membre@cybersphere.test" } });
    if (!member) {
      await auth.api.signUpEmail({
        body: {
          email: "membre@cybersphere.test",
          password: "cybersphere-demo-2026",
          name: "Alex",
        },
      });
    }
    // Compte de démonstration : marqué comme vérifié pour être utilisable
    // directement (la vérification e-mail est active pour les vrais comptes).
    member = await db.user.update({
      where: { email: "membre@cybersphere.test" },
      data: { emailVerified: true },
    });

    // --- Auteur de démonstration (rôle "author" : rédige, l'admin publie) ---
    const authorEmail = "auteur@cybersphere.test";
    const existingAuthor = await db.user.findUnique({ where: { email: authorEmail } });
    if (!existingAuthor) {
      await auth.api.signUpEmail({
        body: {
          email: authorEmail,
          password: "cybersphere-auteur-2026",
          name: "Sam",
        },
      });
    }
    await db.user.update({
      where: { email: authorEmail },
      data: { emailVerified: true, role: "author" },
    });

    const demoComments = [
      {
        slug: slugify("Bienvenue sur CyberSphere"),
        content: "Enfin un blog cyber qui prend le temps d'analyser plutôt que d'empiler les actus. Hâte de lire la suite !",
      },
      {
        slug: slugify("NIS2 : ce que la directive change vraiment"),
        content:
          "Le point sur la responsabilité des dirigeants est essentiel : c'est ce qui fera vraiment bouger les choses dans les PME.",
      },
    ];
    for (const { slug, content } of demoComments) {
      const article = await db.article.findUnique({ where: { slug }, select: { id: true } });
      if (!article) continue;
      const already = await db.comment.findFirst({
        where: { articleId: article.id, authorId: member.id },
      });
      if (!already) {
        await db.comment.create({
          data: { content, articleId: article.id, authorId: member.id },
        });
      }
    }
  } else {
    console.log(
      "→ Comptes de démonstration ignorés (instance non locale ou NODE_ENV=production ; SEED_DEMO=1 pour forcer sur une base jetable).",
    );
  }

  console.log("✓ Seed terminé.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
