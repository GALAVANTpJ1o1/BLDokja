import { z } from "../core/zod.js";
import { AlgDatasetSchema } from "./alg-dataset.js";
import { OpCornerParityDatasetSchema } from "./four-bld-parity.js";
import { SwapDatasetSchema, SwapParityDatasetSchema, M2OpParityDatasetSchema } from "./swap-dataset.js";
import { OpParityDatasetSchema, OpSetupsDatasetSchema } from "./op-dataset.js";
import { M2ThreeStyleParityDatasetSchema, ThreeStyleParityDatasetSchema } from "./three-style-parity.js";
import { LastLayerDatasetSchema } from "./last-layer.js";

/**
 * Every dataset kind under `content/algs/` (4BLD's swap parity and 4x4 corner parity too, D-039 and D-041): 3-style cycles, twists and flips (D-023); setups for OP
 * (D-024) and M2 (D-025); parity for OP/OP, M2/OP (D-024, D-025), 3-style and M2 with 3-style corners (D-026). Setups and parity datasets are told apart by
 * `method`.
 */
export const ContentDatasetSchema = z.discriminatedUnion("kind", [
  AlgDatasetSchema,
  z.discriminatedUnion("method", [OpSetupsDatasetSchema, SwapDatasetSchema]),
  z.discriminatedUnion("method", [OpParityDatasetSchema, M2OpParityDatasetSchema, ThreeStyleParityDatasetSchema, M2ThreeStyleParityDatasetSchema]),
  SwapParityDatasetSchema,
  OpCornerParityDatasetSchema,
  LastLayerDatasetSchema,
]);

export type ContentDataset = z.infer<typeof ContentDatasetSchema>;
