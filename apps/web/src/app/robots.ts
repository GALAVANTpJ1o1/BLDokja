import type { MetadataRoute } from "next";

const SITE_URL = "https://bldokja.pages.dev";

// Required for output:"export" -- resolves to one fixed file at build time.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/lab/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
