import { KPattern, type KPatternData } from "cubing/kpuzzle";
import { at, mod } from "../core/arrays.js";
import { identityPerm, type StickerPerm } from "../core/move-table.js";
import { faceletsOf, verifiedMoves, type Puzzle, type PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { cornerTwistDirection, type TwistDirection } from "../pieces/orientation.js";
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

export type StickerCycleError = ThreeCycleError | { readonly code: "cycle-too-short"; readonly length: number };

function resolveCycle(puzzle: Puzzle, cycle: readonly string[]): Result<{ type: PieceType; stickers: StickerInfo[] }, ThreeCycleError> {
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
  for (let i = 0; i < cycle.length; i++) {
    for (let j = i + 1; j < cycle.length; j++) {
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
 * The sticker permutation of a rigid exchange: the piece holding `a` goes to the slot holding `b` and
 * back, each carrying its other stickers, and nothing else moves. This is what one step of a swap method
 * has to do, apart from the swap's own side effect.
 *
 * Built straight from the sticker model rather than from a kpuzzle pattern, because a pattern names
 * identical pieces by colour: on 4x4 the four U x-centres all read as "the U piece", so a pattern can't
 * say which slot a particular one came from. The permutation here can.
 *
 * `undefined` means the exchange is impossible as named. A wing can't be flipped in its slot, so of its
 * two stickers only one can stand opposite a given buffer sticker; naming the other describes a state the
 * cube can't reach.
 */
export function rigidExchangePerm(puzzle: Puzzle, a: string, b: string): Result<StickerPerm, ThreeCycleError | { readonly code: "impossible-exchange"; readonly stickers: readonly [string, string] }> {
  const resolved = resolveCycle(puzzle, [a, b]);
  if (!resolved.ok) return resolved;
  const { type, stickers } = resolved.value;
  const [first, second] = stickers as [StickerInfo, StickerInfo];
  const orbit = at(puzzle.stickerMap.orbits, type.orbitIndex);
  const oriented = type.orientationOrder > 1;
  // Stickers per piece, not orientations: a wing has two stickers but can't turn in its slot, and its
  // orientation in a slot comes from the table instead.
  const stickersPerPiece = orbit.stickersPerPiece;
  const fixed = oriented ? undefined : fixedOrientationTable(puzzle, type.orbit);
  const label = (sticker: StickerInfo) => (oriented ? sticker.label : 0);

  const perm = identityPerm(puzzle.geometry.stickerCount);
  // Read the same way as a pattern's facelets: the slot at label j + sign·k of this position shows the
  // home sticker of label j of the piece that came here. k is the incoming piece's orientation here.
  for (const [slot, incoming] of [
    [first, second],
    [second, first],
  ] as const) {
    const k = fixed === undefined ? mod(type.orientationSign * (label(slot) - label(incoming)), type.orientationOrder) : at(at(fixed, incoming.position), slot.position);
    for (let j = 0; j < stickersPerPiece; j++) {
      perm[at(at(orbit.slots, slot.position), mod(j + orbit.orientationSign * k, stickersPerPiece))] = at(at(orbit.slots, incoming.position), j);
    }
  }
  if (at(perm, first.index) !== second.index) return err({ code: "impossible-exchange", stickers: [a, b] });
  return ok(perm);
}

/**
 * The state whose trace from `buffer` is exactly `first`, `second`: the buffer slot holds the
 * `first` sticker, the `first` slot holds the `second` sticker, and the `second` slot holds the
 * buffer sticker, each piece carrying its other stickers along. Every other piece is solved.
 */
export function threeCyclePattern(puzzle: Puzzle, cycle: ThreeCycle): Result<KPattern, ThreeCycleError> {
  return cyclePattern(puzzle, cycle);
}

/**
 * The state whose trace from `stickers[0]` is exactly `stickers[1]`, …, `stickers[n − 1]`, built the
 * same way as `threeCyclePattern`: each slot receives the piece of the next sticker, the last slot
 * receives the buffer's piece, and every other piece is solved. With two stickers it is the rigid
 * exchange of the buffer piece and the target piece that a swap-based method performs.
 *
 * Interchangeable pieces (4x4 x-centres) work too: a slot receives the *colour* of the next sticker's
 * piece, which is all those pieces have. A cycle among slots of one colour therefore builds the solved
 * state, because that is what such a cycle looks like on a cube.
 */
export function stickerCyclePattern(puzzle: Puzzle, stickers: readonly string[]): Result<KPattern, StickerCycleError> {
  if (stickers.length < 2) return err({ code: "cycle-too-short", length: stickers.length });
  return cyclePattern(puzzle, stickers);
}

function cyclePattern(puzzle: Puzzle, cycle: readonly string[]): Result<KPattern, ThreeCycleError> {
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
  for (let i = 0; i < stickers.length; i++) {
    const slot = at(stickers, i);
    const incoming = at(stickers, (i + 1) % stickers.length);
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

type AlgInputError = { readonly code: "invalid-alg"; readonly error: AlgParseError } | { readonly code: "wrong-puzzle"; readonly expected: PuzzleId; readonly actual: PuzzleId };

function readAlg(puzzle: Puzzle, alg: string | ParsedAlg): Result<ParsedAlg, AlgInputError> {
  if (typeof alg !== "string") {
    return alg.puzzle === puzzle.id ? ok(alg) : err({ code: "wrong-puzzle", expected: puzzle.id, actual: alg.puzzle });
  }
  const result = parseAlg(puzzle.id, alg);
  return result.ok ? result : err({ code: "invalid-alg", error: result.error });
}

/** Apply the alg to the case state: valid if the whole puzzle ends solved. */
function judge(puzzle: Puzzle, parsed: ParsedAlg, start: KPattern): CommValidation {
  const moves = expandNodes(parsed.nodes);
  const end = start.applyAlg(formatMoves(moves));
  if (isSolved(puzzle, end)) return { valid: true };
  if (isSolved(puzzle, start.applyAlg(formatMoves(invertMoves(moves))))) return { valid: false, reason: "reversed" };
  return { valid: false, reason: "wrong-effect", unsolved: unsolvedStickers(puzzle, end).filter((o) => o.stickers.length > 0) };
}

export function validateComm(puzzle: Puzzle, alg: string | ParsedAlg, cycle: ThreeCycle): Result<CommValidation, ValidateCommError> {
  const parsed = readAlg(puzzle, alg);
  if (!parsed.ok) return parsed;
  const start = threeCyclePattern(puzzle, cycle);
  if (!start.ok) return start;
  return ok(judge(puzzle, parsed.value, start.value));
}

/** A twist case (a corner and its direction) or a flip case (an edge), from a buffer. */
export interface OrientationCase {
  /** Buffer sticker; only its piece matters. */
  readonly buffer: string;
  /** Name of the piece that is twisted or flipped in place. */
  readonly target: string;
  /** For twists: the direction the target is twisted in, as `trace` reports it (D-012). Omitted for flips. */
  readonly direction?: TwistDirection;
}

export type OrientationCaseError =
  | { readonly code: "unknown-sticker"; readonly sticker: string }
  | { readonly code: "unknown-piece"; readonly piece: string }
  | { readonly code: "same-piece"; readonly pieces: readonly [string, string] }
  | { readonly code: "no-orientation"; readonly pieceType: PieceTypeId }
  | { readonly code: "direction-required" }
  | { readonly code: "direction-not-applicable" };

/**
 * The state a twist or flip alg solves: the target piece twisted `direction` (or flipped) in its own
 * slot, the buffer piece twisted the other way (or flipped), everything else solved. Tracing that
 * state reports exactly those two pieces and no targets (tested).
 */
export function orientationPairPattern(puzzle: Puzzle, orientationCase: OrientationCase): Result<KPattern, OrientationCaseError> {
  const type = pieceTypesFor(puzzle).find((t) => t.stickerByName(orientationCase.buffer) !== undefined);
  const buffer = type?.stickerByName(orientationCase.buffer);
  if (type === undefined || buffer === undefined) return err({ code: "unknown-sticker", sticker: orientationCase.buffer });
  if (type.orientationOrder === 1 || type.interchangeable) return err({ code: "no-orientation", pieceType: type.id });
  const target = type.pieceByName(orientationCase.target);
  if (target === undefined) return err({ code: "unknown-piece", piece: orientationCase.target });
  const bufferPiece = at(type.pieces, buffer.position);
  if (target.position === buffer.position) return err({ code: "same-piece", pieces: [bufferPiece.name, target.name] });

  const n = type.orientationOrder;
  let k = 1;
  if (n === 3) {
    if (orientationCase.direction === undefined) return err({ code: "direction-required" });
    k = [1, 2].find((candidate) => cornerTwistDirection(puzzle, type, target.position, candidate) === orientationCase.direction) ?? 1;
  } else if (orientationCase.direction !== undefined) {
    return err({ code: "direction-not-applicable" });
  }

  const defaults = puzzle.kpuzzle.defaultPattern().patternData;
  const base = defaults[type.orbit];
  if (base === undefined) throw new Error(`default pattern has no ${type.orbit} orbit`);
  const orientation = [...base.orientation];
  orientation[target.position] = k;
  orientation[buffer.position] = mod(-k, n);
  return ok(new KPattern(puzzle.kpuzzle, { ...defaults, [type.orbit]: { ...base, orientation } }));
}

export function validateOrientationAlg(
  puzzle: Puzzle,
  alg: string | ParsedAlg,
  orientationCase: OrientationCase,
): Result<CommValidation, OrientationCaseError | AlgInputError> {
  const parsed = readAlg(puzzle, alg);
  if (!parsed.ok) return parsed;
  const start = orientationPairPattern(puzzle, orientationCase);
  if (!start.ok) return start;
  return ok(judge(puzzle, parsed.value, start.value));
}
