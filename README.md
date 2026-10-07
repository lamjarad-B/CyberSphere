# CyberSphere

Blog de cybersécurité **bilingue (français/anglais)** : articles en Markdown,
catégories & sous-catégories, tags, séries, espace membre, commentaires réservés
aux membres connectés, newsletter, et administration intégrée — avec une posture
sécurité exemplaire (2FA, passkeys, CSP à nonces, journal d'audit…).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** (thème sombre par défaut)
- **PostgreSQL 17** (Docker) + **Prisma 6** (+ recherche full-text `tsvector`)
- **better-auth** (email/mot de passe, **2FA TOTP**, **passkeys WebAuthn**,
  vérification **Have I Been Pwned**, CAPTCHA Turnstile, sessions en base, rôles)
- Rendu Markdown : `unified` + `rehype-pretty-code` (coloration Shiki)
- Images : ré-encodage **sharp** (WebP, suppression EXIF)

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

> Port 5433 déjà pris par un autre projet ? Lancez la base sur un autre port
> (`POSTGRES_PORT=5436 docker compose up -d`) et reportez-le dans
> `DATABASE_URL`. Sous Windows, préférez `127.0.0.1` à `localhost` dans
> `DATABASE_URL` : le relais IPv6 de Docker Desktop est parfois instable.

Le site est disponible sur **http://localhost:3001** (port fixé dans le script
`dev`). Cette URL doit correspondre à `BETTER_AUTH_URL` et `NEXT_PUBLIC_APP_URL`
dans `.env` : si vous ouvrez le site sur un autre port, better-auth rejette la
connexion (origine non approuvée).

> `npm run dev` affiche « Another next dev server is already running » ? Un
> serveur précédent tourne encore en arrière-plan : arrêtez-le avec la commande
> indiquée (`taskkill /PID <pid> /F` sous Windows) puis relancez.

## Comptes de démonstration (créés par le seed)

- **Admin** : identifiants définis dans `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
  L'accès à `/admin` exige d'activer la **2FA** depuis `/membre` (obligatoire).
- **Membre** : `membre@cybersphere.test` / `cybersphere-demo-2026`
- **Auteur** : `auteur@cybersphere.test` / `cybersphere-auteur-2026` — rédige des
  brouillons et les soumet à validation ; seul un admin publie.

> Base créée avant la v2 ? L'ancien membre démo garde son mot de passe
> d'origine (`membre1234`).

**La connexion échoue ?**

1. Vérifiez l'URL : http://localhost:3001 (et non 3000) — voir ci-dessus.
2. Les comptes démo n'existent que si le seed a tourné (`npm run db:seed`),
   avec Docker démarré (`docker compose up -d`).
3. Compte créé via « Inscription » : l'e-mail doit être **vérifié** avant la
   première connexion. En dev (`SMTP_HOST` vide), le lien de vérification
   s'affiche dans la **console du serveur** (`npm run dev`).
4. « Accès refusé » sur `/admin` alors que la connexion réussit : activez
   d'abord la 2FA depuis `/membre` (obligatoire pour admins et auteurs).

## Rôles

| Rôle | Capacités |
|------|-----------|
| Visiteur | Lecture, recherche full-text, RSS (global, par catégorie, par tag), newsletter |
| Membre (`user`) | + Commentaires, réactions « utile », signets, signalements, profil, 2FA, passkeys, gestion de ses sessions, export et suppression de son compte (RGPD) |
| Auteur (`author`) | + Rédaction d'articles (brouillon → soumission à validation, les admins sont prévenus par e-mail) |
| Admin (`admin`) | + Publication immédiate ou **programmée**, catégories/tags/séries, modération + file de signalements (notification e-mail), membres & rôles, statistiques, journal d'audit |

## Sécurité

- **Authentification** : scrypt + vérification e-mail obligatoire, réinitialisation
  de mot de passe par e-mail, refus des mots de passe compromis (HIBP,
  k-anonymity), 2FA TOTP + codes de secours (**imposée aux admins/auteurs**),
  passkeys WebAuthn, CAPTCHA Cloudflare Turnstile (si configuré), rate limiting.
- **Sessions** en base révocables : page « Mes sessions » (révocation individuelle),
  révocation totale au changement de mot de passe et au bannissement.
- **CSP stricte à nonces** (`proxy.ts`) : pas d'`unsafe-inline` sur les scripts,
  `strict-dynamic`, rendu dynamique global.
- **Défense en profondeur** : proxy → layouts → chaque page et Server Action
  revérifie session, rôle **et 2FA du staff** (`lib/session.ts`) ; validation
  Zod partout ; Markdown sans HTML brut.
- **Alertes de sécurité par e-mail** : connexion depuis un appareil inconnu,
  mot de passe modifié, 2FA désactivée, passkey ajoutée.
- **Uploads** : ré-encodage sharp en WebP (EXIF supprimés, fichiers polyglottes
  neutralisés), noms aléatoires, service anti-traversée + `nosniff`.
- **Journal d'audit** (`/admin/journal`) : connexions (réussies et échouées),
  2FA, changements de mot de passe, publications, bans, promotions, exports et
  suppressions de comptes… avec IP.
- **Anti-spam** : honeypots + limitation de fréquence sur commentaires et
  newsletter (par membre, et par IP + Turnstile pour la newsletter).
- **RGPD** : export JSON des données (`/membre`), suppression du compte par le
  membre (mot de passe exigé), purge automatique des sessions expirées, des
  inscriptions newsletter non confirmées (7 j) et du journal d'audit
  (`AUDIT_RETENTION_DAYS`, 365 j par défaut).
- **Divulgation responsable** : `/.well-known/security.txt` (RFC 9116) + `/securite`.

## Multilingue (FR/EN)

- Le français vit sans préfixe (`/articles/...`), l'anglais sous `/en`.
- La langue est **détectée automatiquement** (`Accept-Language` du navigateur,
  plus fiable qu'une géolocalisation IP) ; le bouton FR/EN du header mémorise
  le choix dans un cookie qui l'emporte ensuite.
- **Traduction éditoriale, relue par un humain** : l'interface est traduite à
  la main dans le code ; les articles se traduisent depuis le formulaire admin
  (section « Traduction anglaise », complète ou absente). Un article non
  traduit est servi en français sur `/en` avec un bandeau d'avertissement.
- **Pré-traduction IA (optionnel)** : le bouton « ✨ Pré-traduire avec l'IA »
  du formulaire admin appelle l'**API Claude** (Anthropic) pour remplir un
  *brouillon* de traduction (titre, extrait, contenu — Markdown et blocs de
  code préservés), que vous relisez et corrigez avant d'enregistrer. Rien
  n'est publié sans validation humaine. Renseignez `ANTHROPIC_API_KEY` dans
  `.env` (clé sur https://console.anthropic.com) ; vide = bouton désactivé.
- Catégories et séries ont des champs anglais optionnels ; la recherche `/en`
  interroge un index full-text **anglais** dédié ; RSS, e-mails et sitemap
  (hreflang) sont déclinés dans les deux langues. L'administration reste en
  français.

## Vérification d'e-mail & e-mails

En développement, **laissez `SMTP_HOST` vide** dans `.env` : tous les e-mails
(vérification, réinitialisation, newsletter) s'affichent dans la console du
serveur. En production, renseignez les variables `SMTP_*`.

## CAPTCHA Turnstile (optionnel)

Renseignez `NEXT_PUBLIC_TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY` (créés sur
le dashboard Cloudflare) pour protéger inscription, connexion et « mot de passe
oublié ». Vide = désactivé.

## Déploiement Docker (production)

`docker-compose.prod.yml` orchestre **Caddy** (TLS automatique Let's Encrypt +
HSTS, seul service exposé), l'application (image standalone non-root, migrations
auto au démarrage), PostgreSQL et un service de **sauvegardes quotidiennes
chiffrées** (pg_dump + AES-256, rotation `BACKUP_KEEP_DAYS`).

```bash
cp .env.production.example .env.production   # puis renseigner les secrets
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Restaurer une sauvegarde :

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE \
  -in cybersphere_YYYY-MM-DD.sql.gz.enc | gunzip | psql "$DATABASE_URL"
```

Volumes persistants : `db-data`, `db-backups`, `uploads`, `caddy-data`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) : ESLint + tests unitaires +
build, tests de bout en bout Playwright (avec un service PostgreSQL),
`npm audit` (échec sur high/critical), scan de secrets **gitleaks**.
**Dependabot** surveille npm, les actions GitHub et les images Docker.

## Tests

- **Unitaires** (`npm test`, Vitest — `tests/unit/`) : assainissement des URL
  Markdown, liens d'aperçu signés, anti open-redirect, limiteur de débit,
  anti-traversée des uploads, échappement des e-mails, sommaire, slugs, langues.
  Aucune base nécessaire.
- **De bout en bout** (`npm run test:e2e`, Playwright — `tests/e2e/`) :
  en-têtes de sécurité, gardes d'accès, inscription, 2FA (codes TOTP calculés),
  alertes, commentaires/signalements, export et suppression RGPD, newsletter
  (double opt-in, désabonnement en un clic), exigence 2FA de l'admin,
  cloisonnement des brouillons, publication programmée.

```bash
npx playwright install chromium     # une fois
npx prisma migrate deploy && npm run db:seed
npm run test:e2e                    # build + serveur sur :3001 (ou réutilise un serveur déjà lancé)
```

Les parcours créent leurs propres comptes (adresses `e2e-…@cybersphere.test`) :
à lancer sur une **base de développement ou jetable**, jamais en production.

## Scripts

| Commande | Rôle |
|----------|------|
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm run start` | Build et serveur de production |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Tests de bout en bout (Playwright) |
| `npm run db:migrate` | Migrations Prisma |
| `npm run db:seed` | Données de démonstration |
| `npm run db:studio` | Interface Prisma Studio |

## Structure

- `src/app/[locale]/` — pages publiques FR/EN + espace membre + auth (2FA, reset…)
- `src/app/admin/` — administration (2FA obligatoire ; auteurs restreints)
- `src/actions/` — Server Actions (articles, pré-traduction IA, séries,
  commentaires, réactions, signalements, newsletter, membres, profil, sessions)
- `src/app/api/` — auth (better-auth), export RGPD, désabonnement en un clic
- `src/lib/` — db, auth, session, i18n, markdown (+ TOC), uploads (sharp), rss,
  stats, newsletter, audit, draft-preview (liens signés), validations,
  notifications (alertes, e-mails admin), maintenance (programmation, purge)
- `src/i18n/` — dictionnaires FR/EN de l'interface (traduits à la main)
- `src/proxy.ts` — négociation de langue + CSP à nonces + garde `/admin`, `/membre`
- `src/instrumentation.ts` — démarre les tâches de fond au lancement du serveur
- `tests/` — tests unitaires (Vitest) et de bout en bout (Playwright)
- `docs/CAHIER-DES-SPECIFICATIONS.md` — spécifications complètes
