import { AlgDatasetSchema, SwapDatasetSchema, SwapParityDatasetSchema, M2OpParityDatasetSchema, OpCornerParityDatasetSchema, OpParityDatasetSchema, OpSetupsDatasetSchema, type AlgDataset, type SwapDataset, type SwapParityDataset, type M2OpParityDataset, type OpCornerParityDataset, type OpParityDataset, type OpSetupsDataset } from "@bld/cube-engine";
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

/**
 * The verified alg datasets in /content/algs (generated and checked by the engine's test suite,
 * D-023 to D-026). They cross into the app here, so they are parsed with the engine's Zod schemas.
 */
function parsed<T>(name: string, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } }, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(`content/algs/${name} failed validation`);
  return result.data;
}

let cache: { threeStyleCorners: AlgDataset; threeStyleEdges: AlgDataset; opCorners: OpSetupsDataset; opEdges: OpSetupsDataset; opParity: OpParityDataset; m2Edges: SwapDataset; m2opParity: M2OpParityDataset; r2Wings: SwapDataset; u2Centres: SwapDataset; r2Parity: SwapParityDataset; u2Parity: SwapParityDataset; cornerParity4x4: OpCornerParityDataset } | undefined;

export function algDatasets() {
  cache ??= {
    threeStyleCorners: parsed("3style-corners.UFR.json", AlgDatasetSchema, threeStyleCornersRaw),
    threeStyleEdges: parsed("3style-edges.UF.json", AlgDatasetSchema, threeStyleEdgesRaw),
    opCorners: parsed("op-corners.UBL.json", OpSetupsDatasetSchema, opCornersRaw),
    opEdges: parsed("op-edges.UR.json", OpSetupsDatasetSchema, opEdgesRaw),
    opParity: parsed("op-parity.UBL-UR.json", OpParityDatasetSchema, opParityRaw),
    m2Edges: parsed("m2-edges.DF.json", SwapDatasetSchema, m2EdgesRaw),
    m2opParity: parsed("m2op-parity.UBL-DF.json", M2OpParityDatasetSchema, m2opParityRaw),
    // 4BLD (D-038, D-039, D-041).
    r2Wings: parsed("r2-wings.FDr.json", SwapDatasetSchema, r2WingsRaw),
    u2Centres: parsed("u2-xcenters.Ubr.json", SwapDatasetSchema, u2CentresRaw),
    r2Parity: parsed("r2-parity.FDr.json", SwapParityDatasetSchema, r2ParityRaw),
    u2Parity: parsed("u2-parity.Ubr.json", SwapParityDatasetSchema, u2ParityRaw),
    cornerParity4x4: parsed("op-corner-parity.UBL.json", OpCornerParityDatasetSchema, opCornerParityRaw),
  };
  return cache;
}
