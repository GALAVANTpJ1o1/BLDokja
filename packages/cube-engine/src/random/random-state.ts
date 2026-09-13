import { KPattern, type KPatternData } from "cubing/kpuzzle";
import { at, mod, permutationParity } from "../core/arrays.js";
import type { Puzzle } from "../core/puzzle.js";
import type { OrbitStickerMap } from "../core/sticker-map.js";
import { type Rng, shuffled } from "./prng.js";

function orbitOfKind(puzzle: Puzzle, kind: OrbitStickerMap["kind"]): OrbitStickerMap {
  const matches = puzzle.stickerMap.orbits.filter((o) => o.kind === kind && !o.interchangeable);
  if (matches.length !== 1) throw new Error(`${puzzle.id} has ${matches.length} distinguishable ${kind} orbits`);
  return at(matches, 0);
}

function randomOrientations(rng: Rng, count: number, modulus: number): number[] {
  const values = Array.from({ length: count - 1 }, () => rng.int(modulus));
  const sum = values.reduce((a, b) => a + b, 0);
  values.push(mod(-sum, modulus));
  return values;
}

/**
 * A uniformly random solvable 3x3x3 state with centres in place.
 *
 * Uniform over the cube group given its reachability conditions: corner and edge permutations
 * have equal parity, corner twists sum to 0 mod 3, edge flips sum to 0 mod 2. The tests check
 * that every face turn preserves those conditions in cubing.js's orientation convention, and the
 * slow suite checks sampled states are solvable.
 */
export function randomState3x3(puzzle: Puzzle, rng: Rng): KPattern {
  if (puzzle.id !== "3x3x3") throw new Error("randomState3x3 needs the 3x3x3 puzzle");
  const corners = orbitOfKind(puzzle, "corner");
  const edges = orbitOfKind(puzzle, "edge");
  const cornerPieces = shuffled(rng, corners.defaultPieces);
  const edgePieces = shuffled(rng, edges.defaultPieces);
  if (permutationParity(cornerPieces) !== permutationParity(edgePieces)) {
    // Swapping two edges is a bijection between the odd and even halves, so uniformity is kept.
    const first = at(edgePieces, 0);
    edgePieces[0] = at(edgePieces, 1);
    edgePieces[1] = first;
  }
  const data: KPatternData = { ...puzzle.kpuzzle.defaultPattern().patternData };
  data[corners.orbit] = { pieces: cornerPieces, orientation: randomOrientations(rng, corners.numPieces, 3) };
  data[edges.orbit] = { pieces: edgePieces, orientation: randomOrientations(rng, edges.numPieces, 2) };
  return new KPattern(puzzle.kpuzzle, data);
}

/** A random move sequence with no two consecutive moves on the same face/axis family. */
export function randomMoveSequence(rng: Rng, moves: readonly string[], length: number): string[] {
  const out: string[] = [];
  let previousFamily = "";
  while (out.length < length) {
    const move = at(moves, rng.int(moves.length));
    const family = move.replace(/['\d]/g, "");
    if (family === previousFamily) continue;
    out.push(move);
    previousFamily = family;
  }
  return out;
}
