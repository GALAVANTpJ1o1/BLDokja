import type { MetadataRoute } from "next";
import { loadLessons } from "@/content/lessons/source";

const SITE_URL = "https://bldokja.pages.dev";

/** Static pages, excluding /lab/ (design review, noindex per its own metadata -- kept out of the sitemap for the same reason). */
const STATIC_PATHS = [
  "/", "/learn/", "/practice/", "/practice/3style/", "/practice/4bld/", "/practice/algorithms/",
  "/practice/big-cubes/", "/practice/debug/", "/practice/difficulty/", "/practice/first-solve/",
  "/practice/levels/", "/practice/m2op/", "/practice/memory/", "/practice/pairs/", "/practice/reference/",
  "/practice/sandbox/", "/practice/speffz/", "/practice/trace/", "/practice/weak/",
  "/practice/f2l/", "/practice/last-layer/", "/reference/", "/reference/f2l/", "/reference/2look-oll/", "/reference/2look-pll/", "/reference/oll/", "/reference/pll/",
  "/progress/", "/settings/", "/settings/lettering/", "/account/", "/leaderboard/", "/contact/", "/privacy/",
] as const;

// Required for output:"export" -- resolves to one fixed file at build time.
export const dynamic = "force-static";

/** Generated at build time for the static export -- one entry per real route, lesson pages included, so nothing needs hand-updating as lessons are added. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lessons = loadLessons().map((l): MetadataRoute.Sitemap[number] => ({ url: `${SITE_URL}/learn/${l.frontmatter.id}/` }));
  return [...STATIC_PATHS.map((path): MetadataRoute.Sitemap[number] => ({ url: `${SITE_URL}${path}` })), ...lessons];
}
