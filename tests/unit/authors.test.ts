import { describe, expect, it } from "vitest";
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
