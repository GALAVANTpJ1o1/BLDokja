/**
 * Builds fixture states from hand-written targets, without ever calling the tracer.
 *
 * Tracing shoots each target with a swap; every swap is its own inverse. So starting from the
 * final state (solved, apart from any pieces left twisted or flipped) and applying the target
 * swaps in reverse order gives a state whose trace is exactly those targets, provided the list
 * obeys the tracing rules (breaks into the lowest eligible letter, break cycles close on the same
 * piece). If the hand-written list breaks a rule, the tracer and oracle disagree with it and the
 * fixture fails.
 */
import { KPattern } from "cubing/kpuzzle";
import type { Face } from "../../src/core/geometry.js";
import type { Puzzle } from "../../src/core/puzzle.js";
import { faceletsToPattern } from "../../src/core/sticker-map.js";
import type { Scheme } from "../../src/lettering/scheme.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import type { PieceTypeId } from "../../src/pieces/piece-types.js";
import { TraceOracle, type Colours } from "../oracle/trace-oracle.js";
import type { TraceFixture, TypeFixture } from "./trace-fixtures.js";

const GREEK = "Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω".split(" ");
const LATIN = "A B C D E F G H I J K L M N O P Q R S T U V W X".split(" ");

/** Speffz with the alphabet reversed onto Greek letters (A→Ω … X→Α), so "lowest letter" order differs. */
export function reverseGreekScheme(puzzle: Puzzle): Scheme {
  const base = speffzScheme(puzzle);
  const letters: Scheme["letters"] = {};
  for (const [id, entries] of Object.entries(base.letters)) {
    letters[id as PieceTypeId] = Object.fromEntries(
      Object.entries(entries).map(([sticker, letter]) => [sticker, GREEK[23 - LATIN.indexOf(letter)] ?? "?"]),
    );
  }
  return { ...base, id: "reverse-greek", name: "Reverse Greek", letters };
}

export function fixtureScheme(puzzle: Puzzle, fixture: TraceFixture): Scheme {
  return fixture.scheme === "speffz" ? speffzScheme(puzzle) : reverseGreekScheme(puzzle);
}

export function splitTargets(targets: string): string[] {
  return targets.split(/\s+/).filter((t) => t.length > 0);
}

const TYPE_IDS = ["corners", "edges", "wings"] as const;

export function typeFixtures(fixture: TraceFixture): [(typeof TYPE_IDS)[number], TypeFixture][] {
  return TYPE_IDS.flatMap((id) => {
    const spec = fixture[id];
    return spec === undefined ? [] : [[id, spec] as [(typeof TYPE_IDS)[number], TypeFixture]];
  });
}

export function constructColours(puzzle: Puzzle, fixture: TraceFixture): Colours {
  if (fixture.scramble !== undefined) return new TraceOracle(puzzle.size, "corners").coloursAfter(fixture.scramble);
  const scheme = fixtureScheme(puzzle, fixture);
  let colours: Colours | undefined;
  for (const [typeId, spec] of typeFixtures(fixture)) {
    const oracle = new TraceOracle(puzzle.size, typeId);
    colours ??= oracle.solvedColours();
    const letters = scheme.letters[typeId] ?? {};
    const stickerOfLetter = new Map(Object.entries(letters).map(([sticker, letter]) => [letter, sticker]));
    for (const twist of spec.twists ?? []) {
      oracle.twist(colours, oracle.cubieOfSlot(oracle.slotNamed(twist.piece)), twist.turns);
    }
    const bufferSlot = oracle.slotNamed(spec.buffer);
    for (const letter of [...splitTargets(spec.targets)].reverse()) {
      const sticker = stickerOfLetter.get(letter);
      if (sticker === undefined) throw new Error(`${fixture.id}: letter ${letter} is not in the ${typeId} scheme`);
      oracle.swap(colours, bufferSlot, oracle.slotNamed(sticker));
    }
  }
  if (colours === undefined) throw new Error(`${fixture.id} has no piece types`);
  return colours;
}

export interface ColourReaders {
  readonly corners: TraceOracle;
  readonly twoSticker: TraceOracle;
}

export function colourReaders(puzzle: Puzzle): ColourReaders {
  return { corners: new TraceOracle(puzzle.size, "corners"), twoSticker: new TraceOracle(puzzle.size, puzzle.size === 3 ? "edges" : "wings") };
}

/** A kpuzzle pattern with the given colours (every piece identified by its colours). */
export function coloursToPattern(puzzle: Puzzle, colours: Colours, readers: ColourReaders = colourReaders(puzzle)): KPattern {
  const facelets = new Int32Array(puzzle.geometry.stickerCount);
  const { corners, twoSticker } = readers;
  for (const sticker of puzzle.geometry.stickers) {
    const cubie = puzzle.geometry.cubieOf(sticker.index);
    const colour = colours[sticker.index] as Face;
    if (cubie.stickers.length === 1) {
      const sameColour = puzzle.geometry.stickers.find((s) => s.face === colour && puzzle.geometry.cubieOf(s.index).stickers.length === 1);
      facelets[sticker.index] = colour === sticker.face ? sticker.index : (sameColour?.index ?? -1);
      continue;
    }
    const oracle = cubie.stickers.length === 3 ? corners : twoSticker;
    facelets[sticker.index] = oracle.homeSlotOf(colours, sticker.index, { kind: "corners", buffer: "", letters: {}, orientedInPlace: "separate" });
  }
  return new KPattern(puzzle.kpuzzle, faceletsToPattern(puzzle.stickerMap, facelets));
}
