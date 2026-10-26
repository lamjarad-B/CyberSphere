# syntax=docker/dockerfile:1

# ---------- Étape 1 : dépendances ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# openssl est requis par les moteurs Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Étape 2 : build ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* est figé au build : fournir l'URL publique via un build arg
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

# ---------- Étape 3 : CLI Prisma isolé (pour les migrations) ----------
# Arbre de dépendances complet du CLI (effect, c12, jiti…), indépendant du
# node_modules minimal du standalone Next.
FROM node:22-bookworm-slim AS prisma-cli
WORKDIR /prisma-cli
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package-lock.json /tmp/package-lock.json
# Version exacte issue du lockfile, pour rester aligné avec le client généré
RUN V=$(node -p "require('/tmp/package-lock.json').packages['node_modules/prisma'].version") \
  && npm init -y >/dev/null \
  && npm install --no-audit --no-fund prisma@$V

# ---------- Étape 4 : exécution ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur non-root
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Sortie autonome de Next (serveur + node_modules minimal)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Client Prisma généré (runtime de l'application)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/prisma ./prisma

# CLI Prisma complet, isolé, pour appliquer les migrations au démarrage
COPY --from=prisma-cli /prisma-cli/node_modules /prisma-cli/node_modules

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Répertoire des fichiers téléversés (monté en volume)
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads /app/prisma

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
