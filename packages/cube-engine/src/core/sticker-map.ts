import type { KPatternData, KPuzzle, KTransformationData } from "cubing/kpuzzle";
import { at, mod } from "./arrays.js";
import type { StickerGeometry } from "./geometry.js";
import { geometryMovePermutation, parseGeometryMove } from "./geometry-moves.js";

/**
 * The map between cubing.js's piece/orientation model and physical sticker slots.
 *
 * Nothing here is a hand-written table. Each kpuzzle position is identified with a geometric
 * cubie by the set of layer moves that disturb it, and orientation labels are found by
 * propagating the move definitions from one seed position. `verifyStickerMap` then checks every
 * sticker under every generator move.
 */

export type OrbitKind = "corner" | "edge" | "center";

export interface OrbitStickerMap {
  readonly orbit: string;
  readonly kind: OrbitKind;
  readonly numPieces: number;
  readonly stickersPerPiece: number;
  /** A piece with kpuzzle orientation k has its label-j sticker in label slot (j + sign·k) mod n. */
  readonly orientationSign: 1 | -1;
  /** `slots[position][label]` = geometry sticker index. */
  readonly slots: readonly (readonly number[])[];
  /** Solved-state piece value per position; repeated values mean interchangeable pieces. */
  readonly defaultPieces: readonly number[];
  readonly interchangeable: boolean;
  readonly defaultOrientationMod: readonly number[] | undefined;
}

export interface StickerSlot {
  readonly orbitIndex: number;
  readonly position: number;
  readonly label: number;
}

export interface StickerMap {
  readonly orbits: readonly OrbitStickerMap[];
  /** Indexed by geometry sticker index. */
  readonly slotOfSticker: readonly StickerSlot[];
}

export class StickerMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StickerMapError";
  }
}

function kindForStickerCount(count: number): OrbitKind {
  if (count === 3) return "corner";
  if (count === 2) return "edge";
  return "center";
}

function stickersPerPieceFor(numOrientations: number): number {
  return numOrientations === 3 || numOrientations === 2 ? numOrientations : 1;
}

/** Layer moves used to identify pieces: every face at every depth up to the middle. */
export function signatureMoves(size: number): string[] {
  const moves: string[] = [];
  for (const face of ["U", "D", "R", "L", "F", "B"]) {
    for (let depth = 1; depth <= Math.floor((size + 1) / 2); depth++) {
      moves.push(depth === 1 ? face : `${depth}${face}`);
    }
  }
  return moves;
}

function cyclicOrders(stickers: readonly number[]): number[][] {
  const [a, b, c] = stickers;
  if (stickers.length === 3 && a !== undefined && b !== undefined && c !== undefined) {
    return [
      [a, b, c],
      [a, c, b],
    ];
  }
  return [[...stickers]];
}

function inversePermutation(perm: readonly number[]): number[] {
  const inverse = new Array<number>(perm.length);
  perm.forEach((source, position) => {
    inverse[source] = position;
  });
  return inverse;
}

export function deriveStickerMap(kpuzzle: KPuzzle, geometry: StickerGeometry): StickerMap {
  const definition = kpuzzle.definition;
  const sigMoves = signatureMoves(geometry.size);
  const sigTransforms = sigMoves.map((m) => kpuzzle.moveToTransformation(m).transformationData);
  const sigPerms = sigMoves.map((m) => geometryMovePermutation(geometry, m));
  const sigTurns = sigMoves.map((m) => parseGeometryMove(m, geometry.size));

  const geometrySignature = (cubieIndex: number): string =>
    sigTurns
      .map((turn) => (turn.depths.includes(geometry.depthFrom(turn.face, at(geometry.cubies, cubieIndex).center)) ? "1" : "0"))
      .join("");

  const cubiesByKey = new Map<string, number[]>();
  for (const cubie of geometry.cubies) {
    const key = `${cubie.stickers.length}:${geometrySignature(cubie.index)}`;
    const list = cubiesByKey.get(key) ?? [];
    list.push(cubie.index);
    cubiesByKey.set(key, list);
  }

  const orbits: OrbitStickerMap[] = definition.orbits.map((orbitDef) => {
    const { orbitName, numPieces, numOrientations } = orbitDef;
    const n = stickersPerPieceFor(numOrientations);
    const defaultData = definition.defaultPattern[orbitName];
    if (defaultData === undefined) throw new StickerMapError(`No default pattern for orbit ${orbitName}`);

    // 1. Identify each kpuzzle position with a geometric cubie.
    const cubieOfPosition: number[] = [];
    for (let position = 0; position < numPieces; position++) {
      const signature = sigTransforms
        .map((t) => {
          const orbitT = t[orbitName];
          if (orbitT === undefined) throw new StickerMapError(`Move data missing orbit ${orbitName}`);
          return at(orbitT.permutation, position) !== position || at(orbitT.orientationDelta, position) !== 0 ? "1" : "0";
        })
        .join("");
      const matches = cubiesByKey.get(`${n}:${signature}`) ?? [];
      if (matches.length !== 1) {
        throw new StickerMapError(`${orbitName}[${position}] matches ${matches.length} cubies (signature ${signature})`);
      }
      cubieOfPosition.push(at(matches, 0));
    }
    if (new Set(cubieOfPosition).size !== numPieces) {
      throw new StickerMapError(`${orbitName}: two positions matched the same cubie`);
    }

    const stickersOf = (position: number): readonly number[] => at(geometry.cubies, at(cubieOfPosition, position)).stickers;
    const common = {
      orbit: orbitName,
      kind: kindForStickerCount(n),
      numPieces,
      stickersPerPiece: n,
      defaultPieces: [...defaultData.pieces],
      interchangeable: new Set(defaultData.pieces).size !== defaultData.pieces.length,
      defaultOrientationMod: defaultData.orientationMod === undefined ? undefined : [...defaultData.orientationMod],
    };

    if (n === 1) {
      return { ...common, orientationSign: 1 as const, slots: cubieOfPosition.map((c) => [at(at(geometry.cubies, c).stickers, 0)]) };
    }

    // 2. Find orientation labels by propagation from position 0.
    for (const sign of [1, -1] as const) {
      for (const seed of cyclicOrders(stickersOf(0))) {
        const labels = propagateLabels(orbitName, numPieces, n, sign, seed, sigTransforms, sigPerms, stickersOf);
        if (labels !== undefined) {
          return { ...common, orientationSign: sign, slots: labels };
        }
      }
    }
    throw new StickerMapError(`${orbitName}: no consistent orientation labelling`);
  });

  const slotOfSticker = new Array<StickerSlot>(geometry.stickerCount);
  orbits.forEach((orbit, orbitIndex) => {
    orbit.slots.forEach((labels, position) => {
      labels.forEach((sticker, label) => {
        slotOfSticker[sticker] = { orbitIndex, position, label };
      });
    });
  });
  for (let s = 0; s < geometry.stickerCount; s++) {
    if (slotOfSticker[s] === undefined) throw new StickerMapError(`Sticker ${s} belongs to no kpuzzle orbit`);
  }
  return { orbits, slotOfSticker };
}

function propagateLabels(
  orbitName: string,
  numPieces: number,
  n: number,
  sign: 1 | -1,
  seed: readonly number[],
  transforms: readonly KTransformationData[],
  perms: readonly Int32Array[],
  stickersOf: (position: number) => readonly number[],
): number[][] | undefined {
  const labels = new Array<number[] | undefined>(numPieces).fill(undefined);
  labels[0] = [...seed];
  const queue = [0];
  const inverses = transforms.map((t) => {
    const orbitT = t[orbitName];
    if (orbitT === undefined) throw new StickerMapError(`Move data missing orbit ${orbitName}`);
    return { inverse: inversePermutation(orbitT.permutation), delta: orbitT.orientationDelta };
  });
  while (queue.length > 0) {
    const source = queue.pop();
    if (source === undefined) break;
    const sourceLabels = labels[source];
    if (sourceLabels === undefined) continue;
    for (let m = 0; m < transforms.length; m++) {
      const { inverse, delta } = at(inverses, m);
      const perm = at(perms, m);
      const target = at(inverse, source);
      const d = at(delta, target);
      const next = new Array<number>(n);
      for (let j = 0; j < n; j++) {
        next[mod(j + sign * d, n)] = at(perm, at(sourceLabels, j));
      }
      const targetStickers = new Set(stickersOf(target));
      if (!next.every((s) => targetStickers.has(s))) return undefined;
      const existing = labels[target];
      if (existing === undefined) {
        labels[target] = next;
        queue.push(target);
      } else if (existing.some((s, j) => s !== next[j])) {
        return undefined;
      }
    }
  }
  const complete: number[][] = [];
  for (const entry of labels) {
    if (entry === undefined) return undefined;
    complete.push(entry);
  }
  return complete;
}

/** Sticker permutation (`perm[from] = to`) described by a kpuzzle transformation. */
export function transformationToStickerPermutation(map: StickerMap, data: KTransformationData, stickerCount: number): Int32Array {
  const out = new Int32Array(stickerCount).fill(-1);
  for (const orbit of map.orbits) {
    const t = data[orbit.orbit];
    if (t === undefined) throw new StickerMapError(`Transformation missing orbit ${orbit.orbit}`);
    const n = orbit.stickersPerPiece;
    for (let position = 0; position < orbit.numPieces; position++) {
      const source = at(t.permutation, position);
      const d = at(t.orientationDelta, position);
      for (let j = 0; j < n; j++) {
        out[at(at(orbit.slots, source), j)] = at(at(orbit.slots, position), mod(j + orbit.orientationSign * d, n));
      }
    }
  }
  return out;
}

/** Facelet state (`facelets[slot]` = home sticker at that slot) described by a kpuzzle pattern. */
export function patternToFacelets(map: StickerMap, data: KPatternData, stickerCount: number): Int32Array {
  const out = new Int32Array(stickerCount).fill(-1);
  for (const orbit of map.orbits) {
    const p = data[orbit.orbit];
    if (p === undefined) throw new StickerMapError(`Pattern missing orbit ${orbit.orbit}`);
    const n = orbit.stickersPerPiece;
    for (let position = 0; position < orbit.numPieces; position++) {
      const piece = at(p.pieces, position);
      const k = at(p.orientation, position);
      for (let j = 0; j < n; j++) {
        out[at(at(orbit.slots, position), mod(j + orbit.orientationSign * k, n))] = at(at(orbit.slots, piece), j);
      }
    }
  }
  return out;
}

/**
 * Kpuzzle pattern data for a facelet state. Throws if the stickers at some position don't form
 * one real piece in one real orientation (for example, stickers from two different corners).
 */
export function faceletsToPattern(map: StickerMap, facelets: Int32Array): KPatternData {
  const data: KPatternData = {};
  map.orbits.forEach((orbit, orbitIndex) => {
    const n = orbit.stickersPerPiece;
    const pieces: number[] = [];
    const orientation: number[] = [];
    for (let position = 0; position < orbit.numPieces; position++) {
      const labels = at(orbit.slots, position);
      const home = at(map.slotOfSticker, at(facelets, at(labels, 0)));
      if (home.orbitIndex !== orbitIndex) {
        throw new StickerMapError(`${orbit.orbit}[${position}] holds a sticker from another orbit`);
      }
      const k = mod(-orbit.orientationSign * home.label, n);
      for (let j = 0; j < n; j++) {
        const expected = at(at(orbit.slots, home.position), j);
        const actual = at(facelets, at(labels, mod(j + orbit.orientationSign * k, n)));
        if (actual !== expected) {
          throw new StickerMapError(`${orbit.orbit}[${position}] does not hold a single piece`);
        }
      }
      pieces.push(at(orbit.defaultPieces, home.position));
      orientation.push(n === 1 ? 0 : k);
    }
    data[orbit.orbit] =
      orbit.defaultOrientationMod === undefined
        ? { pieces, orientation }
        : { pieces, orientation, orientationMod: [...orbit.defaultOrientationMod] };
  });
  return data;
}
