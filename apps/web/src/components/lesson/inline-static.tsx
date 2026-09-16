import type { ReactNode } from "react";

/** Lesson components that only format text: no state, no engine, rendered on the server. */

/** A move or alg in notation. */
export function Moves({ children }: { children: ReactNode }) {
  return <code className="t-notation rounded-[2px] bg-stage px-1">{children}</code>;
}

/** A short aside set off from the lesson text. */
export function Note({ children }: { children: ReactNode }) {
  return <aside className="my-4 border-l-2 border-rule pl-4 t-body text-quiet">{children}</aside>;
}
