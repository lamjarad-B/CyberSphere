import { publishDueArticles, purgeStaleData } from "./maintenance";

const PUBLISH_EVERY_MS = 60 * 1000; // publication programmée : à la minute
const PURGE_EVERY_MS = 6 * 3600 * 1000; // purge : 4 fois par jour

const globalForScheduler = globalThis as unknown as { cybersphereScheduler?: boolean };

/**
 * Tâches de fond in-process, démarrées par src/instrumentation.ts. Pas de
 * cron externe à déployer ; les opérations sont idempotentes, donc sans
 * risque si plusieurs instances tournent.
 */
export function startScheduler(): void {
  // Le rechargement à chaud du dev réévalue le module : un seul démarrage
  if (globalForScheduler.cybersphereScheduler) return;
  globalForScheduler.cybersphereScheduler = true;

  const publish = () =>
    publishDueArticles()
      .then((count) => {
        if (count > 0) console.log(`[programmation] ${count} article(s) publié(s)`);
      })
      .catch((error) => console.error("[programmation] échec :", error));

  const purge = () =>
    purgeStaleData()
      .then((counts) => {
        if (Object.values(counts).some((n) => n > 0)) {
          console.log("[maintenance] purge :", counts);
        }
      })
      .catch((error) => console.error("[maintenance] échec de la purge :", error));

  // Premier passage peu après le démarrage (base potentiellement en cours de migration)
  setTimeout(() => {
    void publish();
    void purge();
  }, 15_000).unref();
  setInterval(publish, PUBLISH_EVERY_MS).unref();
  setInterval(purge, PURGE_EVERY_MS).unref();
}
