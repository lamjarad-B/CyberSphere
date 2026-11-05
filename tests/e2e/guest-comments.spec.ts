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
const SUCCESS = "Merci ! Votre commentaire sera publié après relecture.";
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

async function approve(adminPage: Page, content: string) {
  await adminPage.goto("/admin/commentaires");
  const row = adminPage.locator("li").filter({ hasText: content });
  await row.getByRole("button", { name: "Approuver" }).click();
  await expect(row).toBeHidden();
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
  test.afterEach(async () => {
    // Les réponses partent en cascade ; l'e-mail d'un commentaire approuvé est
    // déjà effacé, d'où le filtre sur le nom
    await db.comment.deleteMany({ where: { guestName: { startsWith: NAME_PREFIX } } });
    await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  test("parcours nominal : relu avant publication, e-mail jamais exposé, CSP respectée", async ({
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

    // En attente : invisible, même pour son auteur après rechargement
    await page.reload();
    await expect(guestForm(page)).toBeVisible();
    await expect(page.getByText(guest.content)).toBeHidden();
    expect(await page.content()).not.toContain(guest.email);

    const pending = await db.comment.findFirstOrThrow({ where: { guestEmail: guest.email } });
    expect(pending).toMatchObject({
      status: "PENDING",
      authorId: null,
      articleId: article.id,
      guestName: guest.name,
      content: guest.content,
      newsletterOptIn: true,
    });
    expect(pending.guestIpHash).toBeTruthy();
    expect(pending.guestIpHash).not.toContain(ip);

    // Aucun e-mail ne part vers une adresse non vérifiée avant la relecture humaine
    expect(await db.newsletterSubscriber.count({ where: { email: guest.email } })).toBe(0);

    const admin = await openAdmin(browser, request);
    const adminCspErrors = collectCspErrors(admin.page);
    await admin.page.goto("/admin/commentaires");
    const row = admin.page.locator("li").filter({ hasText: guest.content });
    await expect(row).toContainText(guest.email);
    await approve(admin.page, guest.content);
    await admin.page.getByRole("link", { name: /Publiés/ }).click();
    await expect(admin.page.locator("li").filter({ hasText: guest.content })).toContainText(guest.email);
    await admin.close();

    await page.reload();
    const block = guestBlock(page, guest.content);
    await expect(block).toContainText(guest.name);
    await expect(block.getByText("Invité", { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(guest.email);

    // L'e-mail reste, réservé aux admins ; l'empreinte d'IP est effacée
    const approved = await db.comment.findUniqueOrThrow({ where: { id: pending.id } });
    expect(approved).toMatchObject({
      status: "APPROVED",
      guestEmail: guest.email,
      guestIpHash: null,
      newsletterOptIn: false,
    });

    // L'inscription part après la réponse (after()) et reste en double opt-in
    await expect
      .poll(async () => db.newsletterSubscriber.findUnique({ where: { email: guest.email } }))
      .toMatchObject({ confirmed: false });
    const { token } = await db.newsletterSubscriber.findUniqueOrThrow({
      where: { email: guest.email },
    });
    await page.goto(`/newsletter/confirmation?jeton=${token}`);
    await page.getByRole("button", { name: "Confirmer mon inscription" }).click();
    await expect(page.getByRole("heading", { name: /Inscription confirmée/ })).toBeVisible();
    expect(
      (await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: guest.email } })).confirmed,
    ).toBe(true);
    expect(
      await db.auditLog.count({
        where: { action: "commentaire.approbation", targetId: pending.id },
      }),
    ).toBe(1);

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

  test("une preuve authentique ne contourne rien : statut forcé, parent en attente, origine, type", async ({
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
        status: "APPROVED",
        authorId: someone.id,
        guestIpHash: "falsifie",
      }),
    );
    expect(await forcedResponse.text()).toContain('"ok":true');
    const row = await db.comment.findFirstOrThrow({ where: { content: forced.content } });
    expect(row).toMatchObject({ status: "PENDING", authorId: null });
    expect(row.guestIpHash).not.toBe("falsifie");
    await forcedClient.dispose();

    // Répondre à un commentaire encore en attente reste impossible
    const hidden = await db.comment.create({
      data: { content: `${seed.content} parent`, articleId: article.id, guestName: seed.name },
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

    const admin = await openAdmin(browser, request);
    await admin.page.goto("/admin/commentaires");
    await expect(admin.page.getByText(guest.content)).toBeVisible();
    expect(await xss(admin.page)).toBeUndefined();
    await approve(admin.page, guest.content);
    await admin.close();

    await page.reload();
    await expect(page.getByText(guest.content)).toBeVisible();
    expect(await xss(page)).toBeUndefined();
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

  test("quota : 3 commentaires en attente par e-mail, même depuis des IP différentes", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const guest = newGuest();
    for (let attempt = 1; attempt <= 4; attempt++) {
      const context = await newClient(browser);
      const page = await context.newPage();
      await openArticle(page);
      await fillGuestForm(guestForm(page), { ...guest, content: `${guest.content} n°${attempt}` });
      await send(guestForm(page));
      if (attempt <= 3) await expectSent(page);
      else await expect(commentAlert(page)).toBeVisible({ timeout: POW_TIMEOUT });
      await context.close();
    }
    expect(await db.comment.count({ where: { guestEmail: guest.email } })).toBe(3);
  });

  test("réponse : visible seulement après approbation, rattachée au parent", async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(180_000);
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
    await expect(page.getByText(guest.content)).toBeHidden();
    const reply = await db.comment.findFirstOrThrow({ where: { guestEmail: guest.email } });
    expect(reply).toMatchObject({ status: "PENDING", parentId: parent.id });

    const admin = await openAdmin(browser, request);
    await approve(admin.page, guest.content);
    await admin.close();

    await page.reload();
    await expect(page.getByText(guest.content)).toBeVisible();
    expect(await db.comment.findUniqueOrThrow({ where: { id: reply.id } })).toMatchObject({
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

  test("autorisation : file et approbation réservées aux admins", async ({
    browser,
    playwright,
    request,
  }) => {
    test.setTimeout(180_000);
    const article = await publishedArticle();
    const guest = newGuest();
    const pending = await db.comment.create({
      data: {
        content: guest.content,
        articleId: article.id,
        guestName: guest.name,
        guestEmail: guest.email,
        guestIpHash: `hash-${uid()}`,
      },
    });
    const status = async () =>
      (await db.comment.findUniqueOrThrow({ where: { id: pending.id } })).status;

    // La vraie requête d'approbation, interceptée avant d'atteindre le serveur
    const admin = await openAdmin(browser, request);
    const actions = captureActions(admin.page);
    await admin.page.route("**/admin/commentaires**", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await admin.page.goto("/admin/commentaires");
    await admin.page
      .locator("li")
      .filter({ hasText: guest.content })
      .getByRole("button", { name: "Approuver" })
      .click();
    await expect.poll(async () => (await actions()).length).toBe(1);
    const [approval] = await actions();
    expect(await status()).toBe("PENDING");

    for (const role of ["user", "author"] as const) {
      const user = await createUser(request, role);
      const context = await newClient(browser);
      const page = await context.newPage();
      await login(page, user);
      await page.goto("/admin/commentaires");
      const html = await page.content();
      expect(html, role).not.toContain(guest.email);
      expect(html, role).not.toContain(guest.content);
      await replay(page.request, approval);
      expect(await status(), role).toBe("PENDING");
      await context.close();
    }

    // Sans session : le proxy renvoie vers la connexion, rien n'est exécuté
    const anonymous = await apiClient(playwright);
    await replay(anonymous, approval);
    expect(await status()).toBe("PENDING");
    await anonymous.dispose();

    // Contre-épreuve : la même requête aboutit avec la session de l'admin
    await replay(admin.page.request, approval);
    await expect.poll(status).toBe("APPROVED");
    await admin.close();
  });

  test("modération : supprimer un commentaire, puis vider la file sans toucher aux publiés", async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const article = await publishedArticle();
    const [first, second, published] = [newGuest(), newGuest(), newGuest()];
    const inQueue = (guest: Guest) => ({
      content: guest.content,
      articleId: article.id,
      guestName: guest.name,
      guestEmail: guest.email,
    });
    await db.comment.createMany({
      data: [
        inQueue(first),
        inQueue(second),
        { content: published.content, articleId: article.id, guestName: published.name, status: "APPROVED" },
      ],
    });

    const admin = await openAdmin(browser, request);
    admin.page.on("dialog", (dialog) => void dialog.accept());
    await admin.page.goto("/admin/commentaires");

    const firstRow = admin.page.locator("li").filter({ hasText: first.content });
    await firstRow.getByRole("button", { name: "Supprimer" }).click();
    await expect(firstRow).toBeHidden();
    expect(await db.comment.count({ where: { content: first.content } })).toBe(0);

    await admin.page.getByRole("button", { name: "Tout supprimer" }).click();
    await expect(admin.page.locator("li").filter({ hasText: second.content })).toBeHidden();
    expect(await db.comment.count({ where: { status: "PENDING" } })).toBe(0);

    await admin.page.getByRole("link", { name: /Publiés/ }).click();
    const publishedRow = admin.page.locator("li").filter({ hasText: published.content });
    await expect(publishedRow).toBeVisible();
    await expect(publishedRow.getByRole("button", { name: "Approuver" })).toHaveCount(0);
    await admin.close();
  });
});
