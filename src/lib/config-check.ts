/**
 * Contrôle de configuration au démarrage du serveur de production
 * (src/instrumentation.ts). better-auth se contente d'un avertissement pour
 * un secret faible ; or avec un secret connu — la valeur d'exemple des
 * fichiers .env.*.example par exemple —, les liens de vérification d'e-mail
 * et d'aperçu deviennent forgeables et les secrets TOTP d'une sauvegarde
 * déchiffrables. Le serveur refuse donc de démarrer.
 */

/** Valeur de remplissage des fichiers d'exemple. */
const PLACEHOLDER = "CHANGEZ_MOI";
const MIN_SECRET_LENGTH = 32;

type ConfigEnv = Record<string, string | undefined>;

/** Problèmes de configuration bloquants (liste vide si tout va bien). */
export function productionConfigErrors(env: ConfigEnv): string[] {
  const errors: string[] = [];
  const secret = env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH || secret.includes(PLACEHOLDER)) {
    errors.push(
      `BETTER_AUTH_SECRET doit être une valeur aléatoire d'au moins ${MIN_SECRET_LENGTH} caractères (openssl rand -hex 32).`,
    );
  }
  if (env.DATABASE_URL?.includes(PLACEHOLDER)) {
    errors.push("DATABASE_URL contient encore le mot de passe d'exemple (POSTGRES_PASSWORD).");
  }
  return errors;
}

/**
 * Arrête le processus si la configuration est dangereuse. Un simple throw
 * dans register() laisserait le serveur tourner en répondant 500 à toutes
 * les requêtes, ce qui masquerait la cause : l'arrêt net la rend visible
 * (journaux, boucle de redémarrage du conteneur).
 */
export function enforceProductionConfig(env: ConfigEnv = process.env): void {
  const errors = productionConfigErrors(env);
  if (errors.length === 0) return;
  console.error(`✗ Configuration de production refusée :\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
