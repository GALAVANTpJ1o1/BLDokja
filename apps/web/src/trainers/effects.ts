import { expandNodes, faceletsOf, formatMoves, invertMoves, parseAlg, pieceType, type Puzzle, type SwapDataset } from "@bld/cube-engine";

/**
 * Comparing what move sequences do, by what the cube shows. Used where an answer is right if it works,
 * not only if it matches a table: typed setups and comms, and diagnosing a failed solve.
 */

/** Whether two move sequences leave the cube looking the same from solved: exact, except interchangeable x-centres by colour. */
export function sameLook(puzzle: Puzzle, a: string, b: string): boolean {
  const fa = faceletsOf(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(a));
  const fb = faceletsOf(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(b));
  for (let slot = 0; slot < fa.length; slot++) {
    const x = fa[slot] ?? -1;
    const y = fb[slot] ?? -1;
    if (x === y) continue;
    const orbit = puzzle.stickerMap.orbits[puzzle.stickerMap.slotOfSticker[slot]?.orbitIndex ?? -1];
    if (orbit?.interchangeable !== true || puzzle.geometry.sticker(x).face !== puzzle.geometry.sticker(y).face) return false;
  }
  return true;
}

/** The pieces a move sequence leaves out of place (or turned), by piece type, on a 3x3. */
export function misplacedPieces(puzzle: Puzzle, alg: string): { readonly corners: readonly string[]; readonly edges: readonly string[] } {
  const facelets = faceletsOf(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(alg));
  const of = (type: "corners" | "edges") =>
    pieceType(puzzle, type)
      .pieces.filter((piece) => piece.stickers.some((s) => facelets[s.index] !== s.index))
      .map((piece) => piece.name);
  return { corners: of("corners"), edges: of("edges") };
}

/**
 * A swap-method setup (M2, r2, U2) is right if it works, not only if it's the table's: setup, swap and undo must do what the
 * verified record does — the target exchanged with the buffer, the swap's side effect, nothing else.
 */
export function gradeSwapSetup(puzzle: Puzzle, dataset: SwapDataset, target: string, typed: string): { correct: boolean; reason: "legal" | "wrong-effect" | "unreadable" } {
  const record = dataset.records.find((r) => r.target === target);
  const expected = record?.algs[0]?.moves;
  const parsed = parseAlg(puzzle.id, typed.trim());
  if (!parsed.ok || typed.trim() === "") return { correct: false, reason: "unreadable" };
  if (expected === undefined) return { correct: false, reason: "wrong-effect" };
  const setup = expandNodes(parsed.value.nodes);
  const shot = `${formatMoves(setup)} ${dataset.swap.alg} ${formatMoves(invertMoves(setup))}`;
  return sameLook(puzzle, shot, expected) ? { correct: true, reason: "legal" } : { correct: false, reason: "wrong-effect" };
}
