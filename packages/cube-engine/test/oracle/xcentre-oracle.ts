/**
 * An independent x-centre tracer, used only by tests.
 *
 * Like `trace-oracle.ts` it never touches kpuzzle. States are sticker colours from the geometry model;
 * an x-centre slot is any single-sticker cubie of a 4x4, and its colour is the face it sits on when
 * solved. The rules are written out again from the tracing spec, not shared with src/trace.
 */
import { StickerGeometry, applyStickerPermutation, type Face } from "../../src/core/geometry.js";
import { geometryAlgPermutation, geometryMovePermutation } from "../../src/core/geometry-moves.js";
import { stickerName } from "../../src/pieces/names.js";

export type Colours = Face[];

export interface XCentreOracleConfig {
  readonly buffer: string;
  /** Sticker name → letter. */
  readonly letters: Readonly<Record<string, string>>;
  readonly sameColour: "lowestLetter" | "avoidBufferColour";
  readonly breakOrder?: readonly string[];
}

export interface XCentreOracleResult {
  readonly targetStickers: string[];
  readonly kinds: ("normal" | "cycleBreak" | "cycleClose")[];
  /** Colours after performing every swap, which must be solved. */
  readonly finalColours: Colours;
  /** At each break, whether every slot of the buffer's colour was already solved. */
  readonly breaksForced: boolean[];
}

export class XCentreOracle {
  readonly geometry: StickerGeometry;
  /** Sticker indices of the 24 x-centres. */
  readonly slots: readonly number[];

  constructor(size = 4, family: "xcenters" | "tcenters" = "xcenters") {
    this.geometry = new StickerGeometry(size);
    this.slots = this.geometry.cubies.filter((c) => c.stickers.length === 1 && (size === 4 || c.center.filter((v) => v !== 0 && Math.abs(v) < size - 1).length === (family === "xcenters" ? 2 : 1))).map((c) => c.stickers[0] ?? -1);
    if (this.slots.length !== 24) throw new Error(`expected 24 x-centres, found ${this.slots.length}`);
  }

  coloursAfter(alg: string): Colours {
    const facelets = applyStickerPermutation(this.geometry.solvedFacelets(), geometryAlgPermutation(this.geometry, alg));
    return Array.from(facelets, (s) => this.geometry.sticker(s).face);
  }

  /** Colours after rotating the whole cube by a sequence of x/y/z moves. */
  rotate(colours: Colours, alg: string): Colours {
    let out = [...colours];
    for (const move of alg.split(" ").filter((m) => m !== "")) {
      const perm = geometryMovePermutation(this.geometry, move);
      const next = new Array<Face>(out.length);
      out.forEach((colour, slot) => {
        next[perm[slot] ?? -1] = colour;
      });
      out = next;
    }
    return out;
  }

  home(slot: number): Face {
    return this.geometry.sticker(slot).face;
  }

  nameOf(slot: number): string {
    return stickerName(this.geometry, slot);
  }

  slotNamed(name: string): number {
    const slot = this.slots.find((s) => this.nameOf(s) === name);
    if (slot === undefined) throw new Error(`no x-centre named ${name}`);
    return slot;
  }

  trace(input: Colours, config: XCentreOracleConfig): XCentreOracleResult {
    const colours = [...input];
    const buffer = this.slotNamed(config.buffer);
    const bufferColour = this.home(buffer);
    const letter = (slot: number) => config.letters[this.nameOf(slot)] ?? "";
    const pick = (candidates: number[]): number => {
      for (const name of config.breakOrder ?? []) {
        const found = candidates.find((s) => this.nameOf(s) === name);
        if (found !== undefined) return found;
      }
      let best = candidates[0] ?? -1;
      for (const s of candidates) if (letter(s) < letter(best)) best = s;
      return best;
    };
    const swap = (slot: number) => {
      const held = colours[buffer] ?? "U";
      colours[buffer] = colours[slot] ?? "U";
      colours[slot] = held;
    };

    const targetStickers: string[] = [];
    const kinds: XCentreOracleResult["kinds"] = [];
    const breaksForced: boolean[] = [];
    let openBreak = -1;
    for (let guard = 0; guard < 200; guard++) {
      const held = colours[buffer] ?? "U";
      const wanting = this.slots.filter((s) => s !== buffer && this.home(s) === held && colours[s] !== held);
      if (wanting.length > 0) {
        const notBufferColour = wanting.filter((s) => colours[s] !== bufferColour);
        const slot = pick(config.sameColour === "avoidBufferColour" && notBufferColour.length > 0 ? notBufferColour : wanting);
        targetStickers.push(this.nameOf(slot));
        kinds.push(slot === openBreak ? "cycleClose" : "normal");
        if (slot === openBreak) openBreak = -1;
        swap(slot);
        continue;
      }
      const wrong = this.slots.filter((s) => s !== buffer && colours[s] !== this.home(s));
      if (wrong.length === 0) break;
      breaksForced.push(this.slots.filter((s) => this.home(s) === bufferColour).every((s) => colours[s] === bufferColour));
      const slot = pick(wrong);
      targetStickers.push(this.nameOf(slot));
      kinds.push("cycleBreak");
      swap(slot);
      openBreak = slot;
    }
    return { targetStickers, kinds, finalColours: colours, breaksForced };
  }
}
