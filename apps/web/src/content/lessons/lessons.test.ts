import { AlgDatasetSchema, ContentDatasetSchema, createRng, expandNodes, invertNodes, faceletsOf, formatMoves, loadPuzzle, OpSetupsDatasetSchema, parseAlg, pieceType, randomMoveSequence, solveFourBld, solveOpOp, speffzScheme, stickerName, trace, verifiedMoves, type FourBldConfig, type OpParityDataset, type Puzzle, type PuzzleId } from "@bld/cube-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { INTERACTIVE_COMPONENTS, MDX_COMPONENT_NAMES } from "@/components/lesson/mdx-component-names";
import { misplacedPieces, sameLook } from "@/trainers/effects";
import { MISTAKES, mistakeFor, type MistakeKind } from "@/trainers/lesson-items";
import { loadLessons, type LessonSource } from "./source";

/**
 * Lesson content rules, checked on every lesson file (BRIEF §6; your 2026-09-15 answers).
 * Everything cube-related a lesson says through a component is checked against the engine here.
 */
const lessons = loadLessons();
const algsRoot = join(import.meta.dirname, "..", "..", "..", "..", "..", "content", "algs");
const algsDir = join(algsRoot, "3x3");
const opDataset = (name: string) => OpSetupsDatasetSchema.parse(JSON.parse(readFileSync(join(algsDir, name), "utf8")));
const anyDataset = (path: string) => ContentDatasetSchema.parse(JSON.parse(readFileSync(join(algsRoot, path), "utf8")));

interface Usage {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly raw: string;
}

/** Component tags with their string attributes, in order. Lesson files may only use string attributes. */
function usages(body: string): Usage[] {
  const withoutCode = body.replace(/```[\s\S]*?```/g, "");
  return [...withoutCode.matchAll(/<([A-Z][A-Za-z]*)((?:\s+[a-zA-Z]+="[^"]*")*)\s*\/?>/g)].map((m) => ({
    name: m[1] ?? "",
    attributes: Object.fromEntries([...(m[2] ?? "").matchAll(/([a-zA-Z]+)="([^"]*)"/g)].map((a) => [a[1] ?? "", a[2] ?? ""])),
    raw: m[0],
  }));
}

const each = (fn: (lesson: LessonSource) => void) => {
  for (const lesson of lessons) fn(lesson);
};

describe("the 3BLD path", () => {
  it("has lessons 1–23 in order, with unique ids", () => {
    const track = lessons.filter((l) => l.frontmatter.track === "3bld");
    expect(track.map((l) => l.frontmatter.order)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(new Set(lessons.map((l) => l.frontmatter.id)).size).toBe(lessons.length);
  });

  it("prerequisites exist and come earlier on the path, so the graph has no cycles", () => {
    // Path position: the 3BLD track, then the 4BLD track, each in order (loadLessons sorts them that way).
    const position = new Map(lessons.map((l, i) => [l.frontmatter.id, i]));
    lessons.forEach((l, i) => {
      for (const p of l.frontmatter.prerequisites) {
        expect(position.has(p), `${l.frontmatter.id} needs unknown ${p}`).toBe(true);
        expect(position.get(p) ?? Infinity, `${l.frontmatter.id} needs later ${p}`).toBeLessThan(i);
      }
    });
  });

  it("the 4BLD track has lessons 1–10 in order, and starts from the end of 3BLD", () => {
    const track = lessons.filter((l) => l.frontmatter.track === "4bld");
    expect(track.map((l) => l.frontmatter.order)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(track[0]?.frontmatter.prerequisites).toEqual(["first-full-solve"]);
  });

  it("CFOP starts independently with notation then paired F2L, without a beginner-method course", () => {
    const track = lessons.filter((l) => l.frontmatter.track === "cfop");
    expect(track.slice(0, 2).map((l) => l.frontmatter.id)).toEqual(["cfop-notation", "cfop-paired-insertions"]);
    expect(track[0]?.frontmatter.prerequisites).toEqual([]);
    expect(track[1]?.frontmatter.prerequisites).toEqual(["cfop-notation"]);
    expect(track.every((l) => l.frontmatter.prerequisites.every((id) => id.startsWith("cfop-")))).toBe(true);
  });

  it("every lesson is 5–8 minutes and opens with a recap if it builds on anything", () => {
    each((l) => {
      expect(l.frontmatter.estimatedMinutes, l.frontmatter.id).toBeGreaterThanOrEqual(5);
      expect(l.frontmatter.estimatedMinutes, l.frontmatter.id).toBeLessThanOrEqual(8);
      if (l.frontmatter.prerequisites.length > 0) expect(l.frontmatter.recap.length, l.frontmatter.id).toBeGreaterThan(0);
    });
  });

  it("lessons 1–3 are written in all four voices", () => {
    for (const l of lessons.filter((x) => x.frontmatter.track === "3bld" && x.frontmatter.order <= 3)) {
      expect(Object.keys(l.bodies).sort(), l.frontmatter.id).toEqual(["casual", "plain", "roast", "tsundere"]);
    }
  });
});

describe("lesson files", () => {
  it("use only known components, at least one of them interactive", () => {
    each((l) => {
      for (const [voice, body] of Object.entries(l.bodies)) {
        const used = usages(body);
        for (const u of used) expect(MDX_COMPONENT_NAMES as readonly string[], `${l.frontmatter.id} (${voice}) uses <${u.name}>`).toContain(u.name);
        expect(used.some((u) => (INTERACTIVE_COMPONENTS as readonly string[]).includes(u.name)), `${l.frontmatter.id} (${voice}) has nothing interactive`).toBe(true);
      }
    });
  });

  it("contain no JavaScript expressions (props are strings; lesson files are data)", () => {
    each((l) => {
      for (const [voice, body] of Object.entries(l.bodies)) {
        const outsideCode = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
        expect(outsideCode.includes("{"), `${l.frontmatter.id} (${voice}) contains {`).toBe(false);
      }
    });
  });

  it("every voice uses exactly the same components with the same props, in the same order, as the plain voice", () => {
    each((l) => {
      const plain = usages(l.bodies.plain ?? "").map((u) => u.raw.replace(/\s+/g, " "));
      for (const [voice, body] of Object.entries(l.bodies)) {
        if (voice === "plain") continue;
        expect(usages(body).map((u) => u.raw.replace(/\s+/g, " ")), `${l.frontmatter.id}: ${voice} differs from plain`).toEqual(plain);
      }
    });
  });

  it("each checkpoint in frontmatter appears exactly once in the lesson, and no other checkpoint does", () => {
    each((l) => {
      const ids = usages(l.bodies.plain ?? "")
        .filter((u) => u.name === "Checkpoint")
        .map((u) => u.attributes.id);
      expect(ids.sort(), l.frontmatter.id).toEqual(l.frontmatter.checkpoints.map((c) => c.id).sort());
    });
  });

  it("uses British spelling", () => {
    const american = /\b(color\w*|memoriz\w*|recogniz\w*|organiz\w*|analyz\w*|favorit\w*|centers?|centered|gray)\b/i;
    each((l) => {
      for (const [voice, body] of Object.entries(l.bodies)) {
        const text = `${body} ${voice === "plain" ? [l.frontmatter.title, ...l.frontmatter.objectives, ...l.frontmatter.recap].join(" ") : ""}`;
        expect(american.exec(text)?.[0], `${l.frontmatter.id} (${voice})`).toBeUndefined();
      }
    });
  });
});

describe("what lessons show on the cube is checked by the engine", () => {
  let puzzle: Awaited<ReturnType<typeof loadPuzzle>>;
  let puzzle4: Awaited<ReturnType<typeof loadPuzzle>>;
  beforeAll(async () => {
    puzzle = await loadPuzzle("3x3x3");
    puzzle4 = await loadPuzzle("4x4x4");
  });

  it("CFOP paired-insertion demos show the stated connected colours and restore the cross and all slots", () => {
    const lesson = lessons.find((l) => l.frontmatter.id === "cfop-paired-insertions");
    if (lesson === undefined) throw new Error("Missing CFOP paired-insertion lesson");
    const demos = usages(lesson.bodies.plain ?? "").filter((u) => u.name === "Cube");
    expect(demos).toHaveLength(2);
    const stated = [
      { corner: "UFL", edge: "UF", faces: { UFL: "F", FUL: "R", LUF: "D", UF: "F", FU: "R" } },
      { corner: "UBR", edge: "UR", faces: { UBR: "R", BUR: "D", RUB: "F", UR: "R", RU: "F" } },
    ] as const;
    const corners = pieceType(puzzle, "corners");
    const edges = pieceType(puzzle, "edges");
    const targetCorner = corners.pieceByName("DFR");
    const targetEdge = edges.pieceByName("FR");
    if (targetCorner === undefined || targetEdge === undefined) throw new Error("Missing F2L slot");
    for (const [index, demo] of demos.entries()) {
      const expected = stated[index];
      if (expected === undefined) throw new Error("Unexpected F2L demo");
      expect((demo.attributes.highlight ?? "").split(" ").sort()).toEqual([...Object.keys(expected.faces), "U", "D", "F", "B", "R", "L"].sort());
      const start = puzzle.kpuzzle.defaultPattern().applyAlg(demo.attributes.setup ?? "");
      const facelets = faceletsOf(puzzle, start);
      for (const [name, face] of Object.entries(expected.faces)) {
        const sticker = corners.stickerByName(name) ?? edges.stickerByName(name);
        if (sticker === undefined) throw new Error(`Unknown sticker ${name}`);
        const home = facelets[sticker.index];
        if (home === undefined) throw new Error(`No home colour at ${name}`);
        expect(puzzle.geometry.sticker(home).face, name).toBe(face);
        expect((demo.attributes.highlight ?? "").split(" "), name).toContain(name);
      }
      const cornerSlot = corners.pieceByName(expected.corner);
      const edgeSlot = edges.pieceByName(expected.edge);
      if (cornerSlot === undefined || edgeSlot === undefined) throw new Error("Missing pair position");
      expect(start.patternData[corners.orbit]?.pieces[cornerSlot.position]).toBe(targetCorner.position);
      expect(start.patternData[edges.orbit]?.pieces[edgeSlot.position]).toBe(targetEdge.position);
      // Independently pin the preserved geometry, not just inverse(alg) + alg.
      for (const type of [corners, edges]) {
        const protectedPieces = type.pieces.filter((piece) => type.id === "corners" ? piece.name.includes("D") && piece.name !== "DFR" : piece.name.includes("D") || !/[UD]/.test(piece.name) && piece.name !== "FR");
        for (const piece of protectedPieces) {
          expect(start.patternData[type.orbit]?.pieces[piece.position], piece.name).toBe(piece.position);
          expect(start.patternData[type.orbit]?.orientation[piece.position], piece.name).toBe(0);
        }
      }
      expect(start.applyAlg(demo.attributes.alg ?? "").isIdentical(puzzle.kpuzzle.defaultPattern())).toBe(true);
      expect(looksSolved(puzzle, `${demo.attributes.setup ?? ""} ${demo.attributes.alg ?? ""}`)).toBe(true);
    }
  });

  const allUsages = () => lessons.flatMap((l) => usages(l.bodies.plain ?? "").map((u) => ({ lesson: l.frontmatter.id, ...u })));
  /** The puzzle a component shows: 4x4 for the Four* components and a Cube with puzzle="4x4x4". */
  const puzzleOf = (u: Usage): PuzzleId => (u.name.startsWith("Four") || u.attributes.puzzle === "4x4x4" ? "4x4x4" : "3x3x3");

  it("every alg, setup, scramble and move parses with verified moves only", () => {
    const verifiedFamilies = new Set(verifiedMoves("3x3x3").map((m) => m.replace(/['2]$/, "")));
    for (const u of allUsages()) {
      for (const key of ["setup", "alg", "scramble"] as const) {
        const value = u.attributes[key];
        if (value === undefined) continue;
        expect(parseAlg(puzzleOf(u), value).ok, `${u.lesson}: ${u.name} ${key}="${value}"`).toBe(true);
      }
      if (u.name === "MoveExplorer") {
        for (const move of (u.attributes.moves ?? "").split(/\s+/).filter(Boolean)) {
          expect(parseAlg("3x3x3", move).ok, `${u.lesson}: move ${move}`).toBe(true);
          expect(verifiedFamilies.has(move.replace(/['2]$/, "")), `${u.lesson}: ${move} is not a verified family`).toBe(true);
        }
      }
    }
  });

  it("every sticker named in a lesson exists, and every OP target and forbidden move is in the verified dataset", () => {
    const names = new Set([...pieceType(puzzle, "corners").stickers, ...pieceType(puzzle, "edges").stickers].map((s) => s.name));
    const names4 = new Set((["corners", "wings", "xcenters"] as const).flatMap((t) => pieceType(puzzle4, t).stickers.map((s) => s.name)));
    const corners = opDataset("op-corners.UBL.json");
    const edges = opDataset("op-edges.UR.json");
    for (const u of allUsages()) {
      for (const sticker of [...(u.attributes.highlight ?? "").split(/\s+/).filter(Boolean), ...(u.attributes.sticker === undefined ? [] : [u.attributes.sticker])]) {
        const known = puzzleOf(u) === "4x4x4" ? names4.has(sticker) : names.has(sticker) || /^[UDFBLR]$/.test(sticker);
        expect(known, `${u.lesson}: sticker ${sticker}`).toBe(true);
      }
      if (u.name === "OpShot") {
        const dataset = u.attributes.pieces === "edges" ? edges : corners;
        expect(dataset.records.some((r) => r.target === u.attributes.target), `${u.lesson}: OpShot ${u.attributes.target}`).toBe(true);
      }
      if (u.name === "IllegalSetup") {
        const dataset = u.attributes.pieces === "edges" ? edges : corners;
        expect(dataset.forbidden.some((f) => f.family === u.attributes.family), `${u.lesson}: IllegalSetup ${u.attributes.family}`).toBe(true);
      }
    }
  });

  it("every TraceWalk scramble has the features its lesson says it has (with the Gate B OP buffers)", () => {
    const scheme = speffzScheme(puzzle);
    for (const u of allUsages().filter((x) => x.name === "TraceWalk")) {
      const pieces = u.attributes.pieces === "edges" ? "edges" : "corners";
      const traced = trace(puzzle, { alg: u.attributes.scramble ?? "" }, { pieceType: pieces, buffer: pieces === "corners" ? "UBL" : "UR", scheme, policy: { orientedInPlace: "asTargets" } });
      if (!traced.ok) throw new Error(`${u.lesson}: ${JSON.stringify(traced.error)}`);
      const kinds = new Set(traced.value.cycles.map((c) => c.kind));
      const shows = u.attributes.shows ?? "any";
      if (shows === "no-breaks") expect(kinds.has("break") || kinds.has("orientation"), `${u.lesson}: ${u.attributes.scramble}`).toBe(false);
      if (shows === "break") expect(kinds.has("break"), `${u.lesson}: ${u.attributes.scramble}`).toBe(true);
      if (shows === "twist") expect(kinds.has("orientation"), `${u.lesson}: ${u.attributes.scramble}`).toBe(true);
      expect(traced.value.targetCount, `${u.lesson}: ${u.attributes.scramble} is too long for a lesson`).toBeLessThanOrEqual(10);
    }
  });

  it("every 4BLD component names a real piece type, method, verified target or solvable scramble", () => {
    const config = fourBldConfig(puzzle4);
    const pieceTypes = ["xcenters", "wings", "corners"];
    for (const u of allUsages()) {
      const where = `${u.lesson}: ${u.raw}`;
      if (u.name === "FourShot") {
        const method = u.attributes.method ?? "";
        const records = method === "r2" ? config.wings.records : method === "u2" ? config.centres.records : method === "op" ? config.corners.records : undefined;
        expect(records?.some((r) => r.target === u.attributes.target), where).toBe(true);
      }
      if (u.name === "FourTrace" || u.name === "FourParity" || u.name === "FourExplorer") expect(pieceTypes, where).toContain(u.attributes.pieces ?? "wings");
      if (u.name === "FourTrace") {
        const pieces = (u.attributes.pieces ?? "wings") as "xcenters" | "wings" | "corners";
        const solved = solveFourBld(puzzle4, { alg: u.attributes.scramble ?? "" }, config);
        if (!solved.ok) throw new Error(`${where}: ${JSON.stringify(solved.error)}`);
        const count = solved.value.traces[pieces].targetStickers.length;
        expect(count, `${where} has nothing to trace`).toBeGreaterThan(0);
        expect(count, `${where} is too long for a lesson`).toBeLessThanOrEqual(10);
      }
      if (u.name === "FourSolve") {
        const scramble = u.attributes.scramble ?? "";
        const solved = solveFourBld(puzzle4, { alg: scramble }, config);
        if (!solved.ok) throw new Error(`${where}: ${JSON.stringify(solved.error)}`);
        expect(looksSolved(puzzle4, `${scramble} ${formatMoves(solved.value.moves)}`), where).toBe(true);
        expect(pieceTypes, where).toContain(u.attributes.upto ?? "corners");
      }
      if (u.name === "Checkpoint" && (u.attributes.kind ?? "").startsWith("four-")) {
        expect(["four-letters", "four-trace", "four-parity", "four-setup"], where).toContain(u.attributes.kind);
        if (u.attributes.kind === "four-setup") expect(["r2", "u2"], where).toContain(u.attributes.method);
        else for (const p of (u.attributes.pieces ?? "").split(/\s+/).filter(Boolean)) expect(u.attributes.kind === "four-parity" ? ["wings", "corners"] : pieceTypes, where).toContain(p);
      }
    }
  });
});

function fourBldConfig(puzzle4: Puzzle): FourBldConfig {
  return {
    scheme: speffzScheme(puzzle4),
    centres: anyDataset("4x4/u2-xcenters.Ubr.json"),
    centreParity: anyDataset("4x4/u2-parity.Ubr.json"),
    wings: anyDataset("4x4/r2-wings.FDr.json"),
    wingParity: anyDataset("4x4/r2-parity.FDr.json"),
    corners: anyDataset("3x3/op-corners.UBL.json"),
    cornerParity: anyDataset("4x4/op-corner-parity.UBL.json"),
  } as FourBldConfig;
}

function looksSolved(p: Puzzle, alg: string): boolean {
  return Array.from(faceletsOf(p, p.kpuzzle.defaultPattern().applyAlg(alg))).every((home, slot) => p.geometry.sticker(home).face === p.geometry.sticker(slot).face);
}

/**
 * Facts the 4BLD lessons state in prose, each checked here so a lesson can't drift from the engine.
 * Lesson numbers name where each claim is made.
 */
describe("what the 4BLD lessons say is true", () => {
  let p4: Puzzle;
  beforeAll(async () => {
    p4 = await loadPuzzle("4x4x4");
  });

  /** Pieces of a type that a move sequence takes out of their slots, from solved. */
  const moved = (alg: string, type: "corners" | "wings" | "xcenters") => {
    const facelets = faceletsOf(p4, p4.kpuzzle.defaultPattern().applyAlg(alg));
    const t = pieceType(p4, type);
    return t.pieces.filter((piece) => piece.stickers.some((st) => facelets[st.index] !== st.index && !(type === "xcenters" && p4.geometry.sticker(facelets[st.index] ?? -1).face === p4.geometry.sticker(st.index).face))).length;
  };

  it("lesson 1: 8 corners, 24 wings, 24 x-centres; wings and x-centres have no orientation; 2R moves four wings, eight x-centres and no corner", () => {
    expect(["corners", "wings", "xcenters"].map((t) => pieceType(p4, t as "wings").pieces.length)).toEqual([8, 24, 24]);
    expect(pieceType(p4, "wings").orientationOrder).toBe(1);
    expect(pieceType(p4, "xcenters").orientationOrder).toBe(1);
    // x-centres moved between faces show a different colour; 2R moves them across U, F, D and B.
    const facelets = faceletsOf(p4, p4.kpuzzle.defaultPattern().applyAlg("2R"));
    const centreSlotsChanged = pieceType(p4, "xcenters").stickers.filter((st) => p4.geometry.sticker(facelets[st.index] ?? -1).face !== p4.geometry.sticker(st.index).face).length;
    expect([moved("2R", "wings"), centreSlotsChanged, moved("2R", "corners")]).toEqual([4, 8, 0]);
  });

  it("lesson 3: wing letters follow the edges, x-centre letters follow the corners, and the buffers' letters", () => {
    const four = speffzScheme(p4);
    for (const [wing, letter] of Object.entries(four.letters.wings ?? {})) {
      // UBl sits on the UB edge: it takes the UB edge's letter.
      expect(letter, wing).toBe(threeScheme.letters.edges?.[wing.slice(0, 2)]);
    }
    for (const [centre, letter] of Object.entries(four.letters.xcenters ?? {})) expect(letter, centre).toBe(threeScheme.letters.corners?.[centre.toUpperCase()]);
    expect([four.letters.wings?.UBl, four.letters.xcenters?.Ubl, four.letters.xcenters?.Ubr, four.letters.wings?.FDr, four.letters.corners?.UBL]).toEqual(["A", "A", "B", "K", "A"]);
  });

  it("lessons 5 and 6: U2 setups never turn U; r2 setups use outer faces and 2L, never 2R", () => {
    const { centres, wings } = fourBldConfig(p4);
    expect(centres.setupFamilies.some((f) => f === "U")).toBe(false);
    expect([...wings.setupFamilies].sort()).toEqual(["2L", "B", "D", "F", "L", "R", "U"]);
    const setups = wings.records.flatMap((r) => (r.kind === "target" && r.setup !== "" ? [r.setup.split(" ").length] : []));
    // "Many wings are three moves from BUr", and some setups start with 2L.
    expect(setups.filter((n) => n === 3).length).toBeGreaterThan(setups.length / 2);
    expect(wings.records.some((r) => r.kind === "target" && r.setup.startsWith("2L"))).toBe(true);
    expect(wings.swap.sideEffectPieces.filter((piece) => /^[UDRLFB][a-z]{2}$/.test(piece))).toHaveLength(8);
  });

  it("lesson 8: an outer quarter turn makes corners odd and wings even; an inner one the reverse", () => {
    const config = fourBldConfig(p4);
    const counts = (alg: string) => {
      const solved = solveFourBld(p4, { alg }, config);
      if (!solved.ok) throw new Error(JSON.stringify(solved.error));
      return [solved.value.traces.corners.targetStickers.length % 2, solved.value.traces.wings.targetStickers.length % 2];
    };
    expect(counts("R")).toEqual([1, 0]);
    expect(counts("2R")).toEqual([0, 1]);
  });

  it("lesson 9: about 19 x-centre, 24 wing and 8 corner targets, about 530 moves; a 3x3 memo is about 20 letters", async () => {
    const config = fourBldConfig(p4);
    const moves = verifiedMoves("4x4x4").filter((m) => /^(?:[UDRLFB]|[UDRLFB]w)['2]?$/.test(m));
    const totals = { xcenters: 0, wings: 0, corners: 0, moves: 0 };
    const n = 200;
    for (let i = 0; i < n; i++) {
      const solved = solveFourBld(p4, { alg: randomMoveSequence(createRng(`memo load#${String(i)}`), moves, 60).join(" ") }, config);
      if (!solved.ok) throw new Error(JSON.stringify(solved.error));
      for (const t of ["xcenters", "wings", "corners"] as const) totals[t] += solved.value.traces[t].targetStickers.length;
      totals.moves += solved.value.moves.length;
    }
    expect(Math.abs(totals.xcenters / n - 19)).toBeLessThan(1);
    expect(Math.abs(totals.wings / n - 24)).toBeLessThan(1);
    expect(Math.abs(totals.corners / n - 8)).toBeLessThan(1);
    expect(Math.abs(totals.moves / n - 530)).toBeLessThan(30);

    const p3 = await loadPuzzle("3x3x3");
    const op = { corners: opDataset("op-corners.UBL.json"), edges: opDataset("op-edges.UR.json"), parity: anyDataset("3x3/op-parity.UBL-UR.json") as OpParityDataset };
    const faces = verifiedMoves("3x3x3").filter((m) => /^[UDRLFB]['2]?$/.test(m));
    let letters = 0;
    for (let i = 0; i < n; i++) {
      const solved = solveOpOp(p3, { alg: randomMoveSequence(createRng(`3x3 memo#${String(i)}`), faces, 25).join(" ") }, { scheme: speffzScheme(p3), ...op });
      if (!solved.ok) throw new Error(JSON.stringify(solved.error));
      letters += solved.value.traces.corners.targetCount + solved.value.traces.edges.targetCount;
    }
    expect(Math.abs(letters / n - 20)).toBeLessThan(2.5);
  });

  it("lessons 4 and 10: the demo scrambles have the counts the lessons describe", () => {
    const config = fourBldConfig(p4);
    const counts = (alg: string) => {
      const solved = solveFourBld(p4, { alg }, config);
      if (!solved.ok) throw new Error(JSON.stringify(solved.error));
      return (["xcenters", "wings", "corners"] as const).map((t) => solved.value.traces[t].targetStickers.length);
    };
    // Lesson 4: five centre targets in the solver's trace, an odd count, and no corners (only inner slices).
    expect(counts("2B2 2R2 2B2")[0]).toBe(5);
    expect(counts("2B2 2R2 2B2")[2]).toBe(0);
    // Lesson 10: an odd count in all three.
    expect(counts("2U D 2U 2B' 2U2").map((c) => c % 2)).toEqual([1, 1, 1]);
    // Lesson 2: one Rw gives five corner targets and moves every piece type.
    const [centres, wingCount, corners] = counts("Rw");
    expect(corners).toBe(5);
    expect(centres).toBeGreaterThan(0);
    expect(wingCount).toBeGreaterThan(0);
    // Lesson 8: one 2R gives three wing targets.
    expect(counts("2R")[1]).toBe(3);
  });
});

let threeScheme: ReturnType<typeof speffzScheme>;
beforeAll(async () => {
  threeScheme = speffzScheme(await loadPuzzle("3x3x3"));
});

/**
 * Lessons 16–23: every M2, commutator and mistake demo is checked against the engine, and so is what the
 * prose says about them. Lesson numbers name where each claim is made.
 */
describe("lessons 16–23: components and claims", () => {
  let p3: Puzzle;
  beforeAll(async () => {
    p3 = await loadPuzzle("3x3x3");
  });
  const m2 = () => anyDataset("3x3/m2-edges.DF.json");
  const style = (pieces: string) => AlgDatasetSchema.parse(JSON.parse(readFileSync(join(algsDir, pieces === "edges" ? "3style-edges.UF.json" : "3style-corners.UFR.json"), "utf8")));
  const plainUsages = () => lessons.flatMap((l) => usages(l.bodies.plain ?? "").map((u) => ({ lesson: l.frontmatter.id, ...u })));
  const moves = (text: string) => {
    const parsed = parseAlg("3x3x3", text);
    if (!parsed.ok) throw new Error(text);
    return formatMoves(expandNodes(parsed.value.nodes));
  };
  const cycled = (alg: string) => {
    const moved = misplacedPieces(p3, alg);
    return [...moved.corners, ...moved.edges];
  };

  it("every M2, commutator, parity and mistake component names something real", () => {
    const m2Edges = m2();
    if (m2Edges.kind !== "setups" || m2Edges.method !== "m2") throw new Error("m2 dataset");
    const op = { corners: opDataset("op-corners.UBL.json"), edges: opDataset("op-edges.UR.json"), parity: anyDataset("3x3/op-parity.UBL-UR.json") as OpParityDataset };
    for (const u of plainUsages()) {
      const where = `${u.lesson}: ${u.raw}`;
      if (u.name === "M2Shot") expect(m2Edges.records.some((r) => r.target === u.attributes.target), where).toBe(true);
      if (u.name === "M2Tempting") expect(m2Edges.tempting.some((t) => t.target === u.attributes.target), where).toBe(true);
      if (u.name === "ParityAlg") expect(["op", "m2"], where).toContain(u.attributes.method ?? "op");
      if (u.name === "CommCase") expect(style(u.attributes.pieces ?? "").records.some((r) => r.id === u.attributes.case), where).toBe(true);
      if (u.name === "CommParts") {
        // One commutator, or a conjugate of one, that cycles exactly three pieces of one type.
        const parsed = parseAlg("3x3x3", u.attributes.comm ?? "");
        const [top] = parsed.ok ? parsed.value.nodes : [];
        const inner = top?.type === "conjugate" ? top.body[0] : top;
        expect(parsed.ok && parsed.value.nodes.length === 1 && inner?.type === "commutator", where).toBe(true);
        const moved = misplacedPieces(p3, moves(u.attributes.comm ?? ""));
        expect([moved.corners.length, moved.edges.length].sort(), where).toEqual([0, 3]);
      }
      if (u.name === "SolveMistake") {
        expect(MISTAKES, where).toContain(u.attributes.mistake);
        expect(mistakeFor(p3, speffzScheme(p3), op, u.attributes.scramble ?? "", u.attributes.mistake as MistakeKind), where).toBeDefined();
      }
      if (u.name === "Checkpoint" && ["m2-setup", "m2-special", "comm-expand", "comm-case", "comm-build", "mistake"].includes(u.attributes.kind ?? "")) {
        for (const piece of (u.attributes.pieces ?? "").split(/\s+/).filter(Boolean)) expect(["corners", "edges"], where).toContain(piece);
      }
    }
  });

  it("lesson 16: M2 exchanges DF with UB and swaps UF with DB; legal setups leave DF, UF and DB home and put the target on UB", () => {
    const m2Edges = m2();
    if (m2Edges.kind !== "setups" || m2Edges.method !== "m2") throw new Error("m2 dataset");
    expect([m2Edges.buffer, m2Edges.swap.swapSticker, m2Edges.swap.alg]).toEqual(["DF", "UB", "M2"]);
    expect([...m2Edges.swap.sideEffectPieces].sort()).toEqual(["B", "D", "DB", "F", "U", "UF"]);
    expect([...m2Edges.setupFamilies].sort()).toEqual(["B", "D", "F", "L", "R", "U"]);
    const facelets = (alg: string) => faceletsOf(p3, p3.kpuzzle.defaultPattern().applyAlg(alg));
    const slot = (name: string) => p3.geometry.stickers.findIndex((st) => stickerName(p3.geometry, st.index) === name);
    const setups = m2Edges.records.flatMap((r) => (r.kind === "target" ? [r] : []));
    for (const record of setups) {
      const after = facelets(record.setup);
      // DF, UF and DB show their own stickers, and UB shows the target's.
      for (const home of ["DF", "UF", "DB"]) expect(after[slot(home)], `${record.target}: ${home}`).toBe(slot(home));
      expect(after[slot("UB")], record.target).toBe(slot(record.target));
    }
    const lengths = setups.filter((r) => r.setup !== "").map((r) => r.setup.split(" ").length);
    expect(lengths.filter((n) => n === 3).length / lengths.length).toBeGreaterThan(0.9);
    // Old Pochmann's edge swap, for comparison: 14 moves.
    expect(opDataset("op-edges.UR.json").swap.alg.split(" ")).toHaveLength(14);
  });

  it("lesson 17: the four special targets and their odd/even partners", () => {
    const m2Edges = m2();
    if (m2Edges.kind !== "setups" || m2Edges.method !== "m2") throw new Error("m2 dataset");
    expect([...m2Edges.specialTargets].sort()).toEqual(["BD", "DB", "FU", "UF"]);
    expect(m2Edges.oddStepRule.map((r) => `${r.target}>${r.shootAs}`).sort()).toEqual(["BD>FU", "DB>UF", "FU>BD", "UF>DB"]);
  });

  it("lesson 18: each mistake's signature, as the lesson describes it", () => {
    const op = { corners: opDataset("op-corners.UBL.json"), edges: opDataset("op-edges.UR.json"), parity: anyDataset("3x3/op-parity.UBL-UR.json") as OpParityDataset };
    const scramble = "R U F D' L2 B";
    const shown = (kind: MistakeKind) => misplacedPieces(p3, `${scramble} ${mistakeFor(p3, speffzScheme(p3), op, scramble, kind) ?? ""}`);
    const parity = shown("parity");
    expect([parity.corners.length, parity.edges.length]).toEqual([2, 2]);
    const letters = shown("letters");
    expect([letters.corners.length, letters.edges.length].sort()).toEqual([0, 3]);
    const undo = shown("undo");
    expect(undo.corners.length).toBeGreaterThan(0);
    expect(undo.edges.length).toBeGreaterThan(0);
    expect(undo.corners.length + undo.edges.length).toBeGreaterThanOrEqual(5);
  });

  it("lesson 20: [R, U] is R U R' U'; swapping a comm's parts reverses it; each insertion touches one slot of its interchange layer", () => {
    expect(moves("[R, U]")).toBe("R U R' U'");
    for (const [interchange, insertion] of [["B", "L F' L'"], ["M", "B U B'"]] as const) {
      const comm = `[${interchange}, ${insertion}]`;
      const swapped = `[${insertion}, ${interchange}]`;
      expect(sameLook(p3, `${moves(comm)} ${moves(swapped)}`, ""), comm).toBe(true);
      expect(cycled(moves(swapped)).sort(), comm).toEqual(cycled(moves(comm)).sort());
      // The interchange's layer holds two of the three pieces; the insertion touches one slot of that layer.
      const layer = cycled(interchange);
      expect(cycled(moves(comm)).filter((piece) => layer.includes(piece)), comm).toHaveLength(2);
      expect(cycled(moves(insertion)).filter((piece) => layer.includes(piece)), comm).toHaveLength(1);
    }
    // Undoing a sequence: reverse order, each move inverted.
    const parsed = parseAlg("3x3x3", "R U' F2");
    if (!parsed.ok) throw new Error("parse");
    expect(formatMoves(expandNodes(invertNodes(parsed.value.nodes)))).toBe("F2 U R'");
  });

  it("lessons 21 and 22: 378 corner cases from UFR and 440 edge cases from UF; the example comms are the shapes the lessons say", () => {
    const corners = style("corners");
    const edges = style("edges");
    expect([corners.buffer, corners.records.filter((r) => r.kind === "cycle").length]).toEqual(["UFR", 378]);
    expect([edges.buffer, edges.records.filter((r) => r.kind === "cycle").length]).toEqual(["UF", 440]);
    const main = (dataset: typeof corners, id: string) => dataset.records.find((r) => r.id === id)?.algs[0]?.alg ?? "";
    expect(main(corners, "UBR-UBL")).toMatch(/^\[[^,\]]+: /);
    expect(main(corners, "UBR-LUB")).toMatch(/^\[[^:]+\]$/);
    expect(main(edges, "UR-UB")).toMatch(/^\[[^,\]]+: /);
    // UR-BU's comm has a single slice turn as one of its parts.
    expect(main(edges, "UR-BU")).toMatch(/^\[[^:]+, [MSE]'?2?\]$|^\[[MSE]'?2?, [^:]+\]$/);
  });
});
