import { AlgDatasetSchema, M2DatasetSchema, OpParityDatasetSchema, OpSetupsDatasetSchema, type AlgDataset, type M2Dataset, type OpParityDataset, type OpSetupsDataset } from "@bld/cube-engine";
import threeStyleCornersRaw from "../../../../content/algs/3x3/3style-corners.UFR.json";
import threeStyleEdgesRaw from "../../../../content/algs/3x3/3style-edges.UF.json";
import m2EdgesRaw from "../../../../content/algs/3x3/m2-edges.DF.json";
import opCornersRaw from "../../../../content/algs/3x3/op-corners.UBL.json";
import opEdgesRaw from "../../../../content/algs/3x3/op-edges.UR.json";
import opParityRaw from "../../../../content/algs/3x3/op-parity.UBL-UR.json";

/**
 * The verified alg datasets in /content/algs (generated and checked by the engine's test suite,
 * D-023 to D-026). They cross into the app here, so they are parsed with the engine's Zod schemas.
 */
function parsed<T>(name: string, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } }, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(`content/algs/3x3/${name} failed validation`);
  return result.data;
}

let cache: { threeStyleCorners: AlgDataset; threeStyleEdges: AlgDataset; opCorners: OpSetupsDataset; opEdges: OpSetupsDataset; opParity: OpParityDataset; m2Edges: M2Dataset } | undefined;

export function algDatasets() {
  cache ??= {
    threeStyleCorners: parsed("3style-corners.UFR.json", AlgDatasetSchema, threeStyleCornersRaw),
    threeStyleEdges: parsed("3style-edges.UF.json", AlgDatasetSchema, threeStyleEdgesRaw),
    opCorners: parsed("op-corners.UBL.json", OpSetupsDatasetSchema, opCornersRaw),
    opEdges: parsed("op-edges.UR.json", OpSetupsDatasetSchema, opEdgesRaw),
    opParity: parsed("op-parity.UBL-UR.json", OpParityDatasetSchema, opParityRaw),
    m2Edges: parsed("m2-edges.DF.json", M2DatasetSchema, m2EdgesRaw),
  };
  return cache;
}
