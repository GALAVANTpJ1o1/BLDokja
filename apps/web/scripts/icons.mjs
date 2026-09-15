/**
 * Draws the app icons (PWA manifest, favicon, Apple touch icon) from the design tokens, so no image is
 * made by hand: one cube face, nine stickers on the cube body, on the dark ground. Colours are read from
 * src/design/palette.ts (standard palette, dark theme), which palette.test.ts keeps in step with tokens.css.
 *
 *   node scripts/icons.mjs   # writes public/icon.svg, public/icons/*.png, public/apple-touch-icon.png
 *
 * PNGs are rasterised here with 4×4 supersampling and written with a minimal encoder (zlib from Node).
 */
import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const root = join(import.meta.dirname, "..");
const palette = readFileSync(join(root, "src", "design", "palette.ts"), "utf8");
const pick = (pattern) => {
  const match = palette.match(pattern);
  if (match?.[1] === undefined) throw new Error(`palette.ts: ${pattern} not found`);
  return match[1];
};
const standard = pick(/standard: \{([^}]*)\}/);
const face = (f) => {
  const match = standard.match(new RegExp(`${f}: "(#[0-9A-F]{6})"`));
  if (match?.[1] === undefined) throw new Error(`no ${f} colour`);
  return match[1];
};
const ground = pick(/dark: \{ ground: "(#[0-9A-F]{6})"/);
const body = pick(/CUBE_BODY = "(#[0-9A-F]{6})"/);

// A face mid-solve: white centre, the other five colours around it, no two equal neighbours in a row.
const STICKERS = [
  ["R", "U", "F"],
  ["B", "U", "D"],
  ["F", "L", "R"],
].map((row) => row.map(face));

/** Shapes in a 0..1 square: the ground, the body, and nine stickers. `inset` shrinks the mark for maskable icons. */
function shapes({ inset, roundGround }) {
  const bodySize = 0.72 * (1 - inset);
  const bodyStart = (1 - bodySize) / 2;
  const gap = bodySize * 0.045;
  const cell = (bodySize - gap * 4) / 3;
  const out = [{ x: 0, y: 0, w: 1, h: 1, r: roundGround ? 0.18 : 0, colour: ground }, { x: bodyStart, y: bodyStart, w: bodySize, h: bodySize, r: bodySize * 0.1, colour: body }];
  STICKERS.forEach((row, i) =>
    row.forEach((colour, j) => {
      out.push({ x: bodyStart + gap + j * (cell + gap), y: bodyStart + gap + i * (cell + gap), w: cell, h: cell, r: cell * 0.14, colour });
    }),
  );
  return out;
}

function inside(shape, px, py) {
  const { x, y, w, h, r } = shape;
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

function rasterise(size, options) {
  const list = shapes(options);
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (px + (sx + 0.5) / samples) / size;
          const v = (py + (sy + 0.5) / samples) / size;
          // The topmost shape covering the sample wins.
          const top = [...list].reverse().find((s) => inside(s, u, v));
          if (top === undefined) continue;
          const [cr, cg, cb] = rgb(top.colour);
          r += cr;
          g += cg;
          b += cb;
          a += 1;
        }
      }
      const o = (py * size + px) * 4;
      const n = samples * samples;
      pixels[o] = a === 0 ? 0 : Math.round(r / a);
      pixels[o + 1] = a === 0 ? 0 : Math.round(g / a);
      pixels[o + 2] = a === 0 ? 0 : Math.round(b / a);
      pixels[o + 3] = Math.round((a / n) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function svg(options) {
  const f = (n) => Number((n * 64).toFixed(3));
  const rects = shapes(options).map((s) => `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" rx="${f(s.r)}" fill="${s.colour}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${rects.join("")}</svg>\n`;
}

const publicDir = join(root, "public");
mkdirSync(join(publicDir, "icons"), { recursive: true });
writeFileSync(join(publicDir, "icon.svg"), svg({ inset: 0, roundGround: true }));
for (const size of [192, 512]) writeFileSync(join(publicDir, "icons", `icon-${size}.png`), png(size, rasterise(size, { inset: 0, roundGround: true })));
// Maskable: a full-bleed ground and the mark inside the 80% safe circle.
writeFileSync(join(publicDir, "icons", "maskable-512.png"), png(512, rasterise(512, { inset: 0.22, roundGround: false })));
writeFileSync(join(publicDir, "apple-touch-icon.png"), png(180, rasterise(180, { inset: 0.08, roundGround: false })));
console.log("icons: icon.svg, icons/icon-192.png, icons/icon-512.png, icons/maskable-512.png, apple-touch-icon.png");
