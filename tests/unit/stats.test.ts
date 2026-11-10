import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { isBotUserAgent, recordArticleView, recordVisit } from "@/lib/stats";

type Place = { day: Date; country: string; region: string; city: string };

// Base en mémoire : compteurs incrémentés (vues totales, du jour, référents)
const counts = vi.hoisted(() => new Map<string, number>());
// Provenance : compteur par « jour|pays|région|ville »
const places = vi.hoisted(() => new Map<string, number>());
// Base de géolocalisation simulée : IP connues, présence de la base, lignes du jour
const geo = vi.hoisted(() => ({
  available: true,
  rowsToday: null as number | null,
  locations: {
    "203.0.113.7": { country: "FR", region: "Auvergne-Rhône-Alpes", city: "Lyon" },
    "203.0.113.8": { country: "FR", region: "Auvergne-Rhône-Alpes", city: "Lyon" },
    "198.51.100.1": { country: "BE", region: "Brussels Capital", city: "Brussels" },
  } as Record<string, { country: string; region: string; city: string }>,
}));

vi.mock("@/lib/geoip", () => ({
  locateIp: async (ip: string) =>
    geo.available ? (geo.locations[ip] ?? { country: "", region: "", city: "" }) : null,
}));

function placeKey({ day, country, region, city }: Place): string {
  return [day.toISOString().slice(0, 10), country, region, city].join("|");
}

vi.mock("@/lib/db", () => {
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  return {
    db: {
      visitorLocationStat: {
        updateMany: async ({ where }: { where: Place }) => {
          const key = placeKey(where);
          if (!places.has(key)) return { count: 0 };
          places.set(key, places.get(key)! + 1);
          return { count: 1 };
        },
        count: async ({ where }: { where: { day: Date } }) => {
          const prefix = `${where.day.toISOString().slice(0, 10)}|`;
          return geo.rowsToday ?? [...places.keys()].filter((k) => k.startsWith(prefix)).length;
        },
        upsert: async ({ where }: { where: { day_country_region_city: Place } }) => {
          const key = placeKey(where.day_country_region_city);
          places.set(key, (places.get(key) ?? 0) + 1);
        },
      },
      // Gabarit SQL : l'identifiant de l'article est la seule valeur interpolée
      $executeRaw: async (_sql: TemplateStringsArray, articleId: string) =>
        bump(`total:${articleId}`),
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

describe("Statistiques : provenance des visiteurs", () => {
  beforeEach(() => {
    places.clear();
    resetRateLimits();
    geo.available = true;
    geo.rowsToday = null;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("compte un visiteur une fois par jour, par lieu", async () => {
    await recordVisit("203.0.113.7");
    await recordVisit("203.0.113.7");
    await recordVisit("203.0.113.8");
    await recordVisit("198.51.100.1");
    expect(Object.fromEntries(places)).toEqual({
      "2026-11-10|FR|Auvergne-Rhône-Alpes|Lyon": 2,
      "2026-11-10|BE|Brussels Capital|Brussels": 1,
    });
  });

  it("recompte le même visiteur le jour suivant (UTC)", async () => {
    vi.setSystemTime(new Date("2026-11-10T23:30:00Z"));
    await recordVisit("203.0.113.7");
    vi.setSystemTime(new Date("2026-11-11T00:30:00Z"));
    await recordVisit("203.0.113.7");
    expect(Object.fromEntries(places)).toEqual({
      "2026-11-10|FR|Auvergne-Rhône-Alpes|Lyon": 1,
      "2026-11-11|FR|Auvergne-Rhône-Alpes|Lyon": 1,
    });
  });

  it("regroupe les adresses IPv6 d'un même /64", async () => {
    await recordVisit("2001:db8:1:2::1");
    await recordVisit("2001:db8:1:2:aaaa::ff");
    expect(places.get("2026-11-10|||")).toBe(1);
  });

  it("compte une IP absente de la base comme lieu inconnu", async () => {
    await recordVisit("10.0.0.1");
    expect(Object.fromEntries(places)).toEqual({ "2026-11-10|||": 1 });
  });

  it("ne compte rien sans IP ni sans base", async () => {
    await recordVisit(null);
    geo.available = false;
    await recordVisit("203.0.113.7");
    expect(places.size).toBe(0);
  });

  it("au-delà du plafond de lieux du jour, ne garde que le pays", async () => {
    geo.rowsToday = 1000;
    await recordVisit("198.51.100.1");
    expect(Object.fromEntries(places)).toEqual({ "2026-11-10|BE||": 1 });
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
