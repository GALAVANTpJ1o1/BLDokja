import { en } from "@/i18n/en";

/** All a label needs from a reader: the 3BLD reader and the 4BLD one both have it. */
export interface LetterSource {
  letterOf(sticker: string): string | undefined;
}

/** A drill case id as the trainers write it, read back for display (Weak 20, session summaries). */
export type ParsedCase =
  | { readonly trainer: "pairs"; readonly pair: string }
  | { readonly trainer: "3style"; readonly pieceType: "corners" | "edges"; readonly buffer: string; readonly targets: readonly [string, string] }
  | { readonly trainer: "m2op"; readonly mode: "op-corners" | "op-edges" | "m2-edges" | "m2-special"; readonly buffer: string | undefined; readonly target: string; readonly position: "even" | "odd" | undefined }
  | { readonly trainer: "trace"; readonly pieceType: "corners" | "edges"; readonly sticker: string }
  | { readonly trainer: "4bld"; readonly kind: "shot"; readonly method: "r2" | "u2"; readonly target: string; readonly position: "even" | "odd" | undefined }
  | { readonly trainer: "4bld"; readonly kind: "trace"; readonly pieces: "xcenters" | "wings" | "corners"; readonly sticker: string };

export function parseCase(trainer: string, caseId: string): ParsedCase | undefined {
  if (trainer === "pairs") return { trainer, pair: caseId };
  if (trainer === "3style") {
    const m = /^(corners|edges)@([UDRLFB]{2,3}):([UDRLFB]{2,3})-([UDRLFB]{2,3})$/.exec(caseId);
    if (m === null) return undefined;
    return { trainer, pieceType: m[1] === "corners" ? "corners" : "edges", buffer: m[2] ?? "", targets: [m[3] ?? "", m[4] ?? ""] };
  }
  if (trainer === "m2op") {
    const m = /^(op-corners|op-edges|m2-edges|m2-special)(?:@([UDRLFB]{2,3}))?:([UDRLFB]{2,3})(?::(even|odd))?$/.exec(caseId);
    if (m === null) return undefined;
    return { trainer, mode: m[1] as "op-corners" | "op-edges" | "m2-edges" | "m2-special", buffer: m[2], target: m[3] ?? "", position: m[4] === "even" || m[4] === "odd" ? m[4] : undefined };
  }
  if (trainer === "trace") {
    const m = /^(corners|edges):([UDRLFB]{2,3})$/.exec(caseId);
    if (m === null) return undefined;
    return { trainer, pieceType: m[1] === "corners" ? "corners" : "edges", sticker: m[2] ?? "" };
  }
  if (trainer === "4bld") {
    // 4x4 sticker names carry lower-case letters: "UBl" is a wing, "Ubl" an x-centre.
    const shot = /^(r2|u2):([A-Za-z]{3})(?::(even|odd))?$/.exec(caseId);
    if (shot !== null) return { trainer, kind: "shot", method: shot[1] === "u2" ? "u2" : "r2", target: shot[2] ?? "", position: shot[3] === "even" || shot[3] === "odd" ? shot[3] : undefined };
    const traced = /^trace-(xcenters|wings|corners):([A-Za-z]{3})$/.exec(caseId);
    if (traced !== null) return { trainer, kind: "trace", pieces: traced[1] === "xcenters" ? "xcenters" : traced[1] === "wings" ? "wings" : "corners", sticker: traced[2] ?? "" };
    return undefined;
  }
  return undefined;
}

export function itemLabel(reader: LetterSource, trainer: string, caseId: string): string {
  const parsed = parseCase(trainer, caseId);
  if (parsed === undefined) return caseId;
  const letter = (s: string) => reader.letterOf(s) ?? "?";
  switch (parsed.trainer) {
    case "pairs":
      return en.analytics.labelPair(parsed.pair);
    case "3style":
      return en.analytics.labelComm(`${letter(parsed.targets[0])}${letter(parsed.targets[1])}`, parsed.targets[0], parsed.targets[1]);
    case "m2op":
      return `${en.analytics.labelShot(en.m2op.modes[parsed.mode], letter(parsed.target), parsed.target)}${parsed.position === undefined ? "" : ` · ${parsed.position === "odd" ? en.m2op.oddPosition : en.m2op.evenPosition}`}`;
    case "trace":
      return en.analytics.labelTrace(parsed.sticker);
    case "4bld":
      if (parsed.kind === "trace") return en.analytics.labelTrace(parsed.sticker);
    {
      // 4x4 letters come from the 4BLD reader, which a 3BLD page doesn't have; the sticker names the case either way.
      const known = reader.letterOf(parsed.target);
      const mode = en.fourBld.modes[parsed.method];
      return `${known === undefined ? en.analytics.labelSticker(mode, parsed.target) : en.analytics.labelShot(mode, known, parsed.target)}${parsed.position === undefined ? "" : ` · ${parsed.position === "odd" ? en.m2op.oddPosition : en.m2op.evenPosition}`}`;
    }
  }
}
