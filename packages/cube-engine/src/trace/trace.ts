import type { KPattern } from "cubing/kpuzzle";
import { at, mod, permutationParity } from "../core/arrays.js";
import { centersRotation, wholeCubeRotationAlgs } from "../core/frame.js";
import type { Puzzle, PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { compileLettering, compareLetters, type Lettering, type Scheme, type SchemeIssue } from "../lettering/scheme.js";
import { cornerTwistDirection, referenceStickerSlot, type TwistDirection } from "../pieces/orientation.js";
import { PIECE_TYPE_SPECS, pieceType, type PieceType, type PieceTypeId, type StickerInfo } from "../pieces/piece-types.js";

/**
 * Tracing: scramble → the targets a blindfolded solver memorises for one piece type.
 *
 * The model is the "virtual swap" every BLD method is built on. The solver reads the sticker in
 * the buffer slot, shoots it to its home slot, and the piece that was there becomes the new
 * buffer contents. Nothing is solved physically; the tracer only follows the swaps.
 *
 * Rules (BRIEF §5.3), each covered by fixtures and property tests:
 * - Follow the cycle from the buffer until the buffer piece comes home.
 * - Then break into the next unsolved piece, chosen by `breakOrder`, and close that cycle on the
 *   same piece (possibly on a different sticker, if the cycle carries a twist).
 * - Solved pieces are never break targets.
 * - A piece in its own slot but misoriented is either reported in `twisted`/`flipped`
 *   (`orientedInPlace: "separate"`) or traced as two targets (`"asTargets"`).
 * - The buffer piece ending in its own slot but misoriented is reported, never a target.
 * - Pairs run straight across cycle boundaries; only a final odd target is left single.
 * - Parity is the actual permutation parity of the piece type, not a count of targets.
 *
 * Interchangeable pieces (4x4 x-centres) follow the same swap model with colours instead of pieces
 * (`runInterchangeableTrace`): a slot is solved when it holds its own colour, and the buffer's piece
 * may go to any slot of its colour that doesn't have that colour yet. Which one is a policy choice.
 */

export type TargetKind = "normal" | "cycleBreak" | "cycleClose" | "orientationTarget";

/**
 * How the cube is held while memorising (D-014). Every frame is one of the 24 whole-cube rotations,
 * applied after the scramble, so letters keep naming fixed slots in space.
 * - `centers` (3x3x3): the rotation that solves the centres.
 * - `asIs`: no rotation.
 * - `rotation` (4x4x4): a rotation you name, such as `x y`.
 * - `corner` (4x4x4): the one rotation that brings this corner piece home and oriented. A 4x4 has no
 *   fixed centres, so a corner is the orientation reference (DECISIONS D-032).
 */
export type Frame =
  | { readonly kind: "centers" }
  | { readonly kind: "asIs" }
  | { readonly kind: "rotation"; readonly alg: string }
  | { readonly kind: "corner"; readonly piece: string };

export interface TracePolicy {
  /** `"scheme"`: the lowest letter among eligible stickers. A list: first listed eligible sticker, then scheme order. */
  readonly breakOrder?: "scheme" | readonly string[];
  readonly orientedInPlace?: "separate" | "asTargets";
  /**
   * Interchangeable pieces only: which slot the buffer's piece goes to when several slots of its colour
   * need it. `"avoidBufferColour"` (default) first sets aside slots holding the buffer's own colour, so
   * that colour comes back to the buffer as late as possible, then picks by `breakOrder`; `"lowestLetter"`
   * picks by `breakOrder` alone. Avoiding the buffer's colour saves breaks (DECISIONS D-033).
   */
  readonly sameColour?: "lowestLetter" | "avoidBufferColour";
}

export interface TraceConfig {
  readonly pieceType: PieceTypeId;
  /** Sticker name of the buffer (for wings, either sticker of the buffer piece). */
  readonly buffer: string;
  readonly scheme: Scheme;
  /** Required for 4x4x4. Defaults to `centers` on 3x3x3. */
  readonly frame?: Frame;
  readonly policy?: TracePolicy;
}

export type TraceInput = { readonly alg: string } | { readonly pattern: KPattern };

export interface OrientedInPlace {
  readonly piece: string;
  /** Slot where the piece's reference sticker now shows. */
  readonly sticker: string;
  readonly letter: string;
  /** The reference sticker's own slot (where it shows when the piece is solved). */
  readonly homeSticker: string;
  readonly homeLetter: string;
  readonly direction: TwistDirection | "flip";
  readonly isBuffer: boolean;
}

export interface TraceCycle {
  /** Index of the first target in this cycle. */
  readonly start: number;
  /** Index one past the last target. */
  readonly end: number;
  readonly kind: "buffer" | "break" | "orientation";
}

export interface TraceResult {
  /** Letters in solve order. */
  readonly targets: string[];
  /** Targets grouped in twos; a trailing single is kept. */
  readonly pairs: [string, string?][];
  /** Indices where a new cycle starts after a break (including orientation-only cycles). */
  readonly cycleBreaks: number[];
  /** Letters of edges in place but flipped (reference-sticker slot). */
  readonly flipped: string[];
  /** Letters of corners in place but twisted (reference-sticker slot). */
  readonly twisted: string[];
  /** Names of pieces already solved in the scrambled state. */
  readonly solvedPieces: string[];
  /** Odd permutation of this piece type. */
  readonly parity: boolean;
  readonly targetCount: number;

  readonly buffer: { readonly sticker: string; readonly piece: string };
  readonly targetStickers: string[];
  readonly targetKinds: TargetKind[];
  readonly cycles: TraceCycle[];
  readonly orientedInPlace: OrientedInPlace[];
}

export type TraceError =
  | { readonly code: "invalid-alg"; readonly message: string }
  | { readonly code: "piece-type-not-on-puzzle"; readonly pieceType: PieceTypeId; readonly puzzle: PuzzleId }
  | { readonly code: "unknown-buffer"; readonly buffer: string }
  | { readonly code: "invalid-scheme"; readonly issues: readonly SchemeIssue[] }
  | { readonly code: "frame-required"; readonly puzzle: PuzzleId }
  | { readonly code: "frame-not-supported"; readonly puzzle: PuzzleId; readonly frame: Frame["kind"] }
  | { readonly code: "centers-not-normalisable" }
  | { readonly code: "unknown-rotation"; readonly alg: string }
  | { readonly code: "unknown-reference-corner"; readonly piece: string };

export type FrameError = Extract<TraceError, { readonly code: "frame-not-supported" | "centers-not-normalisable" | "unknown-rotation" | "unknown-reference-corner" }>;

/**
 * The rotation a frame calls for on this pattern, and the rotated pattern. The alg is a shortest x/y/z
 * form (empty when there's no rotation); applying it after the scramble gives the rotated pattern.
 */
export function applyFrame(puzzle: Puzzle, pattern: KPattern, frame: Frame): Result<{ readonly alg: string; readonly pattern: KPattern }, FrameError> {
  switch (frame.kind) {
    case "asIs":
      return ok({ alg: "", pattern });
    case "centers": {
      if (puzzle.id !== "3x3x3") return err({ code: "frame-not-supported", puzzle: puzzle.id, frame: frame.kind });
      const found = centersRotation(puzzle, pattern);
      return found === undefined ? err({ code: "centers-not-normalisable" }) : ok(found);
    }
    case "rotation": {
      if (puzzle.id === "3x3x3") return err({ code: "frame-not-supported", puzzle: puzzle.id, frame: frame.kind });
      let named;
      try {
        named = puzzle.kpuzzle.identityTransformation().applyAlg(frame.alg);
      } catch {
        return err({ code: "unknown-rotation", alg: frame.alg });
      }
      const rotation = wholeCubeRotationAlgs(puzzle).find((r) => r.transformation.isIdentical(named));
      if (rotation === undefined) return err({ code: "unknown-rotation", alg: frame.alg });
      return ok({ alg: rotation.alg, pattern: pattern.applyTransformation(rotation.transformation) });
    }
    case "corner": {
      if (puzzle.id === "3x3x3") return err({ code: "frame-not-supported", puzzle: puzzle.id, frame: frame.kind });
      const corners = pieceType(puzzle, "corners");
      const position = corners.pieceByName(frame.piece)?.position;
      if (position === undefined) return err({ code: "unknown-reference-corner", piece: frame.piece });
      // Rotations act freely and transitively on a corner's 24 placements, so exactly one fits.
      for (const rotation of wholeCubeRotationAlgs(puzzle)) {
        const rotated = pattern.applyTransformation(rotation.transformation);
        const data = rotated.patternData[corners.orbit];
        if (data?.pieces[position] === position && data.orientation[position] === 0) return ok({ alg: rotation.alg, pattern: rotated });
      }
      throw new Error(`no rotation brings ${frame.piece} home; the pattern is not a valid state`);
    }
  }
}

/** Compiled letterings, cached per scheme object (schemes are treated as immutable values). */
const letteringCache = new WeakMap<Scheme, Map<string, Result<Lettering, SchemeIssue[]>>>();

function cachedLettering(puzzle: Puzzle, scheme: Scheme, pieceTypeId: PieceTypeId): Result<Lettering, SchemeIssue[]> {
  let byType = letteringCache.get(scheme);
  if (byType === undefined) {
    byType = new Map();
    letteringCache.set(scheme, byType);
  }
  const key = `${puzzle.id}/${pieceTypeId}`;
  let compiled = byType.get(key);
  if (compiled === undefined) {
    compiled = compileLettering(puzzle, scheme, pieceTypeId);
    byType.set(key, compiled);
  }
  return compiled;
}

interface Target {
  readonly position: number;
  /** kpuzzle label of the target sticker (0 for unoriented piece types). */
  readonly label: number;
  readonly kind: TargetKind;
}

export function trace(puzzle: Puzzle, input: TraceInput, config: TraceConfig): Result<TraceResult, TraceError> {
  if (!PIECE_TYPE_SPECS[puzzle.id].some((s) => s.id === config.pieceType)) {
    return err({ code: "piece-type-not-on-puzzle", pieceType: config.pieceType, puzzle: puzzle.id });
  }
  const type = pieceType(puzzle, config.pieceType);

  const bufferSticker = type.stickerByName(config.buffer);
  if (bufferSticker === undefined) return err({ code: "unknown-buffer", buffer: config.buffer });

  const lettering = cachedLettering(puzzle, config.scheme, config.pieceType);
  if (!lettering.ok) return err({ code: "invalid-scheme", issues: lettering.error });

  let pattern: KPattern;
  if ("pattern" in input) {
    pattern = input.pattern;
  } else {
    try {
      pattern = puzzle.kpuzzle.defaultPattern().applyAlg(input.alg);
    } catch (error) {
      return err({ code: "invalid-alg", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const frame = config.frame ?? (puzzle.id === "3x3x3" ? { kind: "centers" as const } : undefined);
  if (frame === undefined) return err({ code: "frame-required", puzzle: puzzle.id });
  const framed = applyFrame(puzzle, pattern, frame);
  if (!framed.ok) return framed;
  pattern = framed.value.pattern;

  const data = pattern.patternData[type.orbit];
  if (data === undefined) throw new Error(`pattern has no ${type.orbit} orbit`);
  if (type.interchangeable) {
    // A piece value names its colour by the solved slot that holds it; identical pieces share one value.
    const homes = at(puzzle.stickerMap.orbits, type.orbitIndex).defaultPieces;
    return ok(runInterchangeableTrace(type, lettering.value, bufferSticker, data.pieces.map((v) => at(homes, v)), homes, config.policy ?? {}));
  }
  return ok(runTrace(puzzle, type, lettering.value, bufferSticker, [...data.pieces], [...data.orientation], config.policy ?? {}));
}

function runTrace(
  puzzle: Puzzle,
  type: PieceType,
  lettering: Lettering,
  buffer: StickerInfo,
  pieces: number[],
  orientation: number[],
  policy: TracePolicy,
): TraceResult {
  const oriented = type.orientationOrder > 1;
  const n = oriented ? type.orientationOrder : 1;
  const s = type.orientationSign;
  const pb = buffer.position;
  const jb = oriented ? buffer.label : 0;
  const separate = (policy.orientedInPlace ?? "separate") === "separate";
  const breakOrder = policy.breakOrder ?? "scheme";

  const ori = oriented ? orientation.map((k) => mod(k, n)) : orientation.map(() => 0);
  const parity = permutationParity(pieces) === 1;
  const isSolved = (i: number) => at(pieces, i) === i && at(ori, i) === 0;
  const isOrientedInPlace = (i: number) => at(pieces, i) === i && at(ori, i) !== 0;
  const solvedPieces = type.pieces.filter((p) => isSolved(p.position)).map((p) => p.name);

  const targets: Target[] = [];
  const cycles: TraceCycle[] = [];
  let cycleStart = 0;
  let cycleKind: TraceCycle["kind"] = "buffer";
  let breakPosition = -1;

  const closeCycle = () => {
    if (targets.length > cycleStart) cycles.push({ start: cycleStart, end: targets.length, kind: cycleKind });
  };

  const eligibleStickers = (): StickerInfo[] =>
    type.pieces
      .filter((p) => p.position !== pb && !isSolved(p.position) && (!separate || !isOrientedInPlace(p.position)))
      .flatMap((p) => (oriented ? [...p.stickers] : p.stickers.filter((st) => lettering.letterOf(st) !== undefined)));

  const letterOfTarget = (t: { position: number; label: number }): string =>
    oriented ? (lettering.letterOf(at(at(type.pieces, t.position).stickers, t.label)) ?? "") : lettering.letterOfPiece(t.position);

  const chooseBreak = (candidates: StickerInfo[]): StickerInfo => {
    if (breakOrder !== "scheme") {
      for (const name of breakOrder) {
        const preferred = candidates.find((c) => c.name === name);
        if (preferred !== undefined) return preferred;
      }
    }
    const letterOf = (st: StickerInfo) => (oriented ? (lettering.letterOf(st) ?? "") : lettering.letterOfPiece(st.position));
    return candidates.reduce((best, c) => (compareLetters(letterOf(c), letterOf(best)) < 0 ? c : best));
  };

  // Every step either solves a piece or starts a cycle that will, so this bound is never reached.
  const maxSteps = type.pieces.length * (n + 2) * 2;
  for (let step = 0; ; step++) {
    if (step > maxSteps) throw new Error("trace did not terminate; the pattern is not a valid state");

    const atBuffer = at(pieces, pb);
    if (atBuffer !== pb) {
      const k = at(ori, pb);
      const label = oriented ? mod(jb - s * k, n) : 0;
      const kind: TargetKind = atBuffer === breakPosition ? (cycleKind === "orientation" ? "orientationTarget" : "cycleClose") : "normal";
      targets.push({ position: atBuffer, label, kind });
      const displaced = at(pieces, atBuffer);
      const displacedOri = at(ori, atBuffer);
      pieces[atBuffer] = atBuffer;
      ori[atBuffer] = 0;
      pieces[pb] = displaced;
      ori[pb] = oriented ? mod(displacedOri + k, n) : 0;
      if (atBuffer === breakPosition) breakPosition = -1;
      continue;
    }

    closeCycle();
    const candidates = eligibleStickers();
    if (candidates.length === 0) break;

    const chosen = chooseBreak(candidates);
    const q = chosen.position;
    const jc = oriented ? chosen.label : 0;
    cycleKind = isOrientedInPlace(q) ? "orientation" : "break";
    cycleStart = targets.length;
    targets.push({ position: q, label: jc, kind: cycleKind === "orientation" ? "orientationTarget" : "cycleBreak" });
    const bufferOri = at(ori, pb);
    const displaced = at(pieces, q);
    const displacedOri = at(ori, q);
    pieces[q] = pb;
    ori[q] = oriented ? mod(bufferOri + s * (jc - jb), n) : 0;
    pieces[pb] = displaced;
    ori[pb] = oriented ? mod(displacedOri + s * (jb - jc), n) : 0;
    breakPosition = q;
  }

  const orientedInPlace: OrientedInPlace[] = [];
  if (oriented) {
    for (const piece of type.pieces) {
      const k = at(ori, piece.position);
      if (at(pieces, piece.position) !== piece.position || k === 0) continue;
      const slot = referenceStickerSlot(type, piece.position, k);
      const home = referenceStickerSlot(type, piece.position, 0);
      orientedInPlace.push({
        piece: piece.name,
        sticker: slot.name,
        letter: lettering.letterOf(slot) ?? "",
        homeSticker: home.name,
        homeLetter: lettering.letterOf(home) ?? "",
        direction: type.orientationOrder === 3 ? cornerTwistDirection(puzzle, type, piece.position, k) : "flip",
        isBuffer: piece.position === pb,
      });
    }
    // Reported in letter order, with the buffer (if misoriented) last.
    orientedInPlace.sort((a, b) => Number(a.isBuffer) - Number(b.isBuffer) || compareLetters(a.letter, b.letter));
  }

  const letters = targets.map(letterOfTarget);
  const pairs: [string, string?][] = [];
  for (let i = 0; i < letters.length; i += 2) {
    const first = at(letters, i);
    const second = letters[i + 1];
    pairs.push(second === undefined ? [first] : [first, second]);
  }
  const bufferPiece = at(type.pieces, pb);

  return {
    targets: letters,
    pairs,
    cycleBreaks: targets.flatMap((t, i) => (t.kind === "cycleBreak" || (t.kind === "orientationTarget" && cycles.some((c) => c.start === i)) ? [i] : [])),
    flipped: type.orientationOrder === 2 ? orientedInPlace.map((o) => o.letter) : [],
    twisted: type.orientationOrder === 3 ? orientedInPlace.map((o) => o.letter) : [],
    solvedPieces,
    parity,
    targetCount: targets.length,
    buffer: { sticker: buffer.name, piece: bufferPiece.name },
    targetStickers: targets.map((t) =>
      oriented
        ? at(at(type.pieces, t.position).stickers, t.label).name
        : (at(type.pieces, t.position).stickers.find((st) => lettering.letterOf(st) !== undefined)?.name ?? ""),
    ),
    targetKinds: targets.map((t) => t.kind),
    cycles,
    orientedInPlace,
  };
}

/**
 * Tracing for interchangeable pieces, by colour. `start[p]` is the colour in slot p and `homes[p]` the
 * colour that belongs there (both as solved-state piece values).
 *
 * - The buffer holds colour X: shoot it to a slot whose colour is X that doesn't hold X yet, chosen by
 *   `sameColour` and `breakOrder`. Such a slot always exists unless X is the buffer's own colour, since
 *   there are as many pieces of a colour as slots.
 * - The buffer holds its own colour and every slot of that colour is done: if anything is unsolved,
 *   break into an unsolved slot (by `breakOrder`); otherwise the trace is over.
 *
 * Each normal target solves a slot for good, and a break is always followed by one, so it ends. There is
 * no permutation to take the parity of: two identical pieces can be exchanged without changing the cube.
 * `parity` is the parity of the swaps the trace performs, which is what a swap method has to fix.
 */
function runInterchangeableTrace(type: PieceType, lettering: Lettering, buffer: StickerInfo, start: readonly number[], homes: readonly number[], policy: TracePolicy): TraceResult {
  const colours = [...start];
  const pb = buffer.position;
  const bufferColour = at(homes, pb);
  const breakOrder = policy.breakOrder ?? "scheme";
  const avoidBufferColour = (policy.sameColour ?? "avoidBufferColour") === "avoidBufferColour";
  const positions = type.pieces.map((p) => p.position);
  const isSolved = (q: number) => at(colours, q) === at(homes, q);
  const solvedPieces = type.pieces.filter((p) => isSolved(p.position)).map((p) => p.name);
  const stickerOf = (q: number) => at(at(type.pieces, q).stickers, 0);

  const choose = (candidates: readonly number[]): number => {
    if (breakOrder !== "scheme") {
      for (const name of breakOrder) {
        const preferred = candidates.find((q) => stickerOf(q).name === name);
        if (preferred !== undefined) return preferred;
      }
    }
    return candidates.reduce((best, q) => (compareLetters(lettering.letterOfPiece(q), lettering.letterOfPiece(best)) < 0 ? q : best));
  };

  const targets: Target[] = [];
  const cycles: TraceCycle[] = [];
  let cycleStart = 0;
  let cycleKind: TraceCycle["kind"] = "buffer";
  let breakPosition = -1;
  const swapWithBuffer = (q: number) => {
    const held = at(colours, pb);
    colours[pb] = at(colours, q);
    colours[q] = held;
  };

  const maxSteps = positions.length * 3;
  for (let step = 0; ; step++) {
    if (step > maxSteps) throw new Error("trace did not terminate; the pattern is not a valid state");
    const held = at(colours, pb);
    const needing = positions.filter((q) => q !== pb && at(homes, q) === held && at(colours, q) !== held);
    if (needing.length > 0) {
      const preferred = avoidBufferColour ? needing.filter((q) => at(colours, q) !== bufferColour) : needing;
      const q = choose(preferred.length > 0 ? preferred : needing);
      targets.push({ position: q, label: 0, kind: q === breakPosition ? "cycleClose" : "normal" });
      if (q === breakPosition) breakPosition = -1;
      swapWithBuffer(q);
      continue;
    }
    if (held !== bufferColour) throw new Error("no slot needs the buffer's colour; the pattern is not a valid state");
    if (targets.length > cycleStart) cycles.push({ start: cycleStart, end: targets.length, kind: cycleKind });
    const unsolved = positions.filter((q) => q !== pb && !isSolved(q));
    if (unsolved.length === 0) break;
    const q = choose(unsolved);
    cycleKind = "break";
    cycleStart = targets.length;
    targets.push({ position: q, label: 0, kind: "cycleBreak" });
    swapWithBuffer(q);
    breakPosition = q;
  }

  const letters = targets.map((t) => lettering.letterOfPiece(t.position));
  const pairs: [string, string?][] = [];
  for (let i = 0; i < letters.length; i += 2) {
    const second = letters[i + 1];
    pairs.push(second === undefined ? [at(letters, i)] : [at(letters, i), second]);
  }
  return {
    targets: letters,
    pairs,
    cycleBreaks: targets.flatMap((t, i) => (t.kind === "cycleBreak" ? [i] : [])),
    flipped: [],
    twisted: [],
    solvedPieces,
    parity: targets.length % 2 === 1,
    targetCount: targets.length,
    buffer: { sticker: buffer.name, piece: at(type.pieces, pb).name },
    targetStickers: targets.map((t) => stickerOf(t.position).name),
    targetKinds: targets.map((t) => t.kind),
    cycles,
    orientedInPlace: [],
  };
}

/**
 * The slots an interchangeable trace may shoot to next, for a trainer that accepts any of them: every
 * slot of the buffer's colour still missing that colour, or, when there is none, every unsolved slot as
 * a break (empty when the type is solved). `colours` and `homes` are as in the trace.
 */
export function interchangeableChoices(type: PieceType, bufferPosition: number, colours: readonly number[], homes: readonly number[]): { readonly kind: "target" | "break"; readonly positions: number[] } {
  const held = at(colours, bufferPosition);
  const positions = type.pieces.map((p) => p.position).filter((q) => q !== bufferPosition);
  const needing = positions.filter((q) => at(homes, q) === held && at(colours, q) !== held);
  if (needing.length > 0) return { kind: "target", positions: needing };
  return { kind: "break", positions: positions.filter((q) => at(colours, q) !== at(homes, q)) };
}
