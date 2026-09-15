import { cancelMoves, entryForAlg, expandNodes, formatAlg, formatMoves, invertNodes, parseAlg, symmetryImageDataset, validateComm, type AlgDataset, type Puzzle, type Scheme } from "@bld/cube-engine";
import type { AlgOverrides } from "@bld/storage";
import { z } from "zod";

/**
 * The 3-style trainer's cases (BRIEF §7.3): an ordered pair of targets relative to a buffer, from the
 * verified dataset for your buffer. Your own algs come first, but only after the engine has checked
 * that each one solves its case; an alg that doesn't is listed as rejected and never shown as an answer.
 */

export const THREE_STYLE_TRAINER = "3style";

export interface CaseAlg {
  /** Canonical notation. */
  readonly alg: string;
  /** Expanded and cancelled. */
  readonly moves: string;
  readonly etm: number;
  /** The inverse in bracket notation, and its cancelled moves: the alg for the reversed case. */
  readonly inverse: string;
  readonly inverseMoves: string;
  readonly source: "yours" | "dataset";
}

export interface CommCase {
  /** `corners@UFR:UBR-UBL`: piece type and buffer, so history never mixes across buffers. */
  readonly id: string;
  /** The dataset record id, `UBR-UBL`. */
  readonly recordId: string;
  readonly pieceType: "corners" | "edges";
  readonly buffer: string;
  readonly targets: readonly [string, string];
  /** The two target letters in your scheme. */
  readonly letters: string;
  readonly algs: readonly CaseAlg[];
}

export interface RejectedOverride {
  readonly recordId: string;
  readonly alg: string;
  readonly reason: "does-not-parse" | "does-not-solve" | "unknown-case";
}

export const caseId = (pieceType: "corners" | "edges", buffer: string, recordId: string): string => `${pieceType}@${buffer}:${recordId}`;

function withInverse(alg: string, moves: string, etm: number, source: CaseAlg["source"]): CaseAlg | undefined {
  const parsed = parseAlg("3x3x3", alg);
  if (!parsed.ok) return undefined;
  const inverse = invertNodes(parsed.value.nodes);
  return { alg, moves, etm, inverse: formatAlg({ puzzle: "3x3x3", nodes: inverse }), inverseMoves: formatMoves(cancelMoves("3x3x3", expandNodes(inverse))), source };
}

/** An alg you typed, checked against a case: canonical notation and counts if it solves it. */
export function checkUserAlg(puzzle: Puzzle, dataset: AlgDataset, recordId: string, text: string): { ok: true; alg: CaseAlg } | { ok: false; reason: RejectedOverride["reason"] } {
  const record = dataset.records.find((r) => r.id === recordId);
  if (record?.kind !== "cycle") return { ok: false, reason: "unknown-case" };
  const parsed = parseAlg(puzzle.id, text.trim());
  if (!parsed.ok) return { ok: false, reason: "does-not-parse" };
  const verdict = validateComm(puzzle, parsed.value, [dataset.buffer, record.targets[0], record.targets[1]]);
  if (!verdict.ok || !verdict.value.valid) return { ok: false, reason: "does-not-solve" };
  const entry = entryForAlg(puzzle, formatAlg(parsed.value), "reference", "yours");
  const alg = withInverse(entry.alg, entry.moves, entry.etm, "yours");
  return alg === undefined ? { ok: false, reason: "does-not-parse" } : { ok: true, alg };
}

export function commCases(puzzle: Puzzle, dataset: AlgDataset, scheme: Scheme, overrides: AlgOverrides | undefined): { cases: CommCase[]; rejected: RejectedOverride[] } {
  const mine = overrides?.[dataset.id] ?? {};
  const rejected: RejectedOverride[] = [];
  const known = new Set(dataset.records.map((r) => r.id));
  for (const [recordId, algs] of Object.entries(mine)) if (!known.has(recordId)) for (const alg of algs) rejected.push({ recordId, alg, reason: "unknown-case" });
  const pieceType = dataset.pieceType;
  const letter = (sticker: string) => scheme.letters[pieceType]?.[sticker] ?? "?";
  const cases = dataset.records.flatMap((record): CommCase[] => {
    if (record.kind !== "cycle") return [];
    const yours: CaseAlg[] = [];
    for (const text of mine[record.id] ?? []) {
      const checked = checkUserAlg(puzzle, dataset, record.id, text);
      if (checked.ok) yours.push(checked.alg);
      else rejected.push({ recordId: record.id, alg: text, reason: checked.reason });
    }
    const fromDataset = record.algs.flatMap((a) => withInverse(a.alg, a.moves, a.etm, "dataset") ?? []).filter((a) => !yours.some((y) => y.moves === a.moves));
    return [
      {
        id: caseId(pieceType, dataset.buffer, record.id),
        recordId: record.id,
        pieceType,
        buffer: dataset.buffer,
        targets: record.targets,
        letters: `${letter(record.targets[0])}${letter(record.targets[1])}`,
        algs: [...yours, ...fromDataset],
      },
    ];
  });
  return { cases, rejected };
}

/** Rows and columns of the case grid: every non-buffer sticker, in your letters' order. */
export function gridStickers(puzzle: Puzzle, dataset: AlgDataset, scheme: Scheme): string[] {
  const targets = new Set(dataset.records.flatMap((r) => (r.kind === "cycle" ? [r.targets[0]] : [])));
  const letter = (s: string) => scheme.letters[dataset.pieceType]?.[s] ?? s;
  return [...targets].sort((a, b) => letter(a).localeCompare(letter(b)) || (a < b ? -1 : 1));
}

/** Your algs for a case, main first, as the settings store them. */
export function withUserAlg(overrides: AlgOverrides | undefined, datasetId: string, recordId: string, alg: string): AlgOverrides {
  const forDataset = overrides?.[datasetId] ?? {};
  const current = (forDataset[recordId] ?? []).filter((a) => a !== alg);
  return { ...(overrides ?? {}), [datasetId]: { ...forDataset, [recordId]: [alg, ...current].slice(0, 4) } };
}

export function withoutUserAlg(overrides: AlgOverrides | undefined, datasetId: string, recordId: string, alg: string): AlgOverrides {
  const forDataset = { ...(overrides?.[datasetId] ?? {}) };
  const remaining = (forDataset[recordId] ?? []).filter((a) => a !== alg);
  const next = Object.fromEntries(Object.entries(forDataset).filter(([id]) => id !== recordId));
  return { ...(overrides ?? {}), [datasetId]: remaining.length === 0 ? next : { ...next, [recordId]: remaining } };
}

export const OverridesFileSchema = z
  .object({
    format: z.literal("bld-platform/alg-overrides"),
    version: z.literal(1),
    overrides: z.record(z.string().regex(/^3style-(corners|edges)\.[UDRLFB]{2,3}$/), z.record(z.string().regex(/^[UDRLFB]{2,3}-[UDRLFB]{2,3}$/), z.array(z.string().min(1).max(200)).min(1).max(4))),
  })
  .strict();

export function overridesFile(overrides: AlgOverrides): string {
  return `${JSON.stringify({ format: "bld-platform/alg-overrides", version: 1, overrides }, null, 2)}\n`;
}

/**
 * Reads an alg file you exported (or wrote), checking every alg against its case with the engine. Only
 * algs that solve their case are kept; the rest come back as rejected. Datasets for other buffers are
 * the verified rotation images of the committed sets.
 */
export function importOverrides(puzzle: Puzzle, text: string, sources: { corners: AlgDataset; edges: AlgDataset }): { ok: true; overrides: AlgOverrides; kept: number; rejected: RejectedOverride[] } | { ok: false } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const parsed = OverridesFileSchema.safeParse(json);
  if (!parsed.success) return { ok: false };
  const overrides: Record<string, Record<string, string[]>> = {};
  const rejected: RejectedOverride[] = [];
  let kept = 0;
  for (const [datasetId, cases] of Object.entries(parsed.data.overrides)) {
    const [kind, buffer = ""] = datasetId.split(".");
    const image = symmetryImageDataset(puzzle, kind === "3style-corners" ? sources.corners : sources.edges, buffer);
    for (const [recordId, algs] of Object.entries(cases)) {
      for (const alg of algs) {
        const checked = image.ok ? checkUserAlg(puzzle, image.value, recordId, alg) : { ok: false as const, reason: "unknown-case" as const };
        if (!checked.ok) {
          rejected.push({ recordId, alg, reason: checked.reason });
          continue;
        }
        overrides[datasetId] ??= {};
        const list = (overrides[datasetId][recordId] ??= []);
        if (!list.includes(checked.alg.alg) && list.length < 4) {
          list.push(checked.alg.alg);
          kept++;
        }
      }
    }
  }
  return { ok: true, overrides, kept, rejected };
}
