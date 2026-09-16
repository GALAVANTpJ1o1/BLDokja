import { CUBE_VIEWS, PALETTES, THEMES, VOICES } from "./options.js";
import { z } from "./zod.js";

/**
 * The local data schema, version 1 (docs/MIGRATION.md §3). One number covers the export envelope and
 * the IndexedDB store. Every record read back from storage or imported from a file is parsed with
 * these schemas; the TypeScript types are inferred from them.
 *
 * Adding an optional field or a new event type doesn't need a new version: older data still parses.
 * Anything that would make existing data fail to parse, or change what a field means, does
 * (MIGRATION.md §5).
 */
export const SCHEMA_VERSION = 1;
export const EXPORT_FORMAT = "bld-platform/export";

/** A string split into user-perceived characters. */
export const graphemes = (text: string): string[] => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);

/** A lettering letter: exactly one grapheme, not restricted to A–X. */
export const LetterSchema = z.string().refine((s) => graphemes(s).length === 1, "a letter is exactly one character");

const isoInstant = z.iso.datetime({ offset: false });

export const LegacyPairWordRowSchema = z
  .object({
    table: z.literal("pair_words"),
    id: z.number().int(),
    pair: z.string(),
    word: z.string(),
    count: z.number().int(),
  })
  .strict();

export const PairImageSchema = z
  .object({
    id: z.string().min(1),
    text: z.string(),
    uses: z.number().int().nonnegative(),
    flags: z.array(z.literal("placeholder")).optional(),
    /** A user-supplied raster image. No remote URLs or active SVG content. */
    asset: z.string().max(2_800_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
    legacy: z.array(LegacyPairWordRowSchema).min(1).optional(),
  })
  .strict();

export const LetterPairSchema = z
  .object({
    id: z.string().min(2),
    first: LetterSchema,
    second: LetterSchema,
    images: z.array(PairImageSchema),
    notes: z.string().optional(),
    category: z.string().optional(),
    createdAt: isoInstant.optional(),
    updatedAt: isoInstant.optional(),
  })
  .strict()
  .refine((p) => p.id === `${p.first}${p.second}`, { message: "id must be first + second", path: ["id"] })
  .refine((p) => new Set(p.images.map((i) => i.id)).size === p.images.length, { message: "image ids must be unique", path: ["images"] });

export const LegacyMemoAttemptSchema = z
  .object({
    table: z.literal("memo_attempts"),
    id: z.number().int(),
    difficulty: z.string(),
    corners_expected: z.string(),
    edges_expected: z.string(),
    corners_answer: z.string(),
    edges_answer: z.string(),
    correct_letters: z.number().int(),
    total_letters: z.number().int(),
    accuracy: z.number(),
    created_at: z.string(),
  })
  .strict();

export const LegacyMemoAttemptEventSchema = z
  .object({
    id: z.string().regex(/^legacy:memo_attempts:\d+$/),
    type: z.literal("legacy.memoAttempt"),
    at: isoInstant,
    legacy: LegacyMemoAttemptSchema,
    derived: z
      .object({
        scorer: z.literal("lcs@1"),
        correctLetters: z.number().int().nonnegative(),
        totalLetters: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

/**
 * One graded drill interaction (BRIEF §8): which trainer, which case, how it was chosen, whether it
 * was right, and how long it took. `detail` holds trainer-specific data (for guided trace: the target
 * kind and level), `settings` the snapshot of the difficulty settings in force.
 */
export const DrillAttemptEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("drill.attempt"),
    at: isoInstant,
    trainer: z.string().min(1),
    caseId: z.string().min(1),
    strategy: z.string().optional(),
    seed: z.string().optional(),
    correct: z.boolean(),
    responseMs: z.number().nonnegative(),
    detail: z.record(z.string(), z.json()).optional(),
    settings: z.record(z.string(), z.json()).optional(),
  })
  .strict();

/** A lesson checkpoint passed, or a lesson opened (drives the path and the adaptive home). */
export const LessonEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["lesson.opened", "lesson.checkpointPassed"]),
    at: isoInstant,
    lessonId: z.string().min(1),
    /** For lesson.checkpointPassed: which of the lesson's checkpoints. */
    checkpointId: z.string().min(1).optional(),
    score: z.object({ correct: z.number().int().nonnegative(), total: z.number().int().positive() }).strict().optional(),
  })
  .strict();

/**
 * A word found for a letter pair in "find a word" mode (AUDIT §6, Q4). Kept apart from drill attempts so
 * discovering an image never counts as recalling one, and never changes an image's use count.
 */
export const PairDiscoveryEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("pairs.discovered"),
    at: isoInstant,
    pairId: z.string().min(2),
    word: z.string().min(1),
    /** False when the word was already one of the pair's images. */
    added: z.boolean(),
  })
  .strict();

export const AppEventSchema = z.discriminatedUnion("type", [LegacyMemoAttemptEventSchema, DrillAttemptEventSchema, LessonEventSchema, PairDiscoveryEventSchema]);

export const LegacySettingSchema = z.object({ rowid: z.number().int(), key: z.string(), value: z.string() }).strict();

export const ImportReportSchema = z
  .object({
    tables: z.record(z.string(), z.number().int().nonnegative()),
    rows: z.number().int().nonnegative(),
    images: z.number().int().nonnegative(),
    merges: z.array(z.object({ pair: z.string(), text: z.string(), ids: z.array(z.number().int()) }).strict()),
    pairsWithAnyImage: z.number().int().nonnegative(),
    distinctLetterPairsCovered: z.number().int().nonnegative(),
    pairsWithRealWord: z.number().int().nonnegative(),
    pairsNeedingWord: z.array(z.string()),
    totalUses: z.number().int().nonnegative(),
    corrections: z.array(z.object({ id: z.number().int(), pair: z.string(), from: z.string(), to: z.string() }).strict()),
    placeholders: z.array(z.object({ id: z.number().int(), pair: z.string(), word: z.string() }).strict()),
    primaryChanges: z.array(z.object({ pair: z.string(), from: z.string(), to: z.string() }).strict()),
    tieBreakPrimaries: z.array(z.string()),
    sharedWords: z.array(z.object({ text: z.string(), pairs: z.array(z.string()) }).strict()),
    wordsWithDigitsOrPunctuation: z.array(z.object({ pair: z.string(), text: z.string() }).strict()),
    memoScoreDiffers: z.array(z.number().int()),
    deletedIdGaps: z.record(z.string(), z.array(z.number().int())),
  })
  .strict();

export const ProvenanceSchema = z
  .object({
    kind: z.literal("legacy-letterpairtrainer-sqlite"),
    importerVersion: z.string(),
    importedAt: isoInstant,
    source: z
      .object({
        fileName: z.string().refine((f) => !/[\\/]/.test(f), "file name only, no path"),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        sizeBytes: z.number().int().nonnegative(),
        ddl: z.record(z.string(), z.string()),
        rowCounts: z.record(z.string(), z.number().int().nonnegative()),
        sqliteSequence: z.record(z.string(), z.number().int()),
      })
      .strict(),
    report: ImportReportSchema,
  })
  .strict();

export { CUBE_VIEWS, PALETTES, THEMES, VOICES };

/** A sticker or piece name as the engine generates it ("UFR", "FUR", "UFr"). The engine checks it exists. */
const StickerNameSchema = z.string().regex(/^[UDRLFB]{1,3}[udrlfb]{0,2}$/, "not a sticker name");

/**
 * A lettering scheme you edited (BRIEF §7.6): sticker name → one letter, per piece type. Storage checks
 * the shape; the engine's scheme validation (duplicates, gaps, stickers that don't exist) runs where it's
 * used, and an invalid scheme is never applied.
 */
export const StoredSchemeSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(100),
    letters: z
      .object({
        corners: z.record(StickerNameSchema, LetterSchema).optional(),
        edges: z.record(StickerNameSchema, LetterSchema).optional(),
        wings: z.record(StickerNameSchema, LetterSchema).optional(),
        xcenters: z.record(StickerNameSchema, LetterSchema).optional(),
      })
      .strict(),
  })
  .strict();

const BufferPairSchema = z.object({ corners: StickerNameSchema, edges: StickerNameSchema }).strict();

/** Buffer stickers per method. Unset methods use the Gate B defaults (D-022). */
export const BuffersSchema = z.object({ op: BufferPairSchema.optional(), m2: BufferPairSchema.optional(), threeStyle: BufferPairSchema.optional() }).strict();

/**
 * Your own algs for 3-style cases (BRIEF §7.3), main first. Keyed by dataset (`3style-corners.UFR`), then
 * case id (`UBR-UBL`), so changing buffer keeps them for when you change back. The engine verifies an alg
 * solves its case before it's saved, and again before it's used.
 */
export const AlgOverridesSchema = z.record(
  z.string().regex(/^3style-(corners|edges).[UDRLFB]{2,3}$/, "not a 3-style dataset id"),
  z.record(z.string().regex(/^[UDRLFB]{2,3}-[UDRLFB]{2,3}$/, "not a case id"), z.array(z.string().min(1).max(200)).min(1).max(4)),
);

const RangeSchema = z
  .object({ min: z.number().int().nonnegative().optional(), max: z.number().int().nonnegative().optional() })
  .strict()
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, { message: "min is greater than max" });

/** The same shape as the engine's trace constraints for one piece type (BRIEF §5.6). */
const PieceDifficultySchema = z
  .object({ targets: RangeSchema.optional(), cycleBreaks: RangeSchema.optional(), misoriented: RangeSchema.optional(), parity: z.boolean().optional() })
  .strict();

/** The difficulty customiser's shared settings (BRIEF §7.7). Each trainer uses the fields that apply to it. */
export const DifficultySchema = z
  .object({
    pieces: z.enum(["both", "edges", "corners"]).optional(),
    constraints: z.object({ edges: PieceDifficultySchema.optional(), corners: PieceDifficultySchema.optional() }).strict().optional(),
    /** Case subsets, by trainer id. An empty or missing list means every case. */
    cases: z.record(z.string().min(1).max(40), z.array(z.string().min(1).max(40)).max(1000)).optional(),
    time: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("none") }).strict(),
        z.object({ mode: z.literal("soft"), seconds: z.number().positive().max(600) }).strict(),
        z.object({ mode: z.literal("hard"), seconds: z.number().positive().max(600) }).strict(),
      ])
      .optional(),
    relook: z.boolean().optional(),
    seed: z.string().min(1).max(64).optional(),
  })
  .strict();

export const DifficultyPresetSchema = z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(60), difficulty: DifficultySchema }).strict();

export const FirstSolveSchema = z.object({
  id: z.string().min(1), scramble: z.string().max(2000),
  /** -2: edge memo; -1: corner memo; 0..n: verified execution steps. */
  cursor: z.number().int().min(-2), memoCursor: z.number().int().nonnegative().optional(), scheme: StoredSchemeSchema.optional(),
  buffers: BufferPairSchema, startedAt: isoInstant, updatedAt: isoInstant,
  completedAt: isoInstant.optional(),
}).strict();

export const MemoryPalaceSchema = z.object({
  id: z.string().min(1), name: z.string().min(1).max(100),
  locations: z.array(z.object({ id: z.string().min(1), name: z.string().min(1).max(100), prompt: z.string().max(1000) }).strict()).max(100),
}).strict();

export const MemoStorySchema = z.object({
  id: z.string().min(1), title: z.string().min(1).max(100), palaceId: z.string().optional(),
  scenes: z.array(z.object({ id: z.string().min(1), pairId: z.string().min(2), imageId: z.string().min(1), locationId: z.string().optional(), text: z.string().max(1000) }).strict()).max(200),
}).strict();

export const AlgPreferenceSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(), regrips: z.number().int().min(0).max(30).optional(),
  fingerTricks: z.string().max(1000).optional(), notes: z.string().max(1000).optional(),
}).strict();

/** Preferences. Every field is optional so a new preference never needs a migration. */

export const SettingsSchema = z
  .object({
    theme: z.enum(THEMES).optional(),
    palette: z.enum(PALETTES).optional(),
    /** How cubes are shown: the 3D player, a flat sticker net, or the state written out (BRIEF §10). */
    cubeView: z.enum(CUBE_VIEWS).optional(),
    /** Whether trainers read each prompt aloud, the non-visual path through a drill (BRIEF §10). */
    readAloud: z.boolean().optional(),
    /** Unset until the first-visit voice picker is answered. */
    voice: z.enum(VOICES).optional(),
    /** When the user last exported a backup (for the 30-day reminder). */
    lastBackupAt: isoInstant.optional(),
    /** Whether the browser granted persistent storage, last time it was asked. */
    persistentStorage: z.enum(["granted", "denied", "unsupported"]).optional(),
    scheme: StoredSchemeSchema.optional(),
    buffers: BuffersSchema.optional(),
    algOverrides: AlgOverridesSchema.optional(),
    difficulty: DifficultySchema.optional(),
    difficultyPresets: z.array(DifficultyPresetSchema).max(50).optional(),
    /** The comm sandbox's scratchpad. */
    scratchpad: z.string().max(20_000).optional(),
    firstSolve: FirstSolveSchema.optional(),
    lessonPositions: z.record(z.string(), z.string().max(200)).optional(),
    trainerLevel: z.enum(["recognition", "setup", "algorithm", "blind", "solves"]).optional(),
    memoryPalaces: z.array(MemoryPalaceSchema).max(50).optional(),
    memoStories: z.array(MemoStorySchema).max(100).optional(),
    /** dataset|case|alg, preserving separate preferences for each notation. */
    algPreferences: z.record(z.string(), AlgPreferenceSchema).optional(),
    physicalChecks: z.record(z.string(), isoInstant).optional(),
  })
  .strict();

export const ExportV1Schema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    schemaVersion: z.literal(1),
    exportedAt: isoInstant,
    provenance: z.array(ProvenanceSchema),
    letterPairs: z.array(LetterPairSchema),
    events: z.array(AppEventSchema),
    settings: SettingsSchema.optional(),
    legacy: z.object({ appSettings: z.array(LegacySettingSchema) }).strict().optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    const seen = new Set<string>();
    e.letterPairs.forEach((p, i) => {
      if (seen.has(p.id)) ctx.addIssue({ code: "custom", message: `duplicate letter pair ${p.id}`, path: ["letterPairs", i, "id"] });
      seen.add(p.id);
    });
    const events = new Set<string>();
    e.events.forEach((ev, i) => {
      if (events.has(ev.id)) ctx.addIssue({ code: "custom", message: `duplicate event ${ev.id}`, path: ["events", i, "id"] });
      events.add(ev.id);
    });
    const legacyIds = new Set<number>();
    e.letterPairs.forEach((p, i) => { p.images.forEach((img, j) =>
        img.legacy?.forEach((row, k) => {
          if (legacyIds.has(row.id)) ctx.addIssue({ code: "custom", message: `legacy row ${row.id} appears twice`, path: ["letterPairs", i, "images", j, "legacy", k, "id"] });
          legacyIds.add(row.id);
        }),
      ); },
    );
  });

export type LetterPair = z.infer<typeof LetterPairSchema>;
export type PairImage = z.infer<typeof PairImageSchema>;
export type LegacyPairWordRow = z.infer<typeof LegacyPairWordRowSchema>;
export type LegacyMemoAttemptEvent = z.infer<typeof LegacyMemoAttemptEventSchema>;
export type DrillAttemptEvent = z.infer<typeof DrillAttemptEventSchema>;
export type LessonEvent = z.infer<typeof LessonEventSchema>;
export type PairDiscoveryEvent = z.infer<typeof PairDiscoveryEventSchema>;
export type AppEvent = z.infer<typeof AppEventSchema>;
export type LegacySetting = z.infer<typeof LegacySettingSchema>;
export type ImportReport = z.infer<typeof ImportReportSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type ExportV1 = z.infer<typeof ExportV1Schema>;
export type Theme = (typeof THEMES)[number];
export type Palette = (typeof PALETTES)[number];
export type CubeView = (typeof CUBE_VIEWS)[number];
export type Voice = (typeof VOICES)[number];
export type StoredScheme = z.infer<typeof StoredSchemeSchema>;
export type Buffers = z.infer<typeof BuffersSchema>;
export type AlgOverrides = z.infer<typeof AlgOverridesSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type DifficultyPreset = z.infer<typeof DifficultyPresetSchema>;
export type FirstSolve = z.infer<typeof FirstSolveSchema>;
export type MemoryPalace = z.infer<typeof MemoryPalaceSchema>;
export type MemoStory = z.infer<typeof MemoStorySchema>;
export type AlgPreference = z.infer<typeof AlgPreferenceSchema>;
