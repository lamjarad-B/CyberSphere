import { expect, newClient, test, BASE_URL, createUser, db, enableTwoFactor, freshTotp, login, uid } from "./helpers";

test.describe("Authentification", () => {
  test("validation serveur de l'inscription (nom, avatar arbitraire)", async ({ request }) => {
    const base = {
      email: `e2e-val-${uid()}@cybersphere.test`,
      password: `E2e-${uid()}-Zq!9xw`,
    };
    const longName = await request.post("/api/auth/sign-up/email", {
      data: { ...base, name: "x".repeat(200) },
      headers: { Origin: BASE_URL },
    });
    expect(longName.status()).toBe(400);

    const withImage = await request.post("/api/auth/sign-up/email", {
      data: { ...base, name: "Valide", image: "https://tracker.example/pixel.gif" },
      headers: { Origin: BASE_URL },
    });
    expect(withImage.status()).toBe(400);
    expect(await db.user.count({ where: { email: base.email } })).toBe(0);
  });

  test("inscription : aucune session avant vérification de l'e-mail", async ({ page }) => {
    const email = `e2e-reg-${uid()}@cybersphere.test`;
    const password = `E2e-${uid()}-Kp!3vr`;
    await page.goto("/inscription");
    await page.locator("#name").fill("Nouveau Membre");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("#confirm").fill(password);
    await page.locator('main form button[type="submit"]').click();
    await expect(page.getByText(email)).toBeVisible();

    await page.goto("/connexion");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator('main form button[type="submit"]').click();
    await expect(page.getByRole("button", { name: /renvoyer/i })).toBeVisible();
  });

  test("échec de connexion tracé dans le journal d'audit", async ({ page }) => {
    const user = await createUser(page.request);
    await page.goto("/connexion");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill("mauvais-mot-de-passe");
    await page.locator('main form button[type="submit"]').click();
    await expect(page.getByText(/incorrect|invalide/i).first()).toBeVisible();
    await expect
      .poll(() => db.auditLog.count({ where: { action: "auth.connexion_echouee", actorEmail: user.email } }))
      .toBe(1);
  });

  test("appareil inconnu détecté à la connexion", async ({ browser, request }) => {
    const user = await createUser(request);
    const firstDevice = await newClient(browser, { userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0" });
    await login(await firstDevice.newPage(), user);
    const secondDevice = await newClient(browser, {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
    });
    await login(await secondDevice.newPage(), user);
    // Deux empreintes d'appareil : la seconde connexion a déclenché l'alerte e-mail
    await expect.poll(() => db.loginDevice.count({ where: { userId: user.id } })).toBe(2);
    await firstDevice.close();
    await secondDevice.close();
  });

  test("changement de mot de passe et désactivation de la 2FA : audités", async ({ page }) => {
    const user = await createUser(page.request);
    await login(page, user);
    await enableTwoFactor(page, user);

    await page.locator("#disable-password").fill(user.password);
    await page.locator('form:has(#disable-password) button[type="submit"]').click();
    await expect(page.locator("#enable-password")).toBeVisible();

    const newPassword = `${user.password}-2`;
    await page.locator("#current").fill(user.password);
    await page.locator("#new").fill(newPassword);
    await page.locator("#confirm").fill(newPassword);
    await page.locator('form:has(#current) button[type="submit"]').click();
    await expect(page.locator('form:has(#current) [class*="emerald"]')).toBeVisible();

    for (const action of ["auth.2fa_desactivee", "auth.mot_de_passe_modifie"]) {
      await expect
        .poll(() => db.auditLog.count({ where: { action, actorId: user.id } }), { message: action })
        .toBe(1);
    }
  });

  test("2FA : activation puis connexion en deux étapes, avec retour à la page demandée", async ({ browser, request }) => {
    const user = await createUser(request);
    const setup = await newClient(browser);
    const setupPage = await setup.newPage();
    await login(setupPage, user);
    const secret = await enableTwoFactor(setupPage, user);
    await setup.close();

    const context = await newClient(browser);
    const page = await context.newPage();
    await page.goto("/connexion?redirection=%2Fseries");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('main form button[type="submit"]').click();
    await page.waitForURL(/\/deux-facteurs\?redirection=%2Fseries/);
    await page.locator("#code").fill(await freshTotp(secret));
    await page.locator('main form button[type="submit"]').click();
    await page.waitForURL(/\/series$/);
    await context.close();
  });
});
