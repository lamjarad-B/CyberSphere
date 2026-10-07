import { defineConfig, devices } from "@playwright/test";

/**
 * Parcours de bout en bout contre un serveur de production local (build +
 * start) et une base PostgreSQL migrée et seedée — cf. README, « Tests ».
 * L'URL doit correspondre à BETTER_AUTH_URL (origine approuvée).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "tests/e2e",
  // Les parcours partagent la base et le limiteur de débit de l'auth :
  // exécution séquentielle, plus lisible et sans interférences.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx next start -p 3001",
    url: `${baseURL}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
  },
});
