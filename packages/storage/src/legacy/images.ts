import { graphemes, type LegacyPairWordRow, type LetterPair, type PairImage } from "../schema.js";
import type { Correction } from "./corrections.js";

/**
 * Legacy rows → letter pairs (MIGRATION.md §3.2, §3.6). A pure function of the rows and the
 * corrections table, so the same code imports a database and rebuilds images from the snapshots an
 * export keeps (which is how corrections stay reversible).
 */

/** Placeholders last, then most used first, then text in code-unit order (AUDIT C4's order, after corrections). */
export function compareImages(a: PairImage, b: PairImage): number {
  const pa = a.flags?.includes("placeholder") === true ? 1 : 0;
  const pb = b.flags?.includes("placeholder") === true ? 1 : 0;
  return pa - pb || b.uses - a.uses || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0);
}

export const isPlaceholder = (image: PairImage) => image.flags?.includes("placeholder") === true;

export function buildLetterPairs(rows: readonly LegacyPairWordRow[], corrections: readonly Correction[]): LetterPair[] {
  const byId = new Map(corrections.map((c) => [c.id, c]));
  const groups = new Map<string, Map<string, { text: string; placeholder: boolean; snapshots: LegacyPairWordRow[] }>>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const correction = byId.get(row.id);
    const text = correction !== undefined && "to" in correction ? correction.to : row.word;
    const placeholder = correction !== undefined && "flag" in correction;
    const pair = groups.get(row.pair) ?? new Map<string, { text: string; placeholder: boolean; snapshots: LegacyPairWordRow[] }>();
    groups.set(row.pair, pair);
    // Merge rows whose corrected text is identical. A placeholder never merges with a real word.
    const key = `${placeholder ? "p" : "w"}:${text}`;
    const group = pair.get(key) ?? { text, placeholder, snapshots: [] };
    group.snapshots.push(row);
    pair.set(key, group);
  }

  return [...groups.keys()].sort().map((id) => {
    const images = [...(groups.get(id)?.values() ?? [])]
      .map((g): PairImage => {
        const lowest = g.snapshots[0]?.id ?? 0;
        return {
          id: `legacy:pair_words:${lowest}`,
          text: g.text,
          uses: g.snapshots.reduce((sum, s) => sum + s.count, 0),
          ...(g.placeholder ? { flags: ["placeholder" as const] } : {}),
          legacy: g.snapshots,
        };
      })
      .sort(compareImages);
    const [first = "", second = ""] = graphemes(id);
    return { id, first, second, images };
  });
}

/** Every legacy snapshot in a set of letter pairs, in id order. */
export function snapshotsOf(pairs: readonly LetterPair[]): LegacyPairWordRow[] {
  return pairs.flatMap((p) => p.images.flatMap((i) => i.legacy ?? [])).sort((a, b) => a.id - b.id);
}

/** Longest common subsequence length, for re-scoring legacy memo attempts (AUDIT C3). */
export function lcsLength(a: string, b: string): number {
  const x = graphemes(a);
  const y = graphemes(b);
  let previous = new Array<number>(y.length + 1).fill(0);
  for (const cx of x) {
    const current = [0];
    for (let j = 1; j <= y.length; j++) {
      current[j] = cx === y[j - 1] ? (previous[j - 1] ?? 0) + 1 : Math.max(previous[j] ?? 0, current[j - 1] ?? 0);
    }
    previous = current;
  }
  return previous[y.length] ?? 0;
}
