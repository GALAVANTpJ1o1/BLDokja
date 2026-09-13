import { uniformFloat64 } from "pure-rand/distribution/uniformFloat64";
import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plus, xoroshiro128plusFromState } from "pure-rand/generator/xoroshiro128plus";
import type { JumpableRandomGenerator } from "pure-rand/types/JumpableRandomGenerator";

/**
 * Seeded randomness for everything that must be reproducible: drill sessions, sampled states,
 * fixtures. Nothing in cube-engine calls Math.random.
 */
export interface Rng {
  /** Uniform integer in [0, bound). */
  int(bound: number): number;
  /** Uniform integer in [from, to]. */
  intBetween(from: number, to: number): number;
  /** Uniform float in [0, 1). */
  float(): number;
  /** Serialisable generator state; `rngFromState` resumes from it. */
  state(): readonly number[];
  /** An independent copy that continues from the same point. */
  clone(): Rng;
}

class PureRandRng implements Rng {
  readonly #generator: JumpableRandomGenerator;

  constructor(generator: JumpableRandomGenerator) {
    this.#generator = generator;
  }

  int(bound: number): number {
    if (!Number.isInteger(bound) || bound < 1) throw new RangeError(`bound must be a positive integer, got ${bound}`);
    return uniformInt(this.#generator, 0, bound - 1);
  }

  intBetween(from: number, to: number): number {
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
      throw new RangeError(`invalid integer range [${from}, ${to}]`);
    }
    return uniformInt(this.#generator, from, to);
  }

  float(): number {
    return uniformFloat64(this.#generator);
  }

  state(): readonly number[] {
    return this.#generator.getState();
  }

  clone(): Rng {
    return new PureRandRng(xoroshiro128plusFromState(this.#generator.getState()));
  }
}

/** UTF-8 bytes of a string (written out here because TextEncoder is not part of the bare language). */
export function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  return bytes;
}

/**
 * 32-bit FNV-1a over the UTF-8 bytes of `text`. Constants and test vectors are from the FNV
 * reference implementation (github.com/lcn2/fnv, test_fnv.c); see test/random/prng.test.ts.
 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of utf8Bytes(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A generator seeded from a shareable seed string (or a 32-bit integer). */
export function createRng(seed: string | number): Rng {
  const numeric = typeof seed === "number" ? seed | 0 : fnv1a32(seed) | 0;
  return new PureRandRng(xoroshiro128plus(numeric));
}

export function rngFromState(state: readonly number[]): Rng {
  return new PureRandRng(xoroshiro128plusFromState(state));
}

/** Fisher–Yates shuffle into a new array. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) throw new RangeError("shuffle index out of range");
    out[i] = b;
    out[j] = a;
  }
  return out;
}
