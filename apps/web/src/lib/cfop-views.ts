import { z } from "@/lib/zod";
import viewsRaw from "../../../../content/algs/cfop/curated/views.json";
import type { Place, Side } from "@/i18n/cfop";

/**
 * Everything a case card draws, read from content/algs/cfop/curated/views.json (built from the cube engine by
 * scripts/build-cfop-views.ts and checked against it in a test). No cube engine runs to draw a reference page.
 */
const Colours = z.string().regex(/^[UDFBRL]+$/);
const Iso = z.object({ colours: z.string().length(27).regex(/^[UDFBRL]+$/), flags: z.string().length(27).regex(/^[hnd]+$/) });
const ViewSchema = z.object({
  setup: z.string(),
  top: Colours.length(21).optional(),
  features: z.object({
    edgeSides: z.array(z.enum(["front", "right", "back", "left"])),
    cornerPlaces: z.array(z.enum(["back-left", "back-right", "front-right", "front-left"])),
    bars: z.array(z.enum(["front", "right", "back", "left"])),
    headlights: z.array(z.enum(["front", "right", "back", "left"])),
  }).optional(),
  iso: Iso.optional(),
  mirror: z.object({ setup: z.string(), alg: z.string(), iso: Iso }).optional(),
});
const FileSchema = z.object({ format: z.literal("bld-platform/curated-views"), version: z.literal(1), views: z.record(z.string(), ViewSchema) });
export type CaseView = z.infer<typeof ViewSchema>;
export type IsoData = z.infer<typeof Iso>;

let cache: Readonly<Record<string, CaseView>> | undefined;

export function caseViews(): Readonly<Record<string, CaseView>> {
  if (cache === undefined) {
    const parsed = FileSchema.safeParse(viewsRaw);
    if (!parsed.success) throw new Error("content/algs/cfop/curated/views.json failed validation");
    cache = parsed.data.views;
  }
  return cache;
}

export function caseView(id: string): CaseView | undefined {
  return caseViews()[id];
}

export type Colour = "U" | "D" | "F" | "B" | "R" | "L";
export interface TopDiagram {
  readonly top: readonly (readonly Colour[])[];
  readonly back: readonly Colour[];
  readonly right: readonly Colour[];
  readonly front: readonly Colour[];
  readonly left: readonly Colour[];
}

/** The 21 letters of a `top` string as the rows and strips of the diagram. */
export function decodeTop(top: string): TopDiagram {
  const letters = top.split("") as Colour[];
  const take = (from: number, count: number) => letters.slice(from, from + count);
  return { top: [take(0, 3), take(3, 3), take(6, 3)], back: take(9, 3), right: take(12, 3), front: take(15, 3), left: take(18, 3) };
}

export interface LlFeatures {
  readonly edgeSides: readonly Side[];
  readonly cornerPlaces: readonly Place[];
  readonly bars: readonly Side[];
  readonly headlights: readonly Side[];
}

export const NO_FEATURES: LlFeatures = { edgeSides: [], cornerPlaces: [], bars: [], headlights: [] };
