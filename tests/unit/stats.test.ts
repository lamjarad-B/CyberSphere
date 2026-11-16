import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import {
  botKind,
  flushBotHits,
  isBotUserAgent,
  recordArticleView,
  recordBotHit,
  recordVisit,
} from "@/lib/stats";

type Place = { day: Date; country: string; region: string; city: string };

// Robots écartés : compteur par « jour|type », écriture en échec sur demande
const bots = vi.hoisted(() => ({ rows: new Map<string, number>(), fail: false }));

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
      botHitStat: {
        upsert: async ({
          where,
          create,
        }: {
          where: { day_kind: { day: Date; kind: string } };
          create: { count: number };
        }) => {
          if (bots.fail) throw new Error("base indisponible");
          const key = `${where.day_kind.day.toISOString().slice(0, 10)}|${where.day_kind.kind}`;
          bots.rows.set(key, (bots.rows.get(key) ?? 0) + create.count);
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

  // Robots déclarés sans « bot » dans leur nom : mention « compatible; » ou URL
  it.each([
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; GoogleOther)",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
    "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
    "Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)",
    "Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
    "Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)",
    "Mozilla/4.0 (compatible; ms-office; MSOffice 16)",
    "Mozilla/5.0 (X11; Linux x86_64; GTmetrix https://gtmetrix.com/) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Google (+https://developers.google.com/+/web/snippet/)",
  ])("écarte le robot déclaré %j", (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(true);
  });

  // Outils qui prennent la forme d'un navigateur
  it.each([
    "Mozilla/5.0 (Windows NT; Windows NT 10.0; fr-FR) WindowsPowerShell/5.1.26100.2161",
    "Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26100; fr-FR) PowerShell/7.4.6",
    "Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1",
    "Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/534.34 (KHTML, like Gecko) PingdomTMS/0.8.5 Safari/534.34",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 PTST/240101.150000",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 DatadogSynthetics",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
  ])("écarte l'outil %j", (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(true);
  });

  // Programmes : leur user-agent n'a pas la forme de celui d'un navigateur
  it.each([
    "Go-http-client/2.0",
    "node",
    "undici",
    "got (https://github.com/sindresorhus/got)",
    "Deno/2.1.4",
    "Bun/1.1.38",
    "Scrapy/2.12.0 (+https://scrapy.org)",
    "GuzzleHttp/7",
    "Ruby",
    "libwww-perl/6.77",
    "reqwest/0.12.9",
    "Dart/3.6 (dart:io)",
    "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/AP2A.240805.005)",
    "MyApp/1.0 CFNetwork/1568.200.51 Darwin/24.1.0",
    "PostmanRuntime/7.43.0",
    "HTTPie/3.2.4",
    "http.rb/5.2.0 (Mastodon/4.3.2; +https://infosec.exchange/)",
    "Uptime-Kuma/1.23.16",
    "sqlmap/1.8.11#stable (https://sqlmap.org)",
    "masscan/1.3 (https://github.com/robertdavidgraham/masscan)",
    "Mozilla/5.00 (Nikto/2.5.0) (Evasions:None) (Test:Port Check)",
    "Mozilla/5.0 zgrab/0.x",
    "Mozilla/5.0",
    "Mozlila/5.0 (Linux; Android 7.0; SM-G892A Bulid/NRD90M.G892AUCU2DUE; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/60.0.3112.107 Mobile Safari/537.36",
    "Expanse, a Palo Alto Networks company, searches across the global IPv4 space multiple times per day",
    "Lynx/2.9.2 libwww-FM/2.14 SSL-MM/1.4.1",
  ])("écarte le programme %j", (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (Ecosia android@131.0.6778.81)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0",
    "Opera/9.80 (Android; Opera Mini/80.0.2254/191.340; U; fr) Presto/2.12.423 Version/12.16",
    // Navigateurs intégrés aux applications : la lecture d'un lien partagé
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.8962",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/490.0.0.50.110;FBBV/668392301;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBID/phone;FBLC/fr_FR;FBOP/5;FBRV/0]",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.81 Mobile Safari/537.36 Instagram 359.0.0.59.89 Android (34/14; 480dpi; 1080x2316; samsung; SM-S918B; dm3q; qcom; fr_FR; 670000000)",
  ])("compte %j", (userAgent) => {
    expect(isBotUserAgent(userAgent)).toBe(false);
  });
});

describe("Statistiques : robots écartés", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
    bots.fail = false;
    // Vide ce qu'un test précédent aurait laissé en attente
    await flushBotHits();
    bots.rows.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [null, "absent"],
    ["", "absent"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "robot"],
    ["LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)", "robot"],
    ["curl/8.5.0", "programme"],
    ["Go-http-client/2.0", "programme"],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      null,
    ],
  ])("classe %j : %s", (userAgent, kind) => {
    expect(botKind(userAgent)).toBe(kind);
  });

  it("regroupe les requêtes par jour (UTC) et par type, écrites au passage suivant", async () => {
    recordBotHit("robot");
    recordBotHit("robot");
    recordBotHit("programme");
    vi.setSystemTime(new Date("2026-11-17T00:30:00Z"));
    recordBotHit("robot");
    expect(bots.rows.size).toBe(0);

    await flushBotHits();
    const written = {
      "2026-11-16|robot": 2,
      "2026-11-16|programme": 1,
      "2026-11-17|robot": 1,
    };
    expect(Object.fromEntries(bots.rows)).toEqual(written);

    // Rien n'est écrit deux fois
    await flushBotHits();
    expect(Object.fromEntries(bots.rows)).toEqual(written);
  });

  it("remet en attente un compteur dont l'écriture échoue", async () => {
    recordBotHit("absent");
    bots.fail = true;
    await expect(flushBotHits()).rejects.toThrow("base indisponible");
    expect(bots.rows.size).toBe(0);

    recordBotHit("absent");
    bots.fail = false;
    await flushBotHits();
    expect(Object.fromEntries(bots.rows)).toEqual({ "2026-11-16|absent": 2 });
  });
});
