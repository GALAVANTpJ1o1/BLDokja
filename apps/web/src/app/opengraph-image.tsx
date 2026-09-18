import { ImageResponse } from "next/og";
import { en } from "@/i18n/en";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Required for output:"export" -- there's no per-request server to render this on demand, so it
// must resolve to one fixed file at build time, same as every other route in this static site.
export const dynamic = "force-static";

/** Generated once at build time (static export), from the same brand tokens as the slate dark theme -- no external font or design tool, so it can never drift from the actual copy. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, background: "#213640", color: "#F0F5F7", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", gap: 14 }}>
          {["#94D8DB", "#F0F5F7", "#94D8DB"].map((c, i) => (
            <div key={i} style={{ width: 46, height: 46, borderRadius: 10, background: c }} />
          ))}
        </div>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>{en.site.name}</div>
        <div style={{ fontSize: 34, color: "#B1C7D0" }}>{en.site.tagline}</div>
      </div>
    ),
    { ...size },
  );
}
