# CyberSphere — Cahier des spécifications techniques et fonctionnelles

**Version du document :** 2.1 · **Date :** 10 juillet 2026 · **État du projet :** **v2.1 livrée** (v1 : commit `402fb40`)

> **Note v2** — La montée de version proposée au §7 a été **entièrement
> implémentée** le 10 juillet 2026 : les trois paliers (durcissement sécurité,
> expérience de lecture, communauté) sont livrés. Le §6 recense l'état des
> limites v1 après la v2 ; le §8 documente les choix d'implémentation.
>
> **Note v2.1** — Le site est désormais **bilingue français/anglais** avec
> détection automatique de la langue du visiteur. Spécification complète au §9.

---

## 1. Présentation du projet

CyberSphere est un blog de cybersécurité personnel permettant la publication d'articles
techniques (analyses, tutoriels, veille). Le contenu est rédigé en Markdown depuis une
interface d'administration intégrée, stocké en base de données, et rendu côté serveur
avec coloration syntaxique du code. Le site propose un espace membre dont l'unique
privilège éditorial est le dépôt de commentaires — **aucun commentaire n'est possible
sans compte vérifié**.

S'agissant d'un blog de cybersécurité, la sécurité de la plateforme elle-même est un
objectif de premier rang : chaque choix d'implémentation est documenté au §5.

### 1.1 Acteurs

| Acteur | Description | Capacités |
|---|---|---|
| **Visiteur** | Utilisateur anonyme | Lecture des articles publiés, navigation, recherche, lecture des commentaires, flux RSS |
| **Membre** (`role: user`) | Utilisateur inscrit, e-mail vérifié | + Commenter, répondre, modifier/supprimer **ses** commentaires, gérer son profil |
| **Administrateur** (`role: admin`) | Propriétaire du blog | + Interface `/admin` complète : articles, catégories, tags, modération, gestion des membres |

---

## 2. Spécifications fonctionnelles

### 2.1 Espace public

#### Accueil (`/`)
- Mise en avant des derniers articles publiés (cartes avec image de couverture, catégorie, extrait, auteur, date).
- Navigation principale : catégories de premier niveau avec menu déroulant des sous-catégories.
- Thème **sombre par défaut** (esthétique orientée sécurité, accent cyan), bascule clair/sombre persistante (`next-themes`).

#### Liste des articles (`/articles`)
- Liste paginée des articles **publiés uniquement**, triés par date de publication décroissante.
- Pagination : **9 articles par page** (`PAGE_SIZE`), numéro de page assaini côté serveur.

#### Page article (`/articles/[slug]`)
- Rendu serveur du Markdown : titres ancrés, tableaux GFM, **coloration syntaxique Shiki** (thème `github-dark-default`) — essentielle pour les extraits de code d'un blog cybersec.
- Métadonnées : catégorie, tags, auteur, date, **compteur de vues** (incrémenté à chaque affichage, en tâche de fond non bloquante).
- Section commentaires (cf. §2.4).
- Un article en brouillon (`DRAFT`) renvoie une 404 pour le public.

#### Catégories (`/categories/[slug]`)
- Deux niveaux : catégorie → sous-catégories (profondeur strictement limitée à 2, contrainte appliquée côté serveur).
- La page d'une catégorie parente agrège ses articles **et** ceux de ses sous-catégories ; une sous-catégorie liste les siens.

#### Tags (`/tags/[slug]`)
- Liste paginée des articles publiés portant le tag.

#### Recherche (`/recherche`)
- Recherche insensible à la casse (`ILIKE` Prisma) sur **titre, extrait et contenu** des articles publiés.
- Requête : 2 caractères minimum, tronquée à 100 caractères ; résultats paginés.

#### Flux et référencement
- **RSS 2.0** (`/rss.xml`) : 20 derniers articles publiés, valeurs échappées XML, cache public 1 h.
- **Sitemap** (`sitemap.ts`) et **robots.txt** (`robots.ts`) générés dynamiquement.
- `generateMetadata` par page (title, description, Open Graph) ; page 404 personnalisée.

### 2.2 Authentification et espace membre

#### Inscription (`/inscription`)
- Nom (2–50 car.), e-mail, mot de passe (8–128 car.), validés par Zod côté serveur.
- **Vérification d'e-mail obligatoire** (`requireEmailVerification`) : aucune session n'est ouverte tant que l'adresse n'est pas confirmée. Lien de vérification valable **1 heure**, envoyé à l'inscription et renvoyé à toute tentative de connexion d'un compte non vérifié. Connexion automatique après vérification.
- Envoi SMTP via `nodemailer` ; sans configuration SMTP (développement), l'e-mail est simulé dans la console serveur.

#### Connexion (`/connexion`)
- E-mail + mot de passe ; paramètre `?redirection=` pour revenir à la page protégée demandée.
- Rate limiting better-auth : **30 requêtes / 60 s** par IP sur les endpoints d'auth.

#### Espace membre (`/membre`)
- Modification du profil : nom, **avatar** (upload image, cf. §4.5).
- **Changement de mot de passe** avec `revokeOtherSessions: true` : toutes les autres sessions actives sont révoquées immédiatement.
- Liste de ses propres commentaires.

### 2.3 Règle d'or des commentaires
- **Lecture** : ouverte à tous.
- **Écriture** : réservée aux membres connectés, non bannis, à l'e-mail vérifié. Les visiteurs voient une invite à se connecter.

### 2.4 Commentaires
- Dépôt sur les articles **publiés uniquement** ; contenu texte brut (2–2000 caractères), échappé à l'affichage (aucun HTML interprété).
- **Réponses sur un seul niveau** : répondre à une réponse rattache automatiquement le commentaire au parent d'origine (pas de fils infinis).
- Le membre peut **modifier et supprimer ses propres commentaires** ; l'administrateur peut supprimer n'importe quel commentaire.
- Intégrité vérifiée côté serveur : le parent doit exister et appartenir au même article.

### 2.5 Administration (`/admin`)

| Page | Fonctionnalités |
|---|---|
| **Dashboard** (`/admin`) | Compteurs : articles (total/publiés), commentaires, membres, vues cumulées ; derniers commentaires et articles |
| **Articles** (`/admin/articles`, `/nouveau`, `/[id]`) | CRUD complet : éditeur Markdown avec **aperçu serveur** (même pipeline que le rendu public), upload d'image de couverture, tags libres (max 10, dédupliqués, `connectOrCreate`), statut brouillon/publié, date de publication figée au premier passage en « publié », slug unique généré côté serveur |
| **Catégories** (`/admin/categories`) | CRUD, choix du parent, garde-fous : pas d'auto-parenté, 2 niveaux max, une catégorie ayant des enfants ne peut devenir sous-catégorie, suppression bloquée si des articles l'utilisent |
| **Tags** (`/admin/tags`) | CRUD |
| **Commentaires** (`/admin/commentaires`) | Modération : liste globale, suppression |
| **Membres** (`/admin/membres`) | Liste, **bannissement/débannissement** ; le ban révoque **immédiatement toutes les sessions** du membre (transaction) ; impossible de se bannir soi-même ou de bannir un admin |

---

## 3. Spécifications techniques

### 3.1 Stack

| Composant | Technologie | Version |
|---|---|---|
| Framework | Next.js (App Router, sortie `standalone`) | 16.2.10 |
| UI | React + Tailwind CSS (+ plugin typography) | 19.2.4 / v4 |
| Langage | TypeScript (strict) | 5.x |
| Base de données | PostgreSQL (Docker) | 17-alpine |
| ORM | Prisma (+ migrations, seed `tsx`) | 6.19.3 |
| Authentification | better-auth (plugin `admin`, `nextCookies`) | 1.6.23 |
| Validation | Zod | 4.4.3 |
| Rendu Markdown | unified : remark-parse, remark-gfm, remark-rehype, rehype-slug, rehype-pretty-code (Shiki), rehype-stringify | — |
| E-mail | nodemailer (SMTP) | 9.0.3 |
| Thème | next-themes | 0.4.6 |
| Runtime conteneur | Node.js | 22 (bookworm-slim) |

### 3.2 Architecture applicative

- **Server Components par défaut** : toutes les lectures (listes, article, admin) sont des requêtes Prisma exécutées côté serveur au rendu.
- **Server Actions** (`src/actions/`) pour toutes les mutations : `articles`, `categories`, `tags`, `comments`, `members`, `profile`. Chaque action revalide les chemins impactés (`revalidatePath`).
- **Composants client** limités aux zones interactives : formulaires (auth, article, profil, mot de passe), section commentaires, bascule de thème, menus.
- **`src/proxy.ts`** (convention Next 16 remplaçant `middleware.ts`) : contrôle *optimiste* de la présence du cookie de session sur `/admin/*` et `/membre/*`, avec redirection vers `/connexion?redirection=…`.
- Convention d'URL et interface entièrement **en français**.

```
src/
├── proxy.ts                      # garde optimiste /admin + /membre
├── lib/                          # db, auth, auth-client, session, markdown,
│                                 # slug, uploads, validations, email, format, articles
├── actions/                      # Server Actions (mutations)
├── components/                   # UI publique, admin/, auth/, comments/, membre/
└── app/
    ├── (public)/                 # accueil, articles, catégories, tags, recherche,
    │                             # connexion, inscription, membre
    ├── admin/                    # dashboard, articles, categories, tags,
    │                             # commentaires, membres
    ├── api/auth/[...all]/        # handler better-auth
    ├── uploads/[...path]/        # service des fichiers téléversés
    └── rss.xml/ · sitemap.ts · robots.ts · not-found.tsx
```

### 3.3 Modèle de données (PostgreSQL / Prisma)

**Tables d'authentification** (better-auth) : `User` (avec `role`, `banned`, `banReason`, `banExpires`, `emailVerified`), `Session` (token unique, IP, user-agent, expiration — sessions **en base**, donc révocables), `Account` (hash du mot de passe), `Verification` (jetons de vérification d'e-mail).

**Tables de contenu** :

| Modèle | Champs clés | Relations & règles |
|---|---|---|
| `Category` | `name`, `slug` unique, `description?`, `position`, `parentId?` | Auto-relation parent/enfants (2 niveaux max, appliqué en Server Action) ; suppression en cascade des enfants |
| `Article` | `title`, `slug` unique, `excerpt`, `content` (Markdown), `coverImage?`, `status` (`DRAFT`\|`PUBLISHED`), `publishedAt?`, `views` | → `author` (User), → `category`, ↔ `tags` (m-n implicite) ; index `(status, publishedAt)` et `(categoryId)` |
| `Tag` | `name` unique, `slug` unique | ↔ articles |
| `Comment` | `content` (texte brut), `parentId?` | → `article` (cascade), → `author` (cascade), auto-relation réponses (1 niveau) ; index `(articleId)` |

### 3.4 Pipeline Markdown

- `unified` : `remark-parse` → `remark-gfm` → `remark-rehype` (**sans** `allowDangerousHtml` : tout HTML brut écrit dans le Markdown est **ignoré**, neutralisant l'injection de script à la source) → `rehype-slug` → `rehype-pretty-code` (Shiki, `defaultLang: text`) → `rehype-stringify`.
- Pipeline **partagé** entre le rendu public et l'aperçu de l'éditeur admin (fidélité garantie) ; aperçu plafonné à 100 000 caractères.

### 3.5 Téléversement de fichiers

- Types acceptés : PNG, JPEG, WebP, GIF ; taille max **5 Mo** ; validations côté serveur.
- Nom de fichier **aléatoire** (`timestamp-16 hex aléatoires.ext`) — jamais le nom fourni par le client.
- Stockage dans `uploads/` **hors de `public/`**, servi par le route handler `/uploads/[...path]` : normalisation du chemin + rejet de toute traversée de répertoire, extension → Content-Type sur liste blanche, `X-Content-Type-Options: nosniff`, cache immuable 1 an.

### 3.6 Table des routes

| Route | Type | Accès |
|---|---|---|
| `/`, `/articles`, `/articles/[slug]`, `/categories/[slug]`, `/tags/[slug]`, `/recherche` | Pages | Public |
| `/connexion`, `/inscription` | Pages | Public |
| `/membre` | Page | Membre connecté |
| `/admin`, `/admin/articles(/nouveau|/[id])`, `/admin/categories`, `/admin/tags`, `/admin/commentaires`, `/admin/membres` | Pages | Admin |
| `/api/auth/[...all]` | Route handler | better-auth (rate-limité) |
| `/uploads/[...path]` | Route handler | Public (lecture seule) |
| `/rss.xml`, `/sitemap.xml`, `/robots.txt` | Route handlers / conventions | Public |

---

## 4. Infrastructure et déploiement

### 4.1 Développement
- `docker-compose.yml` : PostgreSQL 17-alpine sur le port **5433** (5432 occupé par un autre projet sur la machine), volume `db-data`, healthcheck `pg_isready`.
- `.env` : `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` (seed), variables `SMTP_*` optionnelles. Modèles fournis : `.env.example`, `.env.production.example`.
- Seed (`prisma/seed.ts`) : crée l'admin depuis les variables d'environnement **via l'API better-auth** (hachage correct), marque son e-mail vérifié ; catégories/sous-catégories, tags, articles et commentaires de démonstration ; compte membre de test. Idempotent (upserts).

### 4.2 Production (Docker)
- **Dockerfile multi-étapes** (deps → build → runner) sur `node:22-bookworm-slim` : sortie autonome Next.js (`output: "standalone"`), image finale minimale.
- Exécution sous **utilisateur non-root** (`nextjs`, uid 1001).
- `docker-entrypoint.sh` : applique `prisma migrate deploy` au démarrage puis lance le serveur.
- `docker-compose.prod.yml` : app + PostgreSQL, volumes persistants `db-data` et `uploads`.
- `NEXT_PUBLIC_APP_URL` injectée en build-arg ; télémétrie Next désactivée.

---

## 5. Spécifications de sécurité (v1)

> Principe directeur : **défense en profondeur** — aucune protection ne repose sur un seul contrôle.

### 5.1 Authentification et sessions
- Mots de passe hachés **scrypt** (better-auth), longueur 8–128.
- **Sessions stockées en base** (jamais de JWT stateless) : révocation immédiate possible — utilisée par le bannissement et le changement de mot de passe.
- Vérification d'e-mail **obligatoire** avant toute session ; jetons de vérification expirant en 1 h.
- **Rate limiting** sur tous les endpoints d'authentification (30 req/60 s).
- Cookies de session gérés par better-auth (`httpOnly`, `sameSite`, `secure` en production).

### 5.2 Autorisation (3 couches)
1. **`proxy.ts`** : refus optimiste sans cookie de session sur `/admin/*` et `/membre/*` (rapide, exécuté avant le rendu).
2. **Layouts serveur** : `requireAdmin()` / `requireUser()` revalident la session réelle, le rôle et l'état de bannissement.
3. **Chaque Server Action** revérifie indépendamment la session (`getAdminSession()` pour les mutations admin) — une action ne fait **jamais** confiance à l'UI qui l'appelle.
- Contrôles d'appartenance : un membre ne modifie/supprime que **ses** commentaires ; un admin ne peut ni se bannir ni bannir un autre admin.

### 5.3 Entrées et contenu
- **Zod sur toutes les entrées** de mutation (longueurs bornées, enums, e-mail) ; message d'erreur générique en cas d'échec d'écriture (pas de fuite d'erreur interne).
- Slugs **générés côté serveur** (translittération, caractères sûrs `[a-z0-9-]`, unicité par suffixe) — jamais fournis par le client.
- Markdown : HTML brut **non interprété** (§3.4) → pas de XSS stockée via les articles ; commentaires en texte brut échappé par React.
- Sortie RSS : échappement XML systématique.
- Recherche : requête bornée (100 car.), paramétrée par Prisma (pas d'injection SQL).

### 5.4 Téléversements
- Liste blanche de types MIME, taille plafonnée, noms aléatoires, stockage hors racine web, service contrôlé avec anti-traversée et `nosniff` (§3.5).

### 5.5 En-têtes HTTP (toutes les réponses)
- **CSP** : `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` (+ `unsafe-inline` script/style requis par Next — durcissement prévu en v2, cf. §7).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (caméra/micro/géoloc désactivés).

### 5.6 Secrets et exploitation
- Aucun secret en dur : tout provient de `.env` (exclu de git ; modèles `.example` fournis).
- Conteneur applicatif non-root ; base de données non exposée publiquement en production (réseau compose interne).

---

## 6. Limites connues de la v1 — état après v2

1. ~~CSP avec `'unsafe-inline'` sur les scripts~~ → **résolu** : CSP à nonces + `strict-dynamic` (1.5).
2. ~~Pas de réinitialisation de mot de passe oublié~~ → **résolu** (1.3).
3. ~~Recherche `ILIKE`~~ → **résolu** : full-text PostgreSQL français (2.1).
4. ~~Pas de 2FA ni de CAPTCHA~~ → **résolu** : 2FA TOTP obligatoire pour le staff, passkeys, Turnstile (1.1, 1.2, 1.8).
5. ~~Pas de journal d'audit~~ → **résolu** (1.6).
6. ~~EXIF conservés~~ → **résolu** : ré-encodage sharp en WebP (1.9).
7. Tests automatisés → **partiellement** : CI (lint, build, audit, gitleaks) en place ; pas encore de tests E2E (Playwright envisageable en v3).
8. ~~Pas de TLS~~ → **résolu** : Caddy + HSTS dans le compose de production (1.11).
9. Uploads sur disque local (volume Docker) — inchangé, incompatible serverless ; à migrer vers un objet storage (S3/R2) si l'hébergement l'exige.

**Nouvelles limites v2** : le CAPTCHA nécessite des clés Cloudflare (désactivé sinon) ; la CSP à nonces impose un rendu 100 % dynamique (pas de cache CDN des pages) ; l'envoi newsletter est séquentiel (suffisant pour quelques centaines d'abonnés, à déporter vers une file si la liste grossit).

---

## 7. Montée de version — CyberSphere v2 ✅ **implémentée**

Objectif : faire du blog une **vitrine de bonnes pratiques de sécurité** (crédibilité éditoriale oblige), puis enrichir l'expérience de lecture et la communauté. **Les 26 fonctionnalités des trois paliers sont livrées** (détails d'implémentation au §8).

### Palier 1 — Durcissement sécurité (priorité absolue)

| # | Fonctionnalité | Détail | Effort |
|---|---|---|---|
| 1.1 | **Authentification à deux facteurs (TOTP)** | Plugin `twoFactor` better-auth : TOTP + codes de secours, **obligatoire pour le compte admin**, optionnel pour les membres | Moyen |
| 1.2 | **Passkeys (WebAuthn)** | Plugin `passkey` better-auth : connexion sans mot de passe, résistante au phishing — signal fort pour un blog cybersec | Moyen |
| 1.3 | **Réinitialisation de mot de passe** | Flux « mot de passe oublié » par e-mail (l'infra SMTP existe déjà), jetons à courte durée de vie | Faible |
| 1.4 | **Vérification Have I Been Pwned** | Plugin better-auth : refus des mots de passe présents dans des fuites connues (API k-anonymity, le mot de passe ne quitte jamais le serveur) | Faible |
| 1.5 | **CSP stricte avec nonces** | Génération d'un nonce par requête dans `proxy.ts`, suppression de `'unsafe-inline'` sur `script-src` + `strict-dynamic` | Moyen |
| 1.6 | **Journal d'audit** | Table `AuditLog` (acteur, action, cible, IP, date) alimentée par toutes les Server Actions admin + événements d'auth sensibles (connexions échouées, bans, changements de mot de passe) ; consultation dans l'admin | Moyen |
| 1.7 | **Gestion des sessions actives** | Page membre « Mes sessions » : liste (appareil, IP, date) et révocation individuelle — les données sont déjà en base | Faible |
| 1.8 | **CAPTCHA invisible** | Cloudflare Turnstile (plugin `captcha` better-auth) sur inscription et connexion, en complément du rate limiting | Faible |
| 1.9 | **Ré-encodage des images** | `sharp` à l'upload : conversion WebP, suppression des métadonnées EXIF, neutralisation des fichiers polyglottes | Faible |
| 1.10 | **Anti-spam commentaires** | Rate limiting applicatif par utilisateur (n commentaires / minute) + champ honeypot | Faible |
| 1.11 | **TLS + HSTS** | Reverse proxy Caddy (TLS automatique) dans `docker-compose.prod.yml`, en-tête `Strict-Transport-Security` | Faible |
| 1.12 | **CI sécurité** | GitHub Actions : lint, build, `npm audit`, Dependabot, scan de secrets (gitleaks) sur chaque push | Faible |
| 1.13 | **Sauvegardes chiffrées** | `pg_dump` planifié (service compose dédié), rotation, chiffrement au repos | Faible |

### Palier 2 — Expérience de lecture

| # | Fonctionnalité | Détail | Effort |
|---|---|---|---|
| 2.1 | **Recherche full-text PostgreSQL** | `tsvector` + index GIN, dictionnaire français, tri par pertinence, extraits surlignés (`ts_headline`) | Moyen |
| 2.2 | **Table des matières + temps de lecture** | Générées depuis l'AST Markdown existant ; sommaire flottant sur desktop | Faible |
| 2.3 | **Articles similaires** | Suggestion en fin d'article (catégorie + tags partagés) | Faible |
| 2.4 | **Séries d'articles** | Modèle `Series` : épisodes ordonnés, navigation précédent/suivant (idéal pour des tutos multi-parties) | Moyen |
| 2.5 | **Copie de code + numéros de ligne** | Bouton « copier » sur les blocs Shiki, surlignage de lignes | Faible |
| 2.6 | **Flux RSS par catégorie/tag** | Déclinaison du flux existant | Faible |
| 2.7 | **Prévisualisation partageable des brouillons** | Lien signé à durée limitée pour relecture avant publication | Moyen |

### Palier 3 — Communauté et croissance

| # | Fonctionnalité | Détail | Effort |
|---|---|---|---|
| 3.1 | **Newsletter** | Inscription (double opt-in), envoi automatique à la publication — réutilise l'infra SMTP | Moyen |
| 3.2 | **Réactions et signets** | « Utile » sur articles/commentaires, favoris dans l'espace membre | Moyen |
| 3.3 | **Signalement de commentaires** | Bouton « signaler » alimentant une file de modération dans l'admin | Faible |
| 3.4 | **Statistiques respectueuses de la vie privée** | Dashboard admin enrichi : vues par article/période, référents — sans cookie tiers ni tracker externe | Moyen |
| 3.5 | **Rôle « auteur »** | Rôle intermédiaire pouvant rédiger des brouillons soumis à validation admin | Moyen |
| 3.6 | **Page divulgation responsable** | `security.txt` (RFC 9116) + page de contact sécurité — la moindre des choses pour un blog cybersec | Faible |

## 8. Choix d'implémentation de la v2

### Sécurité (palier 1)

- **2FA TOTP (1.1)** : plugin `twoFactor` better-auth — enrôlement dans `/membre` (QR code généré localement via `qrcode`, codes de secours à usage unique), vérification à la connexion sur `/deux-facteurs`. **Obligatoire pour accéder à `/admin`** (admins *et* auteurs) : le layout admin bloque tant que la 2FA n'est pas activée.
- **Passkeys (1.2)** : paquet `@better-auth/passkey` — enregistrement/suppression dans `/membre`, bouton « Se connecter avec une passkey » sur `/connexion`. Tables `TwoFactor` et `Passkey` ajoutées au schéma.
- **Mot de passe oublié (1.3)** : `/mot-de-passe-oublie` → e-mail (lien 1 h) → `/reinitialisation?token=…`. Réponse identique que l'adresse existe ou non (pas d'énumération de comptes). Toutes les sessions sont révoquées après réinitialisation.
- **HIBP (1.4)** : plugin `haveIBeenPwned` — tout mot de passe présent dans une fuite connue est refusé à l'inscription, au changement et à la réinitialisation (API k-anonymity : seul un préfixe de hash sort du serveur).
- **CSP à nonces (1.5)** : générée par requête dans `src/proxy.ts` (pattern officiel Next) : `script-src 'self' 'nonce-…' 'strict-dynamic'`, plus aucun `unsafe-inline` script. Rendu dynamique global (`force-dynamic` dans le layout racine), nonce transmis à `next-themes`. `style-src` conserve `unsafe-inline` (attributs de style Shiki, sans risque d'exécution).
- **Journal d'audit (1.6)** : table `AuditLog` + `src/lib/audit.ts` (jamais bloquant pour l'action métier). Alimenté par les hooks base de données better-auth (inscriptions, connexions avec IP, changements de mot de passe) et par toutes les Server Actions sensibles (publication, suppression, modération, bans, rôles). Consultation paginée : `/admin/journal`.
- **Sessions actives (1.7)** : section « Mes sessions » dans `/membre` — appareil (user-agent résumé), IP, date, révocation individuelle ou globale.
- **CAPTCHA (1.8)** : plugin `captcha` better-auth (Cloudflare Turnstile) sur inscription/connexion/mot de passe oublié — activé seulement si `TURNSTILE_SECRET_KEY` est défini ; widget chargé sous `strict-dynamic`, iframe autorisée via `frame-src`.
- **Images (1.9)** : `sharp` ré-encode tout upload en WebP (max 2560 px, EXIF/GPS supprimés, fichiers polyglottes détruits, fichiers non-image rejetés).
- **Anti-spam (1.10)** : honeypot + plafond de 3 commentaires/minute par membre ; honeypot + anti-renvoi de 10 min sur la newsletter.
- **TLS/HSTS (1.11)** : service Caddy dans `docker-compose.prod.yml` (certificats Let's Encrypt automatiques, HSTS 2 ans, seul service exposé — l'app n'a plus de port publié).
- **CI (1.12)** : `.github/workflows/ci.yml` (ESLint, build, `npm audit --audit-level=high`, gitleaks) + Dependabot (npm, actions, Docker).
- **Sauvegardes (1.13)** : service compose dédié — `pg_dump` quotidien, gzip + AES-256 (`openssl enc -pbkdf2`), rotation `BACKUP_KEEP_DAYS` (14 j par défaut), volume `db-backups`.

### Lecture (palier 2)

- **Recherche full-text (2.1)** : colonne `tsvector` française pondérée (titre A > extrait B > contenu C) maintenue par **trigger** (une colonne générée créerait une dérive de schéma Prisma), index GIN, `websearch_to_tsquery` (guillemets, `-exclusion`, `ou`), tri `ts_rank`, extraits `ts_headline` à délimiteurs neutres rendus en `<mark>` par React (jamais de HTML injecté).
- **Sommaire + temps de lecture (2.2)** : extraction des titres h2/h3 depuis l'AST remark avec `github-slugger` (ids identiques à `rehype-slug`) ; 220 mots/min.
- **Articles similaires (2.3)** : même catégorie ou tag partagé, 3 suggestions.
- **Séries (2.4)** : modèle `Series` + `seriesPosition` — CRUD admin, sélection dans le formulaire article, encart « Série » sur l'article, pages `/series` et `/series/[slug]`.
- **Copie de code (2.5)** : bouton « Copier » injecté sur chaque bloc Shiki (composant client `CodeCopy`).
- **RSS déclinés (2.6)** : générateur partagé `src/lib/rss.ts` → `/rss.xml`, `/categories/[slug]/rss.xml` (sous-catégories incluses), `/tags/[slug]/rss.xml`.
- **Prévisualisation partageable (2.7)** : lien signé HMAC-SHA256 (secret serveur, expiration 72 h, comparaison à temps constant) → `/articles/apercu/[id]?jeton=…`, généré d'un clic depuis le formulaire article. `noindex`.

### Communauté (palier 3)

- **Newsletter (3.1)** : double opt-in (jeton aléatoire, e-mail de confirmation, anti-harcèlement d'adresses tierces), envoi automatique aux abonnés confirmés à la **première publication** d'un article (via `after()`, hors du chemin de réponse), lien de désinscription dans chaque e-mail.
- **Réactions & signets (3.2)** : boutons « Utile » (compteur public) et « Ajouter aux signets » sur les articles publiés (état optimiste) ; liste des signets dans `/membre`. *Écart au cahier initial : réactions sur les articles uniquement, pas sur les commentaires — le signalement (3.3) couvre le besoin de retour sur les commentaires.*
- **Signalements (3.3)** : bouton « Signaler » (motif facultatif, 1 signalement par membre et par commentaire) → file `/admin/signalements` (supprimer / classer sans suite), compteur sur le tableau de bord.
- **Statistiques (3.4)** : agrégats quotidiens `ArticleDailyView` + référents externes `ReferrerStat` (compteurs anonymes — ni IP, ni cookie, ni identifiant) ; page `/admin/statistiques` : vues 30 j, top articles, référents, abonnés, réactions.
- **Rôle auteur (3.5)** : statut `SUBMITTED` ajouté au cycle de vie des articles. L'auteur rédige et **soumet** (jamais de publication directe), ne voit et ne modifie que ses articles non publiés ; l'admin valide et publie. Promotion/rétrogradation depuis `/admin/membres` (auditée).
- **Divulgation responsable (3.6)** : `/.well-known/security.txt` (RFC 9116, expiration glissante 6 mois, contact `SECURITY_CONTACT`) + page `/securite` (règles d'engagement).

### Vérifications effectuées

Build de production et ESLint sans erreur ; parcours HTTP vérifiés en local : toutes les routes publiques en 200, `/admin` et `/membre` redirigent sans session, en-tête CSP à nonce présent (sans `unsafe-inline` script), recherche full-text avec surlignage, sommaire/temps de lecture/RSS par catégorie rendus, inscription refusée avec un mot de passe compromis (HIBP), connexions des comptes seed OK (cookies `httpOnly`/`SameSite`), connexions tracées dans `AuditLog` avec IP, accès `/admin` bloqué sans 2FA, vues quotidiennes et référents enregistrés.

---

## 9. Internationalisation — CyberSphere v2.1 (bilingue FR/EN)

### 9.1 Objectif et principes

Le blog est servi en **français** (langue d'origine) et en **anglais**, avec
sélection automatique de la langue du visiteur. Deux principes directeurs :

1. **Qualité de traduction éditoriale** : rien n'est publié sans relecture
   humaine. L'interface (menus, formulaires, e-mails, messages d'erreur) est
   traduite à la main dans le code ; les **articles sont traduits par
   l'équipe** depuis l'administration — au besoin à partir d'un **brouillon
   pré-traduit par l'IA** (§ 9.4) qu'elle relit et corrige. Un article non
   traduit reste lisible : la version française est servie avec un bandeau
   « This article hasn't been translated into English yet ».
2. **URL propres et SEO** : le français vit sans préfixe (`/articles/...`),
   l'anglais sous `/en` (`/en/articles/...`). Chaque page déclare ses
   alternates `hreflang` (métadonnées article + sitemap), l'attribut
   `<html lang>` suit la langue servie.

### 9.2 Détection de la langue

- **`Accept-Language` plutôt que géolocalisation IP** : c'est la
  recommandation de la documentation Next.js, et c'est plus juste — un
  anglophone en France reçoit l'anglais, un francophone au Canada le français.
  Aucune base GeoIP, aucune donnée personnelle traitée (l'en-tête est déjà
  dans chaque requête).
- Ordre de priorité dans `src/proxy.ts` : **cookie `NEXT_LOCALE`** (posé par
  le sélecteur de langue, 1 an) → **négociation `Accept-Language`**
  (q-values) → français par défaut.
- Un visiteur anglophone arrivant sur `/…` est redirigé en **307** vers
  `/en/…` — uniquement pour les navigations HTML GET (les flux RSS, Server
  Actions et appels API ne sont jamais déviés). Le bouton FR/EN du header
  fixe le cookie puis navigue vers l'URL équivalente : le choix manuel
  l'emporte définitivement sur la langue du navigateur.

### 9.3 Routage (pattern officiel Next.js)

- Pages publiques déplacées sous `src/app/[locale]/…` ; `/admin`, `/api`,
  `/uploads`, `/.well-known`, `robots.txt` et `sitemap.xml` restent hors
  locale (l'administration demeure en français).
- Le proxy **réécrit** les chemins sans préfixe vers `/fr/…` en interne
  (l'URL visible ne change pas) et sert `/en/…` directement ; `/fr/…` public
  est canonisé en **308** vers la version sans préfixe. La garde
  d'authentification `/membre`–`/admin` et la CSP à nonces sont conservées à
  l'identique ; l'exclusion des préchargements `next/link` a été retirée du
  matcher (la réécriture de locale doit s'y appliquer).
- Les slugs d'articles sont **communs aux deux langues** : la bascule FR/EN
  transpose toujours l'URL courante, et `hreflang` se déduit trivialement.

### 9.4 Contenu traduit (données)

| Modèle | Mécanisme |
|---|---|
| `ArticleTranslation` | Nouvelle table : `articleId + locale` uniques, `title`, `excerpt`, `content`, `tsvector` **anglais** maintenu par trigger + index GIN |
| `Category.nameEn` | Champ optionnel (repli : nom français) |
| `Series.titleEn` / `descriptionEn` | Champs optionnels (repli : français) |
| `NewsletterSubscriber.locale` | Langue du site au moment de l'inscription → langue des e-mails |
| Tags | Non traduits (vocabulaire technique : `pentest`, `owasp`…) |

- **Saisie** : le formulaire article expose une section « Traduction
  anglaise » (titre, extrait, contenu Markdown) en **tout-ou-rien** — une
  traduction partielle est refusée pour ne jamais mélanger les langues.
  Supprimer les trois champs supprime la traduction. Champs anglais également
  disponibles sur les formulaires catégorie et série.
- **Pré-traduction IA** : le bouton « Pré-traduire avec l'IA » du formulaire
  article (`src/actions/translate.ts`) appelle l'**API Claude** (Anthropic)
  et remplit les trois champs anglais avec un **brouillon** — structure
  Markdown préservée, blocs de code et URLs intouchés — que l'auteur relit et
  corrige avant d'enregistrer. Aucune écriture en base par l'action ; session
  staff revérifiée côté serveur ; fonctionnalité désactivée si
  `ANTHROPIC_API_KEY` est vide (même convention que Turnstile/SMTP).
- **Recherche** : `/recherche` interroge le vecteur français de l'article ;
  `/en/recherche` interroge le vecteur **anglais** des traductions
  (`websearch_to_tsquery('english', …)`) — même pondération, mêmes extraits
  surlignés. La recherche anglaise ne couvre que les articles traduits
  (mention affichée sous le champ).
- **RSS** : tous les flux existent dans les deux langues (`/rss.xml`,
  `/en/rss.xml`, déclinaisons catégorie/tag) avec titres/extraits traduits
  quand ils existent.
- **E-mails** : vérification de compte et réinitialisation dans la langue de
  l'utilisateur (cookie, sinon page d'origine) ; newsletter dans la langue
  choisie à l'inscription, avec titre d'article traduit si disponible.

### 9.5 Interface traduite (code)

- `src/lib/i18n.ts` : primitives sans dépendance (locales, négociation
  `Accept-Language`, `localeHref`).
- `src/i18n/dictionaries.ts` : dictionnaires FR/EN typés (`en satisfies
  Dictionary`) pour le chrome et les composants client — le compilateur
  garantit qu'aucune clé ne manque en anglais.
- `I18nProvider` (contexte React) alimente les composants client
  (formulaires auth, espace membre, commentaires, réactions…) ; les pages
  serveur gardent leurs textes colocalisés dans un objet `copy` local.
- Dates formatées par `Intl.DateTimeFormat` (`fr-FR` / `en-GB`).

### 9.6 Vérifications effectuées (v2.1)

Build de production et ESLint sans erreur ; parcours HTTP vérifiés en local :
négociation `Accept-Language` (FR → 200, EN → 307 `/en`), cookie `NEXT_LOCALE`
prioritaire dans les deux sens, `/fr/*` → 308 canonique, `<html lang>` correct,
article traduit servi en anglais et article non traduit servi en français avec
bandeau, recherche anglaise sur le vecteur `english`, flux RSS `<language>`
fr/en avec titres traduits, sitemap avec alternates `hreflang`, gardes
`/en/membre` → `/en/connexion` et `/admin` → `/connexion`, `security.txt`
accessible hors locale, 404 localisées, en-tête CSP à nonce inchangé.
