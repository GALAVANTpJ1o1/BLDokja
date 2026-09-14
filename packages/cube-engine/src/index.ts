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
  REFERENCE_JB,
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
  traceForSolve,
  type OpOpConfig,
  type OpPhaseError,
  type OpSolveError,
  type OpSystem,
  type OpSystemError,
  type SolveTraceError,
} from "./methods/op.js";
export {
  m2OpSystem,
  m2Phase,
  solveM2Op,
  type M2OpConfig,
  type M2OpSolveError,
  type M2OpSystem,
  type M2OpSystemError,
  type M2PhaseError,
} from "./methods/m2.js";
export {
  solveM2ThreeStyle,
  solveThreeStyle,
  threeStylePhase,
  type M2ThreeStyleConfig,
  type ThreeStyleConfig,
  type ThreeStylePhase,
  type ThreeStylePhaseError,
  type ThreeStyleSolveError,
} from "./methods/three-style.js";
export {
  stepMoves,
  type CycleStep,
  type FrameStep,
  type MethodSolution,
  type MethodStep,
  type OrientationStep,
  type ParityStep,
  type SolvedPieceType,
  type TargetStep,
} from "./methods/solution.js";
export {
  demonstrateSetup,
  illegalSetupExamples,
  temptingSetups,
  type IllegalSetupExample,
  type IllegalSetupExampleOptions,
  type SetupDemonstration,
  type SetupDemonstrationError,
  type TemptingSetup,
} from "./methods/illegal-setup.js";
export {
  M2_SPECIAL_BOUNDS,
  searchSliceComposites,
  type CompositeForm,
  type SliceComposite,
  type SliceCompositeError,
  type SliceCompositeOptions,
} from "./methods/m2-search.js";
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
  datasetSwap,
  identitySymmetry,
  opParityEffect,
  OpParityDatasetSchema,
  OpSetupsDatasetSchema,
  OpSwapSchema,
  OpTargetRecordSchema,
  verifyOpParityDataset,
  verifyOpSetupsDataset,
  type OpBuildError,
  type OpDatasetProblem,
  type OpParityDataset,
  type OpParitySpec,
  type OpSetupsDataset,
  type OpSetupsSpec,
  type OpTargetRecord,
} from "./data/op-dataset.js";
export {
  buildM2Dataset,
  buildM2OpParityDataset,
  deriveOddStepRule,
  m2DatasetSwap,
  M2DatasetSchema,
  m2OpParityEffect,
  M2OpParityDatasetSchema,
  M2RecordSchema,
  verifyM2Dataset,
  verifyM2OpParityDataset,
  type M2BuildError,
  type M2Dataset,
  type M2DatasetProblem,
  type M2OpParityDataset,
  type M2OpParitySpec,
  type M2Record,
  type M2Spec,
  type SpecialAlgs,
} from "./data/m2-dataset.js";
export {
  buildM2ThreeStyleParityDataset,
  buildThreeStyleParityDataset,
  deriveTails,
  M2ThreeStyleParityDatasetSchema,
  referenceJb,
  threeStyleParityEffect,
  ThreeStyleParityDatasetSchema,
  verifyM2ThreeStyleParityDataset,
  verifyThreeStyleParityDataset,
  type M2ThreeStyleParityDataset,
  type M2ThreeStyleParitySpec,
  type ParityTail,
  type ThreeStyleParityBuildError,
  type ThreeStyleParityDataset,
  type ThreeStyleParityProblem,
  type ThreeStyleParitySpec,
} from "./data/three-style-parity.js";
export { ContentDatasetSchema, type ContentDataset } from "./data/content-dataset.js";
export { drillScramble, type DrillScramble, type DrillScrambleError } from "./scramble/drill.js";
export {
  cubingProvider,
  nextScramble,
  orientationSuffixes,
  seededStateProvider3x3,
  type CubingEvent,
  type ScrambleCandidate,
  type ScrambleProvider,
  type SeededProviderOptions,
} from "./scramble/providers.js";
export {
  generateConstrained,
  type ConstrainedOptions,
  type ConstrainedResult,
  type ConstrainedStats,
  type InvalidOption,
  type Traces,
  type TraceStats,
} from "./scramble/constrained.js";
export {
  constraintFailures,
  constraintMeasures,
  matchesConstraints,
  PieceConstraintsSchema,
  TraceConstraintsSchema,
  validateConstraints,
  type ConstraintFailure,
  type ConstraintField,
  type ConstraintIssue,
  type ConstraintMeasures,
  type PieceConstraints,
  type TraceConstraints,
} from "./scramble/constraints.js";
export { createRng, fnv1a32, rngFromState, shuffled, type Rng } from "./random/prng.js";
export { randomMoveSequence, randomState3x3 } from "./random/random-state.js";
export {
  ADVERSARIAL_FLOOR,
  caseWeakness,
  createSelector,
  defaultRecencyWindow,
  SELECTION_STRATEGIES,
  selectionWeights,
  WEAKNESS_FLOOR,
  type CaseStats,
  type CaseStatsProvider,
  type SelectionContext,
  type SelectionError,
  type SelectionStrategy,
  type Selector,
  type SelectorOptionError,
  type SelectorOptions,
} from "./random/selection.js";
