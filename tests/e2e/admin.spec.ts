import { expect, newClient, test, BASE_URL, createUser, db, enableTwoFactor, login, uid } from "./helpers";

test.describe("Administration", () => {
  test("2FA exigée partout pour le staff : pages, navigation directe, API admin", async ({ page }) => {
    const admin = await createUser(page.request, "admin");
    await login(page, admin);

    // Le layout invite à activer la 2FA…
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Double authentification requise" })).toBeVisible();
    // …et une page profonde ne contourne pas l'exigence
    await page.goto("/admin/membres");
    await expect(page.getByRole("heading", { name: "Double authentification requise" })).toBeVisible();
    await expect(page.getByText(admin.email)).toBeHidden();

    // Les endpoints du plugin admin de better-auth exigent aussi la 2FA
    const listUsers = await page.request.get("/api/auth/admin/list-users");
    expect(listUsers.status()).toBe(403);

    // 2FA activée : accès complet
    await enableTwoFactor(page, admin);
    await page.goto("/admin/membres");
    await expect(page.getByRole("heading", { name: /Membres/ })).toBeVisible();
    expect((await page.request.get("/api/auth/admin/list-users")).status()).toBe(200);
  });

  test("auteur : soumission d'un article, brouillons cloisonnés", async ({ browser, request }) => {
    const author = await createUser(request, "author");
    const otherAuthor = await createUser(request, "author");
    const category = await db.category.findFirstOrThrow({ select: { id: true } });
    const foreignDraft = await db.article.create({
      data: {
        title: `Brouillon privé ${uid()}`,
        slug: `brouillon-prive-${uid()}`,
        excerpt: "Brouillon d'un autre auteur.",
        content: "Contenu confidentiel du brouillon.",
        categoryId: category.id,
        authorId: otherAuthor.id,
      },
    });

    const context = await newClient(browser);
    const page = await context.newPage();
    await login(page, author);
    await enableTwoFactor(page, author);

    // Le brouillon d'un autre auteur reste invisible, même par l'URL publique
    const foreign = await page.goto(`/articles/${foreignDraft.slug}`);
    expect(foreign?.status()).toBe(404);

    // Rédaction et soumission à validation
    const title = `Article soumis ${uid()}`;
    await page.goto("/admin/articles/nouveau");
    await page.locator("#title").fill(title);
    await page.locator("#excerpt").fill("Un extrait suffisamment long pour être valide.");
    await page.locator('textarea[name="content"]').fill("## Titre\n\nContenu de l'article soumis.");
    await page.locator("#categoryId").selectOption({ index: 1 });
    await page.locator("#status").selectOption("SUBMITTED");
    await expect(page.locator('#status option[value="PUBLISHED"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForURL(/\/admin\/articles$/);

    const saved = await db.article.findFirstOrThrow({ where: { title } });
    expect(saved.status).toBe("SUBMITTED");
    expect(
      await db.auditLog.count({ where: { action: "article.soumission", targetId: saved.id } }),
    ).toBe(1);
    await context.close();
  });

  test("publication programmée mise en ligne par la tâche de fond", async ({ page }) => {
    test.setTimeout(150_000);
    const admin = await createUser(page.request, "admin");
    await login(page, admin);
    await enableTwoFactor(page, admin);

    const title = `Article programmé ${uid()}`;
    await page.goto("/admin/articles/nouveau");
    await page.locator("#title").fill(title);
    await page.locator("#excerpt").fill("Un extrait suffisamment long pour être valide.");
    await page.locator('textarea[name="content"]').fill("## Bientôt\n\nArticle programmé.");
    await page.locator("#categoryId").selectOption({ index: 1 });
    await page.locator("#status").selectOption("SCHEDULED");
    // Date au format datetime-local, dans le fuseau du navigateur, dans 10 min
    const inTenMinutes = await page.evaluate(() => {
      const date = new Date(Date.now() + 10 * 60_000);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    });
    await page.locator("#scheduledAtLocal").fill(inTenMinutes);
    await page.locator("#coverAlt").fill("Illustration de test");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForURL(/\/admin\/articles$/);

    const scheduled = await db.article.findFirstOrThrow({ where: { title } });
    expect(scheduled.status).toBe("SCHEDULED");
    expect(scheduled.coverAlt).toBe("Illustration de test");
    expect(scheduled.publishedAt!.getTime()).toBeGreaterThan(Date.now());

    // Pas encore public
    const anonymous = await page.context().browser()!.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "10.250.0.1" } });
    expect((await anonymous.request.get(`/articles/${scheduled.slug}`)).status()).toBe(404);

    // On avance l'échéance : la tâche (chaque minute) doit publier l'article
    await db.article.update({
      where: { id: scheduled.id },
      data: { publishedAt: new Date(Date.now() - 1000) },
    });
    await expect
      .poll(async () => (await db.article.findUnique({ where: { id: scheduled.id } }))?.status, {
        timeout: 100_000,
        intervals: [5_000],
      })
      .toBe("PUBLISHED");
    expect((await anonymous.request.get(`/articles/${scheduled.slug}`)).status()).toBe(200);
    await anonymous.close();
  });

  test("API admin refusée sans session", async ({ request }) => {
    const response = await request.get("/api/auth/admin/list-users", {
      headers: { Origin: BASE_URL },
    });
    expect([401, 403]).toContain(response.status());
  });
});
