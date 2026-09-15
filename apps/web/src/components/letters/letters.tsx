"use client";

import { STICKER_PALETTES, tileLetterColour, type FaceName } from "@/design/palette";
import { useSettings } from "@/components/settings/settings-provider";

/**
 * Letters as places (DESIGN.md principle 2). The live target is a tile in its sticker's face colour;
 * letters elsewhere are quiet, with a notch in their face colour.
 */
export function LetterTile({ letter, face, size = "large", label }: { letter: string; face: FaceName; size?: "large" | "small"; label?: string }) {
  const { settings } = useSettings();
  const ink = tileLetterColour(STICKER_PALETTES[settings.palette][face]) === "ink";
  const dimensions = size === "large" ? "h-[72px] w-[72px] t-display-letter" : "h-9 w-9 text-[1.25rem] font-[700] casual";
  return (
    <span
      className={`inline-grid place-items-center rounded-[4px] border ${ink ? "border-ink/40 text-ink" : "border-transparent text-chalk"} ${dimensions}`}
      style={{ background: `var(--face-${face.toLowerCase()})` }}
      aria-label={label}
    >
      {letter}
    </span>
  );
}

export function LetterNotch({ letter, face, className }: { letter: string; face: FaceName; className?: string }) {
  return (
    <span className={`inline-flex min-w-[1.4em] flex-col items-center t-notation ${className ?? ""}`}>
      <span>{letter}</span>
      <span aria-hidden className="h-[3px] w-full rounded-[2px]" style={{ background: `var(--face-${face.toLowerCase()})` }} />
    </span>
  );
}

/** A letter drawn as a star (DESIGN.md, "Letters as stars"): chalk with a soft glow, for completion marks and target displays on the starfield. */
export function LetterStar({ letter, label }: { letter: string; label?: string }) {
  return (
    <span className="letter-star t-display-letter inline-block" aria-label={label}>
      {letter}
    </span>
  );
}
