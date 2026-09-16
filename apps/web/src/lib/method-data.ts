import { m2OpSystem, opSystem, symmetryImageDataset, type AlgDataset, type BufferPair, type SwapDataset, type M2OpParityDataset, type OpParityDataset, type OpSetupsDataset, type Puzzle } from "@bld/cube-engine";
import { algDatasets } from "@/content/algs";
import { GATE_B_BUFFERS } from "./reader-context";
import type { Reader } from "./reader";

/**
 * The verified datasets for the reader's buffers (BRIEF §7.6: alg sets read from your buffers).
 *
 * - The Gate B buffers read the committed files in /content/algs, verified by the engine's test suite.
 * - Other OP and M2 buffers are built and verified in memory by the engine's method systems.
 * - Other 3-style buffers are rotation images of the committed sets, verified in full.
 *
 * Nothing unverified is ever returned: a build that fails verification comes back as a failure.
 */

export interface OpData {
  readonly corners: OpSetupsDataset;
  readonly edges: OpSetupsDataset;
  readonly parity: OpParityDataset;
}

export interface M2Data {
  readonly corners: OpSetupsDataset;
  readonly edges: SwapDataset;
  readonly parity: M2OpParityDataset;
}

export interface ThreeStyleData {
  readonly corners: AlgDataset;
  readonly edges: AlgDataset;
}

export type Built<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const same = (a: BufferPair, b: BufferPair) => a.corners === b.corners && a.edges === b.edges;
const cache = new Map<string, Built<unknown>>();

function cached<T>(key: string, build: () => Built<T>): Built<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit as Built<T>;
  const result = build();
  cache.set(key, result);
  return result;
}

export function opData(puzzle: Puzzle, buffers: BufferPair): Built<OpData> {
  return cached(`op:${buffers.corners}/${buffers.edges}`, () => {
    if (same(buffers, GATE_B_BUFFERS.op)) {
      const { opCorners, opEdges, opParity } = algDatasets();
      return { ok: true, value: { corners: opCorners, edges: opEdges, parity: opParity } };
    }
    const system = opSystem(puzzle, { cornerBuffer: buffers.corners, edgeBuffer: buffers.edges });
    return system.ok ? { ok: true, value: system.value } : { ok: false, reason: system.error.code };
  });
}

export function m2Data(puzzle: Puzzle, buffers: BufferPair): Built<M2Data> {
  return cached(`m2:${buffers.corners}/${buffers.edges}`, () => {
    if (same(buffers, GATE_B_BUFFERS.m2)) {
      const { opCorners, m2Edges, m2opParity } = algDatasets();
      return { ok: true, value: { corners: opCorners, edges: m2Edges, parity: m2opParity } };
    }
    const system = m2OpSystem(puzzle, { cornerBuffer: buffers.corners, edgeBuffer: buffers.edges });
    return system.ok ? { ok: true, value: system.value } : { ok: false, reason: system.error.code };
  });
}

export function threeStyleData(puzzle: Puzzle, buffers: BufferPair): Built<ThreeStyleData> {
  return cached(`3style:${buffers.corners}/${buffers.edges}`, () => {
    const { threeStyleCorners, threeStyleEdges } = algDatasets();
    // A committed set for its own buffer is used as it is, like OP and M2 above; only other buffers need an image.
    const imageFor = (dataset: AlgDataset, buffer: string) => (dataset.buffer === buffer ? { ok: true as const, value: dataset } : symmetryImageDataset(puzzle, dataset, buffer));
    const corners = imageFor(threeStyleCorners, buffers.corners);
    if (!corners.ok) return { ok: false, reason: corners.error.code };
    const edges = imageFor(threeStyleEdges, buffers.edges);
    if (!edges.ok) return { ok: false, reason: edges.error.code };
    return { ok: true, value: { corners: corners.value, edges: edges.value } };
  });
}

/** The 3-style datasets for the reader's 3-style buffers. */
export function threeStyleForReader(puzzle: Puzzle, buffers: Reader["buffers"]): Built<ThreeStyleData> {
  return threeStyleData(puzzle, buffers.threeStyle);
}

/** OP and M2 together, as the M2/OP trainer needs them. */
export function m2opData(puzzle: Puzzle, buffers: Reader["buffers"]): Built<{ op: OpData; m2: M2Data }> {
  const op = opData(puzzle, buffers.op);
  if (!op.ok) return op;
  const m2 = m2Data(puzzle, buffers.m2);
  if (!m2.ok) return m2;
  return { ok: true, value: { op: op.value, m2: m2.value } };
}
