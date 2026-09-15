import { z } from "../core/zod.js";
import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { PIECE_TYPE_SPECS, pieceType, type PieceType, type PieceTypeId, type StickerInfo } from "../pieces/piece-types.js";

/**
 * A lettering scheme is data: sticker name → letter, per piece type. Nothing downstream assumes
 * Speffz or the Latin alphabet; letters are opaque single graphemes.
 */

export const PIECE_TYPE_IDS = ["corners", "edges", "wings", "xcenters"] as const satisfies readonly PieceTypeId[];

export const SchemeSchema = z.object({
  format: z.literal("bld-platform/scheme"),
  version: z.literal(1),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  puzzle: z.enum(["3x3x3", "4x4x4"]),
  letters: z.partialRecord(
    z.enum(PIECE_TYPE_IDS),
    z.record(z.string().regex(/^[UDRLFB]{1,3}[udrlfb]{0,2}$/, "not a sticker name"), z.string()),
  ),
});

export type Scheme = z.infer<typeof SchemeSchema>;

export type SchemeIssue =
  | { readonly code: "wrong-puzzle"; readonly expected: string; readonly actual: string }
  | { readonly code: "piece-type-not-on-puzzle"; readonly pieceType: PieceTypeId }
  | { readonly code: "missing-piece-type"; readonly pieceType: PieceTypeId }
  | { readonly code: "unknown-sticker"; readonly pieceType: PieceTypeId; readonly sticker: string }
  | { readonly code: "not-a-single-letter"; readonly pieceType: PieceTypeId; readonly sticker: string; readonly letter: string }
  | { readonly code: "duplicate-letter"; readonly pieceType: PieceTypeId; readonly letter: string; readonly stickers: readonly string[] }
  | { readonly code: "missing-letter"; readonly pieceType: PieceTypeId; readonly piece: string; readonly unlettered: readonly string[] }
  | { readonly code: "too-many-letters"; readonly pieceType: PieceTypeId; readonly piece: string; readonly lettered: readonly string[] };

export interface Lettering {
  readonly schemeId: string;
  readonly pieceType: PieceType;
  /** Letter of a sticker, or undefined for a sticker the scheme deliberately leaves blank (wings). */
  letterOf(sticker: StickerInfo): string | undefined;
  /** The letter naming a piece slot, for piece types that letter one sticker per piece. */
  letterOfPiece(position: number): string;
  stickerOf(letter: string): StickerInfo | undefined;
  /** Letters sorted in the order used for "lowest letter first" choices (code point order). */
  readonly alphabet: readonly string[];
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function isSingleGrapheme(text: string): boolean {
  if (text.trim() !== text || text.length === 0) return false;
  let count = 0;
  for (const _ of segmenter.segment(text)) {
    count++;
    if (count > 1) return false;
  }
  return count === 1;
}

export function compareLetters(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Check a scheme for one piece type and build fast lookups. Every problem is reported, not just
 * the first. Duplicate letters are errors: a letter must name exactly one sticker, or a traced
 * memo can't be read back unambiguously.
 */
export function compileLettering(puzzle: Puzzle, scheme: Scheme, pieceTypeId: PieceTypeId): Result<Lettering, SchemeIssue[]> {
  const issues: SchemeIssue[] = [];
  if (scheme.puzzle !== puzzle.id) return err([{ code: "wrong-puzzle", expected: puzzle.id, actual: scheme.puzzle }]);
  if (!PIECE_TYPE_SPECS[puzzle.id].some((spec) => spec.id === pieceTypeId)) {
    return err([{ code: "piece-type-not-on-puzzle", pieceType: pieceTypeId }]);
  }
  const type = pieceType(puzzle, pieceTypeId);
  const entries = scheme.letters[pieceTypeId];
  if (entries === undefined) return err([{ code: "missing-piece-type", pieceType: pieceTypeId }]);

  const letterByIndex = new Map<number, string>();
  const stickersByLetter = new Map<string, string[]>();
  for (const [stickerName, letter] of Object.entries(entries)) {
    const sticker = type.stickerByName(stickerName);
    if (sticker === undefined) {
      issues.push({ code: "unknown-sticker", pieceType: pieceTypeId, sticker: stickerName });
      continue;
    }
    if (!isSingleGrapheme(letter)) {
      issues.push({ code: "not-a-single-letter", pieceType: pieceTypeId, sticker: stickerName, letter });
      continue;
    }
    letterByIndex.set(sticker.index, letter);
    stickersByLetter.set(letter, [...(stickersByLetter.get(letter) ?? []), stickerName]);
  }
  for (const [letter, stickers] of stickersByLetter) {
    if (stickers.length > 1) issues.push({ code: "duplicate-letter", pieceType: pieceTypeId, letter, stickers });
  }
  for (const piece of type.pieces) {
    const lettered = piece.stickers.filter((s) => letterByIndex.has(s.index));
    if (lettered.length < type.letteredStickersPerPiece) {
      issues.push({
        code: "missing-letter",
        pieceType: pieceTypeId,
        piece: piece.name,
        unlettered: piece.stickers.filter((s) => !letterByIndex.has(s.index)).map((s) => s.name),
      });
    } else if (lettered.length > type.letteredStickersPerPiece) {
      issues.push({ code: "too-many-letters", pieceType: pieceTypeId, piece: piece.name, lettered: lettered.map((s) => s.name) });
    }
  }
  if (issues.length > 0) return err(issues);

  const stickerByLetter = new Map<string, StickerInfo>();
  for (const sticker of type.stickers) {
    const letter = letterByIndex.get(sticker.index);
    if (letter !== undefined) stickerByLetter.set(letter, sticker);
  }
  const pieceLetters = type.pieces.map((piece) => {
    const lettered = piece.stickers.find((s) => letterByIndex.has(s.index));
    return lettered === undefined ? "" : (letterByIndex.get(lettered.index) ?? "");
  });
  return ok({
    schemeId: scheme.id,
    pieceType: type,
    letterOf: (sticker) => letterByIndex.get(sticker.index),
    letterOfPiece: (position) => {
      const letter = pieceLetters[position];
      if (letter === undefined || letter === "") throw new RangeError(`No single letter for ${type.id} position ${position}`);
      return letter;
    },
    stickerOf: (letter) => stickerByLetter.get(letter),
    alphabet: [...stickerByLetter.keys()].sort(compareLetters),
  });
}

/** Parse untrusted scheme JSON and validate it against the puzzle. */
export function parseScheme(puzzle: Puzzle, input: unknown): Result<Scheme, { zod?: z.ZodError; issues: SchemeIssue[] }> {
  const parsed = SchemeSchema.safeParse(input);
  if (!parsed.success) return err({ zod: parsed.error, issues: [] });
  if (parsed.data.puzzle !== puzzle.id) {
    return err({ issues: [{ code: "wrong-puzzle", expected: puzzle.id, actual: parsed.data.puzzle }] });
  }
  const issues: SchemeIssue[] = [];
  for (const id of Object.keys(parsed.data.letters) as PieceTypeId[]) {
    const compiled = compileLettering(puzzle, parsed.data, id);
    if (!compiled.ok) issues.push(...compiled.error);
  }
  return issues.length > 0 ? err({ issues }) : ok(parsed.data);
}
