import { CuratedSetSchema, F2LSetSchema, type CuratedSet, type CuratedStage, type F2LSet } from "@bld/cube-engine/cfop-data";
import coRaw from "../../../../content/algs/cfop/curated/co.json";
import cpRaw from "../../../../content/algs/cfop/curated/cp.json";
import eoRaw from "../../../../content/algs/cfop/curated/eo.json";
import epRaw from "../../../../content/algs/cfop/curated/ep.json";
import f2lRaw from "../../../../content/algs/cfop/curated/f2l.json";
import ollRaw from "../../../../content/algs/cfop/curated/oll.json";
import pllRaw from "../../../../content/algs/cfop/curated/pll.json";

/**
 * The one canonical CFOP dataset (polish brief §9): every lesson, reference card, trainer and statistic reads the sets
 * below and nothing else. Parsed with the engine's Zod schemas where it crosses into the app, and only when first read.
 */
function parsed<T>(name: string, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(`content/algs/cfop/curated/${name} failed validation`);
  return result.data;
}

let cache: { readonly sets: Readonly<Record<CuratedStage, CuratedSet>>; readonly f2l: F2LSet } | undefined;

export function cfopData(): { readonly sets: Readonly<Record<CuratedStage, CuratedSet>>; readonly f2l: F2LSet } {
  cache ??= {
    sets: {
      eo: parsed("eo.json", CuratedSetSchema, eoRaw), co: parsed("co.json", CuratedSetSchema, coRaw), cp: parsed("cp.json", CuratedSetSchema, cpRaw),
      ep: parsed("ep.json", CuratedSetSchema, epRaw), oll: parsed("oll.json", CuratedSetSchema, ollRaw), pll: parsed("pll.json", CuratedSetSchema, pllRaw),
    },
    f2l: parsed("f2l.json", F2LSetSchema, f2lRaw),
  };
  return cache;
}

/** The reference sheets, in the order the site lists them. `stage` is the curated set behind each (F2L has its own). */
export const REFERENCE_SHEETS = ["f2l", "2look-oll", "2look-pll", "oll", "pll"] as const;
export type ReferenceSheet = (typeof REFERENCE_SHEETS)[number];

export const SHEET_STAGES: Readonly<Record<Exclude<ReferenceSheet, "f2l">, readonly CuratedStage[]>> = {
  "2look-oll": ["eo", "co"],
  "2look-pll": ["cp", "ep"],
  oll: ["oll"],
  pll: ["pll"],
};
