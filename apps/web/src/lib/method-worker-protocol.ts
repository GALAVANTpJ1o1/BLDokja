import { AlgDatasetSchema, M2OpParityDatasetSchema, OpParityDatasetSchema, OpSetupsDatasetSchema, SwapDatasetSchema } from "@bld/cube-engine";
import { z } from "./zod";
import type { Built } from "./method-data";
const pair = z.object({ corners: z.string().min(2).max(3), edges: z.string().length(2) }).strict();
export const MethodRequestSchema = z.object({ kind: z.enum(["m2op", "threeStyle"]), buffers: z.object({ op: pair, m2: pair, threeStyle: pair }).strict() }).strict();
const op = z.object({ corners: OpSetupsDatasetSchema, edges: OpSetupsDatasetSchema, parity: OpParityDatasetSchema });
const m2 = z.object({ corners: OpSetupsDatasetSchema, edges: SwapDatasetSchema, parity: M2OpParityDatasetSchema });
const schemas = { m2op: z.object({ op, m2 }), threeStyle: z.object({ corners: AlgDatasetSchema, edges: AlgDatasetSchema }) };
export function checkedWorkerResult(kind: "m2op" | "threeStyle", input: unknown): Built<unknown> {
  const envelope = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), value: z.unknown() }).strict(), z.object({ ok: z.literal(false), reason: z.string() }).strict()]).safeParse(input);
  if (!envelope.success) return { ok: false, reason: "invalid-worker-message" };
  if (!envelope.data.ok) return envelope.data;
  const parsed = schemas[kind].safeParse(envelope.data.value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "invalid-worker-data" };
}
