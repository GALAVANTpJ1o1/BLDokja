export { ENGINE_VERSION } from "./version.js";

export { loadPuzzle, verifiedMoves, VERIFIED_MOVE_FAMILIES, type Puzzle, type PuzzleId } from "./core/puzzle.js";
export { centersRotation, normaliseByCenters, wholeCubeRotationAlgs, wholeCubeRotations, type WholeCubeRotation } from "./core/frame.js";
export { composePerms, identityPerm, invertPerm, moveTable, type MoveTable, type StickerPerm, type TableMove } from "./core/move-table.js";
export { conjugatePerm, cubeSymmetries, inverseSymmetry, relabelMove, type CubeSymmetry, type RelabelMove } from "./core/symmetry.js";
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
export { affectedStickers, type AffectedOrbit } from "./commutator/effect.js";
export {
  buildCatalogue,
  buildOrientationCatalogue,
  DEFAULT_COMM_BOUNDS,
  DEFAULT_ORIENTATION_BOUNDS,
  type CatalogueComm,
  type CommCatalogue,
  type CommSearchBounds,
} from "./commutator/catalogue.js";
export {
  searchOrientationAlgs,
  type OrientationCaseResult,
  type OrientationSearchError,
  type OrientationSearchOptions,
  type OrientationSearchResult,
} from "./commutator/orientation-search.js";
export {
  searchComms,
  type CommCaseResult,
  type CommSearchError,
  type CommSearchOptions,
  type CommSearchResult,
  type CommSearchStats,
  type FoundComm,
} from "./commutator/search.js";
export {
  orientationPairPattern,
  stickerCyclePattern,
  threeCyclePattern,
  validateComm,
  validateOrientationAlg,
  type CommValidation,
  type OrientationCase,
  type OrientationCaseError,
  type StickerCycleError,
  type ThreeCycle,
  type ThreeCycleError,
  type ValidateCommError,
} from "./commutator/validate.js";
export {
  analyseSwap,
  m2Swaps,
  REFERENCE_OP_PARITY,
  referenceSwap,
  REFERENCE_SWAPS,
  sideEffectPerm,
  swapVariants,
  targetEffect,
  type ReferenceSwap,
  type SwapAlg,
  type SwapAlgError,
  type SwapEffect,
  type SwapMethod,
  type SwapShapeError,
  type TargetEffectError,
} from "./methods/swap-algs.js";
export {
  opPhase,
  opSystem,
  solveOpOp,
  type OpOpConfig,
  type OpPhaseError,
  type OpSolveError,
  type OpSystem,
  type OpSystemError,
} from "./methods/op.js";
export { stepMoves, type FrameStep, type MethodSolution, type MethodStep, type ParityStep, type TargetStep } from "./methods/solution.js";
export {
  demonstrateSetup,
  illegalSetupExamples,
  type IllegalSetupExample,
  type IllegalSetupExampleOptions,
  type SetupDemonstration,
  type SetupDemonstrationError,
} from "./methods/illegal-setup.js";
export {
  DEFAULT_SETUP_POOLS,
  GATE_B_SETUP_FAMILIES,
  searchSetups,
  type ForbiddenFamily,
  type SetupRegime,
  type SetupSearchError,
  type SetupSearchOptions,
  type SetupTable,
  type TargetSetup,
} from "./methods/setup-search.js";
export {
  ALG_SOURCES,
  algEntry,
  AlgDatasetSchema,
  AlgEntrySchema,
  AlgRecordSchema,
  buildRecord,
  checkAlgEntry,
  entryForAlg,
  expectedRecordIds,
  IntendedEffectSchema,
  PieceName,
  stickerCycles,
  StickerName,
  verifyDataset,
  verifyRecord,
  type AlgDataset,
  type AlgEntry,
  type AlgRecord,
  type AlgSource,
  type DatasetProblem,
  type RecordCase,
} from "./data/alg-dataset.js";
export {
  buildOpParityDataset,
  buildOpSetupsDataset,
  ContentDatasetSchema,
  datasetSwap,
  opParityEffect,
  OpParityDatasetSchema,
  OpSetupsDatasetSchema,
  OpSwapSchema,
  OpTargetRecordSchema,
  verifyOpParityDataset,
  verifyOpSetupsDataset,
  type ContentDataset,
  type OpBuildError,
  type OpDatasetProblem,
  type OpParityDataset,
  type OpParitySpec,
  type OpSetupsDataset,
  type OpSetupsSpec,
  type OpTargetRecord,
} from "./data/op-dataset.js";
export { createRng, fnv1a32, rngFromState, shuffled, type Rng } from "./random/prng.js";
export { randomMoveSequence, randomState3x3 } from "./random/random-state.js";
