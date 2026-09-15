import { KPattern } from "cubing/kpuzzle";
import { describe, expect, it } from "vitest";
import { at } from "../../src/core/arrays.js";
import type { Face } from "../../src/core/geometry.js";
import { loadPuzzle, verifiedMoves, type Puzzle } from "../../src/core/puzzle.js";
import type { Scheme } from "../../src/lettering/scheme.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { createRng, shuffled } from "../../src/random/prng.js";
import { randomMoveSequence } from "../../src/random/random-state.js";
import { interchangeableChoices, trace, type TracePolicy } from "../../src/trace/trace.js";
import { reverseGreekScheme } from "../fixtures/construct.js";
import { XCentreOracle } from "../oracle/xcentre-oracle.js";

/**
 * 4x4 x-centres: interchangeable pieces, traced by colour. Hand-derived fixtures, agreement with an
 * independent colour-reading oracle, and the properties that make a trace a solution.
 */

/** A pattern whose x-centres show the given colours (slots not listed are solved); everything else solved. */
function patternWith(puzzle: Puzzle, colours: Readonly<Record<string, Face>>): KPattern {
  const type = pieceType(puzzle, "xcenters");
  const homes = at(puzzle.stickerMap.orbits, type.orbitIndex).defaultPieces;
  const valueOf = (face: Face) => {
    const piece = type.pieces.find((p) => p.homeFace === face);
    if (piece === undefined) throw new Error(`no x-centre home on ${face}`);
    return at(homes, piece.position);
  };
  for (const name of Object.keys(colours)) if (type.pieceByName(name) === undefined) throw new Error(`no x-centre ${name}`);
  const pieces = type.pieces.map((p) => valueOf(colours[p.name] ?? p.homeFace));
  const base = puzzle.kpuzzle.defaultPattern();
  return new KPattern(puzzle.kpuzzle, { ...base.patternData, [type.orbit]: { pieces, orientation: pieces.map(() => 0) } });
}

interface XFixture {
  readonly id: string;
  readonly description: string;
  readonly buffer: string;
  readonly scheme?: "speffz" | "reverse-greek";
  readonly policy?: TracePolicy;
  /** Slots holding another colour; four of each colour overall. */
  readonly state: Readonly<Record<string, Face>>;
  readonly targets: string;
  readonly kinds: string;
  readonly parity: boolean;
}

// Each expected trace was worked out by hand from the rules in src/trace/trace.ts, step by step, before
// the tracer was run. N normal, B break, C close.
const FIXTURES: readonly XFixture[] = [
  {
    id: "X-01",
    description: "two targets, no choice at either step",
    buffer: "Ubl",
    state: { Ubl: "F", Ful: "L", Lub: "U" },
    targets: "I E",
    kinds: "N N",
    parity: false,
  },
  {
    id: "X-02",
    description: "two F slots need F; the lower letter goes first",
    buffer: "Ubl",
    state: { Ubl: "F", Ful: "R", Fur: "L", Ruf: "F", Lub: "U" },
    targets: "I M J E",
    kinds: "N N N N",
    parity: false,
  },
  {
    id: "X-03",
    description: "lowest letter picks up the buffer's colour early and needs a break",
    buffer: "Ubl",
    policy: { sameColour: "lowestLetter" },
    state: { Ubl: "F", Ful: "U", Fur: "R", Ruf: "F", Ubr: "L", Lub: "U" },
    targets: "I B E J M J",
    kinds: "N N N B N C",
    parity: false,
  },
  {
    id: "X-04",
    description: "the same state with the default, avoiding the buffer's colour: no break, and odd",
    buffer: "Ubl",
    state: { Ubl: "F", Ful: "U", Fur: "R", Ruf: "F", Ubr: "L", Lub: "U" },
    targets: "J M I B E",
    kinds: "N N N N N",
    parity: true,
  },
  {
    id: "X-05",
    description: "reversed letters change which F slot is lowest",
    buffer: "Ubl",
    scheme: "reverse-greek",
    state: { Ubl: "F", Ful: "U", Fur: "R", Ruf: "F", Ubr: "L", Lub: "U" },
    targets: "Ο Μ Π Ψ Υ",
    kinds: "N N N N N",
    parity: true,
  },
  {
    id: "X-06",
    description: "buffer solved at the start: break, then close on the break slot",
    buffer: "Ubl",
    state: { Ful: "L", Lub: "F" },
    targets: "E I E",
    kinds: "B N C",
    parity: true,
  },
  {
    id: "X-07",
    description: "a break order list picks the break slot",
    buffer: "Ubl",
    policy: { breakOrder: ["Ful"] },
    state: { Ful: "L", Lub: "F" },
    targets: "I E I",
    kinds: "B N C",
    parity: true,
  },
  {
    id: "X-08",
    description: "fully solved x-centres",
    buffer: "Ubr",
    state: {},
    targets: "",
    kinds: "",
    parity: false,
  },
  {
    id: "X-09",
    description: "another buffer: Ubr, with a D target and the buffer's colour on D",
    buffer: "Ubr",
    state: { Ubr: "D", Dfl: "U" },
    targets: "U",
    kinds: "N",
    parity: true,
  },
];

const KIND = { N: "normal", B: "cycleBreak", C: "cycleClose" } as const;

describe("x-centre fixtures (hand-derived)", () => {
  it.each(FIXTURES)("$id: $description", async (fixture) => {
    const puzzle = await loadPuzzle("4x4x4");
    const counts = new Map<string, number>();
    const type = pieceType(puzzle, "xcenters");
    for (const p of type.pieces) {
      const colour = fixture.state[p.name] ?? p.homeFace;
      counts.set(colour, (counts.get(colour) ?? 0) + 1);
    }
    expect([...counts.values()], "four of each colour").toEqual([4, 4, 4, 4, 4, 4]);

    const scheme = fixture.scheme === "reverse-greek" ? reverseGreekScheme(puzzle) : speffzScheme(puzzle);
    const result = trace(puzzle, { pattern: patternWith(puzzle, fixture.state) }, { pieceType: "xcenters", buffer: fixture.buffer, scheme, frame: { kind: "asIs" }, ...(fixture.policy === undefined ? {} : { policy: fixture.policy }) });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const split = (s: string) => s.split(" ").filter((t) => t !== "");
    expect(result.value.targets).toEqual(split(fixture.targets));
    expect(result.value.targetKinds).toEqual(split(fixture.kinds).map((k) => KIND[k as keyof typeof KIND]));
    expect(result.value.cycleBreaks).toEqual(split(fixture.kinds).flatMap((k, i) => (k === "B" ? [i] : [])));
    expect(result.value.parity).toBe(fixture.parity);
    expect(result.value.flipped).toEqual([]);
    expect(result.value.twisted).toEqual([]);
  });
});

describe("x-centre tracer ≡ oracle", () => {
  it("agrees on targets and kinds for random states, every buffer, both schemes and both policies", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const oracle = new XCentreOracle();
    const rng = createRng("xcentres-differential");
    const base = speffzScheme(puzzle);
    const letters = base.letters.xcenters ?? {};
    // A fixed permutation of the letters, drawn once, so both tracers see the same shuffled scheme.
    const values = shuffled(createRng("xcentres-scheme"), Object.values(letters));
    const shuffledScheme: Scheme = { ...base, id: "shuffled", name: "Shuffled", letters: { ...base.letters, xcenters: Object.fromEntries(Object.keys(letters).map((k, i) => [k, values[i] ?? "?"])) } };
    const type = pieceType(puzzle, "xcenters");
    const moves = verifiedMoves("4x4x4");
    let compared = 0;
    for (let i = 0; i < 60; i++) {
      const alg = randomMoveSequence(rng, moves, 25 + rng.int(20)).join(" ");
      const colours = oracle.coloursAfter(alg);
      for (const scheme of [base, shuffledScheme]) {
        for (const piece of type.pieces) {
          for (const sameColour of ["lowestLetter", "avoidBufferColour"] as const) {
            const buffer = piece.name;
            const result = trace(puzzle, { alg }, { pieceType: "xcenters", buffer, scheme, frame: { kind: "asIs" }, policy: { sameColour } });
            if (!result.ok) throw new Error(JSON.stringify(result.error));
            const expected = oracle.trace(colours, { buffer, letters: scheme.letters.xcenters ?? {}, sameColour });
            const context = `${alg} | ${buffer} | ${scheme.id} | ${sameColour}`;
            expect(result.value.targetStickers, context).toEqual(expected.targetStickers);
            expect(result.value.targetKinds, context).toEqual(expected.kinds);
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(60 * 2 * 24 * 2);
  });
});

describe("x-centre trace properties", () => {
  it("performing the traced swaps solves the colours; count, breaks, parity and choices are consistent", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const oracle = new XCentreOracle();
    const scheme = speffzScheme(puzzle);
    const type = pieceType(puzzle, "xcenters");
    const homes = at(puzzle.stickerMap.orbits, type.orbitIndex).defaultPieces;
    const rng = createRng("xcentres-properties");
    const moves = verifiedMoves("4x4x4");
    for (let i = 0; i < 150; i++) {
      const alg = randomMoveSequence(rng, moves, 30).join(" ");
      const buffer = at(type.pieces, rng.int(24)).name;
      const bufferSlot = oracle.slotNamed(buffer);
      for (const sameColour of ["lowestLetter", "avoidBufferColour"] as const) {
        const result = trace(puzzle, { alg }, { pieceType: "xcenters", buffer, scheme, frame: { kind: "asIs" }, policy: { sameColour } });
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        const r = result.value;
        const context = `${alg} | ${buffer} | ${sameColour}`;

        // Replay the swaps on geometry colours: the result must be solved.
        const colours = oracle.coloursAfter(alg);
        const unsolvedAtStart = oracle.slots.filter((s) => s !== bufferSlot && colours[s] !== oracle.home(s)).length;
        const expected = oracle.trace(colours, { buffer, letters: scheme.letters.xcenters ?? {}, sameColour });
        expect(expected.finalColours.every((c, s) => !oracle.slots.includes(s) || c === oracle.home(s)), context).toBe(true);
        expect(expected.breaksForced.every(Boolean), context).toBe(true);

        // Every non-buffer slot that starts wrong is filled once; each break adds one more target.
        expect(r.targetCount, context).toBe(unsolvedAtStart + r.cycleBreaks.length);
        expect(r.parity, context).toBe(r.targetCount % 2 === 1);
        expect(r.solvedPieces.length, context).toBe(24 - unsolvedAtStart - (colours[bufferSlot] === oracle.home(bufferSlot) ? 0 : 1));

        // Each traced step is one of the choices a trainer would accept at that point.
        const pattern = puzzle.kpuzzle.defaultPattern().applyAlg(alg);
        const state = [...(pattern.patternData[type.orbit]?.pieces ?? [])].map((v) => at(homes, v));
        const pb = type.pieceByName(buffer)?.position ?? -1;
        for (const [k, sticker] of r.targetStickers.entries()) {
          const q = type.pieceByName(sticker)?.position ?? -1;
          const choices = interchangeableChoices(type, pb, state, homes);
          expect(choices.positions, `${context} step ${k}`).toContain(q);
          expect(choices.kind === "break", `${context} step ${k}`).toBe(r.targetKinds[k] === "cycleBreak");
          const held = at(state, pb);
          state[pb] = at(state, q);
          state[q] = held;
        }
        expect(interchangeableChoices(type, pb, state, homes).positions, context).toEqual([]);
      }
    }
  });
});
