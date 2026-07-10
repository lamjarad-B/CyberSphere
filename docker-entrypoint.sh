#!/bin/sh
set -e

echo "→ Application des migrations Prisma…"
node node_modules/prisma/build/index.js migrate deploy

echo "→ Démarrage de CyberSphere…"
exec node server.js
