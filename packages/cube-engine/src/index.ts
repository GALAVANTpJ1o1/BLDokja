export const ENGINE_VERSION = "0.1.0";

export { loadPuzzle, verifiedMoves, VERIFIED_MOVE_FAMILIES, type Puzzle, type PuzzleId } from "./core/puzzle.js";
export { normaliseByCenters, wholeCubeRotations } from "./core/frame.js";
export type { Result } from "./core/result.js";
export { pieceType, pieceTypesFor, PIECE_TYPE_SPECS, type PieceType, type PieceTypeId, type PieceInfo, type StickerInfo } from "./pieces/piece-types.js";
export type { TwistDirection } from "./pieces/orientation.js";
export {
  compileLettering,
  parseScheme,
  SchemeSchema,
  type Lettering,
  type Scheme,
  type SchemeIssue,
} from "./lettering/scheme.js";
export { blankScheme, buildFaceCycleScheme, speffzScheme, SPEFFZ_RULE, type FaceCycleRule } from "./lettering/speffz.js";
export {
  trace,
  type Frame,
  type OrientedInPlace,
  type TargetKind,
  type TraceConfig,
  type TraceCycle,
  type TraceError,
  type TraceInput,
  type TracePolicy,
  type TraceResult,
} from "./trace/trace.js";
export {
  DEFAULT_SINGLE_LETTER_REPRESENTATION,
  memoView,
  type MemoItem,
  type MemoItemKind,
  type MemoLetterSource,
  type MemoOptions,
  type MemoView,
  type SingleLetterRepresentation,
} from "./memo/memo.js";
export {
  formatAlg,
  formatMove,
  formatNodes,
  parseAlg,
  type AlgMove,
  type AlgNode,
  type AlgParseError,
  type Commutator,
  type Conjugate,
  type ParsedAlg,
  type QuarterTurns,
} from "./commutator/parse.js";
export { cancelMoves, expandAlg, expandNodes, formatMoves, invertMoves, moveAxis, type ExpandOptions } from "./commutator/expand.js";
export { moveCounts, type MoveCounts } from "./commutator/metrics.js";
export { createRng, fnv1a32, rngFromState, shuffled, type Rng } from "./random/prng.js";
export { randomMoveSequence, randomState3x3 } from "./random/random-state.js";
