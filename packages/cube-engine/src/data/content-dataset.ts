import * as z from "zod";
import { AlgDatasetSchema } from "./alg-dataset.js";
import { M2DatasetSchema, M2OpParityDatasetSchema } from "./m2-dataset.js";
import { OpParityDatasetSchema, OpSetupsDatasetSchema } from "./op-dataset.js";

/**
 * Every dataset kind under `content/algs/`: 3-style cycles, twists and flips (D-023); setups for OP
 * (D-024) and M2 (D-025); parity for OP/OP and M2/OP. Setups and parity datasets are told apart by
 * `method`.
 */
export const ContentDatasetSchema = z.discriminatedUnion("kind", [
  AlgDatasetSchema,
  z.discriminatedUnion("method", [OpSetupsDatasetSchema, M2DatasetSchema]),
  z.discriminatedUnion("method", [OpParityDatasetSchema, M2OpParityDatasetSchema]),
]);

export type ContentDataset = z.infer<typeof ContentDatasetSchema>;
