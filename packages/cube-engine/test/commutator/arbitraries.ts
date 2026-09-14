import fc from "fast-check";
import { VERIFIED_MOVE_FAMILIES, type PuzzleId } from "../../src/core/puzzle.js";
import { formatMove, type AlgMove, type AlgNode, type Commutator, type Conjugate, type QuarterTurns } from "../../src/commutator/parse.js";

/** Random alg trees over a puzzle's verified move families. Operands are never empty. */
export function algNodesArbitrary(puzzle: PuzzleId, options: { maxDepth?: number; maxTop?: number; families?: readonly string[] } = {}): fc.Arbitrary<AlgNode[]> {
  const families = options.families ?? VERIFIED_MOVE_FAMILIES[puzzle];
  const move: fc.Arbitrary<AlgMove> = fc.record({
    type: fc.constant("move" as const),
    family: fc.constantFrom(...families),
    amount: fc.constantFrom<QuarterTurns>(1, 2, 3),
  });
  const tree = fc.letrec<{ node: AlgNode; seq: AlgNode[] }>((tie) => ({
    node: fc.oneof(
      { maxDepth: options.maxDepth ?? 3, depthIdentifier: "alg" },
      { arbitrary: move, weight: 3 },
      { arbitrary: fc.record({ type: fc.constant("commutator" as const), a: tie("seq"), b: tie("seq") }), weight: 1 },
      { arbitrary: fc.record({ type: fc.constant("conjugate" as const), setup: tie("seq"), body: tie("seq") }), weight: 1 },
    ),
    seq: fc.array(tie("node"), { minLength: 1, maxLength: 3, depthIdentifier: "alg" }),
  }));
  return fc.array(tree.node, { maxLength: options.maxTop ?? 4 });
}

/**
 * Prints an alg with every bracket the notation rules allow you to leave out: a right operand that
 * is a single bracket joins its parent's level (as long as the level keeps at most one comma), and
 * a lone top-level bracket loses its brackets.
 */
export function sugared(nodes: readonly AlgNode[]): string {
  const only = nodes.length === 1 ? nodes[0] : undefined;
  return only !== undefined && only.type !== "move" ? inner(only, 0) : sequence(nodes);
}

function sequence(nodes: readonly AlgNode[]): string {
  return nodes.map((node) => (node.type === "move" ? formatMove(node) : `[${inner(node, 0)}]`)).join(" ");
}

function inner(node: Commutator | Conjugate, commasSoFar: number): string {
  const commas = commasSoFar + (node.type === "commutator" ? 1 : 0);
  const left = node.type === "commutator" ? node.a : node.setup;
  const right = node.type === "commutator" ? node.b : node.body;
  const only = right.length === 1 ? right[0] : undefined;
  const joins = only !== undefined && only.type !== "move" && (only.type === "conjugate" || commas === 0);
  return `${sequence(left)}${node.type === "commutator" ? "," : ":"} ${joins ? inner(only, commas) : sequence(right)}`;
}
