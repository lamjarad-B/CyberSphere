import { expect, test, db, uid } from "./helpers";

test.describe("Newsletter", () => {
  test("double opt-in : le lien seul ne confirme pas, le clic oui", async ({ page }) => {
    const email = `e2e-news-${uid()}@cybersphere.test`;
    await page.goto("/");
    await page.getByLabel("Adresse e-mail pour la newsletter").fill(email);
    await page.getByRole("button", { name: "S'abonner" }).click();
    await expect(page.getByText(/ouvrez l'e-mail de confirmation/)).toBeVisible();

    const subscriber = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    expect(subscriber.confirmed).toBe(false);

    // Un scanner de liens qui ouvre l'URL de l'e-mail ne confirme rien
    await page.goto(`/newsletter/confirmation?jeton=${subscriber.token}`);
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).confirmed).toBe(false);

    await page.getByRole("button", { name: "Confirmer mon inscription" }).click();
    await expect(page.getByRole("heading", { name: /Inscription confirmée/ })).toBeVisible();
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).confirmed).toBe(true);
  });

  test("désinscription : bouton sur la page, et en un clic (RFC 8058)", async ({ page, request }) => {
    const pageToken = `tok-${uid()}`;
    const oneClickToken = `tok-${uid()}`;
    await db.newsletterSubscriber.createMany({
      data: [
        { email: `e2e-unsub-${uid()}@cybersphere.test`, token: pageToken, confirmed: true },
        { email: `e2e-unsub-${uid()}@cybersphere.test`, token: oneClickToken, confirmed: true },
      ],
    });

    await page.goto(`/newsletter/desinscription?jeton=${pageToken}`);
    expect(await db.newsletterSubscriber.count({ where: { token: pageToken } })).toBe(1);
    await page.getByRole("button", { name: "Me désinscrire" }).click();
    await expect(page.getByRole("heading", { name: "Désinscription effectuée" })).toBeVisible();
    expect(await db.newsletterSubscriber.count({ where: { token: pageToken } })).toBe(0);

    const response = await request.post(`/api/newsletter/desinscription?jeton=${oneClickToken}`, {
      form: { "List-Unsubscribe": "One-Click" },
    });
    expect(response.status()).toBe(204);
    expect(await db.newsletterSubscriber.count({ where: { token: oneClickToken } })).toBe(0);
  });
});
