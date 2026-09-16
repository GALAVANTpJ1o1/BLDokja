import { cancelMoves, expandNodes, parseAlg } from "@bld/cube-engine";
import type { AlgPreference } from "@bld/storage";

export interface ErgonomicWeights { moves: number; rotations: number; slices: number; wide: number; regrips: number; preference: number }
export const DEFAULT_WEIGHTS: ErgonomicWeights = { moves: 1, rotations: 3, slices: 1.5, wide: 0.5, regrips: 2, preference: 2 };
const cache = new Map<string, { moves: number; rotations: number; slices: number; wide: number }>();
export function ergonomicCounts(alg: string) {
  const hit = cache.get(alg);
  if (hit !== undefined) return hit;
  const parsed = parseAlg("3x3x3", alg);
  if (!parsed.ok) return undefined;
  const moves = cancelMoves("3x3x3", expandNodes(parsed.value.nodes));
  const counts = { moves: moves.length, rotations: moves.filter((m) => /^[xyz]$/.test(m.family)).length, slices: moves.filter((m) => /^[MES]$/.test(m.family)).length, wide: moves.filter((m) => /w$|^[udrlfb]$/.test(m.family)).length };
  cache.set(alg, counts);
  return counts;
}
export const preferenceKey = (dataset: string, record: string, alg: string) => JSON.stringify([dataset, record, alg]);
export function ergonomicScore(alg: string, preference: AlgPreference | undefined, weights = DEFAULT_WEIGHTS): number {
  const counts = ergonomicCounts(alg);
  if (counts === undefined) return Infinity;
  return counts.moves * weights.moves + counts.rotations * weights.rotations + counts.slices * weights.slices + counts.wide * weights.wide + (preference?.regrips ?? 0) * weights.regrips - (preference?.rating ?? 0) * weights.preference;
}
