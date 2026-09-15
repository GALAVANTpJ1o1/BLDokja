import { loadPuzzle, OpSetupsDatasetSchema, parseAlg, pieceType, speffzScheme, trace, verifiedMoves } from "@bld/cube-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { INTERACTIVE_COMPONENTS, MDX_COMPONENT_NAMES } from "@/components/lesson/mdx-component-names";
import { loadLessons, type LessonSource } from "./source";

/**
 * Lesson content rules, checked on every lesson file (BRIEF §6; your 2026-09-15 answers).
 * Everything cube-related a lesson says through a component is checked against the engine here.
 */
const lessons = loadLessons();
const algsDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "content", "algs", "3x3");
const opDataset = (name: string) => OpSetupsDatasetSchema.parse(JSON.parse(readFileSync(join(algsDir, name), "utf8")));

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
  it("has lessons 1–15 in order, with unique ids", () => {
    const track = lessons.filter((l) => l.frontmatter.track === "3bld");
    expect(track.map((l) => l.frontmatter.order)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(new Set(lessons.map((l) => l.frontmatter.id)).size).toBe(lessons.length);
  });

  it("prerequisites exist and come earlier on the path, so the graph has no cycles", () => {
    const order = new Map(lessons.map((l) => [l.frontmatter.id, l.frontmatter.order]));
    each((l) => {
      for (const p of l.frontmatter.prerequisites) {
        expect(order.has(p), `${l.frontmatter.id} needs unknown ${p}`).toBe(true);
        expect(order.get(p) ?? Infinity, `${l.frontmatter.id} needs later ${p}`).toBeLessThan(l.frontmatter.order);
      }
    });
  });

  it("every lesson is 5–8 minutes and opens with a recap if it builds on anything", () => {
    each((l) => {
      expect(l.frontmatter.estimatedMinutes, l.frontmatter.id).toBeGreaterThanOrEqual(5);
      expect(l.frontmatter.estimatedMinutes, l.frontmatter.id).toBeLessThanOrEqual(8);
      if (l.frontmatter.prerequisites.length > 0) expect(l.frontmatter.recap.length, l.frontmatter.id).toBeGreaterThan(0);
    });
  });

  it("lessons 1–3 are written in all four voices", () => {
    for (const l of lessons.filter((x) => x.frontmatter.order <= 3)) {
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
  beforeAll(async () => {
    puzzle = await loadPuzzle("3x3x3");
  });

  const allUsages = () => lessons.flatMap((l) => usages(l.bodies.plain ?? "").map((u) => ({ lesson: l.frontmatter.id, ...u })));

  it("every alg, setup, scramble and move parses with verified moves only", () => {
    const verifiedFamilies = new Set(verifiedMoves("3x3x3").map((m) => m.replace(/['2]$/, "")));
    for (const u of allUsages()) {
      for (const key of ["setup", "alg", "scramble"] as const) {
        const value = u.attributes[key];
        if (value === undefined) continue;
        expect(parseAlg("3x3x3", value).ok, `${u.lesson}: ${u.name} ${key}="${value}"`).toBe(true);
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
    const corners = opDataset("op-corners.UBL.json");
    const edges = opDataset("op-edges.UR.json");
    for (const u of allUsages()) {
      for (const sticker of [...(u.attributes.highlight ?? "").split(/\s+/).filter(Boolean), ...(u.attributes.sticker === undefined ? [] : [u.attributes.sticker])]) {
        expect(names.has(sticker) || /^[UDFBLR]$/.test(sticker), `${u.lesson}: sticker ${sticker}`).toBe(true);
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
});
