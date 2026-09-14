import { at, mod } from "../core/arrays.js";
import { faceAxis } from "../core/geometry.js";
import { parseGeometryMove } from "../core/geometry-moves.js";
import { PUZZLE_SIZES, type PuzzleId } from "../core/puzzle.js";
import { formatMove, type AlgMove } from "./parse.js";

/**
 * Move counts (DECISIONS D-017), derived from the geometry model rather than a table of families.
 *
 * A move turns some layers about one axis, so it is a vector of quarter turns per layer. Its
 * HTM and QTM weight is the cheapest way to make that vector from outer-block turns (layers 1..k
 * from either face, any amount), with whole-cube rotations free: HTM costs 1 per block turn, QTM
 * 1 per quarter turn. On 3x3x3 this is the usual HTM (a wide move is a face turn plus a rotation,
 * a slice is two face turns); on bigger cubes it is the outer block turn metric.
 * STM counts any turn of one contiguous block as 1 and rotations as 0. ETM counts every written
 * move as 1, rotations included.
 */

export interface MoveCounts {
  readonly htm: number;
  readonly qtm: number;
  readonly stm: number;
  readonly etm: number;
}

interface Weights {
  readonly htm: number;
  readonly qtm: number;
  readonly stm: number;
}

/** Cheapest cost from the zero vector to every layer vector in Z₄ᴺ, using outer-block turns. */
function blockDistances(size: number, cost: (amount: number) => number): number[] {
  const states = 4 ** size;
  const blocks: number[][] = [];
  for (let k = 1; k < size; k++) {
    blocks.push(Array.from({ length: k }, (_, i) => i));
    blocks.push(Array.from({ length: k }, (_, i) => size - 1 - i));
  }
  const digit = (state: number, layer: number) => Math.floor(state / 4 ** layer) % 4;
  const dist = new Array<number>(states).fill(Number.POSITIVE_INFINITY);
  dist[0] = 0;
  const done = new Array<boolean>(states).fill(false);
  // Dijkstra over at most 4⁵ states; a linear scan for the minimum is plenty.
  for (;;) {
    let current = -1;
    for (let s = 0; s < states; s++) if (!at(done, s) && (current < 0 || at(dist, s) < at(dist, current))) current = s;
    if (current < 0 || at(dist, current) === Number.POSITIVE_INFINITY) break;
    done[current] = true;
    for (const block of blocks) {
      for (let amount = 1; amount < 4; amount++) {
        let next = current;
        for (const layer of block) next += (mod(digit(current, layer) + amount, 4) - digit(current, layer)) * 4 ** layer;
        const d = at(dist, current) + cost(amount);
        if (d < at(dist, next)) dist[next] = d;
      }
    }
  }
  return dist;
}

const distanceCache = new Map<number, { htm: number[]; qtm: number[] }>();
const weightCache = new Map<string, Weights>();

function distancesFor(size: number): { htm: number[]; qtm: number[] } {
  let cached = distanceCache.get(size);
  if (cached === undefined) {
    cached = { htm: blockDistances(size, () => 1), qtm: blockDistances(size, (amount) => (amount === 2 ? 2 : 1)) };
    distanceCache.set(size, cached);
  }
  return cached;
}

function weightsOf(puzzle: PuzzleId, move: AlgMove): Weights {
  const text = formatMove(move);
  const key = `${puzzle}/${text}`;
  const cached = weightCache.get(key);
  if (cached !== undefined) return cached;

  const size = PUZZLE_SIZES[puzzle];
  const turn = parseGeometryMove(text, size);
  const { sign } = faceAxis(turn.face);
  const quarters = mod(sign * turn.quarters, 4);
  // Layer 0 is the one at the positive face (R, U or F).
  const layers = new Array<number>(size).fill(0);
  for (const depth of turn.depths) layers[sign > 0 ? depth - 1 : size - depth] = quarters;

  const { htm, qtm } = distancesFor(size);
  const encode = (rotation: number) => layers.reduce((state, q, layer) => state + mod(q - rotation, 4) * 4 ** layer, 0);
  const rotations = [0, 1, 2, 3];
  const weights: Weights = {
    htm: Math.min(...rotations.map((c) => at(htm, encode(c)))),
    qtm: Math.min(...rotations.map((c) => at(qtm, encode(c)))),
    stm: layers.every((q) => q === layers[0]) ? 0 : 1,
  };
  weightCache.set(key, weights);
  return weights;
}

export function moveCounts(puzzle: PuzzleId, moves: readonly AlgMove[]): MoveCounts {
  let htm = 0;
  let qtm = 0;
  let stm = 0;
  for (const move of moves) {
    const w = weightsOf(puzzle, move);
    htm += w.htm;
    qtm += w.qtm;
    stm += w.stm;
  }
  return { htm, qtm, stm, etm: moves.length };
}
