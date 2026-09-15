import { en } from "@/i18n/en";
import type { Reader } from "./reader";

/** A drill case id as the trainers write it, read back for display (Weak 20, session summaries). */
export type ParsedCase =
  | { readonly trainer: "pairs"; readonly pair: string }
  | { readonly trainer: "3style"; readonly pieceType: "corners" | "edges"; readonly buffer: string; readonly targets: readonly [string, string] }
  | { readonly trainer: "m2op"; readonly mode: "op-corners" | "op-edges" | "m2-edges" | "m2-special"; readonly buffer: string | undefined; readonly target: string; readonly position: "even" | "odd" | undefined }
  | { readonly trainer: "trace"; readonly pieceType: "corners" | "edges"; readonly sticker: string };

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
  return undefined;
}

export function itemLabel(reader: Reader, trainer: string, caseId: string): string {
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
  }
}
