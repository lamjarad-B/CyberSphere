import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { createUser, db, expect, login, publishedArticle, test } from "./helpers";

async function expectNoViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = violations.map((violation) => ({
    rule: violation.id,
    nodes: violation.nodes.map((node) => node.html),
  }));
  expect(summary, label).toEqual([]);
}

/** Article assez long pour défiler, avec sommaire et note de bas de page. */
async function articleWithAnchors() {
  const source = await publishedArticle();
  const article = await db.article.findUniqueOrThrow({
    where: { id: source.id },
    select: { authorId: true, categoryId: true },
  });
  const slug = `a11y-e2e-${Date.now().toString(36)}`;
  const filler = "Paragraphe de remplissage pour que la page défile.\n\n".repeat(60);
  await db.article.create({
    data: {
      title: `Accessibilité e2e ${slug}`,
      slug,
      excerpt: "Article créé par le test des ancres et du header collant.",
      content: `## Contexte\n\n${filler}## Analyse\n\nUne affirmation sourcée[^1], citée deux fois[^1].\n\n${filler}## Conclusion\n\nFin.\n\n[^1]: ANSSI, « Panorama », https://cyber.gouv.fr`,
      status: "PUBLISHED",
      publishedAt: new Date(),
      authorId: article.authorId,
      categoryId: article.categoryId,
    },
  });
  return slug;
}

test.describe("Accessibilité", () => {
  for (const theme of ["dark", "light"]) {
    test(`aucune violation WCAG A/AA sur les pages publiques, thème ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      const article = await publishedArticle();
      for (const path of [
        "/",
        "/articles",
        `/articles/${article.slug}`,
        "/series",
        "/recherche?q=cyber",
        "/connexion",
        "/inscription",
        "/contact",
        "/en",
      ]) {
        await page.goto(path);
        await expectNoViolations(page, `${path} (${theme})`);
      }
    });
  }

  test("espace membre et formulaire de commentaire sans violation", async ({ page }) => {
    const article = await publishedArticle();
    const user = await createUser(page.request);
    await login(page, user);
    await page.goto(`/articles/${article.slug}`);
    await expect(page.getByLabel("Votre commentaire")).toBeVisible();
    await expectNoViolations(page, "article connecté");
    await page.goto("/membre");
    await expectNoViolations(page, "/membre");
  });

  for (const theme of ["dark", "light"]) {
    test(`formulaire de commentaire visiteur et CAPTCHA sans violation, thème ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      const article = await publishedArticle();
      await page.goto(`/articles/${article.slug}`);
      const robot = page.getByLabel("Je ne suis pas un robot");
      // Le widget se charge au premier focus, à refaire si l'hydratation n'était pas finie
      await expect(async () => {
        await page.getByLabel(/^Votre commentaire/).blur();
        await page.getByLabel(/^Votre commentaire/).focus();
        await expect(robot).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await expectNoViolations(page, `formulaire visiteur (${theme})`);

      // Contrastes de l'état « vérifié », aux couleurs du thème
      await robot.click();
      await expect(page.getByText("Vérifié", { exact: true })).toBeVisible({ timeout: 45_000 });
      await expectNoViolations(page, `CAPTCHA vérifié (${theme})`);
    });
  }

  test("pages de liste : pas de saut de niveau de titre après le h1", async ({ page }) => {
    const category = await db.article.findFirstOrThrow({
      where: { status: "PUBLISHED" },
      select: { category: { select: { slug: true } } },
    });
    for (const path of ["/articles", "/en/articles", `/categories/${category.category.slug}`]) {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withRules(["heading-order"]).analyze();
      expect(violations.map((violation) => violation.id), path).toEqual([]);
    }
  });

  test("lien d'évitement : premier arrêt de tabulation, mène au contenu", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Aller au contenu" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenu$/);
    await page.keyboard.press("Tab");
    const insideMain = await page.evaluate(
      () => document.querySelector("main")?.contains(document.activeElement) ?? false,
    );
    expect(insideMain).toBe(true);
  });

  test("thématiques : ouverture à la demande, Échap referme et rend le focus", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Thématiques" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const panelId = await trigger.getAttribute("aria-controls");
    const firstLink = page.locator(`[id="${panelId}"] a`).first();

    // Fermé, le panneau ne retient pas la tabulation
    await trigger.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Rechercher" })).toBeFocused();

    // Ouvert au clavier, ses liens suivent le déclencheur
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(firstLink).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(firstLink).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
    await expect(firstLink).toBeHidden();

    // Affiché au survol : Échap le masque sous le pointeur (WCAG 1.4.13)
    await page.mouse.move(0, 400);
    await trigger.hover();
    await expect(firstLink).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(firstLink).toBeHidden();
    await page.mouse.move(0, 400);
    await trigger.hover();
    await expect(firstLink).toBeVisible();
  });

  test("ancres et focus clavier : jamais sous le header collant", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const slug = await articleWithAnchors();
    try {
      await page.goto(`/articles/${slug}`);
      await expectNoViolations(page, "article avec sommaire et notes");
      const headerBottom = async () =>
        page.evaluate(() => document.querySelector("header")!.getBoundingClientRect().bottom);

      await page.getByRole("navigation", { name: "Sommaire" }).getByRole("link", { name: "Analyse" }).click();
      await expect(page).toHaveURL(/#analyse$/);
      await expect
        .poll(async () => {
          const top = await page.locator("#analyse").evaluate((el) => el.getBoundingClientRect().top);
          return top >= (await headerBottom());
        })
        .toBe(true);

      await page.locator("[data-footnote-ref]").first().click();
      await page.locator("[data-footnote-backref]").first().click();
      await expect
        .poll(async () => {
          const top = await page.locator("[data-footnote-ref]").first().evaluate((el) => el.getBoundingClientRect().top);
          return top >= (await headerBottom());
        })
        .toBe(true);

      // Maj+Tab depuis le bas de page jusqu'à l'appel de note, au milieu d'un
      // long texte : le défilement vers le haut ne le cache pas sous le header
      await page.locator("footer a").first().focus();
      let reachedNote = false;
      for (let step = 0; step < 40 && !reachedNote; step++) {
        await page.keyboard.press("Shift+Tab");
        const { top, isNote } = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement;
          return {
            top: active.getBoundingClientRect().top,
            isNote: active.matches("[data-footnote-ref]"),
          };
        });
        expect(top).toBeGreaterThanOrEqual(await headerBottom());
        reachedNote = isNote;
      }
      expect(reachedNote).toBe(true);
    } finally {
      await db.article.delete({ where: { slug } });
    }
  });

  test("avertissement avant déconnexion : prolonger, puis expiration", async ({ page }) => {
    const user = await createUser(page.request);
    await login(page, user);
    await page.clock.install();
    // Le battement de cœur envoyé au montage atteste que le composant est hydraté
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/auth/get-session")),
      page.goto("/articles"),
    ]);
    const title = await page.title();

    const dialog = page.getByRole("alertdialog", { name: "Toujours là ?" });
    const stay = dialog.getByRole("button", { name: "Rester connecté" });
    await expect(dialog).toBeHidden();

    // 26 min sans activité : préavis de 2 min avant la déconnexion
    await page.clock.fastForward("26:05");
    await expect(dialog).toBeVisible();
    await expect(stay).toBeFocused();
    await expect(dialog.getByRole("timer")).toContainText(/Déconnexion dans 1:5\d/);
    await expect(page).toHaveTitle(/^Déconnexion imminente — /);

    // Une touche pressée sur le dialogue ne le ferme pas (voir IdleLogout) ; Entrée sur le bouton oui
    await page.keyboard.press("Tab");
    await expect(dialog).toBeVisible();
    await stay.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveTitle(title);

    // La prolongation a trouvé une session vivante : toujours connecté
    await page.clock.fastForward("00:30");
    await expect(page).toHaveURL(/\/articles$/);
    expect(await db.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);

    // Échap prolonge aussi
    await page.clock.fastForward("26:05");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Sans réaction : session révoquée et retour à la connexion
    await page.clock.fastForward("26:05");
    await expect(dialog).toBeVisible();
    await page.clock.fastForward("02:05");
    await page.waitForURL(/\/connexion\?raison=inactivite/);
    await expect(page.getByRole("status").filter({ hasText: "inactivité" })).toBeVisible();
    await expect
      .poll(() => db.session.count({ where: { userId: user.id } }))
      .toBe(0);
  });
});
