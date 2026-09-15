import { z } from "../zod.js";

/**
 * Corrections applied at import (MIGRATION.md §3.6). Corrections are data: each entry names a legacy
 * row by id and states the exact word it expects there, so a table that no longer matches its
 * database aborts the import instead of changing the wrong row.
 */
export const CorrectionSchema = z.union([
  z.object({ id: z.number().int(), pair: z.string(), from: z.string(), to: z.string() }).strict(),
  z.object({ id: z.number().int(), pair: z.string(), word: z.string(), flag: z.literal("placeholder") }).strict(),
]);
export type Correction = z.infer<typeof CorrectionSchema>;

/** The table you approved row by row at the Phase 0 review (MIGRATION.md §3.6). */
export const APPROVED_CORRECTIONS: readonly Correction[] = [
  // Spelling
  { id: 666, pair: "EN", from: "engish", to: "english" },
  { id: 304, pair: "EP", from: "epstien", to: "epstein" },
  { id: 687, pair: "GC", from: "group chay", to: "group chat" },
  { id: 473, pair: "GK", from: "general knowlegde", to: "general knowledge" },
  { id: 611, pair: "NS", from: "nise shot", to: "nice shot" },
  { id: 417, pair: "LV", from: "luis vuiton", to: "louis vuitton" },
  { id: 637, pair: "LV", from: "lui vuiton", to: "louis vuitton" },
  { id: 260, pair: "EI", from: "eienstien", to: "einstein" },
  { id: 427, pair: "HM", from: "honorable mention", to: "honourable mention" },
  // Spacing
  { id: 508, pair: "BP", from: "bloodpressure", to: "blood pressure" },
  { id: 667, pair: "FB", from: "face book", to: "facebook" },
  { id: 577, pair: "FW", from: "fuckwith", to: "fuck with" },
  { id: 488, pair: "HC", from: "hermit craft", to: "hermitcraft" },
  { id: 371, pair: "HG", from: "home girl", to: "homegirl" },
  { id: 16, pair: "LN", from: "lightnovel", to: "light novel" },
  { id: 589, pair: "MB", from: "muscle blaze", to: "muscleblaze" },
  { id: 679, pair: "SD", from: "sd slayer", to: "sdslayer" },
  { id: 604, pair: "SW", from: "sea weed", to: "seaweed" },
  { id: 30, pair: "TH", from: "townhall", to: "town hall" },
  { id: 308, pair: "UG", from: "under grad", to: "undergrad" },
  // Placeholders
  { id: 353, pair: "EI", word: "no", flag: "placeholder" },
  { id: 674, pair: "EO", word: "no", flag: "placeholder" },
  { id: 490, pair: "EO", word: "yes", flag: "placeholder" },
  { id: 234, pair: "IE", word: "no", flag: "placeholder" },
];
