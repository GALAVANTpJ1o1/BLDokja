"use client";

import { compileLettering, m2BufferPairs, opBufferPairs, parseScheme, pieceType, speffzScheme, stickerName, type BufferPair, type Lettering, type Puzzle, type Scheme, type SchemeIssue } from "@bld/cube-engine";
import type { Buffers, StoredScheme } from "@bld/storage";
import { createContext, useContext, useMemo } from "react";
import { usePuzzle } from "@/components/cube/use-puzzle";
import { useSettings } from "@/components/settings/settings-provider";
import type { FaceName } from "@/design/palette";

/**
 * The reader's lettering scheme and buffers, which every trainer and lesson example reads from
 * (BRIEF §7.6). Both come from settings; anything that doesn't verify falls back to Speffz and the
 * Gate B buffers (D-022), and says so in `issues`, so a half-edited scheme never breaks a trainer.
 */
export const GATE_B_BUFFERS = {
  op: { corners: "UBL", edges: "UR" },
  m2: { corners: "UBL", edges: "DF" },
  threeStyle: { corners: "UFR", edges: "UF" },
} as const satisfies Record<Method, BufferPair>;

export type Method = "op" | "m2" | "threeStyle";
export type ReaderBuffers = Readonly<Record<Method, BufferPair>>;

export type ReaderIssue =
  | { readonly kind: "scheme"; readonly issues: readonly SchemeIssue[] }
  | { readonly kind: "buffers"; readonly method: Method; readonly corners: string; readonly edges: string };

export interface Reader {
  readonly puzzle: Puzzle;
  readonly scheme: Scheme;
  /** Whether the scheme in use is Speffz or yours. */
  readonly schemeSource: "speffz" | "custom";
  readonly buffers: ReaderBuffers;
  readonly issues: readonly ReaderIssue[];
  /** The letter of a corner or edge sticker by name ("UBL" → "A" in Speffz), or undefined for a centre. */
  letterOf(sticker: string): string | undefined;
  /** The sticker a letter names within a piece type. */
  stickerOf(pieceType: "corners" | "edges", letter: string): string | undefined;
  faceOf(sticker: string): FaceName;
  pieceTypeOf(sticker: string): "corners" | "edges" | undefined;
  /** The name of the sticker slot at a geometry index. */
  nameOf(index: number): string;
}

/** A stored scheme as the engine's scheme document (3x3x3 corners and edges). */
export function schemeDocument(stored: StoredScheme): unknown {
  return { format: "bld-platform/scheme", version: 1, id: stored.id, name: stored.name, puzzle: "3x3x3", letters: { corners: stored.letters.corners ?? {}, edges: stored.letters.edges ?? {} } };
}

/** Validates a stored scheme with the engine: parse, then compile corners and edges (duplicates, gaps). */
export function checkScheme(puzzle: Puzzle, stored: StoredScheme): { ok: true; scheme: Scheme } | { ok: false; issues: SchemeIssue[] } {
  // parseScheme compiles every piece type the document letters, so duplicates and gaps come back here.
  const parsed = parseScheme(puzzle, schemeDocument(stored));
  return parsed.ok ? { ok: true, scheme: parsed.value } : { ok: false, issues: parsed.error.issues };
}

/** Buffer pairs each method can use. OP and M2 need a verified system for the pair; 3-style takes any corner and edge. */
export function availableBuffers(puzzle: Puzzle): Readonly<Record<Method, readonly BufferPair[] | "any">> {
  return { op: opBufferPairs(puzzle), m2: m2BufferPairs(puzzle), threeStyle: "any" };
}

function bufferAllowed(puzzle: Puzzle, method: Method, pair: BufferPair): boolean {
  const corner = pieceType(puzzle, "corners").stickerByName(pair.corners);
  const edge = pieceType(puzzle, "edges").stickerByName(pair.edges);
  if (corner === undefined || edge === undefined) return false;
  const allowed = availableBuffers(puzzle)[method];
  return allowed === "any" || allowed.some((p) => p.corners === pair.corners && p.edges === pair.edges);
}

export function readerFor(puzzle: Puzzle, stored: { readonly scheme?: StoredScheme | undefined; readonly buffers?: Buffers | undefined } = {}, overrides: ReaderOverrides = {}): Reader {
  const issues: ReaderIssue[] = [];
  let scheme = speffzScheme(puzzle);
  let schemeSource: Reader["schemeSource"] = "speffz";
  if (stored.scheme !== undefined && overrides.lettering !== "speffz") {
    const checked = checkScheme(puzzle, stored.scheme);
    if (checked.ok) {
      scheme = checked.scheme;
      schemeSource = "custom";
    } else issues.push({ kind: "scheme", issues: checked.issues });
  }

  const buffers: Record<Method, BufferPair> = { ...GATE_B_BUFFERS };
  if (overrides.buffers !== "standard") {
    for (const method of ["op", "m2", "threeStyle"] as const) {
      const pair = stored.buffers?.[method];
      if (pair === undefined) continue;
      if (bufferAllowed(puzzle, method, pair)) buffers[method] = pair;
      else issues.push({ kind: "buffers", method, ...pair });
    }
  }

  const letterings: Record<"corners" | "edges", Lettering> = {
    corners: unwrap(compileLettering(puzzle, scheme, "corners")),
    edges: unwrap(compileLettering(puzzle, scheme, "edges")),
  };
  const byName = new Map<string, { type: "corners" | "edges"; sticker: (typeof letterings.corners.pieceType.stickers)[number] }>();
  for (const type of ["corners", "edges"] as const) {
    for (const sticker of pieceType(puzzle, type).stickers) byName.set(sticker.name, { type, sticker });
  }
  return {
    puzzle,
    scheme,
    schemeSource,
    buffers,
    issues,
    letterOf: (name) => {
      const found = byName.get(name);
      return found === undefined ? undefined : letterings[found.type].letterOf(found.sticker);
    },
    stickerOf: (type, letter) => letterings[type].stickerOf(letter)?.name,
    faceOf: (name) => byName.get(name)?.sticker.face ?? "U",
    pieceTypeOf: (name) => byName.get(name)?.type,
    nameOf: (index) => stickerName(puzzle.geometry, index),
  };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`a checked scheme failed to compile: ${JSON.stringify(result.error)}`);
  return result.value;
}

/**
 * What a part of the page reads instead of your settings. Lessons use it: their prose teaches the
 * standard buffers' swap spots and setup rules, and the Speffz lesson teaches Speffz (docs/OVERNIGHT.md).
 */
export interface ReaderOverrides {
  readonly lettering?: "speffz";
  readonly buffers?: "standard";
}

export const ReaderOverridesContext = createContext<ReaderOverrides>({});

export function useReader(): Reader | undefined {
  const puzzle = usePuzzle();
  const { stored } = useSettings();
  const overrides = useContext(ReaderOverridesContext);
  const scheme = stored?.scheme;
  const buffers = stored?.buffers;
  return useMemo(() => (puzzle === undefined ? undefined : readerFor(puzzle, { scheme, buffers }, overrides)), [puzzle, scheme, buffers, overrides]);
}
