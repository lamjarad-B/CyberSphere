import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeCommenters } from "@/lib/maintenance";

const db = vi.hoisted(() => ({
  comment: { findMany: vi.fn(), update: vi.fn() },
  newsletterSubscriber: { upsert: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => {
  vi.clearAllMocks();
  db.newsletterSubscriber.upsert.mockResolvedValue({});
});

describe("Abonnement différé des invités", () => {
  const now = new Date("2026-11-06T12:00:00Z");

  it("ne vise que les commentaires en ligne depuis 24 h qui ont demandé la newsletter", async () => {
    db.comment.findMany.mockResolvedValue([]);
    await subscribeCommenters(now);
    expect(db.comment.findMany.mock.calls[0][0].where).toEqual({
      status: "APPROVED",
      newsletterOptIn: true,
      guestEmail: { not: null },
      createdAt: { lt: new Date("2026-11-05T12:00:00Z") },
    });
  });

  it("abonne sans confirmation, une seule fois, et efface la demande", async () => {
    db.comment.findMany.mockResolvedValue([
      { id: "c1", guestEmail: "a@example.org", guestLocale: "en" },
    ]);
    expect(await subscribeCommenters(now)).toBe(1);
    expect(db.newsletterSubscriber.upsert.mock.calls[0][0].create).toMatchObject({
      email: "a@example.org",
      locale: "en",
    });
    expect(db.newsletterSubscriber.updateMany).toHaveBeenCalledWith({
      where: { email: "a@example.org", confirmed: false },
      data: { confirmed: true, confirmedAt: expect.any(Date) },
    });
    expect(db.comment.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { newsletterOptIn: false, guestLocale: null },
    });
  });

  it("un échec n'empêche pas les suivants et la demande reste pour la prochaine fois", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    db.comment.findMany.mockResolvedValue([
      { id: "c1", guestEmail: "a@example.org", guestLocale: "fr" },
      { id: "c2", guestEmail: "b@example.org", guestLocale: "fr" },
    ]);
    db.newsletterSubscriber.upsert.mockRejectedValueOnce(new Error("base indisponible"));
    expect(await subscribeCommenters(now)).toBe(1);
    expect(db.comment.update).toHaveBeenCalledTimes(1);
    expect(db.comment.update.mock.calls[0][0].where).toEqual({ id: "c2" });
    consoleError.mockRestore();
  });
});
