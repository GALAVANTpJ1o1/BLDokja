import type { KPattern } from "cubing/kpuzzle";
import { at } from "../core/arrays.js";
import { faceletsOf, type Puzzle } from "../core/puzzle.js";
import { pieceOfSticker, stickerName } from "../pieces/names.js";

/**
 * Stickering masks for cubing.js's 3D player (BRIEF §3: "everything dim except the buffer and the
 * targets"). The player keys a mask by piece identity and facelet, so a mask follows pieces as they
 * move; a trainer thinks in slots ("the sticker now in UFR"). This turns a per-slot choice into the
 * player's per-piece mask for a given displayed state.
 *
 * The player's 3D stickers carry (orbit, piece, facelet) equal to the kpuzzle (orbit, position,
 * label) of their solved slot. test/display/stickering.test.ts checks that against the player's own
 * puzzle geometry, sticker by sticker, rather than assuming it.
 *
 * Interchangeable pieces have no identity to follow. cubing.js's 4x4 gives the four centres of a colour
 * one piece value, and the player draws every one of them with that value's mask, so a mask can light a
 * colour of x-centres but not one x-centre (D-040). Here each such colour gets the most visible mask any
 * of its slots asked for, so lighting one centre lights its colour instead of depending on which slot
 * happened to be written last. Trainers that need one x-centre lit use the flat net, which draws slots.
 */
export type FaceletMask = "regular" | "dim" | "ignored" | "invisible";

export interface PlayerStickeringMask {
  readonly orbits: Record<string, { readonly pieces: { readonly facelets: FaceletMask[] }[] }>;
}

/**
 * For each slot (geometry sticker index), the name of the slot, of the sticker showing there, and of
 * the piece the slot is part of ("UFR" for each of the slots UFR, FUR and RUF). The piece is what a mask
 * needs to show the rest of a highlighted piece: every slot of it, whatever is sitting there.
 */
export interface SlotView {
  readonly slot: string;
  readonly sticker: string;
  readonly piece: string;
}

export function slotViews(puzzle: Puzzle, pattern: KPattern): SlotView[] {
  const facelets = faceletsOf(puzzle, pattern);
  return Array.from(facelets, (home, slot) => ({ slot: stickerName(puzzle.geometry, slot), sticker: stickerName(puzzle.geometry, home), piece: pieceOfSticker(puzzle.geometry, slot) }));
}

export function stickeringMask(puzzle: Puzzle, pattern: KPattern, maskFor: (view: SlotView) => FaceletMask): PlayerStickeringMask {
  const facelets = faceletsOf(puzzle, pattern);
  const orbits: Record<string, { pieces: { facelets: FaceletMask[] }[] }> = {};
  const definitions = new Map(puzzle.kpuzzle.definition.orbits.map((o) => [o.orbitName, o]));
  for (const orbit of puzzle.stickerMap.orbits) {
    const orientations = definitions.get(orbit.orbit)?.numOrientations ?? orbit.stickersPerPiece;
    orbits[orbit.orbit] = { pieces: Array.from({ length: orbit.numPieces }, () => ({ facelets: new Array<FaceletMask>(orientations).fill("regular") })) };
  }
  // For interchangeable pieces: the mask chosen so far for each (orbit, piece value).
  const byValue = new Map<string, FaceletMask>();
  facelets.forEach((home, slot) => {
    const where = at(puzzle.stickerMap.slotOfSticker, home);
    const orbit = at(puzzle.stickerMap.orbits, where.orbitIndex);
    const pieces = orbits[orbit.orbit]?.pieces;
    const piece = pieces?.[where.position];
    if (pieces === undefined || piece === undefined) throw new Error(`no mask entry for ${orbit.orbit} ${where.position}`);
    const mask = maskFor({ slot: stickerName(puzzle.geometry, slot), sticker: stickerName(puzzle.geometry, home), piece: pieceOfSticker(puzzle.geometry, slot) });
    if (orbit.stickersPerPiece !== 1) {
      piece.facelets[where.label] = mask;
      return;
    }
    // Single-sticker pieces (centres) have extra orientation facelets in the player; they all get the mask,
    // and so does every piece sharing this one's value.
    const value = at(orbit.defaultPieces, where.position);
    const key = `${orbit.orbit}:${String(value)}`;
    const earlier = byValue.get(key);
    const chosen = earlier === undefined || VISIBILITY[mask] > VISIBILITY[earlier] ? mask : earlier;
    byValue.set(key, chosen);
    orbit.defaultPieces.forEach((v, position) => {
      if (v === value) pieces[position]?.facelets.fill(chosen);
    });
  });
  return { orbits };
}

const VISIBILITY: Readonly<Record<FaceletMask, number>> = { regular: 3, dim: 2, ignored: 1, invisible: 0 };
