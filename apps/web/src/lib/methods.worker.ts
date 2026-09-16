import { loadPuzzle } from "@bld/cube-engine";
import { m2opData, threeStyleForReader } from "./method-data";
import { MethodRequestSchema } from "./method-worker-protocol";

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<unknown>) => void) | null; postMessage: (message: unknown) => void };
scope.onmessage = (event) => {
  const request = MethodRequestSchema.safeParse(event.data);
  if (!request.success) { scope.postMessage({ ok: false, reason: "invalid-request" }); return; }
  void loadPuzzle("3x3x3").then((puzzle) => {
    scope.postMessage(request.data.kind === "m2op" ? m2opData(puzzle, request.data.buffers) : threeStyleForReader(puzzle, request.data.buffers));
  }).catch(() => { scope.postMessage({ ok: false, reason: "build-failed" }); });
};
