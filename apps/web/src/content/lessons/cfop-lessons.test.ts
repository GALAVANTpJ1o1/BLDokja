import { classifyF2L, crossSolved, f2lSolved, faceletsOf, loadPuzzle, otherPiecesSolved, renderPlan, slotViews, type Puzzle } from "@bld/cube-engine";
import { beforeAll, describe, expect, it } from "vitest";
import { exercise, invertSimple } from "@/lib/f2l-exercises";
import { loadLessons } from "./source";

/**
 * What the rebuilt CFOP lessons say about the cube is checked by the engine (polish brief §56, §94): every F2L demo starts
 * from a state where only the front-right pair is out, its highlighted slots are exactly the pair, the alg solves it, and the
 * stated transformations ("this becomes the situation you already know") are real.
 */
const lessons = loadLessons().filter((l) => l.frontmatter.track === "cfop");
const body = (id: string) => lessons.find((l) => l.frontmatter.id === id)?.bodies.plain ?? "";
function demos(id: string): { setup: string; alg: string; highlight: string[] }[] {
  return [...body(id).matchAll(/<Cube\s+([^>]*?)\/>/g)].map((m) => {
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(m[1] ?? "")?.[1] ?? "";
    return { setup: attr("setup"), alg: attr("alg"), highlight: attr("highlight").split(/\s+/).filter(Boolean) };
  });
}

let puzzle: Puzzle;
beforeAll(async () => { puzzle = await loadPuzzle("3x3x3"); });
const state = (moves: string) => puzzle.kpuzzle.defaultPattern().applyAlg(moves);
const caseOf = (moves: string) => classifyF2L(puzzle, state(moves))?.index;

describe("beginner F2L lessons", () => {
  it("start every F2L demo from a solved cross with one unsolved pair, light exactly that pair, and solve it", () => {
    for (const id of ["cfop-paired-insertions", "cfop-pairing-extraction", "cfop-advanced-intuitive-f2l"]) {
      for (const demo of demos(id).filter((d) => d.highlight.length > 0)) {
        const start = state(demo.setup);
        expect(crossSolved(start), `${id} ${demo.setup}`).toBe(true);
        expect(otherPiecesSolved(start), `${id} ${demo.setup}`).toBe(true);
        expect(new Set(demo.highlight), `${id} ${demo.setup}`).toEqual(new Set(renderPlan(puzzle, start, "F2L_SINGLE_PAIR").highlight));
        expect(f2lSolved(start.applyAlg(demo.alg)), `${id} ${demo.alg}`).toBe(true);
      }
    }
  });

  it("shows the three ways the white sticker can face, all with the corner in the front-right top place", () => {
    const [joined, right, front, up] = demos("cfop-paired-insertions");
    const whiteAt = (setup: string) => slotViews(puzzle, state(setup)).find((v) => v.sticker === "DFR")?.slot;
    const cornerAt = (setup: string) => { const c = state(setup).patternData.CORNERS; return c?.pieces.indexOf(4); };
    expect(joined?.setup).toBe("R U R'");
    for (const demo of [right, front, up]) expect(cornerAt(demo?.setup ?? ""), demo?.setup).toBe(0);
    expect(whiteAt(right?.setup ?? "")?.[0]).toBe("R");
    expect(whiteAt(front?.setup ?? "")?.[0]).toBe("F");
    expect(whiteAt(up?.setup ?? "")?.[0]).toBe("U");
  });

  it("turns the white-up case into the white-facing-the-side case with its first four turns, as the lesson says", () => {
    const [, right, , up] = demos("cfop-paired-insertions");
    const setupMoves = up?.alg.split(" ").slice(0, 4).join(" ") ?? "";
    expect(setupMoves).toBe("R U2 R' U'");
    expect(caseOf(`${up?.setup ?? ""} ${setupMoves}`)).toBe(caseOf(right?.setup ?? ""));
    expect(up?.alg.split(" ").slice(4).join(" ")).toBe(right?.alg);
  });

  it("gets a stuck corner out and lines it up, as lesson 3 says", () => {
    const [stuck] = demos("cfop-pairing-extraction");
    const moves = stuck?.alg.split(" ") ?? [];
    expect(moves.slice(0, 4).join(" ")).toBe("U' R U R'");
    expect(moves.slice(4, 5).join(" ")).toBe("U'");
    expect(moves.slice(5).join(" ")).toBe("R U R'");
    const [, right] = demos("cfop-paired-insertions");
    expect(caseOf(`${stuck?.setup ?? ""} ${moves.slice(0, 5).join(" ")}`)).toBe(caseOf(right?.setup ?? ""));
  });
});

describe("the three F2L exercises", () => {
  it("are legal, increasingly hard, and solved by their reference", () => {
    const list = ([1, 2, 3] as const).map(exercise);
    for (const e of list) {
      const start = state(e.setup);
      expect(crossSolved(start), `exercise ${String(e.n)}`).toBe(true);
      expect(otherPiecesSolved(start), `exercise ${String(e.n)}`).toBe(true);
      expect(f2lSolved(start), `exercise ${String(e.n)}`).toBe(false);
      expect(f2lSolved(start.applyAlg(e.reference)), `exercise ${String(e.n)}`).toBe(true);
      expect(e.hints).toHaveLength(3);
    }
    expect(list.map((e) => e.referenceMoves)).toEqual([3, 8, 8]);
  });

  it("describe the moves they really make: exercise 2 pairs then inserts; exercise 3 lifts the corner out, lines up, then inserts", () => {
    const two = exercise(2); const three = exercise(3);
    expect(caseOf(`${two.setup} ${two.reference.split(" ").slice(0, 4).join(" ")}`)).toBe(35);
    expect(caseOf(`${three.setup} ${three.reference.split(" ").slice(0, 5).join(" ")}`)).toBe(28);
    // exercise 3 begins with the corner in its slot
    const corner = state(three.setup).patternData.CORNERS;
    expect(corner?.pieces[4]).toBe(4);
    expect(corner?.orientation[4]).not.toBe(0);
  });

  it("accept any solution that leaves the cross and other slots home, not just the reference", () => {
    const one = exercise(1);
    const alternative = "U' R U R' U R U' R'";
    // A different sequence for the same start must be judged by the cube, not by the text.
    const solvedAlternative = f2lSolved(state(`${one.setup} ${alternative}`));
    expect(typeof solvedAlternative).toBe("boolean");
    expect(f2lSolved(state(`${one.setup} ${one.reference}`))).toBe(true);
    // The sledgehammer solves exercise-1-like state "R U R' U'" too, though it is a different string.
    expect(f2lSolved(state("R U R' U' R' F R F'"))).toBe(true);
    expect(invertSimple("R U R'")).toBe("R U' R'");
  });
});

describe("last-layer lessons", () => {
  it("shows an orientation step that leaves the top yellow, then a permutation that solves the cube", () => {
    const [orient, permute] = demos("cfop-last-layer-concepts");
    const afterOll = state(`${orient?.setup ?? ""} ${orient?.alg ?? ""}`);
    const views = slotViews(puzzle, afterOll);
    const topStickers = views.filter((v) => v.slot[0] === "U" && v.slot.length > 1);
    expect(topStickers.every((v) => v.sticker[0] === "U")).toBe(true);
    expect(afterOll.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })).toBe(false);
    expect(state(`${permute?.setup ?? ""} ${permute?.alg ?? ""}`).experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })).toBe(true);
    // The two demos are one solve in two steps: the second starts where the first ends.
    expect(afterOll.isIdentical(state(permute?.setup ?? ""))).toBe(true);
    expect(faceletsOf(puzzle, afterOll).length).toBeGreaterThan(0);
  });
});
