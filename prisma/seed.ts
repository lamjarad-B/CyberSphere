import { PrismaClient } from "@prisma/client";
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
  const offensive = await category(
    "Sécurité offensive",
    "Offensive security",
    "Pentest, exploitation et techniques d'attaque éthique.",
    null,
    1,
  );
  const defensive = await category(
    "Sécurité défensive",
    "Defensive security",
    "Détection, durcissement et réponse à incident.",
    null,
    2,
  );
  const crypto = await category(
    "Cryptographie",
    "Cryptography",
    "Chiffrement, protocoles et confidentialité.",
    null,
    3,
  );

  const webPentest = await category(
    "Pentest Web",
    "Web pentesting",
    "OWASP, injections et failles applicatives.",
    offensive.id,
    1,
  );
  await category("Réseau", "Networking", "Reconnaissance et attaques réseau.", offensive.id, 2);
  await category("Blue Team", "Blue Team", "SOC, SIEM et threat hunting.", defensive.id, 1);
  await category("Durcissement", "Hardening", "Hardening système et bonnes pratiques.", defensive.id, 2);

  // --- Tags ---
  const [tPentest, tOwasp, tLinux, tCrypto, tWeb] = await Promise.all([
    tag("pentest"),
    tag("owasp"),
    tag("linux"),
    tag("cryptographie"),
    tag("web"),
  ]);

  // --- Articles de démonstration ---
  const articles = [
    {
      title: "Bienvenue sur CyberSphere",
      excerpt:
        "Présentation du blog, de sa ligne éditoriale et de ce que vous y trouverez : pentest, défense, crypto et actualité de la sécurité.",
      categoryId: crypto.id,
      tags: [tCrypto.id],
      content: `## Bienvenue !

**CyberSphere** est un blog dédié à la **cybersécurité**. Vous y trouverez des articles techniques, des analyses et des tutoriels pratiques.

### Au programme

- Sécurité offensive (pentest, exploitation)
- Sécurité défensive (détection, hardening)
- Cryptographie et confidentialité

> La sécurité n'est pas un produit, mais un processus. — Bruce Schneier

Bonne lecture, et n'hésitez pas à **commenter** les articles après vous être connecté !`,
    },
    {
      title: "Comprendre les injections SQL et s'en protéger",
      excerpt:
        "Anatomie d'une injection SQL, démonstration sur une application vulnérable et contre-mesures : requêtes préparées, principe du moindre privilège.",
      categoryId: webPentest.id,
      tags: [tPentest.id, tOwasp.id, tWeb.id],
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
    },
    {
      title: "Durcir un serveur Linux : les premières heures",
      excerpt:
        "Checklist de durcissement d'un serveur Linux fraîchement provisionné : SSH, pare-feu, mises à jour et surveillance de base.",
      categoryId: offensive.id,
      tags: [tLinux.id],
      content: `## Les priorités du hardening

Un serveur fraîchement installé doit être durci **avant** toute mise en production.

### 1. SSH

\`\`\`bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
\`\`\`

### 2. Pare-feu

\`\`\`bash
ufw default deny incoming
ufw allow 22/tcp
ufw enable
\`\`\`

### 3. Mises à jour automatiques

\`\`\`bash
apt install unattended-upgrades
\`\`\`

Un bon durcissement réduit drastiquement la surface d'attaque.`,
    },
  ];

  for (const [i, article] of articles.entries()) {
    const slug = slugify(article.title);
    await db.article.upsert({
      where: { slug },
      update: {},
      create: {
        title: article.title,
        slug,
        excerpt: article.excerpt,
        content: article.content,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - i * 86_400_000),
        views: Math.floor(Math.random() * 200),
        authorId: adminId,
        categoryId: article.categoryId,
        tags: { connect: article.tags.map((id) => ({ id })) },
      },
    });
  }

  // --- Traduction anglaise de démonstration (article SQL) ---
  const sqlArticle = await db.article.findUnique({
    where: { slug: slugify("Comprendre les injections SQL et s'en protéger") },
    select: { id: true },
  });
  if (sqlArticle) {
    await db.articleTranslation.upsert({
      where: { articleId_locale: { articleId: sqlArticle.id, locale: "en" } },
      update: {},
      create: {
        articleId: sqlArticle.id,
        locale: "en",
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
    });
  }

  // --- Série de démonstration ---
  const serie = await db.series.upsert({
    where: { slug: slugify("Pentest web de A à Z") },
    update: {
      titleEn: "Web pentesting from A to Z",
      descriptionEn:
        "From reconnaissance to exploitation: a complete walkthrough of web penetration testing.",
    },
    create: {
      title: "Pentest web de A à Z",
      slug: slugify("Pentest web de A à Z"),
      description:
        "De la reconnaissance à l'exploitation : un parcours complet du test d'intrusion web.",
      titleEn: "Web pentesting from A to Z",
      descriptionEn:
        "From reconnaissance to exploitation: a complete walkthrough of web penetration testing.",
    },
  });
  await db.article.updateMany({
    where: { slug: slugify("Comprendre les injections SQL et s'en protéger") },
    data: { seriesId: serie.id, seriesPosition: 1 },
  });

  // --- Membre de démonstration + commentaire ---
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

  const welcome = await db.article.findUnique({
    where: { slug: slugify("Bienvenue sur CyberSphere") },
  });
  if (member && welcome) {
    const already = await db.comment.findFirst({
      where: { articleId: welcome.id, authorId: member.id },
    });
    if (!already) {
      await db.comment.create({
        data: {
          content: "Super initiative, hâte de lire la suite des articles sur le pentest web !",
          articleId: welcome.id,
          authorId: member.id,
        },
      });
    }
  }

  console.log("✓ Seed terminé.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
