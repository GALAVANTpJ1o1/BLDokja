import { algFor, profileColours, styleMoves, type CuratedCase, type CuratedStage, type ExecutionStyle, type F2LCuratedCase, type OrientationProfile } from "@bld/cube-engine/cfop-data";
import { cfop } from "@/i18n/cfop";
import { en } from "@/i18n/en";
import { caseView, NO_FEATURES, type LlFeatures } from "./cfop-views";

/**
 * The words on a case card, composed from the case's data and its recognised features. The wording lives in
 * i18n/cfop.ts; this file only chooses which sentence a case needs (§83: name, then clue, then how to hold it).
 */
export type LlCase = { readonly stage: CuratedStage; readonly kase: CuratedCase };

const groupLabel = (group: string) => cfop.groups[group] ?? group;

export function caseTitle(stage: CuratedStage, kase: CuratedCase): string {
  switch (stage) {
    case "oll": return kase.name === kase.group ? `OLL ${kase.number ?? ""} — ${groupLabel(kase.group)}` : `OLL ${kase.number ?? ""} — ${kase.name}`;
    case "pll": return `${kase.name} perm`;
    case "ep": return `${kase.name} perm`;
    default: return kase.name;
  }
}

export function f2lTitle(kase: F2LCuratedCase): string {
  return cfop.f2lName(kase.number);
}

export function caseClue(stage: CuratedStage, kase: CuratedCase): string {
  return clueFor(stage, kase, caseView(kase.id)?.features ?? NO_FEATURES);
}

/** The clue for a case as it is *drawn*: pass features read from the state on screen, so "left" means the left of that picture. */
export function clueFor(stage: CuratedStage, kase: CuratedCase, features: LlFeatures): string {
  const edges = cfop.clue.edges(features.edgeSides.length, features.edgeSides);
  const corners = cfop.clue.corners(features.cornerPlaces.length, features.cornerPlaces);
  const structure = () => {
    if (features.headlights.length === 4 || (features.bars.length + features.headlights.length === 4 && features.bars.length === 0)) return cfop.clue.solvedCorners;
    const parts: string[] = [];
    if (features.bars.length > 0) parts.push(cfop.clue.bar(features.bars));
    if (features.headlights.length > 0) parts.push(cfop.clue.headlights(features.headlights));
    return parts.length === 0 ? cfop.clue.noBar : parts.join(" ");
  };
  switch (stage) {
    case "eo": return kase.id === "eo_dot" ? cfop.clue.dot : kase.id === "eo_line" ? cfop.clue.line : cfop.clue.lShape;
    case "co": return `${corners} ${cfop.clue.cross}`;
    case "oll": return kase.group === "Dot" ? `${cfop.clue.dot} ${corners}` : kase.group === "Cross" ? `${cfop.clue.cross} ${corners}` : kase.group === "Corners Oriented" ? `${cfop.clue.cornersOriented} ${edges}` : `${edges} ${corners}`;
    case "cp": case "pll": case "ep": return structure();
  }
}

export function caseHold(stage: CuratedStage, kase: CuratedCase): string {
  const features = caseView(kase.id)?.features ?? NO_FEATURES;
  if (stage === "pll" || stage === "cp" || stage === "ep") {
    const bar = features.bars[0]; const headlights = features.headlights;
    if (bar !== undefined) return `${cfop.clue.hold.yellow} ${cfop.clue.hold.bar(cfop.sides[bar])}`;
    if (headlights.length === 1 && headlights[0] !== undefined) return `${cfop.clue.hold.yellow} ${cfop.clue.hold.headlights(cfop.sides[headlights[0]])}`;
    return `${cfop.clue.hold.yellow} ${cfop.clue.hold.none}`;
  }
  return `${cfop.clue.hold.yellow} ${cfop.clue.hold.asDrawn}`;
}

export function f2lClue(kase: F2LCuratedCase): string {
  const p = kase.placement;
  return cfop.f2lClue(p.cornerPlace === 4 ? "slot" : "top", p.cornerTwist, p.edgePlace === 8 ? "slot" : "top", p.edgeFlip);
}

/** The style shown for a case, whether it fell back, and the executable text. */
export function shownAlg(kase: CuratedCase, style: ExecutionStyle): { readonly alg: string; readonly moves: number; readonly preAuf: string; readonly postAuf: string; readonly rotation: string; readonly executable: string; readonly fallback: boolean; readonly style: ExecutionStyle } {
  const { entry, style: used, fallback } = algFor(kase, style);
  return { alg: entry.alg, moves: entry.moves, preAuf: entry.preAuf, postAuf: entry.postAuf, rotation: entry.endingRotation, executable: styleMoves(entry), fallback, style: used };
}

/** Strings a search box matches a case against: its name, number, group and the words a learner uses for it. */
export function searchText(stage: CuratedStage, kase: CuratedCase): string {
  return [kase.name, kase.id, ...kase.aliases, groupLabel(kase.group), kase.group, caseTitle(stage, kase), stage === "oll" ? `oll${kase.number ?? ""}` : "", stage === "pll" || stage === "ep" ? `${kase.name} perm ${kase.name}perm` : ""].join(" ").toLowerCase();
}

export function f2lSearchText(kase: F2LCuratedCase): string {
  const family = cfop.f2lFamilies[kase.family]?.title ?? kase.family;
  return [kase.name, kase.id, `f2l ${kase.number}`, String(kase.number), family, f2lClue(kase)].join(" ").toLowerCase();
}

export function matchesSearch(haystack: string, query: string): boolean {
  const words = query.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w !== "");
  const squashed = haystack.replace(/[^a-z0-9]/g, "");
  return words.every((w) => haystack.includes(w) || squashed.includes(w));
}

/** One letter per face colour under a profile ("Y" for the top under CFOP), printed on diagram stickers so colour is never the only cue. */
export function colourLetters(profile: OrientationProfile): Record<"U" | "D" | "F" | "B" | "R" | "L", string> {
  const shown = profileColours(profile);
  return Object.fromEntries((["U", "D", "F", "B", "R", "L"] as const).map((face) => [face, en.cube.colourNames[shown[face]].charAt(0).toUpperCase()])) as Record<"U" | "D" | "F" | "B" | "R" | "L", string>;
}
