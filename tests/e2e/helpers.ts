import { randomBytes, randomInt } from "node:crypto";
import {
  test as base,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TOTP } from "otpauth";

/** Accès direct à la base : préparer les données et lire les jetons envoyés par e-mail. */
export const db = new PrismaClient();

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

/**
 * Chaque contexte simule un client distinct (IP via X-Forwarded-For, que le
 * serveur de test lit sans reverse proxy ; en production Caddy l'écrase).
 * Sans cela, le limiteur de débit de l'auth — légitimement — bloquerait
 * les dizaines de connexions enchaînées par la suite de tests.
 */
function clientHeaders(): Record<string, string> {
  return {
    "X-Forwarded-For": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
  };
}

/** Nouveau contexte navigateur, vu comme un client distinct. */
export function newClient(browser: Browser, options: BrowserContextOptions = {}) {
  return browser.newContext({ ...options, extraHTTPHeaders: clientHeaders() });
}

/** `test` avec page et requêtes API rattachées à un client distinct par test. */
export const test = base.extend({
  context: async ({ browser }, provide) => {
    const context = await newClient(browser);
    await provide(context);
    await context.close();
  },
  request: async ({ playwright }, provide) => {
    const request = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: clientHeaders(),
    });
    await provide(request);
    await request.dispose();
  },
});
export { expect };

export type TestUser = { id: string; email: string; password: string; name: string };

/** Identifiant unique : les parcours restent rejouables sur une même base. */
export function uid(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

/**
 * Crée un compte par l'API publique (mot de passe haché par better-auth,
 * hooks exécutés), puis le marque vérifié et lui attribue un rôle.
 * Mot de passe aléatoire : jamais présent dans Have I Been Pwned.
 */
export async function createUser(
  request: APIRequestContext,
  role: "user" | "author" | "admin" = "user",
): Promise<TestUser> {
  const id = uid();
  const user = {
    email: `e2e-${role}-${id}@cybersphere.test`,
    password: `E2e-${randomBytes(12).toString("base64url")}!`,
    name: `E2E ${role} ${id.slice(-4)}`,
  };
  const response = await request.post("/api/auth/sign-up/email", {
    data: user,
    headers: { Origin: BASE_URL },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const updated = await db.user.update({
    where: { email: user.email },
    data: { emailVerified: true, role },
  });
  return { ...user, id: updated.id };
}

/** Connexion par le formulaire ; s'arrête sur /deux-facteurs si la 2FA est active. */
export async function login(page: Page, user: TestUser, totpSecret?: string) {
  await page.goto("/connexion");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.locator('main form button[type="submit"]').click();
  if (totpSecret) {
    await page.waitForURL(/\/deux-facteurs/);
    await page.locator("#code").fill(await freshTotp(totpSecret));
    await page.locator('main form button[type="submit"]').click();
  }
  await expect(page.getByRole("link", { name: "Connexion" }).first()).toBeHidden();
}

/**
 * Code TOTP utilisable : on évite les dernières secondes d'une période, où
 * le code expirerait entre sa génération et sa vérification.
 */
export async function freshTotp(secret: string): Promise<string> {
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remaining < 5) await new Promise((resolve) => setTimeout(resolve, remaining * 1000 + 500));
  return new TOTP({ secret, digits: 6, period: 30, algorithm: "SHA1" }).generate();
}

/**
 * Active la 2FA depuis /membre comme un utilisateur réel. Le secret est lu
 * dans la réponse de l'API (celle qui alimente le QR code) pour calculer
 * les codes, à la manière d'une application d'authentification.
 */
export async function enableTwoFactor(page: Page, user: TestUser): Promise<string> {
  await page.goto("/membre");
  await page.locator("#enable-password").fill(user.password);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/two-factor/enable")),
    page.locator('form:has(#enable-password) button[type="submit"]').click(),
  ]);
  const { totpURI } = (await response.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret");
  if (!secret) throw new Error("Secret TOTP absent");
  await page.locator("#totp-confirm").fill(await freshTotp(secret));
  // L'activation remplace la session : attendre la réponse qui pose le
  // nouveau cookie avant toute navigation
  const [confirmation] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/two-factor/verify-totp")),
    page.locator('form:has(#totp-confirm) button[type="submit"]').click(),
  ]);
  expect(confirmation.ok()).toBeTruthy();
  await expect(page.locator("#disable-password")).toBeVisible();
  await expect
    .poll(async () => (await db.user.findUnique({ where: { id: user.id } }))?.twoFactorEnabled)
    .toBe(true);
  return secret;
}

/** Un article publié de la base (créé par le seed). */
export async function publishedArticle() {
  const article = await db.article.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, slug: true, title: true },
  });
  if (!article) throw new Error("Aucun article publié : lancez le seed avant les tests e2e.");
  return article;
}
