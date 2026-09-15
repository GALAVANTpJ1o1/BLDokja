import { z } from "zod";

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

export const AppEventSchema = z.discriminatedUnion("type", [LegacyMemoAttemptEventSchema, DrillAttemptEventSchema, LessonEventSchema]);

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

export const THEMES = ["system", "dark", "light"] as const;
export const PALETTES = ["standard", "high-contrast", "deuteranopia"] as const;
export const VOICES = ["plain", "tsundere", "casual", "roast"] as const;

/** Preferences. Every field is optional so a new preference never needs a migration. */
export const SettingsSchema = z
  .object({
    theme: z.enum(THEMES).optional(),
    palette: z.enum(PALETTES).optional(),
    /** Unset until the first-visit voice picker is answered. */
    voice: z.enum(VOICES).optional(),
    /** When the user last exported a backup (for the 30-day reminder). */
    lastBackupAt: isoInstant.optional(),
    /** Whether the browser granted persistent storage, last time it was asked. */
    persistentStorage: z.enum(["granted", "denied", "unsupported"]).optional(),
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
export type AppEvent = z.infer<typeof AppEventSchema>;
export type LegacySetting = z.infer<typeof LegacySettingSchema>;
export type ImportReport = z.infer<typeof ImportReportSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type ExportV1 = z.infer<typeof ExportV1Schema>;
export type Theme = (typeof THEMES)[number];
export type Palette = (typeof PALETTES)[number];
export type Voice = (typeof VOICES)[number];
