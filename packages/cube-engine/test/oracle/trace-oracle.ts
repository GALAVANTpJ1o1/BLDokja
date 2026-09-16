/**
 * An independent tracer, used only by tests.
 *
 * It shares nothing with src/trace except geometry-derived sticker names and the scheme data. It
 * never touches kpuzzle: states are arrays of sticker colours (the face a sticker belongs to),
 * produced by the geometry model, and pieces are recognised the way a person recognises them,
 * by their colours (plus handedness for 4x4 wings).
 */
import { FACE_FRAMES, StickerGeometry, applyStickerPermutation, type Face, type Vec3 } from "../../src/core/geometry.js";
import { geometryAlgPermutation, geometryMovePermutation } from "../../src/core/geometry-moves.js";
import { stickerName } from "../../src/pieces/names.js";

export type Colours = Face[];

export type OracleKind = "normal" | "cycleBreak" | "cycleClose" | "orientationTarget";

export interface OracleConfig {
  readonly kind: "corners" | "edges" | "wings" | "midges";
  readonly buffer: string;
  /** Sticker name → letter for this piece type. */
  readonly letters: Readonly<Record<string, string>>;
  readonly orientedInPlace: "separate" | "asTargets";
  readonly breakOrder?: readonly string[];
}

export interface OracleResult {
  readonly targetStickers: string[];
  readonly kinds: OracleKind[];
  readonly orientedInPlace: { piece: string; sticker: string; isBuffer: boolean }[];
  readonly parity: boolean;
}

interface OCubie {
  readonly center: Vec3;
  /** Sticker slots, clockwise around the cubie as seen from outside (for 2-sticker cubies: any fixed order). */
  readonly slots: readonly number[];
  readonly faces: readonly Face[];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
const normal = (f: Face) => FACE_FRAMES[f].normal;

/** True if going from face a to face b is a clockwise step around a corner at `center`, seen from outside. */
function clockwiseStep(a: Face, b: Face, center: Vec3): boolean {
  return dot(cross(normal(a), normal(b)), center) < 0;
}

function handedness(a: Face, b: Face, center: Vec3): number {
  return Math.sign(dot(cross(normal(a), normal(b)), center));
}

export class TraceOracle {
  readonly geometry: StickerGeometry;
  readonly cubies: readonly OCubie[];
  readonly #cubieOfSlot = new Map<number, number>();
  readonly #rotations: Int32Array[];

  constructor(size: number, kind: OracleConfig["kind"]) {
    this.geometry = new StickerGeometry(size);
    const wanted = kind === "corners" ? 3 : 2;
    const cubies: OCubie[] = [];
    for (const cubie of this.geometry.cubies) {
      if (cubie.stickers.length !== wanted) continue;
      if (size === 5 && wanted === 2 && (kind === "midges" ? !cubie.center.includes(0) : cubie.center.includes(0))) continue;
      let slots = [...cubie.stickers];
      if (slots.length === 3) {
        const [a, b, c] = slots as [number, number, number];
        const fa = this.geometry.sticker(a).face;
        const fb = this.geometry.sticker(b).face;
        slots = clockwiseStep(fa, fb, cubie.center) ? [a, b, c] : [a, c, b];
      }
      const index = cubies.length;
      cubies.push({ center: cubie.center, slots, faces: slots.map((s) => this.geometry.sticker(s).face) });
      for (const s of slots) this.#cubieOfSlot.set(s, index);
    }
    this.cubies = cubies;

    const rotations: Int32Array[] = [];
    const identity = Int32Array.from({ length: this.geometry.stickerCount }, (_, i) => i);
    const queue = [identity];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const perm = queue.shift();
      if (perm === undefined) break;
      const key = perm.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      rotations.push(perm);
      for (const move of ["x", "y"]) {
        const step = geometryMovePermutation(this.geometry, move);
        queue.push(Int32Array.from(perm, (to) => step[to] ?? -1));
      }
    }
    this.#rotations = rotations;
  }

  coloursAfter(alg: string): Colours {
    const facelets = applyStickerPermutation(this.geometry.solvedFacelets(), geometryAlgPermutation(this.geometry, alg));
    return Array.from(facelets, (s) => this.geometry.sticker(s).face);
  }

  solvedColours(): Colours {
    return this.geometry.stickers.map((s) => s.face);
  }

  /** Rotate the whole cube so that every centre sticker matches its face (3x3x3). */
  normaliseCentres(colours: Colours): Colours {
    const centres = this.geometry.cubies.filter((c) => c.stickers.length === 1 && c.center.filter((v) => v === 0).length === 2);
    for (const rotation of this.#rotations) {
      const rotated = new Array<Face>(colours.length);
      colours.forEach((colour, slot) => {
        rotated[rotation[slot] ?? -1] = colour;
      });
      if (centres.every((c) => rotated[c.stickers[0] ?? -1] === this.geometry.sticker(c.stickers[0] ?? -1).face)) return rotated;
    }
    throw new Error("no rotation solves the centres");
  }

  nameOf(slot: number): string {
    return stickerName(this.geometry, slot);
  }

  slotNamed(name: string): number {
    const slot = this.geometry.stickers.findIndex((s) => this.nameOf(s.index) === name);
    if (slot < 0) throw new Error(`no sticker named ${name}`);
    return slot;
  }

  cubieOfSlot(slot: number): number {
    const c = this.#cubieOfSlot.get(slot);
    if (c === undefined) throw new Error(`slot ${slot} is not on a traced cubie`);
    return c;
  }

  #cubie(index: number): OCubie {
    const c = this.cubies[index];
    if (c === undefined) throw new Error(`no cubie ${index}`);
    return c;
  }

  /** Which cubie the piece currently in cubie `index` belongs to. */
  homeCubie(colours: Colours, index: number): number {
    const cubie = this.#cubie(index);
    const shown = cubie.slots.map((s) => colours[s] ?? "U");
    const matches = this.cubies
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.faces.length === shown.length && c.faces.every((f) => shown.includes(f)));
    if (matches.length === 1) return matches[0]?.i ?? -1;
    // Two wings share the same colours; tell them apart by handedness, which no move changes.
    const home = matches.find(({ i }) => this.#wingBelongs(colours, index, i));
    if (home === undefined) throw new Error("piece matches no cubie");
    return home.i;
  }

  /** Whether the wing in cubie `at` belongs in cubie `home`: same colours, same handedness. */
  #wingBelongs(colours: Colours, at: number, home: number): boolean {
    const here = this.#cubie(at);
    const there = this.#cubie(home);
    const [s0, s1] = here.slots as [number, number];
    const c0 = colours[s0] ?? "U";
    const c1 = colours[s1] ?? "U";
    if (!there.faces.includes(c0) || !there.faces.includes(c1)) return false;
    // Handedness of the piece measured where it is now: stickers coloured c0 then c1, at slot faces here.
    const nowHand = handedness(this.geometry.sticker(s0).face, this.geometry.sticker(s1).face, here.center);
    // Handedness at home: the sticker coloured c0 sits on face c0.
    const homeHand = handedness(c0, c1, there.center);
    return nowHand === homeHand;
  }

  isSolved(colours: Colours, index: number): boolean {
    return this.#cubie(index).slots.every((s) => colours[s] === this.geometry.sticker(s).face);
  }

  isOrientedInPlace(colours: Colours, index: number): boolean {
    return !this.isSolved(colours, index) && this.homeCubie(colours, index) === index;
  }

  /** Swap the contents of the cubies holding `slotA` and `slotB`, pairing `slotA` with `slotB`. */
  swap(colours: Colours, slotA: number, slotB: number): void {
    const a = this.#cubie(this.cubieOfSlot(slotA));
    const b = this.#cubie(this.cubieOfSlot(slotB));
    const n = a.slots.length;
    const ia = a.slots.indexOf(slotA);
    const ib = b.slots.indexOf(slotB);
    if (n === 3) {
      const fromA = [0, 1, 2].map((t) => a.slots[(ia + t) % 3] ?? -1);
      const fromB = [0, 1, 2].map((t) => b.slots[(ib + t) % 3] ?? -1);
      const saved = fromA.map((s) => colours[s] ?? "U");
      fromA.forEach((s, t) => (colours[s] = colours[fromB[t] ?? -1] ?? "U"));
      fromB.forEach((s, t) => (colours[s] = saved[t] ?? "U"));
      return;
    }
    const otherA = a.slots[1 - ia] ?? -1;
    const otherB = b.slots[1 - ib] ?? -1;
    if (this.geometry.size % 2 === 1) {
      // 3x3 edges: pair slotA with slotB and the remaining stickers with each other.
      const [ca, oa] = [colours[slotA] ?? "U", colours[otherA] ?? "U"];
      colours[slotA] = colours[slotB] ?? "U";
      colours[otherA] = colours[otherB] ?? "U";
      colours[slotB] = ca;
      colours[otherB] = oa;
      return;
    }
    // Wings can't flip in place: move each piece onto the other cubie keeping its handedness.
    const pieceA = a.slots.map((s) => colours[s] ?? "U");
    const pieceB = b.slots.map((s) => colours[s] ?? "U");
    this.#placeWing(colours, b, pieceA, a);
    this.#placeWing(colours, a, pieceB, b);
  }

  #placeWing(colours: Colours, target: OCubie, piece: Face[], from: OCubie): void {
    const [c0, c1] = piece as [Face, Face];
    const [f0, f1] = from.slots as [number, number];
    const pieceHand = handedness(this.geometry.sticker(f0).face, this.geometry.sticker(f1).face, from.center);
    const [t0, t1] = target.slots as [number, number];
    const targetHand = handedness(this.geometry.sticker(t0).face, this.geometry.sticker(t1).face, target.center);
    if (pieceHand === targetHand) {
      colours[t0] = c0;
      colours[t1] = c1;
    } else {
      colours[t0] = c1;
      colours[t1] = c0;
    }
  }

  /** Rotate a cubie's colours in place: each colour moves to the clockwise-next sticker. */
  twist(colours: Colours, index: number, steps: number): void {
    const slots = this.#cubie(index).slots;
    for (let k = 0; k < ((steps % slots.length) + slots.length) % slots.length; k++) {
      const last = colours[slots[slots.length - 1] ?? -1] ?? "U";
      for (let i = slots.length - 1; i > 0; i--) colours[slots[i] ?? -1] = colours[slots[i - 1] ?? -1] ?? "U";
      colours[slots[0] ?? -1] = last;
    }
  }

  /** The home sticker slot of the sticker currently at `slot`. */
  homeSlotOf(colours: Colours, slot: number, config: OracleConfig): number {
    const home = this.#cubie(this.homeCubie(colours, this.cubieOfSlot(slot)));
    if (config.kind === "wings") {
      const lettered = home.slots.find((s) => config.letters[this.nameOf(s)] !== undefined);
      if (lettered === undefined) throw new Error("wing without a letter");
      return lettered;
    }
    const colour = colours[slot];
    const target = home.slots.find((s) => this.geometry.sticker(s).face === colour);
    if (target === undefined) throw new Error("no home sticker for colour");
    return target;
  }

  trace(input: Colours, config: OracleConfig): OracleResult {
    const colours = [...input];
    const bufferSlot = this.slotNamed(config.buffer);
    const bufferCubie = this.cubieOfSlot(bufferSlot);
    const letterOf = (slot: number) => config.letters[this.nameOf(slot)] ?? "";

    // Parity from the colour-read permutation.
    const homes = this.cubies.map((_, i) => this.homeCubie(colours, i));
    const seen = new Set<number>();
    let transpositions = 0;
    for (let i = 0; i < homes.length; i++) {
      if (seen.has(i)) continue;
      let length = 0;
      for (let j = i; !seen.has(j); j = homes[j] ?? -1) {
        seen.add(j);
        length++;
      }
      transpositions += length - 1;
    }

    const targetStickers: string[] = [];
    const kinds: OracleKind[] = [];
    let breakCubie = -1;
    let orientationCycle = false;
    for (let guard = 0; guard < 500; guard++) {
      if (this.homeCubie(colours, bufferCubie) !== bufferCubie) {
        const target = this.homeSlotOf(colours, bufferSlot, config);
        const targetCubie = this.cubieOfSlot(target);
        targetStickers.push(this.nameOf(target));
        kinds.push(targetCubie === breakCubie ? (orientationCycle ? "orientationTarget" : "cycleClose") : "normal");
        this.swap(colours, bufferSlot, target);
        if (targetCubie === breakCubie) breakCubie = -1;
        continue;
      }
      const eligible = this.cubies
        .map((_, i) => i)
        .filter((i) => i !== bufferCubie && !this.isSolved(colours, i))
        .filter((i) => config.orientedInPlace === "asTargets" || !this.isOrientedInPlace(colours, i));
      if (eligible.length === 0) break;
      const stickers = eligible.flatMap((i) => this.#cubie(i).slots.filter((s) => letterOf(s) !== ""));
      let chosen: number | undefined;
      for (const name of config.breakOrder ?? []) {
        chosen = stickers.find((s) => this.nameOf(s) === name);
        if (chosen !== undefined) break;
      }
      chosen ??= stickers.reduce((best, s) => (letterOf(s) < letterOf(best) ? s : best));
      const chosenCubie = this.cubieOfSlot(chosen);
      orientationCycle = this.isOrientedInPlace(colours, chosenCubie);
      targetStickers.push(this.nameOf(chosen));
      kinds.push(orientationCycle ? "orientationTarget" : "cycleBreak");
      this.swap(colours, bufferSlot, chosen);
      breakCubie = chosenCubie;
    }

    const orientedInPlace: OracleResult["orientedInPlace"] = [];
    if (config.kind !== "wings") {
      this.cubies.forEach((cubie, i) => {
        if (!this.isOrientedInPlace(colours, i)) return;
        const hasUD = cubie.faces.some((f) => f === "U" || f === "D");
        const referenceColour = cubie.faces.find((f) => (hasUD ? f === "U" || f === "D" : f === "F" || f === "B"));
        const slot = cubie.slots.find((s) => colours[s] === referenceColour);
        if (slot === undefined) throw new Error("reference colour missing");
        const pieceName = this.nameOf(cubie.slots.find((s) => this.geometry.sticker(s).face === referenceColour) ?? -1);
        orientedInPlace.push({ piece: pieceName, sticker: this.nameOf(slot), isBuffer: i === bufferCubie });
      });
    }
    return { targetStickers, kinds, orientedInPlace, parity: transpositions % 2 === 1 };
  }
}
