import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDES, guideForPath } from "./guides";

const SRC = join(import.meta.dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const allSource = sourceFiles(SRC).map((path) => readFileSync(path, "utf8")).join("\n");

describe("the page guide registry", () => {
  it("has a guide for every page that does something, each with at least two steps", () => {
    const expected = [
      "/", "/learn/", "/learn/notation/", "/practice/", "/practice/speffz/", "/practice/trace/", "/practice/m2op/", "/practice/3style/", "/practice/4bld/", "/practice/pairs/",
      "/practice/sandbox/", "/practice/weak/", "/practice/difficulty/", "/practice/first-solve/", "/practice/levels/", "/practice/debug/", "/practice/algorithms/",
      "/practice/memory/", "/practice/reference/", "/practice/big-cubes/", "/progress/", "/settings/", "/settings/lettering/", "/account/", "/leaderboard/",
    ];
    for (const path of expected) {
      const guide = guideForPath(path);
      expect(guide, path).toBeDefined();
      expect(guide?.steps.length, path).toBeGreaterThanOrEqual(2);
    }
  });

  it("leaves plain text pages and unknown routes without one", () => {
    for (const path of ["/contact/", "/privacy/", "/lab/", "/nothing-here/"]) expect(guideForPath(path), path).toBeUndefined();
  });

  it("matches a path with or without its trailing slash, and every lesson with one shared guide", () => {
    expect(guideForPath("/practice/trace")?.id).toBe("trace");
    expect(guideForPath("/learn/cycle-breaks/")?.id).toBe("lesson");
    expect(guideForPath("/learn/notation")?.id).toBe("lesson");
    expect(guideForPath("/learn/")?.id).toBe("learn");
  });

  it("gives every guide a unique id, and no two guides answer for the same page", () => {
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length);
    for (const path of ["/", "/learn/", "/learn/x/", "/practice/", "/practice/trace/", "/settings/", "/settings/lettering/", "/account/"]) {
      expect(GUIDES.filter((g) => g.matches(path)).map((g) => g.id), path).toHaveLength(1);
    }
  });

  it("gives every step unique ids within its guide and real, short copy", () => {
    for (const guide of GUIDES) {
      expect(new Set(guide.steps.map((s) => s.id)).size, guide.id).toBe(guide.steps.length);
      for (const s of guide.steps) {
        const where = `${guide.id}/${s.id}`;
        expect(s.title.trim(), where).not.toBe("");
        expect(s.title.length, `${where} title`).toBeLessThanOrEqual(40);
        expect(s.body.length, `${where} body`).toBeGreaterThan(30);
        expect(s.body.length, `${where} body`).toBeLessThanOrEqual(300);
        // House style: sentence case, no arrows on buttons or copy, no tracked-out capitals.
        expect(s.title, where).not.toMatch(/→|↗/);
        expect(s.body, where).not.toMatch(/→|↗/);
        expect(s.title, where).not.toBe(s.title.toUpperCase());
        expect(s.title.charAt(0), where).toBe(s.title.charAt(0).toUpperCase());
      }
    }
  });

  it("points every step at an element that some component in the app actually tags", () => {
    const missing: string[] = [];
    for (const guide of GUIDES) {
      for (const s of guide.steps) {
        const tag = /^(?:main )?\[data-guide="([^"]+)"\]$/.exec(s.target)?.[1];
        if (tag === undefined) continue; // a selector on existing markup, checked in the browser spec
        // Tagged as a data-guide attribute, or through a component prop named `guide`.
        if (!allSource.includes(`data-guide="${tag}"`) && !allSource.includes(`guide="${tag}"`)) missing.push(`${guide.id}/${s.id} -> ${tag}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("only waits, before opening by itself, for elements a step or tag really provides", () => {
    for (const guide of GUIDES) {
      for (const selector of guide.ready ?? []) {
        const tag = /\[data-guide="([^"]+)"\]/.exec(selector)?.[1];
        expect(tag, `${guide.id} ready ${selector}`).toBeDefined();
        expect(allSource.includes(`data-guide="${tag ?? ""}"`) || allSource.includes(`guide="${tag ?? ""}"`), `${guide.id} ready ${tag ?? ""}`).toBe(true);
      }
    }
  });
});
