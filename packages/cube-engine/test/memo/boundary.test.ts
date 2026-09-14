import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Import boundary for the memo layer (DECISIONS D-015). Only src/memo/** and the public index may
 * import it, so nothing that traces, solves, searches or selects algs can ever read a self-pair.
 */

const srcDir = join(import.meta.dirname, "..", "..", "src");
const memoDir = join(srcDir, "memo");

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

function sourceFiles(dir: string): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [{ path, text: readFileSync(path, "utf8") }] : [];
  });
}

/** Every module specifier: `import … from`, `export … from`, bare `import "…"`, and `import("…")`. */
function specifiers(text: string): string[] {
  const patterns = [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1] ?? ""));
}

function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + sep);
}

/** Source files outside the allowed set that import anything under src/memo. */
function memoImporters(files: readonly SourceFile[]): string[] {
  const allowed = (path: string) => isInside(path, memoDir) || path === join(srcDir, "index.ts");
  return files
    .filter((file) => !allowed(file.path))
    .filter((file) =>
      specifiers(file.text)
        .filter((spec) => spec.startsWith("."))
        .some((spec) => isInside(resolve(dirname(file.path), spec.replace(/\.js$/, ".ts")), memoDir)),
    )
    .map((file) => relative(srcDir, file.path));
}

describe("memo layer import boundary", () => {
  it("is imported only by src/memo/** and src/index.ts", () => {
    const files = sourceFiles(srcDir);
    expect(files.some((f) => isInside(f.path, memoDir))).toBe(true);
    expect(memoImporters(files)).toEqual([]);
  });

  it("catches static, re-export, side-effect and dynamic imports", () => {
    const at = (path: string, text: string): SourceFile => ({ path: join(srcDir, path), text });
    expect(
      memoImporters([
        at("trace/a.ts", 'import { memoView } from "../memo/memo.js";'),
        at("methods/b.ts", 'export type { MemoView } from "../memo/memo.js";'),
        at("commutator/c.ts", 'import "../memo/memo.js";'),
        at("scramble/d.ts", 'const m = await import("../memo/memo.js");'),
        at("e.ts", "import {\n  memoView,\n} from './memo/index.js';"),
        at("memo/f.ts", 'import { memoView } from "./memo.js";'),
        at("index.ts", 'export { memoView } from "./memo/memo.js";'),
        at("trace/g.ts", 'import { trace } from "./trace.js";'),
      ]),
    ).toEqual([join("trace", "a.ts"), join("methods", "b.ts"), join("commutator", "c.ts"), join("scramble", "d.ts"), "e.ts"]);
  });
});
