"use client";

import type { FaceName } from "@/design/palette";

/**
 * Sticker colours for cubing.js's 3D player (DESIGN.md: a colourblind preset recolours every face
 * colour, the cube included). The player takes its sticker colours from the puzzle geometry's
 * `get3d()`, and has no option for them, so the 3x3x3 loader's `pg()` is wrapped once: the geometry
 * it returns gives each sticker the current `--face-*` token of its face. Players read colours when
 * they are created, so the Cube component remounts its player when the palette changes.
 *
 * If a future cubing.js changes this shape, the wrapper leaves the loader alone and the player keeps
 * its own colours (logged once), rather than breaking the cube.
 */
let installed = false;

function currentFaceColours(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const faces: FaceName[] = ["U", "L", "F", "R", "B", "D"];
  return Object.fromEntries(faces.map((f) => [f, style.getPropertyValue(`--face-${f.toLowerCase()}`).trim()]));
}

interface StickerDatLike {
  stickers: { color: string; face: number }[];
  faces: { name: string }[];
}

interface GeometryLike {
  get3d(options?: unknown): StickerDatLike;
}

function looksLikeGeometry(value: unknown): value is GeometryLike {
  return typeof value === "object" && value !== null && typeof (value as { get3d?: unknown }).get3d === "function";
}

export async function installPlayerPalette(): Promise<void> {
  if (installed) return;
  installed = true;
  const { puzzles } = await import("cubing/puzzles");
  const loader = puzzles["3x3x3"] as unknown as { pg?: () => Promise<unknown> } | undefined;
  const original = loader?.pg;
  if (loader === undefined || original === undefined) {
    console.warn("cube palette: cubing.js has no 3x3x3 geometry loader; using its default colours");
    return;
  }
  loader.pg = async () => {
    const geometry = await original.call(loader);
    if (!looksLikeGeometry(geometry)) return geometry;
    const recoloured = Object.create(geometry) as GeometryLike;
    recoloured.get3d = (options?: unknown) => {
      const dat = geometry.get3d(options);
      const colours = currentFaceColours();
      return {
        ...dat,
        stickers: dat.stickers.map((s) => {
          const colour = colours[dat.faces[s.face]?.name ?? ""];
          return colour === undefined || colour === "" ? s : { ...s, color: colour };
        }),
      };
    };
    return recoloured;
  };
}
