import { describe, expect, it } from "vitest";
import { profilePlatform } from "@/lib/profile-platforms";
import { authorProfileSchema } from "@/lib/validations";

describe("Profil auteur public", () => {
  it("nettoie les liens : lignes vides ignorées, espaces retirés", () => {
    const parsed = authorProfileSchema.parse({
      bio: "  Analyste.  ",
      bioEn: "",
      links: " https://github.com/x \r\n\n https://www.linkedin.com/in/x\n",
    });
    expect(parsed.bio).toBe("Analyste.");
    expect(parsed.links).toEqual(["https://github.com/x", "https://www.linkedin.com/in/x"]);
  });

  it("refuse un lien non https ou invalide", () => {
    for (const links of ["http://exemple.fr", "javascript:alert(1)", "pas une url"]) {
      expect(authorProfileSchema.safeParse({ bio: "", bioEn: "", links }).success, links).toBe(
        false,
      );
    }
  });

  it("limite la bio à 600 caractères et les liens à 5", () => {
    expect(
      authorProfileSchema.safeParse({ bio: "a".repeat(601), bioEn: "", links: "" }).success,
    ).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => `https://exemple.fr/${i}`).join("\n");
    expect(authorProfileSchema.safeParse({ bio: "", bioEn: "", links: six }).success).toBe(false);
  });
});

describe("Icônes des profils publics", () => {
  it.each([
    ["https://github.com/lamjarad-B", "github"],
    ["https://linkedin.com/in/brahim-lamjarad/", "linkedin"],
    ["https://fr.linkedin.com/in/x", "linkedin"],
    ["https://www.youtube.com/@x", "youtube"],
    ["https://twitter.com/x", "x"],
    ["https://x.com/x", "x"],
    ["https://bsky.app/profile/x.bsky.social", "bluesky"],
    ["https://infosec.exchange/@x", "mastodon"],
    ["https://mastodon.xyz/@x", "mastodon"],
    ["https://x.medium.com/", "medium"],
  ])("%s → %s", (url, platform) => {
    expect(profilePlatform(url)).toBe(platform);
  });

  it("garde le globe pour un site, même hébergé chez une plateforme", () => {
    expect(profilePlatform("https://lamjarad-b.github.io/Portfolio/")).toBe("website");
    expect(profilePlatform("https://notgithub.com/x")).toBe("website");
    expect(profilePlatform("https://exemple.fr")).toBe("website");
    expect(profilePlatform("pas une url")).toBe("website");
  });
});
