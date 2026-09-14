import type { KPattern } from "cubing/kpuzzle";
import { at } from "../core/arrays.js";
import { faceletsOf, type Puzzle } from "../core/puzzle.js";
import { stickerName } from "../pieces/names.js";

/**
 * Stickering masks for cubing.js's 3D player (BRIEF §3: "everything dim except the buffer and the
 * targets"). The player keys a mask by piece identity and facelet, so a mask follows pieces as they
 * move; a trainer thinks in slots ("the sticker now in UFR"). This turns a per-slot choice into the
 * player's per-piece mask for a given displayed state.
 *
 * The player's 3D stickers carry (orbit, piece, facelet) equal to the kpuzzle (orbit, position,
 * label) of their solved slot. test/display/stickering.test.ts checks that against the player's own
 * puzzle geometry, sticker by sticker, rather than assuming it.
 */
export type FaceletMask = "regular" | "dim" | "ignored" | "invisible";

export interface PlayerStickeringMask {
  readonly orbits: Record<string, { readonly pieces: { readonly facelets: FaceletMask[] }[] }>;
}

/** For each slot (geometry sticker index), the name of the slot and of the sticker showing there. */
export interface SlotView {
  readonly slot: string;
  readonly sticker: string;
}

export function slotViews(puzzle: Puzzle, pattern: KPattern): SlotView[] {
  const facelets = faceletsOf(puzzle, pattern);
  return Array.from(facelets, (home, slot) => ({ slot: stickerName(puzzle.geometry, slot), sticker: stickerName(puzzle.geometry, home) }));
}

export function stickeringMask(puzzle: Puzzle, pattern: KPattern, maskFor: (view: SlotView) => FaceletMask): PlayerStickeringMask {
  const facelets = faceletsOf(puzzle, pattern);
  const orbits: Record<string, { pieces: { facelets: FaceletMask[] }[] }> = {};
  const definitions = new Map(puzzle.kpuzzle.definition.orbits.map((o) => [o.orbitName, o]));
  for (const orbit of puzzle.stickerMap.orbits) {
    const orientations = definitions.get(orbit.orbit)?.numOrientations ?? orbit.stickersPerPiece;
    orbits[orbit.orbit] = { pieces: Array.from({ length: orbit.numPieces }, () => ({ facelets: new Array<FaceletMask>(orientations).fill("regular") })) };
  }
  facelets.forEach((home, slot) => {
    const where = at(puzzle.stickerMap.slotOfSticker, home);
    const orbit = at(puzzle.stickerMap.orbits, where.orbitIndex);
    const piece = orbits[orbit.orbit]?.pieces[where.position];
    if (piece === undefined) throw new Error(`no mask entry for ${orbit.orbit} ${where.position}`);
    const mask = maskFor({ slot: stickerName(puzzle.geometry, slot), sticker: stickerName(puzzle.geometry, home) });
    // Single-sticker pieces (centres) have extra orientation facelets in the player; they all get the mask.
    if (orbit.stickersPerPiece === 1) piece.facelets.fill(mask);
    else piece.facelets[where.label] = mask;
  });
  return { orbits };
}
