import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    env: {
      // Secret factice : les jetons d'aperçu exigent un secret (lib/draft-preview)
      BETTER_AUTH_SECRET: "secret-de-test-unitaire-uniquement",
    },
  },
});
