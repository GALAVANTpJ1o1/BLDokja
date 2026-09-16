"use client";

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

export { Moves, Note } from "./inline-static";
