import { VOICES } from "@bld/storage";
import { z } from "zod";

/**
 * Lesson frontmatter (BRIEF §6): `id`, `title`, `track`, `prerequisites`, `estimatedMinutes`,
 * `objectives`, `checkpoints`. Lessons are data in /content/lessons; the path is built from this graph.
 *
 * A lesson directory holds `lesson.mdx` (frontmatter and the plain voice) and optionally one file per
 * other voice (`tsundere.mdx`, `casual.mdx`, `roast.mdx`), which carry only `voice:` in frontmatter.
 * Every voice must use the same components with the same props in the same order; lessons.test.ts
 * enforces it, so a voice can change how something is said but never what is taught.
 */
export const CheckpointSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    /** Fraction of items that must be right. Default 0.8 (your 2026-09-15 answer). */
    pass: z.number().gt(0).max(1).default(0.8),
  })
  .strict();

export const LessonFrontmatterSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    track: z.enum(["3bld", "4bld"]),
    order: z.number().int().positive(),
    prerequisites: z.array(z.string()),
    estimatedMinutes: z.number().int().positive(),
    objectives: z.array(z.string().min(1)).min(1).max(5),
    checkpoints: z.array(CheckpointSpecSchema).min(1),
    /** One short recap line per idea this lesson builds on (your 2026-09-15 answer: a recap at the start). */
    recap: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const VoiceFrontmatterSchema = z.object({ voice: z.enum(VOICES).exclude(["plain"]) }).strict();

export type CheckpointSpec = z.infer<typeof CheckpointSpecSchema>;
export type LessonFrontmatter = z.infer<typeof LessonFrontmatterSchema>;
