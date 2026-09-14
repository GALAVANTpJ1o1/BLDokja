import { at } from "../core/arrays.js";
import { type PuzzleId } from "../core/puzzle.js";
import { moveAxis } from "./expand.js";
import type { AlgMove } from "./parse.js";

/**
 * Packed cancellation for hot loops (the comm search). It computes the same cancelled length as
 * `cancelMoves` (DECISIONS D-017), which test/commutator/syllables.test.ts checks property by property.
 *
 * A syllable is a maximal run of moves on one axis. Moves on one axis commute, so a run is just
 * the quarter turns of each family on that axis: packed here as 2 bits per family. Merging two
 * runs adds the turns family by family, mod 4, and a run's move count is its number of non-zero
 * families. Only lengths come out of this module; final move sequences still go through
 * `cancelMoves`, so the written order of a run is never decided here.
 */

export interface Syllables {
  readonly axes: Int8Array;
  readonly values: Uint32Array;
  /** Number of moves after cancellation. */
  readonly length: number;
}

export interface SyllableCodec {
  readonly puzzle: PuzzleId;
  readonly families: readonly string[];
  /** Pack and cancel a move sequence. */
  encode(moves: readonly Pick<AlgMove, "family" | "amount">[]): Syllables;
  inverse(syllables: Syllables): Syllables;
  /** Cancelled length of `setup core setup⁻¹`. Not re-entrant: it uses one shared scratch stack. */
  conjugateLength(setup: Syllables, core: Syllables): number;
  /** Cancelled QTM of the sequence the last `conjugateLength` call reduced. */
  lastQuarterTurns(): number;
  /** A string that is equal for two calls exactly when their cancelled sequences are equal (as runs). */
  lastIdentity(): string;
  /** Move count of one packed syllable value. */
  moveCount(value: number): number;
  negate(value: number): number;
}

/** Families per axis small enough for lookup tables (4 families = 8 bits = 256 values). */
const MAX_TABLE_SLOTS = 4;

/**
 * @param quarterTurns QTM weight of one move (D-017); used by `lastQuarterTurns`. Defaults to
 *   counting a half turn as 2 and anything else as 1, which is right for face turns only.
 */
export function syllableCodec(
  puzzle: PuzzleId,
  families: readonly string[],
  quarterTurns: (family: string, amount: 1 | 2 | 3) => number = (_family, amount) => (amount === 2 ? 2 : 1),
): SyllableCodec {
  const slots = new Map<string, { axis: number; shift: number }>();
  const familyAt: string[][] = [[], [], []];
  const perAxis = [0, 0, 0];
  for (const family of families) {
    if (slots.has(family)) throw new RangeError(`duplicate family ${family}`);
    const axis = moveAxis(puzzle, family);
    const slot = at(perAxis, axis);
    if (slot >= 16) throw new RangeError("more than 16 families on one axis");
    slots.set(family, { axis, shift: 2 * slot });
    at(familyAt, axis).push(family);
    perAxis[axis] = slot + 1;
  }
  const maxSlots = Math.max(...perAxis);
  const qtmOfValue = (axis: number, value: number): number => {
    let total = 0;
    at(familyAt, axis).forEach((family, k) => {
      const amount = (value >>> (2 * k)) & 3;
      if (amount !== 0) total += quarterTurns(family, amount as 1 | 2 | 3);
    });
    return total;
  };
  // QTM per packed value, per axis, when the values are small enough to tabulate.
  const qtmTables = perAxis.map((count, axis) => (count <= 8 ? Uint16Array.from({ length: 4 ** count }, (_, v) => qtmOfValue(axis, v)) : undefined));
  const qtmOf = (axis: number, value: number): number => {
    const tableForAxis = qtmTables[axis];
    return tableForAxis === undefined ? qtmOfValue(axis, value) : at(tableForAxis, value);
  };

  let add: (u: number, v: number) => number;
  let count: (u: number) => number;
  let negate: (u: number) => number;
  if (maxSlots <= MAX_TABLE_SLOTS) {
    const size = 4 ** maxSlots;
    const ADD = new Uint8Array(size * size);
    const NNZ = new Uint8Array(size);
    const NEG = new Uint8Array(size);
    for (let u = 0; u < size; u++) {
      for (let k = 0; k < maxSlots; k++) {
        const a = (u >> (2 * k)) & 3;
        if (a !== 0) NNZ[u] = at(NNZ, u) + 1;
        NEG[u] = at(NEG, u) | (((4 - a) & 3) << (2 * k));
      }
      for (let v = 0; v < size; v++) {
        let w = 0;
        for (let k = 0; k < maxSlots; k++) w |= ((((u >> (2 * k)) & 3) + ((v >> (2 * k)) & 3)) & 3) << (2 * k);
        ADD[u * size + v] = w;
      }
    }
    // Hot path: plain indexing. Every packed value is below `size` by construction.
    add = (u, v) => ADD[u * size + v] ?? 0;
    count = (u) => NNZ[u] ?? 0;
    negate = (u) => NEG[u] ?? 0;
  } else {
    add = (u, v) => {
      let w = 0;
      for (let k = 0; k < 2 * maxSlots; k += 2) w |= (((u >>> k) + (v >>> k)) & 3) << k;
      return w >>> 0;
    };
    count = (u) => {
      let n = 0;
      for (let k = 0; k < 2 * maxSlots; k += 2) if (((u >>> k) & 3) !== 0) n++;
      return n;
    };
    negate = (u) => {
      let w = 0;
      for (let k = 0; k < 2 * maxSlots; k += 2) w |= ((4 - ((u >>> k) & 3)) & 3) << k;
      return w >>> 0;
    };
  }

  const stackAxes = new Int8Array(256);
  const stackValues = new Uint32Array(256);
  let stackSize = 0;

  const encode = (moves: readonly Pick<AlgMove, "family" | "amount">[]): Syllables => {
    const axes: number[] = [];
    const values: number[] = [];
    for (const move of moves) {
      const slot = slots.get(move.family);
      if (slot === undefined) throw new RangeError(`${move.family} is not in this codec`);
      const value = (move.amount << slot.shift) >>> 0;
      const n = axes.length;
      if (n > 0 && axes[n - 1] === slot.axis) {
        const merged = add(at(values, n - 1), value);
        if (merged === 0) {
          axes.pop();
          values.pop();
        } else {
          values[n - 1] = merged;
        }
      } else {
        axes.push(slot.axis);
        values.push(value);
      }
    }
    return { axes: Int8Array.from(axes), values: Uint32Array.from(values), length: values.reduce((sum, v) => sum + count(v), 0) };
  };

  const inverse = (s: Syllables): Syllables => ({
    axes: Int8Array.from(s.axes).reverse(),
    values: Uint32Array.from(s.values, negate).reverse(),
    length: s.length,
  });

  // The comm search's inner loop: no closures or checked access per step.
  const conjugateLength = (setup: Syllables, core: Syllables): number => {
    const setupAxes = setup.axes;
    const setupValues = setup.values;
    const coreAxes = core.axes;
    const coreValues = core.values;
    const s = setupAxes.length;
    const c = coreAxes.length;
    const steps = 2 * s + c;
    let n = 0;
    for (let step = 0; step < steps; step++) {
      let axis: number;
      let value: number;
      if (step < s) {
        axis = setupAxes[step] ?? 0;
        value = setupValues[step] ?? 0;
      } else if (step < s + c) {
        axis = coreAxes[step - s] ?? 0;
        value = coreValues[step - s] ?? 0;
      } else {
        const i = steps - 1 - step;
        axis = setupAxes[i] ?? 0;
        value = negate(setupValues[i] ?? 0);
      }
      if (n > 0 && stackAxes[n - 1] === axis) {
        const merged = add(stackValues[n - 1] ?? 0, value);
        if (merged === 0) n--;
        else stackValues[n - 1] = merged;
      } else {
        stackAxes[n] = axis;
        stackValues[n] = value;
        n++;
      }
    }
    stackSize = n;
    let length = 0;
    for (let i = 0; i < n; i++) length += count(stackValues[i] ?? 0);
    return length;
  };

  const lastQuarterTurns = (): number => {
    let total = 0;
    for (let i = 0; i < stackSize; i++) total += qtmOf(at(stackAxes, i), at(stackValues, i));
    return total;
  };

  const lastIdentity = (): string => {
    let identity = "";
    for (let i = 0; i < stackSize; i++) identity += `${at(stackAxes, i)}:${at(stackValues, i)} `;
    return identity;
  };

  return { puzzle, families: [...families], encode, inverse, conjugateLength, lastQuarterTurns, lastIdentity, moveCount: count, negate };
}
