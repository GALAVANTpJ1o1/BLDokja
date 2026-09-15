import type { MetadataRoute } from "next";
import { INTERFACE } from "@/design/palette";
import { en } from "@/i18n/en";

export const dynamic = "force-static";

/** The web app manifest (BRIEF §10: PWA). Icons are drawn by scripts/icons.mjs from the design tokens. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: en.site.name,
    short_name: en.site.name,
    description: en.site.tagline,
    lang: "en-GB",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: INTERFACE.dark.ground,
    theme_color: INTERFACE.dark.ground,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
