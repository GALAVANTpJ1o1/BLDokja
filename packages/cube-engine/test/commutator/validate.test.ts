import { describe, expect, it } from "vitest";
import { composeStickerPermutations, type StickerGeometry } from "../../src/core/geometry.js";
import { geometryMovePermutation } from "../../src/core/geometry-moves.js";
import { faceletsOf, loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { formatNodes, parseAlg, type AlgMove, type AlgNode, type QuarterTurns } from "../../src/commutator/parse.js";
import { stickerCyclePattern, threeCyclePattern, validateComm, type ThreeCycle } from "../../src/commutator/validate.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType, type PieceTypeId } from "../../src/pieces/piece-types.js";
import { stickerName } from "../../src/pieces/names.js";
import { trace } from "../../src/trace/trace.js";
import { TraceOracle } from "../oracle/trace-oracle.js";

/** Every ordered [buffer, t1, t2] on three distinct pieces, for the given buffer stickers and target stickers. */
function* cycles(puzzle: Puzzle, typeId: PieceTypeId, buffers: readonly string[], targets: readonly string[]): Generator<ThreeCycle> {
  const type = pieceType(puzzle, typeId);
  const position = (name: string) => type.stickerByName(name)?.position ?? -1;
  for (const b of buffers) {
    for (const t1 of targets) {
      if (position(t1) === position(b)) continue;
      for (const t2 of targets) {
        if (position(t2) === position(b) || position(t2) === position(t1)) continue;
        yield [b, t1, t2];
      }
    }
  }
}

function checkConstructed(puzzle: Puzzle, typeId: PieceTypeId, cycle: ThreeCycle, withOracle: boolean): void {
  const context = `${puzzle.id} ${typeId} ${cycle.join(" ")}`;
  const pattern = threeCyclePattern(puzzle, cycle);
  if (!pattern.ok) throw new Error(`${context}: ${JSON.stringify(pattern.error)}`);
  const type = pieceType(puzzle, typeId);
  const index = (name: string) => type.stickerByName(name)?.index ?? -1;
  const [b, t1, t2] = cycle;

  // Sticker-level meaning: the buffer slot shows t1, t1's slot shows t2, t2's slot shows the buffer.
  const facelets = faceletsOf(puzzle, pattern.value);
  if (typeId !== "wings") {
    expect([facelets[index(b)], facelets[index(t1)], facelets[index(t2)]], context).toEqual([index(t1), index(t2), index(b)]);
  }
  // Nothing else is out of place. Identical pieces (4x4 x-centres) can only be compared by colour.
  const face = (sticker: number) => puzzle.geometry.sticker(sticker).face;
  const interchangeable = (slot: number) => puzzle.stickerMap.orbits[puzzle.stickerMap.slotOfSticker[slot]?.orbitIndex ?? -1]?.interchangeable ?? false;
  const misplaced = facelets.filter((home, slot) => (interchangeable(slot) ? face(home) !== face(slot) : home !== slot));
  const stickersPerPiece = type.pieces[0]?.stickers.length ?? 0;
  expect(misplaced.length, context).toBe(3 * stickersPerPiece);

  const scheme = speffzScheme(puzzle);
  const frame = puzzle.id === "3x3x3" ? { kind: "centers" as const } : { kind: "asIs" as const };
  for (const orientedInPlace of ["separate", "asTargets"] as const) {
    const result = trace(puzzle, { pattern: pattern.value }, { pieceType: typeId, buffer: b, scheme, frame, policy: { orientedInPlace } });
    if (!result.ok) throw new Error(`${context}: ${JSON.stringify(result.error)}`);
    expect(result.value.targetStickers, context).toEqual([t1, t2]);
    expect(result.value.orientedInPlace, context).toEqual([]);
    expect(result.value.parity, context).toBe(false);
  }

  if (withOracle) {
    if (typeId === "xcenters") throw new Error("x-centres are not traceable");
    const oracle = new TraceOracle(puzzle.size, typeId);
    const colours = Array.from(facelets, (home) => puzzle.geometry.sticker(home).face);
    const read = oracle.trace(colours, { kind: typeId, buffer: b, letters: scheme.letters[typeId] ?? {}, orientedInPlace: "separate" });
    expect(read.targetStickers, `${context} oracle`).toEqual([t1, t2]);
  }
}

describe("threeCyclePattern", () => {
  it("builds, for every 3x3 buffer and target pair, a state that traces to exactly those two targets", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const typeId of ["corners", "edges"] as const) {
      const stickers = pieceType(puzzle, typeId).stickers.map((s) => s.name);
      let count = 0;
      for (const cycle of cycles(puzzle, typeId, stickers, stickers)) {
        checkConstructed(puzzle, typeId, cycle, count % 97 === 0);
        count++;
      }
      expect(count).toBe(typeId === "corners" ? 24 * 378 : 24 * 440);
    }
  });

  it("does the same for 4x4 corners and wings (three buffers each)", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const scheme = speffzScheme(puzzle);
    for (const typeId of ["corners", "wings"] as const) {
      // Wing targets are the lettered sticker of each wing, as the tracer reports them.
      const stickers = typeId === "wings" ? Object.keys(scheme.letters.wings ?? {}) : pieceType(puzzle, typeId).stickers.map((s) => s.name);
      const buffers = [stickers[0], stickers[7], stickers[17]].filter((s) => s !== undefined);
      let count = 0;
      for (const cycle of cycles(puzzle, typeId, buffers, stickers)) {
        // Every wing case goes through the oracle: wing orientation is where kpuzzle labels differ from "always 0".
        checkConstructed(puzzle, typeId, cycle, typeId === "wings" || count % 97 === 0);
        count++;
      }
      expect(count).toBeGreaterThan(1000);
    }
  });

  it("reports bad cycles", async () => {
    const three = await loadPuzzle("3x3x3");
    const four = await loadPuzzle("4x4x4");
    const code = (r: ReturnType<typeof threeCyclePattern>) => (r.ok ? "ok" : r.error);
    expect(code(threeCyclePattern(three, ["UFR", "XYZ", "DBL"]))).toEqual({ code: "unknown-sticker", sticker: "XYZ" });
    expect(code(threeCyclePattern(three, ["UFR", "UB", "DBL"]))).toEqual({ code: "mixed-piece-types", stickers: ["UFR", "UB", "DBL"] });
    expect(code(threeCyclePattern(three, ["UFR", "RUF", "DBL"]))).toEqual({ code: "same-piece", stickers: ["UFR", "RUF"] });
    expect(code(threeCyclePattern(three, ["UF", "DB", "BD"]))).toEqual({ code: "same-piece", stickers: ["DB", "BD"] });
    expect(code(threeCyclePattern(four, ["Ufr", "Ufl", "Ubl"]))).toEqual("ok");
  });

  it("builds x-centre cases too, where a cycle within one colour is simply the solved cube", async () => {
    const four = await loadPuzzle("4x4x4");
    // Three different faces: a real case, and the pieces land where the cycle says.
    const mixed = threeCyclePattern(four, ["Ufr", "Fur", "Ruf"]);
    if (!mixed.ok) throw new Error(JSON.stringify(mixed.error));
    expect(mixed.value.isIdentical(four.kpuzzle.defaultPattern())).toBe(false);
    const centres = mixed.value.patternData.CENTERS;
    const type = pieceType(four, "xcenters");
    const at = (name: string) => centres?.pieces[type.pieceByName(name)?.position ?? -1];
    const home = (name: string) => four.kpuzzle.defaultPattern().patternData.CENTERS?.pieces[type.pieceByName(name)?.position ?? -1];
    expect([at("Ufr"), at("Fur"), at("Ruf")]).toEqual([home("Fur"), home("Ruf"), home("Ufr")]);
    // Same colour: the pieces are identical, so the "case" is a solved cube.
    const oneColour = threeCyclePattern(four, ["Ufr", "Ufl", "Ubl"]);
    if (!oneColour.ok) throw new Error(JSON.stringify(oneColour.error));
    expect(oneColour.value.isIdentical(four.kpuzzle.defaultPattern())).toBe(true);
  });
});

describe("stickerCyclePattern", () => {
  it("with two stickers, builds the exchange of the buffer and target pieces: it traces to exactly that one target, with parity", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    for (const typeId of ["corners", "edges"] as const) {
      const type = pieceType(puzzle, typeId);
      const oracle = new TraceOracle(3, typeId);
      let count = 0;
      for (const buffer of type.stickers) {
        for (const target of type.stickers) {
          if (target.position === buffer.position) continue;
          const context = `${buffer.name} ↔ ${target.name}`;
          const pattern = stickerCyclePattern(puzzle, [buffer.name, target.name]);
          if (!pattern.ok) throw new Error(`${context}: ${JSON.stringify(pattern.error)}`);
          const facelets = faceletsOf(puzzle, pattern.value);
          expect([facelets[buffer.index], facelets[target.index]], context).toEqual([target.index, buffer.index]);
          expect(facelets.filter((home, slot) => home !== slot).length, context).toBe(2 * (type.pieces[0]?.stickers.length ?? 0));
          for (const orientedInPlace of ["separate", "asTargets"] as const) {
            const result = trace(puzzle, { pattern: pattern.value }, { pieceType: typeId, buffer: buffer.name, scheme, policy: { orientedInPlace } });
            if (!result.ok) throw new Error(`${context}: ${JSON.stringify(result.error)}`);
            expect([result.value.targetStickers, result.value.orientedInPlace, result.value.parity], context).toEqual([[target.name], [], true]);
          }
          if (count % 37 === 0) {
            const colours = Array.from(facelets, (home) => puzzle.geometry.sticker(home).face);
            const read = oracle.trace(colours, { kind: typeId, buffer: buffer.name, letters: scheme.letters[typeId] ?? {}, orientedInPlace: "separate" });
            expect(read.targetStickers, `${context} oracle`).toEqual([target.name]);
          }
          count++;
        }
      }
      expect(count).toBe(typeId === "corners" ? 24 * 21 : 24 * 22);
    }
  });

  it("with three stickers, is threeCyclePattern; with four, traces to the three targets; shorter cycles are rejected", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const three = stickerCyclePattern(puzzle, ["UFR", "DBL", "RDF"]);
    const reference = threeCyclePattern(puzzle, ["UFR", "DBL", "RDF"]);
    if (!three.ok || !reference.ok) throw new Error("pattern");
    expect(three.value.isIdentical(reference.value)).toBe(true);

    const four = stickerCyclePattern(puzzle, ["UF", "RB", "DL", "FU"]);
    expect(four.ok ? "ok" : four.error).toEqual({ code: "same-piece", stickers: ["UF", "FU"] });
    const cycle = stickerCyclePattern(puzzle, ["UF", "RB", "DL", "BU"]);
    if (!cycle.ok) throw new Error(JSON.stringify(cycle.error));
    const result = trace(puzzle, { pattern: cycle.value }, { pieceType: "edges", buffer: "UF", scheme: speffzScheme(puzzle) });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.targetStickers).toEqual(["RB", "DL", "BU"]);

    expect(stickerCyclePattern(puzzle, ["UF"])).toEqual({ ok: false, error: { code: "cycle-too-short", length: 1 } });
  });
});

interface FoundComm {
  readonly nodes: AlgNode[];
  readonly cycle: ThreeCycle;
}

/**
 * Pure commutators [A, B] whose effect, in the geometry model, is exactly one 3-cycle of pieces of
 * one kind with nothing else moved. Nothing here is a remembered algorithm: every comm is found by
 * enumeration and its cycle is read off the geometry model's permutation.
 */
interface CommShape {
  /** Moves for the longer operand, up to `maxLength` of them. */
  readonly longMoves: readonly string[];
  readonly maxLength: number;
  /** Moves for the one-move operand. */
  readonly shortMoves: readonly string[];
  /** Also try [short, long], not only [long, short]. */
  readonly bothOrders: boolean;
}

function computedComms(geometry: StickerGeometry, shape: CommShape, stickersPerPiece: 2 | 3): FoundComm[] {
  const withPerms = (names: readonly string[]) =>
    names.map((name) => {
      const match = /^(.+?)(2|')?$/.exec(name);
      const family = match?.[1] ?? name;
      const amount: QuarterTurns = match?.[2] === "2" ? 2 : match?.[2] === "'" ? 3 : 1;
      const move: AlgMove = { type: "move", family, amount };
      return { move, perm: geometryMovePermutation(geometry, name) };
    });
  const longMoves = withPerms(shape.longMoves);
  const shortMoves = withPerms(shape.shortMoves);
  const inverse = (perm: Int32Array) => {
    const out = new Int32Array(perm.length);
    perm.forEach((to, from) => (out[to] = from));
    return out;
  };
  const found: FoundComm[] = [];
  const seen = new Set<string>();

  const consider = (long: AlgMove[], permLong: Int32Array) => {
    const invLong = inverse(permLong);
    const pairs = shortMoves.flatMap((short) => {
      const invShort = inverse(short.perm);
      const forwards = { a: long, b: [short.move], perms: [permLong, short.perm, invLong, invShort] };
      const backwards = { a: [short.move], b: long, perms: [short.perm, permLong, invShort, invLong] };
      return shape.bothOrders ? [forwards, backwards] : [forwards];
    });
    for (const { a, b, perms } of pairs) {
      const perm = perms.reduce((acc, p) => composeStickerPermutations(acc, p));
      const moved: number[] = [];
      perm.forEach((to, from) => {
        // Centre stickers on bigger cubes are identical within a face, so only a colour change counts.
        const identicalPiece = geometry.cubieOf(from).stickers.length === 1;
        if (identicalPiece ? geometry.sticker(to).face !== geometry.sticker(from).face : to !== from) moved.push(from);
      });
      if (moved.length !== 3 * stickersPerPiece) continue;
      const cubies = new Set(moved.map((s) => geometry.cubieOf(s).index));
      if (cubies.size !== 3 || moved.some((s) => geometry.cubieOf(s).stickers.length !== stickersPerPiece)) continue;
      if (moved.some((s) => perm[perm[perm[s] ?? -1] ?? -1] !== s || geometry.cubieOf(perm[s] ?? -1).index === geometry.cubieOf(s).index)) continue;
      const s = moved[0] ?? -1;
      const cycle: ThreeCycle = [stickerName(geometry, s), stickerName(geometry, perm[s] ?? -1), stickerName(geometry, perm[perm[s] ?? -1] ?? -1)];
      const nodes: AlgNode[] = [{ type: "commutator", a, b }];
      const key = formatNodes(nodes);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ nodes, cycle });
    }
  };

  const extend = (long: AlgMove[], permLong: Int32Array) => {
    if (long.length > 0) consider(long, permLong);
    if (long.length === shape.maxLength) return;
    for (const m of longMoves) {
      if (long[long.length - 1]?.family === m.move.family) continue;
      extend([...long, m.move], composeStickerPermutations(permLong, m.perm));
    }
  };
  extend([], Int32Array.from({ length: geometry.stickerCount }, (_, i) => i));
  return found;
}

describe("validateComm with computed commutators", () => {
  const withSuffixes = (families: string[]) => families.flatMap((f) => [f, `${f}2`, `${f}'`]);

  const faces = withSuffixes(["U", "D", "R", "L", "F", "B"]);
  const slices3 = withSuffixes(["M", "E", "S"]);
  const innerSlices4 = withSuffixes(["2U", "2D", "2R", "2L", "2F", "2B"]);
  it.each([
    {
      label: "3x3 corners: [A, B], A up to 3 face turns, B one face turn",
      puzzleId: "3x3x3" as const,
      typeId: "corners" as const,
      shape: { longMoves: faces, maxLength: 3, shortMoves: faces, bothOrders: false },
    },
    {
      label: "3x3 edges: [A, B], A up to 2 face or slice turns, B one",
      puzzleId: "3x3x3" as const,
      typeId: "edges" as const,
      shape: { longMoves: [...faces, ...slices3], maxLength: 2, shortMoves: [...faces, ...slices3], bothOrders: false },
    },
    {
      label: "4x4 wings: one inner slice against up to 3 U/R/F/D turns, either order",
      puzzleId: "4x4x4" as const,
      typeId: "wings" as const,
      shape: { longMoves: withSuffixes(["U", "R", "F", "D"]), maxLength: 3, shortMoves: innerSlices4, bothOrders: true },
    },
  ])("$label", async ({ puzzleId, typeId, shape }) => {
    const puzzle = await loadPuzzle(puzzleId);
    const type = pieceType(puzzle, typeId);
    const comms = computedComms(puzzle.geometry, shape, typeId === "corners" ? 3 : 2);
    expect(comms.length).toBeGreaterThan(50);

    comms.forEach(({ nodes, cycle }, i) => {
      const alg = { puzzle: puzzleId, nodes };
      const text = formatNodes(nodes);
      const [b, t1, t2] = cycle;
      expect(validateComm(puzzle, alg, cycle), `${text} ${cycle.join(" ")}`).toEqual({ ok: true, value: { valid: true } });
      expect(validateComm(puzzle, alg, [b, t2, t1]), `${text} reversed`).toEqual({ ok: true, value: { valid: false, reason: "reversed" } });

      // A target on a piece outside the cycle: neither direction solves it.
      const involved = new Set(cycle.map((name) => type.stickerByName(name)?.position));
      const outsider = type.stickers.find((s) => !involved.has(s.position));
      if (outsider === undefined) throw new Error("no piece outside the cycle");
      const wrong = validateComm(puzzle, alg, [b, t1, outsider.name]);
      if (!wrong.ok || wrong.value.valid || wrong.value.reason !== "wrong-effect") throw new Error(`${text}: expected wrong-effect, got ${JSON.stringify(wrong)}`);
      expect(wrong.value.unsolved.flatMap((o) => o.stickers).length).toBeGreaterThan(0);

      // The text form gives the same answer.
      if (i % 25 === 0) expect(validateComm(puzzle, text, cycle), text).toEqual({ ok: true, value: { valid: true } });
    });
  });
});

describe("validateComm errors", () => {
  it("reports parse errors, wrong puzzles and bad cycles", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    expect(validateComm(puzzle, "[R, U", ["UFR", "UBL", "DBL"])).toEqual({ ok: false, error: { code: "invalid-alg", error: { code: "unclosed-bracket", index: 0 } } });
    const four = parseAlg("4x4x4", "Rw");
    if (!four.ok) throw new Error("parse");
    expect(validateComm(puzzle, four.value, ["UFR", "UBL", "DBL"])).toEqual({ ok: false, error: { code: "wrong-puzzle", expected: "3x3x3", actual: "4x4x4" } });
    expect(validateComm(puzzle, "R", ["UFR", "UBR", "BUR"])).toEqual({ ok: false, error: { code: "same-piece", stickers: ["UBR", "BUR"] } });
  });
});
