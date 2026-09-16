"use client";

import { Cube } from "@/components/cube/cube";

/**
 * The cube as lesson authors write it. Lesson files can't contain JavaScript, so every prop is a
 * string: `<Cube setup="R U R'" alg="U" highlight="UFR FUR RUF" controls="true" label="…" />`, with
 * `puzzle="4x4x4"` for the 4BLD track. lessons.test.ts checks every alg and sticker name used this way
 * against the engine, for the puzzle named.
 */
export function LessonCube({ puzzle, setup, alg, highlight, controls, dim, label }: { puzzle?: string; setup?: string; alg?: string; highlight?: string; controls?: string; dim?: string; label: string }) {
  return (
    <div className="my-6">
      <Cube
        puzzleId={puzzle === "4x4x4" ? "4x4x4" : "3x3x3"}
        setup={setup ?? ""}
        alg={alg ?? ""}
        {...(highlight === undefined ? {} : { highlight: highlight.split(/\s+/).filter(Boolean) })}
        controls={controls === "true"}
        dim={dim === "soft" ? "soft" : "strong"}
        label={label}
      />
    </div>
  );
}
