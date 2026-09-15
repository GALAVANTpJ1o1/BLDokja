"use client";

import { Cube } from "@/components/cube/cube";

/**
 * The cube as lesson authors write it. Lesson files can't contain JavaScript, so every prop is a
 * string: `<Cube setup="R U R'" alg="U" highlight="UFR FUR RUF" controls="true" label="…" />`.
 * lessons.test.ts checks every alg and sticker name used this way against the engine.
 */
export function LessonCube({ setup, alg, highlight, controls, dim, label }: { setup?: string; alg?: string; highlight?: string; controls?: string; dim?: string; label: string }) {
  return (
    <div className="my-6">
      <Cube
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
