/**
 * Démarrage du serveur : en production, refuse une configuration dangereuse
 * (secret d'exemple ou trop court), puis lance les tâches de fond
 * (publication programmée, purge des données expirées). Node.js uniquement —
 * jamais pendant la build ni dans le runtime Edge. DISABLE_SCHEDULER=1
 * désactive les tâches (ex. instances secondaires, tests).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV === "production") {
    const { enforceProductionConfig } = await import("./lib/config-check");
    enforceProductionConfig();
  }
  if (process.env.DISABLE_SCHEDULER === "1") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
