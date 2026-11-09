import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { isBotUserAgent, recordArticleView } from "@/lib/stats";

// Base en mémoire : compteurs incrémentés (vues totales, du jour, référents)
const counts = vi.hoisted(() => new Map<string, number>());
vi.mock("@/lib/db", () => {
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  return {
    db: {
      article: {
        update: async ({ where }: { where: { id: string } }) => bump(`total:${where.id}`),
      },
      articleDailyView: {
        upsert: async ({ where }: { where: { articleId_day: { articleId: string } } }) =>
          bump(`jour:${where.articleId_day.articleId}`),
      },
      referrerStat: {
        updateMany: async ({ where }: { where: { host: string } }) => {
          bump(`referent:${where.host}`);
          return { count: 1 };
        },
      },
    },
  };
});

function views(articleId: string): number {
  const total = counts.get(`total:${articleId}`) ?? 0;
  // Compteur global et agrégat du jour restent cohérents
  expect(counts.get(`jour:${articleId}`) ?? 0).toBe(total);
  return total;
}

describe("Statistiques : une vue par visiteur", () => {
  beforeEach(() => {
    counts.clear();
    resetRateLimits();
  });

  it("compte une vue par visiteur et par article sur 24 h", async () => {
    await recordArticleView("a", null, "203.0.113.7");
    await recordArticleView("a", null, "203.0.113.7");
    expect(views("a")).toBe(1);

    await recordArticleView("b", null, "203.0.113.7");
    await recordArticleView("a", null, "203.0.113.8");
    expect(views("b")).toBe(1);
    expect(views("a")).toBe(2);

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 24 * 3600 * 1000 + 1);
    try {
      await recordArticleView("a", null, "203.0.113.7");
    } finally {
      clock.mockRestore();
    }
    expect(views("a")).toBe(3);
  });

  it("regroupe les adresses IPv6 d'un même /64", async () => {
    await recordArticleView("a", null, "2001:db8:1:2::1");
    await recordArticleView("a", null, "2001:db8:1:2:aaaa::ff");
    expect(views("a")).toBe(1);

    await recordArticleView("a", null, "2001:db8:1:3::1");
    expect(views("a")).toBe(2);
  });

  it("compte chaque vue dont l'IP est inconnue", async () => {
    await recordArticleView("a", null, null);
    await recordArticleView("a", null, null);
    expect(views("a")).toBe(2);
  });

  it("ne compte pas le référent d'une vue déjà comptée", async () => {
    await recordArticleView("a", "www.google.com", "203.0.113.7");
    await recordArticleView("a", "www.google.com", "203.0.113.7");
    expect(counts.get("referent:www.google.com")).toBe(1);
  });
});

describe("Statistiques : robots", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    "curl/8.5.0",
    "python-requests/2.31.0",
    "",
    null,
  ])("écarte %j", (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  ])("compte %j", (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(false);
  });
});
