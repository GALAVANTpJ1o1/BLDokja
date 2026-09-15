import type { TargetKind, TraceResult } from "@bld/cube-engine";

/**
 * A trace as teaching steps: for each target, where on the scrambled cube you look to find it.
 *
 * - The first target is read from the buffer slot.
 * - After each target, the next is read from the slot you just shot to: the sticker sitting there
 *   is where the next piece belongs.
 * - A cycle break (or the start of a twisted-piece cycle) isn't read at all: you choose the sticker,
 *   so you look at the sticker itself.
 *
 * trace-steps.test.ts checks every "read" step against the cube: the sticker physically in the look
 * slot must be the target, for random scrambles, both piece types, several buffers and both policies.
 */
export interface TraceStep {
  readonly index: number;
  readonly letter: string;
  /** The target sticker's name. */
  readonly target: string;
  readonly kind: TargetKind;
  /** True when you choose this target (a break into a new cycle) rather than read it. */
  readonly chosen: boolean;
  /** The slot to look at for this step. */
  readonly look: string;
}

export function traceSteps(trace: TraceResult): TraceStep[] {
  const starts = new Set(trace.cycles.filter((c) => c.kind !== "buffer").map((c) => c.start));
  return trace.targets.map((letter, index) => {
    const target = trace.targetStickers[index] ?? "";
    const kind = trace.targetKinds[index] ?? "normal";
    const chosen = kind === "cycleBreak" || (kind === "orientationTarget" && starts.has(index));
    const previous = trace.targetStickers[index - 1];
    return { index, letter, target, kind, chosen, look: chosen ? target : index === 0 || previous === undefined ? trace.buffer.sticker : previous };
  });
}
