import { z } from "../core/zod.js";

/**
 * The stored shape of the curated CFOP data and the pure helpers that read it (D-080). This file has no cube-engine
 * dependency at all (only Zod), so the web app can import it as `@bld/cube-engine/cfop-data` and draw a whole
 * reference page without loading the cube engine.
 */

export const CURATED_STAGES = ["eo", "co", "cp", "ep", "oll", "pll"] as const;
export type CuratedStage = (typeof CURATED_STAGES)[number];
export const EXECUTION_STYLES = ["2H", "OH"] as const;
export type ExecutionStyle = (typeof EXECUTION_STYLES)[number];

const AUF = z.enum(["", "U", "U2", "U'"]);
const Tuple4 = <T extends z.ZodType>(item: T) => z.tuple([item, item, item, item]);
const D3 = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const D2 = z.union([z.literal(0), z.literal(1)]);
const D4 = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const CaseStateSchema = z
  .object({
    co: Tuple4(D3).optional(),
    eo: Tuple4(D2).optional(),
    cp: Tuple4(D4).optional(),
    ep: Tuple4(D4).optional(),
  })
  .strict();
export type CaseState = z.infer<typeof CaseStateSchema>;

export const CuratedAlgSchema = z
  .object({
    alg: z.string().min(1),
    /** U turns before the sequence, chosen so the sequence solves the stored case state. */
    preAuf: AUF,
    /** U turns after it (permutation stages only). */
    postAuf: AUF,
    /** Half-turn metric move count of the sequence itself (rotations free, AUFs excluded). */
    moves: z.number().int().positive(),
    /** Whole-cube rotation that puts the centres back where they started (empty if the sequence keeps them). */
    endingRotation: z.string(),
    source: z.string().min(1),
    /** A line of hand and finger guidance, only where one has been written. */
    note: z.string().optional(),
  })
  .strict();
export type CuratedAlg = z.infer<typeof CuratedAlgSchema>;

export const CuratedCaseSchema = z
  .object({
    id: z.string().min(1),
    number: z.number().int().positive().optional(),
    name: z.string().min(1),
    /** The visual family the reference groups cases under (OLL shape, PLL swap type). */
    group: z.string().min(1),
    aliases: z.array(z.string()),
    state: CaseStateSchema,
    algs: z.object({ "2H": CuratedAlgSchema.optional(), OH: CuratedAlgSchema.optional() }).strict(),
    /** True where the owner's tables had no row for this execution style: the other style's sequence is shown instead. */
    missing: z.array(z.enum(EXECUTION_STYLES)),
  })
  .strict()
  .refine((c) => c.algs["2H"] !== undefined || c.algs.OH !== undefined, "a case needs at least one algorithm");
export type CuratedCase = z.infer<typeof CuratedCaseSchema>;

export const CuratedSetSchema = z
  .object({
    format: z.literal("bld-platform/curated-cases"),
    version: z.literal(1),
    stage: z.enum(CURATED_STAGES),
    provenance: z.string().min(1),
    cases: z.array(CuratedCaseSchema).min(1),
  })
  .strict();
export type CuratedSet = z.infer<typeof CuratedSetSchema>;

/** Two U-turn strings' sum, as a single AUF. */
export function combineAuf(a: string, b: string): "" | "U" | "U2" | "U'" {
  const value = (s: string) => (s === "" ? 0 : s === "U" ? 1 : s === "U2" ? 2 : 3);
  const total = (value(a) + value(b)) % 4;
  return (["", "U", "U2", "U'"] as const)[total] ?? "";
}

/**
 * Executable text of a style: pre-AUF, the sequence, the rotation that gets the cube back into its starting hold
 * (whole-cube rotations cost nothing, and an AUF after a sequence that ended turned would otherwise turn the wrong
 * face), then the post-AUF.
 */
export function styleMoves(entry: CuratedAlg): string {
  return [entry.preAuf, entry.alg, entry.endingRotation, entry.postAuf].filter((part) => part !== "").join(" ");
}

/** The style to show: the requested one where the owner's tables have it, otherwise the other one. */
export function algFor(kase: CuratedCase, style: ExecutionStyle): { readonly entry: CuratedAlg; readonly style: ExecutionStyle; readonly fallback: boolean } {
  const wanted = kase.algs[style];
  if (wanted !== undefined) return { entry: wanted, style, fallback: false };
  const other = style === "OH" ? "2H" : "OH";
  const entry = kase.algs[other];
  if (entry === undefined) throw new Error(`case ${kase.id} has no algorithm`);
  return { entry, style: other, fallback: true };
}

const Twist3 = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const Flip2 = z.union([z.literal(0), z.literal(1)]);

export const F2LSetSchema = z
  .object({
    format: z.literal("bld-platform/curated-f2l"),
    version: z.literal(1),
    provenance: z.string().min(1),
    cases: z
      .array(
        z
          .object({
            id: z.string().min(1),
            number: z.number().int().min(1).max(41),
            name: z.string().min(1),
            family: z.enum(["both-top", "corner-top-edge-slot", "corner-slot-edge-top", "both-slot"]),
            aliases: z.array(z.string()),
            placement: z.object({ cornerPlace: z.number().int().min(0).max(4), cornerTwist: Twist3, edgePlace: z.number().int().min(0).max(8), edgeFlip: Flip2 }).strict(),
            algs: z.object({ "2H": z.object({ alg: z.string().min(1), moves: z.number().int().positive(), source: z.string().min(1), note: z.string().optional() }).strict() }).strict(),
            /** Execution styles with no supplied row: OH has none for F2L. */
            missing: z.array(z.enum(["2H", "OH"])),
          })
          .strict(),
      )
      .length(41),
  })
  .strict();
export type F2LSet = z.infer<typeof F2LSetSchema>;
export type F2LCuratedCase = F2LSet["cases"][number];

export { ORIENTATION_PROFILES, profileColours, profileForTrack, type FaceLetter, type OrientationProfile } from "./orientation.js";
