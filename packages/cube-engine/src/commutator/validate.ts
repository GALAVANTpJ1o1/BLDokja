import { KPattern, type KPatternData } from "cubing/kpuzzle";
import { at, mod } from "../core/arrays.js";
import { faceletsOf, verifiedMoves, type Puzzle, type PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { pieceTypesFor, type PieceType, type PieceTypeId, type StickerInfo } from "../pieces/piece-types.js";
import { stickersByOrbit, type AffectedOrbit } from "./effect.js";
import { expandNodes, formatMoves, invertMoves } from "./expand.js";
import { parseAlg, type AlgParseError, type ParsedAlg } from "./parse.js";

/**
 * Commutator validation. A comm for targets [t1, t2] is checked by what it does, not by a written
 * definition of direction: build the state a solver would trace as exactly t1 then t2, apply the
 * alg, and require the whole puzzle to be solved.
 */

export type ThreeCycleError =
  | { readonly code: "unknown-sticker"; readonly sticker: string }
  | { readonly code: "mixed-piece-types"; readonly stickers: readonly string[] }
  | { readonly code: "same-piece"; readonly stickers: readonly [string, string] }
  | { readonly code: "interchangeable-pieces-unsupported"; readonly pieceType: PieceTypeId };

export type ValidateCommError =
  | ThreeCycleError
  | { readonly code: "invalid-alg"; readonly error: AlgParseError }
  | { readonly code: "wrong-puzzle"; readonly expected: PuzzleId; readonly actual: PuzzleId };

export type CommValidation =
  | { readonly valid: true }
  /** The inverse alg solves the case: the comm is written the wrong way round. */
  | { readonly valid: false; readonly reason: "reversed" }
  /** Stickers left unsolved after applying the alg. */
  | { readonly valid: false; readonly reason: "wrong-effect"; readonly unsolved: readonly AffectedOrbit[] };

export type ThreeCycle = readonly [buffer: string, first: string, second: string];

function resolveCycle(puzzle: Puzzle, cycle: ThreeCycle): Result<{ type: PieceType; stickers: StickerInfo[] }, ThreeCycleError> {
  const types = pieceTypesFor(puzzle);
  const found: { type: PieceType; sticker: StickerInfo }[] = [];
  for (const name of cycle) {
    const match = types.flatMap((type) => {
      const sticker = type.stickerByName(name);
      return sticker === undefined ? [] : [{ type, sticker }];
    });
    const first = match[0];
    if (first === undefined) return err({ code: "unknown-sticker", sticker: name });
    found.push(first);
  }
  const type = at(found, 0).type;
  if (found.some((f) => f.type.id !== type.id)) return err({ code: "mixed-piece-types", stickers: [...cycle] });
  if (type.interchangeable) return err({ code: "interchangeable-pieces-unsupported", pieceType: type.id });
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      if (at(found, i).sticker.position === at(found, j).sticker.position) {
        return err({ code: "same-piece", stickers: [at(cycle, i), at(cycle, j)] });
      }
    }
  }
  return ok({ type, stickers: found.map((f) => f.sticker) });
}

const fixedOrientations = new WeakMap<Puzzle, Map<string, readonly (readonly number[])[]>>();

/**
 * For a piece type that can't reorient within a slot (4x4 wings): the kpuzzle orientation piece `p`
 * has at position `q` in every reachable state, as `table[p][q]`. Found by following each piece
 * through the verified move definitions, not assumed to be 0: kpuzzle labels a wing's stickers
 * per slot, so a wing away from home can carry orientation 1.
 */
function fixedOrientationTable(puzzle: Puzzle, orbitName: string): readonly (readonly number[])[] {
  let byOrbit = fixedOrientations.get(puzzle);
  if (byOrbit === undefined) {
    byOrbit = new Map();
    fixedOrientations.set(puzzle, byOrbit);
  }
  const cached = byOrbit.get(orbitName);
  if (cached !== undefined) return cached;

  const orbitDef = puzzle.kpuzzle.definition.orbits.find((o) => o.orbitName === orbitName);
  if (orbitDef === undefined) throw new Error(`no orbit ${orbitName}`);
  const { numPieces, numOrientations } = orbitDef;
  const steps = verifiedMoves(puzzle.id).map((move) => {
    const data = puzzle.kpuzzle.moveToTransformation(move).transformationData[orbitName];
    if (data === undefined) throw new Error(`${move} has no ${orbitName} data`);
    // Where the piece at each position goes, and the orientation it gains.
    const destination = new Array<number>(numPieces);
    data.permutation.forEach((source, position) => (destination[source] = position));
    return { destination, delta: data.orientationDelta };
  });

  const table = Array.from({ length: numPieces }, (_, piece) => {
    const orientationAt = new Array<number | undefined>(numPieces).fill(undefined);
    orientationAt[piece] = 0;
    const queue = [piece];
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      const k = orientationAt[next] ?? 0;
      for (const { destination, delta } of steps) {
        const to = at(destination, next);
        const reached = mod(k + at(delta, to), numOrientations);
        const known = orientationAt[to];
        if (known === undefined) {
          orientationAt[to] = reached;
          queue.push(to);
        } else if (known !== reached) {
          throw new Error(`${orbitName} piece ${piece} can reach position ${to} in two orientations`);
        }
      }
    }
    return orientationAt.map((k) => k ?? 0);
  });
  byOrbit.set(orbitName, table);
  return table;
}

/**
 * The state whose trace from `buffer` is exactly `first`, `second`: the buffer slot holds the
 * `first` sticker, the `first` slot holds the `second` sticker, and the `second` slot holds the
 * buffer sticker, each piece carrying its other stickers along. Every other piece is solved.
 */
export function threeCyclePattern(puzzle: Puzzle, cycle: ThreeCycle): Result<KPattern, ThreeCycleError> {
  const resolved = resolveCycle(puzzle, cycle);
  if (!resolved.ok) return resolved;
  const { type, stickers } = resolved.value;
  const orbit = at(puzzle.stickerMap.orbits, type.orbitIndex);
  const oriented = type.orientationOrder > 1;
  const n = oriented ? type.orientationOrder : 1;
  const label = (s: StickerInfo) => (oriented ? s.label : 0);

  const defaults = puzzle.kpuzzle.defaultPattern().patternData;
  const base = defaults[type.orbit];
  if (base === undefined) throw new Error(`default pattern has no ${type.orbit} orbit`);
  const pieces = [...base.pieces];
  const orientation = [...base.orientation];
  const fixed = oriented ? undefined : fixedOrientationTable(puzzle, type.orbit);
  // Slot of stickers[i] receives the piece of stickers[i + 1]. For pieces that can twist or flip,
  // sticker j of a piece with orientation k shows in label slot j + sign·k, so
  // k = sign·(slot label − sticker label).
  for (let i = 0; i < 3; i++) {
    const slot = at(stickers, i);
    const incoming = at(stickers, (i + 1) % 3);
    pieces[slot.position] = at(orbit.defaultPieces, incoming.position);
    orientation[slot.position] =
      fixed === undefined ? mod(type.orientationSign * (label(slot) - label(incoming)), n) : at(at(fixed, incoming.position), slot.position);
  }
  const data: KPatternData = { ...defaults, [type.orbit]: { ...base, pieces, orientation } };
  return ok(new KPattern(puzzle.kpuzzle, data));
}

function isSolved(puzzle: Puzzle, pattern: KPattern): boolean {
  return pattern.isIdentical(puzzle.kpuzzle.defaultPattern());
}

/** Stickers not showing their own colour in their own slot (identical pieces compare by colour). */
function unsolvedStickers(puzzle: Puzzle, pattern: KPattern): AffectedOrbit[] {
  const facelets = faceletsOf(puzzle, pattern);
  const { geometry, stickerMap } = puzzle;
  const unsolved: number[] = [];
  facelets.forEach((home, slot) => {
    const orbit = at(stickerMap.orbits, at(stickerMap.slotOfSticker, slot).orbitIndex);
    const wrong = orbit.interchangeable ? geometry.sticker(home).face !== geometry.sticker(slot).face : home !== slot;
    if (wrong) unsolved.push(slot);
  });
  return stickersByOrbit(puzzle, unsolved);
}

export function validateComm(puzzle: Puzzle, alg: string | ParsedAlg, cycle: ThreeCycle): Result<CommValidation, ValidateCommError> {
  let parsed: ParsedAlg;
  if (typeof alg === "string") {
    const result = parseAlg(puzzle.id, alg);
    if (!result.ok) return err({ code: "invalid-alg", error: result.error });
    parsed = result.value;
  } else {
    if (alg.puzzle !== puzzle.id) return err({ code: "wrong-puzzle", expected: puzzle.id, actual: alg.puzzle });
    parsed = alg;
  }
  const start = threeCyclePattern(puzzle, cycle);
  if (!start.ok) return start;

  const moves = expandNodes(parsed.nodes);
  const end = start.value.applyAlg(formatMoves(moves));
  if (isSolved(puzzle, end)) return ok({ valid: true });
  if (isSolved(puzzle, start.value.applyAlg(formatMoves(invertMoves(moves))))) return ok({ valid: false, reason: "reversed" });
  return ok({ valid: false, reason: "wrong-effect", unsolved: unsolvedStickers(puzzle, end).filter((o) => o.stickers.length > 0) });
}
