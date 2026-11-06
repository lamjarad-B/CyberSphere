import { randomInt } from "node:crypto";
import type {
  APIRequestContext,
  Browser,
  Locator,
  Page,
  PlaywrightWorkerArgs,
} from "@playwright/test";
import { solveChallenge, type Challenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import {
  BASE_URL,
  createUser,
  db,
  enableTwoFactor,
  expect,
  login,
  newClient,
  publishedArticle,
  test,
  uid,
} from "./helpers";

const DEFI = "/api/commentaires/defi";
const SUCCESS = "Merci ! Votre commentaire est publié.";
const NAME_PREFIX = "Lecteur e2e";
const EMAIL_PREFIX = "e2e-guest-";
// La preuve de travail se calcule avant l'envoi : bien au-delà des 5 s d'un expect
const POW_TIMEOUT = 45_000;

type Guest = { name: string; email: string; content: string };

function newGuest(): Guest {
  const id = uid();
  return {
    name: `${NAME_PREFIX} ${id}`,
    email: `${EMAIL_PREFIX}${id}@cybersphere.test`,
    content: `Commentaire invité e2e ${id}`,
  };
}

function randomIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

/** Client HTTP nu, vu comme une IP distincte : le limiteur ne fausse pas le test. */
function apiClient(playwright: PlaywrightWorkerArgs["playwright"], ip = randomIp()) {
  return playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "X-Forwarded-For": ip },
  });
}

function guestForm(page: Page): Locator {
  return page.locator("form").filter({ has: page.getByLabel(/^Votre commentaire/) });
}

function replyForm(page: Page): Locator {
  return page.locator("form").filter({ has: page.getByLabel(/^Votre réponse à/) });
}

/** Limité à la section : Next.js ajoute son propre role="alert" (annonce de route). */
function commentAlert(page: Page): Locator {
  return page.getByRole("region", { name: "Commentaires" }).getByRole("alert");
}

/** Plus petit bloc de la page qui contient ce texte et ce badge « Invité ». */
function guestBlock(page: Page, content: string): Locator {
  return page
    .locator("div")
    .filter({ hasText: content })
    .filter({ has: page.getByText("Invité", { exact: true }) })
    .last();
}

async function fillGuestForm(form: Locator, guest: Guest, options: { newsletter?: boolean } = {}) {
  const content = form.getByLabel(/^(Votre commentaire|Votre réponse à)/);
  // Le widget se charge au premier focus. Une saisie antérieure à l'hydratation
  // ne le déclenche pas : on refait le focus jusqu'à ce qu'il apparaisse.
  await expect(async () => {
    await content.blur();
    await content.fill(guest.content);
    await expect(form.getByText("Je ne suis pas un robot")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await form.getByLabel(/^Nom/).fill(guest.name);
  await form.getByLabel(/^E-mail/).fill(guest.email);
  if (options.newsletter) await form.getByLabel(/^Recevoir la newsletter/).check();
}

async function send(form: Locator) {
  await form.getByRole("button", { name: "Envoyer le commentaire" }).click();
}

async function expectSent(page: Page) {
  await expect(page.getByText(SUCCESS)).toBeVisible({ timeout: POW_TIMEOUT });
}

async function openArticle(page: Page) {
  const article = await publishedArticle();
  await page.goto(`/articles/${article.slug}`);
  return article;
}

async function openAdmin(browser: Browser, request: APIRequestContext) {
  const admin = await createUser(request, "admin");
  const context = await newClient(browser);
  const page = await context.newPage();
  await login(page, admin);
  await enableTwoFactor(page, admin);
  return { page, close: () => context.close() };
}

async function deleteGuestData() {
  // Les réponses partent en cascade
  await db.comment.deleteMany({ where: { guestName: { startsWith: NAME_PREFIX } } });
  await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

function collectCspErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      errors.push(message.text());
    }
  });
  return errors;
}

type CapturedAction = { url: string; headers: Record<string, string>; body: string };

/** Mémorise les Server Actions postées par la page, pour les rejouer à la main. */
function captureActions(page: Page): () => Promise<CapturedAction[]> {
  const captured: Promise<CapturedAction>[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.headers()["next-action"]) return;
    captured.push(
      request.allHeaders().then((all) => {
        const headers: Record<string, string> = { origin: new URL(request.url()).origin };
        for (const name of ["next-action", "content-type", "accept", "next-router-state-tree"]) {
          if (all[name]) headers[name] = all[name];
        }
        return { url: request.url(), headers, body: request.postData() ?? "" };
      }),
    );
  });
  return () => Promise.all(captured);
}

/** Envoie un vrai commentaire et renvoie la requête émise par le navigateur. */
async function submitAndCapture(browser: Browser, guest: Guest) {
  const context = await newClient(browser);
  const page = await context.newPage();
  const actions = captureActions(page);
  await openArticle(page);
  await fillGuestForm(guestForm(page), guest);
  await send(guestForm(page));
  await expectSent(page);
  const action = (await actions()).find((candidate) => candidate.body.includes(guest.content));
  if (!action) throw new Error("Server Action de commentaire non capturée");
  expect(JSON.parse(action.body)[0]).toHaveProperty("captcha");
  return { action, context, page };
}

function replay(client: APIRequestContext, action: CapturedAction, body = action.body) {
  return client.fetch(action.url, { method: "POST", headers: action.headers, data: body });
}

/** Corps de la requête capturée, avec certains champs du formulaire remplacés. */
function patched(action: CapturedAction, fields: Record<string, unknown>): string {
  const [input] = JSON.parse(action.body) as [Record<string, unknown>];
  return JSON.stringify([{ ...input, ...fields }]);
}

function encodeProof(proof: unknown): string {
  return Buffer.from(JSON.stringify(proof)).toString("base64");
}

/** Preuve authentique et neuve, calculée côté test : rien d'autre ne bloque la requête. */
async function solvedProof(client: APIRequestContext): Promise<string> {
  const challenge = (await (await client.get(DEFI)).json()) as Challenge;
  const solution = await solveChallenge({ challenge, deriveKey });
  return encodeProof({ challenge, solution });
}

test.describe("Commentaires sans compte", () => {
  test.afterEach(deleteGuestData);

  test("parcours nominal : publié aussitôt, e-mail jamais exposé, CSP respectée", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const guest = newGuest();
    const ip = randomIp();
    const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": ip } });
    const page = await context.newPage();
    const cspErrors = collectCspErrors(page);
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));

    const article = await openArticle(page);
    await expect(page.getByRole("heading", { name: "Laisser un commentaire" })).toBeVisible();
    await fillGuestForm(guestForm(page), guest, { newsletter: true });
    await send(guestForm(page));
    await expectSent(page);

    // La preuve a bien été calculée par un worker servi par le site
    expect(workers.length).toBeGreaterThan(0);
    for (const url of workers) expect(url.startsWith(BASE_URL)).toBe(true);

    // En ligne sans rechargement, puis toujours après rechargement
    await expect(guestBlock(page, guest.content)).toContainText(guest.name);
    await page.reload();
    const block = guestBlock(page, guest.content);
    await expect(block).toContainText(guest.name);
    await expect(block.getByText("Invité", { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(guest.email);

    const comment = await db.comment.findFirstOrThrow({ where: { guestEmail: guest.email } });
    expect(comment).toMatchObject({
      status: "APPROVED",
      authorId: null,
      articleId: article.id,
      guestName: guest.name,
      content: guest.content,
      newsletterOptIn: true,
    });
    expect(comment.guestIpHash).toBeTruthy();
    expect(comment.guestIpHash).not.toContain(ip);

    // La case attend 24 h : supprimer le commentaire d'ici là annule l'inscription
    expect(await db.newsletterSubscriber.count({ where: { email: guest.email } })).toBe(0);

    // L'e-mail reste, réservé aux admins
    const admin = await openAdmin(browser, request);
    const adminCspErrors = collectCspErrors(admin.page);
    await admin.page.goto("/admin/commentaires");
    await expect(admin.page.locator("li").filter({ hasText: guest.content })).toContainText(guest.email);
    await admin.close();

    expect(cspErrors).toEqual([]);
    expect(adminCspErrors).toEqual([]);
    await context.close();
  });

  test("formulaire : pas de champ « Site web », newsletter décochée, pot de miel caché", async ({
    page,
  }) => {
    await openArticle(page);
    const form = guestForm(page);
    await expect(form.getByLabel(/site web/i)).toHaveCount(0);
    await expect(form.getByLabel(/^Recevoir la newsletter/)).not.toBeChecked();
    await expect(form.locator('input[name="website"]')).toBeHidden();
    await expect(form.getByLabel(/^Nom/)).toHaveAttribute("required", "");
    await expect(form.getByLabel(/^E-mail/)).toHaveAttribute("required", "");
  });

  test("rejeu : une preuve ne sert qu'une fois, depuis n'importe quel client", async ({
    browser,
    playwright,
  }) => {
    test.setTimeout(120_000);
    const guest = newGuest();
    const { action, context, page } = await submitAndCapture(browser, guest);

    // La requête à l'identique, depuis le même client
    const same = await replay(page.request, action);
    expect(await same.text()).toContain('"ok":false');
    expect(await db.comment.count({ where: { guestEmail: guest.email } })).toBe(1);

    // La même preuve avec un autre texte, depuis une autre IP : le filtre sur
    // les doublons ne peut pas masquer un rejeu accepté
    const other = await apiClient(playwright);
    const content = `${guest.content} rejeu`;
    const elsewhere = await replay(other, action, patched(action, { content }));
    expect(await elsewhere.text()).toContain('"ok":false');
    expect(await db.comment.count({ where: { content } })).toBe(0);

    await other.dispose();
    await context.close();
  });

  test("sans preuve valide : aucune ligne créée", async ({ browser, playwright }) => {
    test.setTimeout(120_000);
    const guest = newGuest();
    const { action, context } = await submitAndCapture(browser, guest);

    const probe = await apiClient(playwright);
    const challenge = (await (await probe.get(DEFI)).json()) as Challenge;
    await probe.dispose();
    const wrongSolution = { counter: 0, derivedKey: "00".repeat(32) };

    const proofs: [string, unknown][] = [
      ["mode test du widget", encodeProof({ challenge: null, solution: null, test: true })],
      ["vide", ""],
      ["objet à la place du texte", { not: "" }],
      ["défi signé, solution fausse", encodeProof({ challenge, solution: wrongSolution })],
      [
        "défi altéré",
        encodeProof({
          challenge: { ...challenge, parameters: { ...challenge.parameters, cost: 1 } },
          solution: wrongSolution,
        }),
      ],
      ["signature absente", encodeProof({ challenge: { parameters: challenge.parameters }, solution: wrongSolution })],
    ];

    for (const [index, [label, captcha]] of proofs.entries()) {
      // Un client par essai : le limiteur par IP ne doit pas répondre à la place du CAPTCHA
      const client = await apiClient(playwright);
      const content = `${guest.content} preuve ${index}`;
      const response = await replay(client, action, patched(action, { content, captcha }));
      expect(await response.text(), label).toContain('"ok":false');
      expect(await db.comment.count({ where: { content } }), label).toBe(0);
      await client.dispose();
    }
    await context.close();
  });

  test("une preuve authentique ne contourne rien : statut forcé, parent masqué, origine, type", async ({
    browser,
    playwright,
  }) => {
    test.setTimeout(240_000);
    const seed = newGuest();
    const { action, context } = await submitAndCapture(browser, seed);
    const article = await publishedArticle();
    const someone = await db.user.findFirstOrThrow({ select: { id: true } });

    // Affectation de masse : les champs ajoutés au corps sont ignorés
    const forced = newGuest();
    const forcedClient = await apiClient(playwright);
    const forcedResponse = await replay(
      forcedClient,
      action,
      patched(action, {
        ...forced,
        captcha: await solvedProof(forcedClient),
        status: "HIDDEN",
        authorId: someone.id,
        guestIpHash: "falsifie",
      }),
    );
    expect(await forcedResponse.text()).toContain('"ok":true');
    const row = await db.comment.findFirstOrThrow({ where: { content: forced.content } });
    expect(row).toMatchObject({ status: "APPROVED", authorId: null });
    expect(row.guestIpHash).not.toBe("falsifie");
    await forcedClient.dispose();

    // Répondre à un commentaire masqué reste impossible
    const hidden = await db.comment.create({
      data: {
        content: `${seed.content} parent`,
        status: "HIDDEN",
        articleId: article.id,
        guestName: seed.name,
      },
    });
    const replyGuest = newGuest();
    const replyClient = await apiClient(playwright);
    const replyResponse = await replay(
      replyClient,
      action,
      patched(action, {
        ...replyGuest,
        parentId: hidden.id,
        captcha: await solvedProof(replyClient),
      }),
    );
    expect(await replyResponse.text()).toContain('"ok":false');
    expect(await db.comment.count({ where: { content: replyGuest.content } })).toBe(0);
    await replyClient.dispose();

    // CSRF : Next.js refuse l'origine étrangère, même avec une preuve valable
    const csrf = newGuest();
    const csrfClient = await apiClient(playwright);
    const csrfResponse = await replay(
      csrfClient,
      { ...action, headers: { ...action.headers, origin: "https://evil.example" } },
      patched(action, { ...csrf, captcha: await solvedProof(csrfClient) }),
    );
    expect(await csrfResponse.text()).not.toContain('"ok":true');
    expect(await db.comment.count({ where: { content: csrf.content } })).toBe(0);
    await csrfClient.dispose();

    // Un filtre Prisma à la place d'un texte n'atteint pas la base
    const typed = newGuest();
    const typedClient = await apiClient(playwright);
    const typedResponse = await replay(
      typedClient,
      action,
      patched(action, { ...typed, email: { not: "" } }),
    );
    expect(await typedResponse.text()).toContain('"ok":false');
    expect(await db.comment.count({ where: { content: typed.content } })).toBe(0);
    await typedClient.dispose();

    await context.close();
  });

  test("injection : le HTML reste du texte, côté public comme en administration", async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const guest = {
      ...newGuest(),
      content: `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script> ${uid()}`,
    };
    const xss = (target: Page) =>
      target.evaluate(() => (window as unknown as { __xss?: number }).__xss);

    await openArticle(page);
    await fillGuestForm(guestForm(page), guest);
    await send(guestForm(page));
    await expectSent(page);
    await page.reload();
    await expect(page.getByText(guest.content)).toBeVisible();
    expect(await xss(page)).toBeUndefined();

    const admin = await openAdmin(browser, request);
    await admin.page.goto("/admin/commentaires");
    await expect(admin.page.getByText(guest.content)).toBeVisible();
    expect(await xss(admin.page)).toBeUndefined();
    await admin.close();
  });

  for (const name of ["<b>x</b>", "http://spam.example"]) {
    test(`nom refusé : ${name}`, async ({ page }) => {
      const guest = { ...newGuest(), name };
      await openArticle(page);
      await fillGuestForm(guestForm(page), guest);
      await send(guestForm(page));
      await expect(commentAlert(page)).toBeVisible({ timeout: POW_TIMEOUT });
      expect(await db.comment.count({ where: { guestEmail: guest.email } })).toBe(0);
    });
  }

  test("pot de miel : réponse de succès, rien en base", async ({ page }) => {
    const guest = newGuest();
    await openArticle(page);
    const form = guestForm(page);
    await fillGuestForm(form, guest);
    await form.locator('input[name="website"]').evaluate((input: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "https://spam.example");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await send(form);
    await expectSent(page);
    expect(await db.comment.count({ where: { guestEmail: guest.email } })).toBe(0);
  });

  test("quota : 5 commentaires par jour pour un e-mail, même depuis une autre IP", async ({
    page,
  }) => {
    const article = await publishedArticle();
    const guest = newGuest();
    await db.comment.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        content: `${guest.content} n°${index}`,
        articleId: article.id,
        guestName: guest.name,
        guestEmail: guest.email,
      })),
    });
    await openArticle(page);
    await fillGuestForm(guestForm(page), guest);
    await send(guestForm(page));
    await expect(commentAlert(page)).toBeVisible({ timeout: POW_TIMEOUT });
    expect(await db.comment.count({ where: { guestEmail: guest.email } })).toBe(5);
  });

  test("réponse : publiée aussitôt, rattachée au parent", async ({ page }) => {
    test.setTimeout(120_000);
    const article = await publishedArticle();
    const author = newGuest();
    const parent = await db.comment.create({
      data: {
        content: author.content,
        articleId: article.id,
        guestName: author.name,
        status: "APPROVED",
      },
    });

    await page.goto(`/articles/${article.slug}`);
    await page
      .locator("div")
      .filter({ hasText: author.content })
      .filter({ has: page.getByRole("button", { name: "Répondre" }) })
      .last()
      .getByRole("button", { name: "Répondre" })
      .click();

    const guest = newGuest();
    await fillGuestForm(replyForm(page), guest);
    await send(replyForm(page));
    await expectSent(page);

    await page.reload();
    await expect(page.getByText(author.content)).toBeVisible();
    await expect(page.getByText(guest.content)).toBeVisible();
    expect(await db.comment.findFirstOrThrow({ where: { guestEmail: guest.email } })).toMatchObject({
      status: "APPROVED",
      parentId: parent.id,
    });
  });

  test("endpoint de défi : signé, jamais en cache, limité par IP", async ({ playwright }) => {
    const client = await apiClient(playwright);

    const first = await client.get(DEFI);
    expect(first.status()).toBe(200);
    expect(first.headers()["cache-control"]).toContain("no-store");
    expect(first.headers()["access-control-allow-origin"]).toBeUndefined();
    const challenge = (await first.json()) as Challenge & { parameters: { counter?: number } };
    expect(challenge.parameters.algorithm).toBe("PBKDF2/SHA-256");
    expect(challenge.signature).toBeTruthy();
    expect(challenge.parameters.keySignature).toBeTruthy();
    // Le compteur est la solution : il ne doit jamais quitter le serveur
    expect(challenge.parameters.counter).toBeUndefined();
    const expiresAt = challenge.parameters.expiresAt ?? 0;
    expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(expiresAt).toBeLessThan(Date.now() / 1000 + 3600);

    const second = (await (await client.get(DEFI)).json()) as Challenge;
    expect(second.parameters.nonce).not.toBe(challenge.parameters.nonce);

    for (let call = 3; call <= 20; call++) {
      expect((await client.get(DEFI)).status(), `appel ${call}`).toBe(200);
    }
    const limited = await client.get(DEFI);
    expect(limited.status()).toBe(429);
    expect(limited.headers()["cache-control"]).toContain("no-store");
    await client.dispose();
  });

  test("CSP : workers du site uniquement, ni WASM ni eval", async ({ page }) => {
    const article = await publishedArticle();
    const response = await page.goto(`/articles/${article.slug}`);
    const csp = response?.headers()["content-security-policy"] ?? "";
    const directives = new Map(
      csp.split(";").map((directive) => {
        const [name, ...values] = directive.trim().split(/\s+/);
        return [name, values.join(" ")] as const;
      }),
    );
    // blob: reste permis sur img-src : seul worker-src est concerné ici
    expect(directives.get("worker-src")).toBe("'self'");
    expect(directives.get("connect-src")).toBe("'self'");
    expect(csp).not.toContain("wasm-unsafe-eval");
    expect(directives.get("script-src")).not.toContain("'unsafe-inline'");
    expect(directives.get("script-src")).not.toContain("'unsafe-eval'");
  });

  test("membre connecté : formulaire inchangé, publication immédiate", async ({ page }) => {
    const user = await createUser(page.request);
    await login(page, user);
    await openArticle(page);
    const section = page.getByRole("region", { name: "Commentaires" });
    await expect(section.getByLabel("Votre commentaire")).toBeVisible();
    await expect(section.getByLabel(/^Nom/)).toHaveCount(0);
    await expect(section.getByLabel(/^E-mail/)).toHaveCount(0);

    const text = `Commentaire membre e2e ${uid()}`;
    await section.getByLabel("Votre commentaire").fill(text);
    await section.getByRole("button", { name: "Publier" }).click();
    // React recopie la saisie dans le contenu du textarea : getByText(text) le
    // trouverait avant la réponse du serveur. Le champ vidé signe le succès.
    await expect(section.getByLabel("Votre commentaire")).toHaveValue("");
    await expect(section.locator("p", { hasText: text })).toBeVisible();
    expect(await db.comment.findFirstOrThrow({ where: { content: text } })).toMatchObject({
      status: "APPROVED",
      authorId: user.id,
      guestName: null,
      guestEmail: null,
    });
    await db.comment.deleteMany({ where: { content: text } });
  });

  test("autorisation : masquer un commentaire est réservé aux admins", async ({
    browser,
    playwright,
    request,
  }) => {
    test.setTimeout(180_000);
    const article = await publishedArticle();
    const guest = newGuest();
    const comment = await db.comment.create({
      data: {
        content: guest.content,
        status: "APPROVED",
        articleId: article.id,
        guestName: guest.name,
        guestEmail: guest.email,
        guestIpHash: `hash-${uid()}`,
      },
    });
    const status = async () =>
      (await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).status;

    // La vraie requête de masquage, interceptée avant d'atteindre le serveur
    const admin = await openAdmin(browser, request);
    const actions = captureActions(admin.page);
    await admin.page.route("**/admin/commentaires**", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await admin.page.goto("/admin/commentaires");
    await admin.page
      .locator("li")
      .filter({ hasText: guest.content })
      .getByRole("button", { name: "Masquer" })
      .click();
    await expect.poll(async () => (await actions()).length).toBe(1);
    const [hide] = await actions();
    expect(await status()).toBe("APPROVED");

    for (const role of ["user", "author"] as const) {
      const user = await createUser(request, role);
      const context = await newClient(browser);
      const page = await context.newPage();
      await login(page, user);
      await page.goto("/admin/commentaires");
      // Le texte est public, l'e-mail non
      expect(await page.content(), role).not.toContain(guest.email);
      await replay(page.request, hide);
      expect(await status(), role).toBe("APPROVED");
      await context.close();
    }

    // Sans session : le proxy renvoie vers la connexion, rien n'est exécuté
    const anonymous = await apiClient(playwright);
    await replay(anonymous, hide);
    expect(await status()).toBe("APPROVED");
    await anonymous.dispose();

    // Contre-épreuve : la même requête aboutit avec la session de l'admin
    await replay(admin.page.request, hide);
    await expect.poll(status).toBe("HIDDEN");
    await admin.close();
  });

  test("après publication : masquer, réafficher, supprimer", async ({ browser, page, request }) => {
    test.setTimeout(120_000);
    const article = await publishedArticle();
    const guest = newGuest();
    const comment = await db.comment.create({
      data: {
        content: guest.content,
        status: "APPROVED",
        articleId: article.id,
        guestName: guest.name,
        guestEmail: guest.email,
      },
    });
    const status = async () =>
      (await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).status;
    await openArticle(page);
    await expect(page.getByText(guest.content)).toBeVisible();

    const admin = await openAdmin(browser, request);
    admin.page.on("dialog", (dialog) => void dialog.accept());
    await admin.page.goto("/admin/commentaires");
    const published = admin.page.locator("li").filter({ hasText: guest.content });
    await expect(published).toContainText(guest.email);
    await expect(published.getByRole("button", { name: "Réafficher" })).toHaveCount(0);

    // Masqué : retiré du site, conservé en administration
    await published.getByRole("button", { name: "Masquer" }).click();
    await expect(published).toBeHidden();
    expect(await status()).toBe("HIDDEN");
    await page.reload();
    await expect(page.getByText(guest.content)).toBeHidden();

    // Réaffiché : de retour sur le site
    await admin.page.getByRole("link", { name: /Masqués/ }).click();
    const hidden = admin.page.locator("li").filter({ hasText: guest.content });
    await hidden.getByRole("button", { name: "Réafficher" }).click();
    await expect(hidden).toBeHidden();
    expect(await status()).toBe("APPROVED");
    await page.reload();
    await expect(page.getByText(guest.content)).toBeVisible();

    for (const action of ["commentaire.masquage", "commentaire.reaffichage"]) {
      expect(await db.auditLog.count({ where: { action, targetId: comment.id } }), action).toBe(1);
    }

    // Supprimé : plus rien en base, l'e-mail part avec le commentaire
    await admin.page.getByRole("link", { name: /Publiés/ }).click();
    const again = admin.page.locator("li").filter({ hasText: guest.content });
    await again.getByRole("button", { name: "Supprimer" }).click();
    await expect(again).toBeHidden();
    expect(await db.comment.count({ where: { guestEmail: guest.email } })).toBe(0);
    await admin.close();
  });

  test("suppression groupée : réservée aux admins, seule la sélection disparaît", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const article = await publishedArticle();
    const [first, second, kept] = [newGuest(), newGuest(), newGuest()];
    const emails = [first.email, second.email, kept.email];
    for (const guest of [first, second, kept]) {
      await db.comment.create({
        data: {
          content: guest.content,
          status: "APPROVED",
          articleId: article.id,
          guestName: guest.name,
          guestEmail: guest.email,
        },
      });
    }
    const remaining = () => db.comment.count({ where: { guestEmail: { in: emails } } });

    const admin = await openAdmin(browser, request);
    admin.page.on("dialog", (dialog) => void dialog.accept());
    const actions = captureActions(admin.page);
    const open = async () => {
      await admin.page.goto("/admin/commentaires");
      await admin.page.waitForLoadState("networkidle");
    };
    const checkbox = (guest: Guest) =>
      admin.page.getByRole("checkbox", { name: `Sélectionner le commentaire de ${guest.name}` });
    const deleteSelection = admin.page.getByRole("button", { name: /^Supprimer la sélection/ });

    // La vraie requête, interceptée puis rejouée par un membre : rien ne disparaît
    await admin.page.route("**/admin/commentaires**", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await open();
    await expect(deleteSelection).toBeDisabled();
    await checkbox(first).check();
    await deleteSelection.click();
    await expect.poll(async () => (await actions()).length).toBe(1);
    const [bulk] = await actions();
    const member = await createUser(request, "user");
    const memberContext = await newClient(browser);
    const memberPage = await memberContext.newPage();
    await login(memberPage, member);
    await replay(memberPage.request, bulk);
    expect(await remaining()).toBe(3);
    await memberContext.close();
    await admin.page.unroute("**/admin/commentaires**");

    // « Tout sélectionner » coche et décoche toute la page
    await open();
    const selectAll = admin.page.getByLabel("Tout sélectionner sur cette page");
    await selectAll.check();
    await expect(checkbox(kept)).toBeChecked();
    await selectAll.uncheck();
    await expect(checkbox(kept)).not.toBeChecked();
    await expect(deleteSelection).toHaveText("Supprimer la sélection (0)");

    await checkbox(first).check();
    await checkbox(second).check();
    await expect(deleteSelection).toHaveText("Supprimer la sélection (2)");
    await deleteSelection.click();
    await expect(admin.page.getByText(first.content)).toBeHidden();
    await expect(admin.page.getByText(second.content)).toBeHidden();
    await expect(admin.page.getByText(kept.content)).toBeVisible();
    await expect(deleteSelection).toHaveText("Supprimer la sélection (0)");
    expect(await remaining()).toBe(1);
    expect(await db.comment.count({ where: { guestEmail: kept.email } })).toBe(1);
    expect(
      await db.auditLog.count({
        where: { action: "commentaire.suppression_groupee", detail: "2 commentaire(s) supprimé(s)" },
      }),
    ).toBeGreaterThan(0);
    await admin.close();
  });
});
