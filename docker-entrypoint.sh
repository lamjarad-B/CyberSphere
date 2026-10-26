#!/bin/sh
set -e

PRISMA="/prisma-cli/node_modules/.bin/prisma"
SCHEMA="/app/prisma/schema.prisma"
MAX_RETRIES="${MIGRATE_MAX_RETRIES:-10}"
RETRY_DELAY="${MIGRATE_RETRY_DELAY:-3}"

echo "→ Application des migrations Prisma…"

# Réessaie tant que la base n'est pas joignable (démarrage concurrent en Compose)
i=1
until "$PRISMA" migrate deploy --schema "$SCHEMA"; do
  if [ "$i" -ge "$MAX_RETRIES" ]; then
    echo "✗ Échec des migrations après $MAX_RETRIES tentatives." >&2
    exit 1
  fi
  echo "  Base indisponible ou migration en échec, nouvelle tentative dans ${RETRY_DELAY}s ($i/$MAX_RETRIES)…"
  i=$((i + 1))
  sleep "$RETRY_DELAY"
done

echo "✓ Migrations appliquées."

echo "→ Démarrage du serveur Next.js sur ${HOSTNAME:-0.0.0.0}:${PORT:-3000}…"
# exec : node devient PID 1 et reçoit directement SIGTERM (arrêt propre)
exec node server.js "$@"
