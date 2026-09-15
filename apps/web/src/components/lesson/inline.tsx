"use client";

import type { ReactNode } from "react";
import { LetterNotch } from "@/components/letters/letters";
import { useReader } from "@/lib/reader";

/** A sticker's letter in the reader's scheme, with its face notch. `<Letter sticker="UBL" />` shows A in Speffz. */
export function Letter({ sticker }: { sticker: string }) {
  const reader = useReader();
  if (reader === undefined) return <span className="t-notation">…</span>;
  return <LetterNotch letter={reader.letterOf(sticker) ?? "?"} face={reader.faceOf(sticker)} />;
}

/** The reader's buffer for a method and piece type, as sticker name and letter: `<Buffer method="op" pieces="corners" />`. */
export function Buffer({ method = "op", pieces }: { method?: "op" | "m2" | "threeStyle"; pieces: "corners" | "edges" }) {
  const reader = useReader();
  if (reader === undefined) return <span>…</span>;
  const sticker = reader.buffers[method][pieces];
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="t-notation">{sticker}</span>
      <LetterNotch letter={reader.letterOf(sticker) ?? "?"} face={reader.faceOf(sticker)} />
    </span>
  );
}

/** A move or alg in notation. */
export function Moves({ children }: { children: ReactNode }) {
  return <code className="t-notation rounded-[2px] bg-stage px-1">{children}</code>;
}

/** A short aside set off from the lesson text. */
export function Note({ children }: { children: ReactNode }) {
  return <aside className="my-4 border-l-2 border-rule pl-4 t-body text-quiet">{children}</aside>;
}
