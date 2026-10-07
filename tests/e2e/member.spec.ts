import { expect, newClient, test, createUser, db, login, publishedArticle } from "./helpers";

test.describe("Espace membre", () => {
  test("commenter, mettre en signet et signaler", async ({ browser, request }) => {
    const article = await publishedArticle();
    const author = await createUser(request);
    const reader = await createUser(request);

    // Le premier membre commente et ajoute l'article à ses signets
    const authorContext = await newClient(browser);
    const page = await authorContext.newPage();
    await login(page, author);
    await page.goto(`/articles/${article.slug}`);
    const text = `Commentaire e2e ${Date.now()}`;
    await page.getByPlaceholder("Votre commentaire…").fill(text);
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText(text)).toBeVisible();
    await page.getByRole("button", { name: "+ Ajouter aux signets" }).click();
    await expect(page.getByRole("button", { name: "✓ Dans mes signets" })).toBeVisible();
    await authorContext.close();

    // Un second membre le signale (motif saisi dans la boîte de dialogue)
    const readerContext = await newClient(browser);
    const readerPage = await readerContext.newPage();
    await login(readerPage, reader);
    await readerPage.goto(`/articles/${article.slug}`);
    readerPage.once("dialog", (dialog) => dialog.accept("Test de signalement"));
    const comment = readerPage.locator("div.space-y-2", { hasText: text }).first();
    await comment.getByRole("button", { name: "Signaler" }).click();
    await expect(comment.getByText("Signalé — merci")).toBeVisible();
    await expect
      .poll(() => db.commentReport.count({ where: { reporterId: reader.id, resolvedAt: null } }))
      .toBe(1);
    await readerContext.close();
  });

  test("« Mes sessions » n'expose pas les jetons de session", async ({ page }) => {
    const user = await createUser(page.request);
    await login(page, user);
    await page.goto("/membre");
    const html = await page.content();
    const sessions = await db.session.findMany({ where: { userId: user.id }, select: { token: true } });
    expect(sessions.length).toBeGreaterThan(0);
    for (const { token } of sessions) expect(html).not.toContain(token);
  });

  test("export RGPD : données du compte, sans secret", async ({ page }) => {
    const user = await createUser(page.request);
    await login(page, user);
    const response = await page.request.get("/api/compte/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain("attachment");
    const body = await response.text();
    const data = JSON.parse(body) as { user: { email: string } };
    expect(data.user.email).toBe(user.email);
    expect(body).not.toMatch(/"(password|token|secret|publicKey)"/);

    const anonymous = await page.context().browser()!.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "10.250.0.1" } });
    expect((await anonymous.request.get("/api/compte/export")).status()).toBe(401);
    await anonymous.close();
  });

  test("suppression du compte (mot de passe exigé)", async ({ page }) => {
    const user = await createUser(page.request);
    await db.newsletterSubscriber.create({
      data: { email: user.email, token: `tok-${user.id}`, confirmed: true },
    });
    await login(page, user);

    // Sans mot de passe, l'API refuse — même avec une session toute fraîche
    const withoutPassword = await page.request.post("/api/auth/delete-user", {
      data: {},
      headers: { Origin: page.url().split("/").slice(0, 3).join("/") },
    });
    expect(withoutPassword.status()).toBe(400);

    await page.goto("/membre");
    await page.locator("#delete-password").fill(user.password);
    const submit = page.getByRole("button", { name: "Supprimer définitivement mon compte" });
    await expect(submit).toBeDisabled();
    await page.locator("#delete-confirm").fill("SUPPRIMER");
    await submit.click();
    await page.waitForURL((url) => url.pathname === "/");

    expect(await db.user.count({ where: { id: user.id } })).toBe(0);
    expect(await db.newsletterSubscriber.count({ where: { email: user.email } })).toBe(0);
    expect(
      await db.auditLog.count({ where: { action: "compte.suppression", actorEmail: user.email } }),
    ).toBe(1);
  });
});
