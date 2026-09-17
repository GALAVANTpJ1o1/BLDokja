import { AlgDatasetSchema, LastLayerDatasetSchema, SwapDatasetSchema, SwapParityDatasetSchema, M2OpParityDatasetSchema, OpCornerParityDatasetSchema, OpParityDatasetSchema, OpSetupsDatasetSchema, type AlgDataset, type LastLayerDataset, type SwapDataset, type SwapParityDataset, type M2OpParityDataset, type OpCornerParityDataset, type OpParityDataset, type OpSetupsDataset } from "@bld/cube-engine";
import threeStyleCornersRaw from "../../../../content/algs/3x3/3style-corners.UFR.json";
import threeStyleEdgesRaw from "../../../../content/algs/3x3/3style-edges.UF.json";
import m2EdgesRaw from "../../../../content/algs/3x3/m2-edges.DF.json";
import m2opParityRaw from "../../../../content/algs/3x3/m2op-parity.UBL-DF.json";
import opCornersRaw from "../../../../content/algs/3x3/op-corners.UBL.json";
import opEdgesRaw from "../../../../content/algs/3x3/op-edges.UR.json";
import opParityRaw from "../../../../content/algs/3x3/op-parity.UBL-UR.json";
import opCornerParityRaw from "../../../../content/algs/4x4/op-corner-parity.UBL.json";
import r2ParityRaw from "../../../../content/algs/4x4/r2-parity.FDr.json";
import r2WingsRaw from "../../../../content/algs/4x4/r2-wings.FDr.json";
import u2ParityRaw from "../../../../content/algs/4x4/u2-parity.Ubr.json";
import u2CentresRaw from "../../../../content/algs/4x4/u2-xcenters.Ubr.json";
import eoRaw from "../../../../content/algs/cfop/eo.json";
import coRaw from "../../../../content/algs/cfop/co.json";
import ollRaw from "../../../../content/algs/cfop/oll.json";
import cornerPermRaw from "../../../../content/algs/cfop/corner-perm.json";
import edgePermRaw from "../../../../content/algs/cfop/edge-perm.json";
import pllRaw from "../../../../content/algs/cfop/pll.json";

/**
 * The verified alg datasets in /content/algs (generated and checked by the engine's test suite,
 * D-023 to D-026). They cross into the app here, so they are parsed with the engine's Zod schemas.
 */
function parsed<T>(name: string, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } }, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(`content/algs/${name} failed validation`);
  return result.data;
}

/** A dataset parsed the first time it's asked for, then kept. */
function once<T>(load: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= load());
}

const threeStyleCorners = once((): AlgDataset => parsed("3style-corners.UFR.json", AlgDatasetSchema, threeStyleCornersRaw));
const threeStyleEdges = once((): AlgDataset => parsed("3style-edges.UF.json", AlgDatasetSchema, threeStyleEdgesRaw));
const opCorners = once((): OpSetupsDataset => parsed("op-corners.UBL.json", OpSetupsDatasetSchema, opCornersRaw));
const opEdges = once((): OpSetupsDataset => parsed("op-edges.UR.json", OpSetupsDatasetSchema, opEdgesRaw));
const opParity = once((): OpParityDataset => parsed("op-parity.UBL-UR.json", OpParityDatasetSchema, opParityRaw));
const m2Edges = once((): SwapDataset => parsed("m2-edges.DF.json", SwapDatasetSchema, m2EdgesRaw));
const m2opParity = once((): M2OpParityDataset => parsed("m2op-parity.UBL-DF.json", M2OpParityDatasetSchema, m2opParityRaw));
const r2Wings = once((): SwapDataset => parsed("r2-wings.FDr.json", SwapDatasetSchema, r2WingsRaw));
const u2Centres = once((): SwapDataset => parsed("u2-xcenters.Ubr.json", SwapDatasetSchema, u2CentresRaw));
const r2Parity = once((): SwapParityDataset => parsed("r2-parity.FDr.json", SwapParityDatasetSchema, r2ParityRaw));
const u2Parity = once((): SwapParityDataset => parsed("u2-parity.Ubr.json", SwapParityDatasetSchema, u2ParityRaw));
const cornerParity4x4 = once((): OpCornerParityDataset => parsed("op-corner-parity.UBL.json", OpCornerParityDatasetSchema, opCornerParityRaw));
const cfopLastLayer = once((): readonly LastLayerDataset[] => [
  parsed("cfop/eo.json", LastLayerDatasetSchema, eoRaw), parsed("cfop/co.json", LastLayerDatasetSchema, coRaw),
  parsed("cfop/oll.json", LastLayerDatasetSchema, ollRaw), parsed("cfop/corner-perm.json", LastLayerDatasetSchema, cornerPermRaw),
  parsed("cfop/edge-perm.json", LastLayerDatasetSchema, edgePermRaw), parsed("cfop/pll.json", LastLayerDatasetSchema, pllRaw),
]);

/**
 * Each dataset is parsed only when it's first read: a lesson that needs M2's table doesn't pay for parsing the
 * 818 3-style records. Destructure what you need (`const { m2Edges } = algDatasets()`).
 */
const datasets = {
  get threeStyleCorners() {
    return threeStyleCorners();
  },
  get threeStyleEdges() {
    return threeStyleEdges();
  },
  get opCorners() {
    return opCorners();
  },
  get opEdges() {
    return opEdges();
  },
  get opParity() {
    return opParity();
  },
  get m2Edges() {
    return m2Edges();
  },
  get m2opParity() {
    return m2opParity();
  },
  // 4BLD (D-038, D-039, D-041).
  get r2Wings() {
    return r2Wings();
  },
  get u2Centres() {
    return u2Centres();
  },
  get r2Parity() {
    return r2Parity();
  },
  get u2Parity() {
    return u2Parity();
  },
  get cornerParity4x4() {
    return cornerParity4x4();
  },
  get cfopLastLayer() {
    return cfopLastLayer();
  },
};

export function algDatasets(): typeof datasets {
  return datasets;
}
