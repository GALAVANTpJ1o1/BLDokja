import { VERIFIED_MOVE_FAMILIES, type PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";

/**
 * Commutator notation (DECISIONS D-016).
 *
 * An alg is a sequence of moves and bracket groups. A bracket holds operands separated by `,`
 * (commutator) or `:` (conjugate). The first separator splits the bracket, and everything to its
 * right is read again as the same bracket level, so:
 *
 *   [A: B, C]  = [A: [B, C]]      [A, B: C] = [A, [B: C]]      [A: B: C] = [A: [B: C]]
 *
 * At most one comma may appear in a bracket level. The whole alg is an implicit bracket level, so
 * the outer brackets are optional: `U: [R, D] U2` is `[U: [R, D] U2]`, and `R, U` is `[R, U]`.
 * cubing.js's own parser can't read most of these forms, so this one is separate.
 */

/** Clockwise quarter turns: 1, 2, or 3 (written as a prime). */
export type QuarterTurns = 1 | 2 | 3;

export interface AlgMove {
  readonly type: "move";
  /** A family from VERIFIED_MOVE_FAMILIES, as written ("R", "Rw", "r", "2R", "M", "x"). */
  readonly family: string;
  readonly amount: QuarterTurns;
}

/** [a, b] = a b a⁻¹ b⁻¹ */
export interface Commutator {
  readonly type: "commutator";
  readonly a: readonly AlgNode[];
  readonly b: readonly AlgNode[];
}

/** [setup: body] = setup body setup⁻¹ */
export interface Conjugate {
  readonly type: "conjugate";
  readonly setup: readonly AlgNode[];
  readonly body: readonly AlgNode[];
}

export type AlgNode = AlgMove | Commutator | Conjugate;

export interface ParsedAlg {
  readonly puzzle: PuzzleId;
  readonly nodes: readonly AlgNode[];
}

/** Every error names the UTF-16 index where it was found. Codes, not messages, so the UI can translate them. */
export type AlgParseError =
  | { readonly code: "complexity-limit"; readonly index: number }
  | { readonly code: "unexpected-character"; readonly index: number; readonly character: string }
  | { readonly code: "parentheses-unsupported"; readonly index: number }
  | { readonly code: "unknown-move"; readonly index: number; readonly text: string }
  | { readonly code: "unsupported-amount"; readonly index: number; readonly text: string }
  | { readonly code: "unclosed-bracket"; readonly index: number }
  | { readonly code: "unmatched-closing-bracket"; readonly index: number }
  | { readonly code: "bracket-without-separator"; readonly index: number }
  | { readonly code: "empty-operand"; readonly index: number }
  | { readonly code: "too-many-commas"; readonly index: number };

const PRIMES = new Set(["'", "’", "‘"]);
const MOVE_CHAR = /[0-9A-Za-z'’‘-]/;
const MOVE_TOKEN = /^((?:\d+(?:-\d+)?)?[A-Za-z]+)(\d*)(['’‘]?)$/;

class ParseFailure extends Error {
  constructor(readonly detail: AlgParseError) {
    super(detail.code);
  }
}

type Separator = { readonly kind: "," | ":"; readonly index: number };

class Parser {
  #pos = 0;
  readonly #text: string;
  readonly #families: ReadonlySet<string>;

  constructor(text: string, families: ReadonlySet<string>) {
    this.#text = text;
    this.#families = families;
  }

  parseTop(): AlgNode[] {
    return this.#level(undefined);
  }

  #fail(detail: AlgParseError): never {
    throw new ParseFailure(detail);
  }

  #skipWhitespace(): void {
    while (this.#pos < this.#text.length && /\s/.test(this.#text[this.#pos] ?? "")) this.#pos++;
  }

  /** A bracket level: operands and separators up to `]` (or the end, at the top level). */
  #level(openIndex: number | undefined): AlgNode[] {
    const operands: AlgNode[][] = [[]];
    const separators: Separator[] = [];
    let commas = 0;

    for (;;) {
      this.#skipWhitespace();
      const index = this.#pos;
      const char = this.#text[index];
      const current = operands[operands.length - 1] ?? [];

      if (char === undefined) {
        if (openIndex !== undefined) this.#fail({ code: "unclosed-bracket", index: openIndex });
        break;
      }
      if (char === "]") {
        if (openIndex === undefined) this.#fail({ code: "unmatched-closing-bracket", index });
        this.#pos++;
        if (separators.length === 0) this.#fail({ code: "bracket-without-separator", index: openIndex });
        break;
      }
      if (char === "," || char === ":") {
        if (current.length === 0) this.#fail({ code: "empty-operand", index });
        if (char === ",") {
          commas++;
          if (commas > 1) this.#fail({ code: "too-many-commas", index });
        }
        separators.push({ kind: char, index });
        operands.push([]);
        this.#pos++;
        continue;
      }
      if (char === "[") {
        this.#pos++;
        current.push(...this.#level(index));
        continue;
      }
      if (char === "(" || char === ")") this.#fail({ code: "parentheses-unsupported", index });
      if (MOVE_CHAR.test(char)) {
        current.push(this.#move());
        continue;
      }
      this.#fail({ code: "unexpected-character", index, character: String.fromCodePoint(this.#text.codePointAt(index) ?? 0) });
    }

    const last = separators[separators.length - 1];
    if (last !== undefined && (operands[operands.length - 1] ?? []).length === 0) {
      this.#fail({ code: "empty-operand", index: last.index });
    }
    return build(operands, separators, 0);
  }

  #move(): AlgMove {
    const start = this.#pos;
    while (this.#pos < this.#text.length && MOVE_CHAR.test(this.#text[this.#pos] ?? "")) this.#pos++;
    const text = this.#text.slice(start, this.#pos);
    const match = MOVE_TOKEN.exec(text);
    const family = match?.[1];
    if (match === null || family === undefined || !this.#families.has(family)) this.#fail({ code: "unknown-move", index: start, text });
    const digits = match[2] ?? "";
    if (digits !== "" && digits !== "2") this.#fail({ code: "unsupported-amount", index: start, text });
    const prime = PRIMES.has(match[3] ?? "");
    const amount: QuarterTurns = digits === "2" ? 2 : prime ? 3 : 1;
    return { type: "move", family, amount };
  }
}

/** Right-nest a level's operands: the first separator splits, the rest is read as the same level. */
function build(operands: readonly (readonly AlgNode[])[], separators: readonly Separator[], i: number): AlgNode[] {
  const left = operands[i] ?? [];
  const separator = separators[i];
  if (i > 32) throw new ParseFailure({ code: "complexity-limit", index: separator?.index ?? 0 });
  if (separator === undefined) return [...left];
  const right = i + 1 === separators.length ? [...(operands[i + 1] ?? [])] : build(operands, separators, i + 1);
  return [separator.kind === "," ? { type: "commutator", a: left, b: right } : { type: "conjugate", setup: left, body: right }];
}

export function parseAlg(puzzle: PuzzleId, text: string): Result<ParsedAlg, AlgParseError> {
  try {
    if (text.length > 100_000) return err({ code: "complexity-limit", index: 100_000 });
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "[") depth++;
      else if (text[i] === "]") depth--;
      if (depth > 32) return err({ code: "complexity-limit", index: i });
    }
    const nodes = new Parser(text, new Set(VERIFIED_MOVE_FAMILIES[puzzle])).parseTop();
    const expansionCost = (nodes: readonly AlgNode[]): number => nodes.reduce((sum,node) => sum + (node.type === "move" ? 1 : node.type === "commutator" ? 2 * (expansionCost(node.a) + expansionCost(node.b)) : 2 * expansionCost(node.setup) + expansionCost(node.body)), 0);
    if (expansionCost(nodes) > 10_000) return err({ code: "complexity-limit", index: 0 });
    return ok({ puzzle, nodes });
  } catch (error) {
    if (error instanceof ParseFailure) return err(error.detail);
    throw error;
  }
}

export function formatMove(move: AlgMove): string {
  return `${move.family}${move.amount === 1 ? "" : move.amount === 2 ? "2" : "'"}`;
}

export function formatNodes(nodes: readonly AlgNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "move":
          return formatMove(node);
        case "commutator":
          return `[${formatNodes(node.a)}, ${formatNodes(node.b)}]`;
        case "conjugate":
          return `[${formatNodes(node.setup)}: ${formatNodes(node.body)}]`;
      }
    })
    .join(" ");
}

/** The canonical form: every commutator and conjugate in explicit brackets. cubing.js can read it too. */
export function formatAlg(alg: ParsedAlg): string {
  return formatNodes(alg.nodes);
}
