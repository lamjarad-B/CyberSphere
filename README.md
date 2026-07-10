# CyberSphere

Blog de cybersécurité : articles en Markdown, catégories & sous-catégories, tags,
espace membre, commentaires réservés aux membres connectés, et administration intégrée.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** (thème sombre par défaut)
- **PostgreSQL 17** (Docker) + **Prisma 6**
- **better-auth** (email/mot de passe, sessions en base, rôles, bannissement)
- Rendu Markdown : `unified` + `rehype-pretty-code` (coloration Shiki)

## Démarrage

```bash
# 1. Base de données (PostgreSQL sur le port 5433)
docker compose up -d

# 2. Dépendances
npm install

# 3. Schéma + données de démonstration
npx prisma migrate dev
npm run db:seed

# 4. Serveur de développement
npm run dev
```

Le site est disponible sur http://localhost:3000.

## Comptes de démonstration (créés par le seed)

- **Admin** : identifiants définis dans `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- **Membre** : `membre@cybersphere.test` / `membre1234`

## Vérification d'e-mail

L'inscription exige une confirmation par e-mail (`requireEmailVerification`).
En développement, **laissez `SMTP_HOST` vide** dans `.env` : le lien de vérification
s'affiche directement dans la console du serveur (`npm run dev`). En production,
renseignez les variables `SMTP_*` (voir `.env.example`) pour un envoi réel.

## Déploiement Docker (production)

L'image utilise la sortie autonome de Next.js ; les migrations Prisma sont
appliquées automatiquement au démarrage (`docker-entrypoint.sh`).

```bash
cp .env.production.example .env.production   # puis renseigner les secrets
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Pour créer le compte admin en production, lancez le seed une fois avec la
`DATABASE_URL` de production (depuis une machine disposant du code source) :

```bash
DATABASE_URL="postgresql://…" npm run db:seed
```

Volumes persistants : `db-data` (base) et `uploads` (images téléversées).

## Scripts

| Commande | Rôle |
|----------|------|
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm run start` | Build et serveur de production |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Migrations Prisma |
| `npm run db:seed` | Données de démonstration |
| `npm run db:studio` | Interface Prisma Studio |

## Structure

- `src/app/(public)/` — pages publiques + espace membre
- `src/app/admin/` — administration (protégée, rôle `admin`)
- `src/actions/` — Server Actions (articles, catégories, tags, commentaires, membres, profil)
- `src/lib/` — db, auth, session, markdown, uploads, validations (Zod)
- `src/proxy.ts` — protection optimiste de `/admin` et `/membre`
- `uploads/` — images téléversées (servies via `src/app/uploads/[...path]`)

## Sécurité

Mots de passe hachés (scrypt), sessions en base révocables, rate limiting sur l'auth,
double vérification du rôle admin (proxy + chaque Server Action), validation Zod,
Markdown assaini (pas de HTML brut exécuté), en-têtes CSP / X-Frame-Options / nosniff.
