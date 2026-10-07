import type { MetadataRoute } from "next";
import { SITE_URL as BASE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Espaces privés et liens à jeton, dans les deux langues
      disallow: [
        "/admin",
        "/api",
        "/membre",
        "/en/membre",
        "/articles/apercu",
        "/en/articles/apercu",
        "/newsletter",
        "/en/newsletter",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
