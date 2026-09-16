"use client";

import { useEffect, useState } from "react";
import type { Reader } from "./reader";
import type { Built, M2Data, OpData, ThreeStyleData } from "./method-data";
import { checkedWorkerResult, MethodRequestSchema } from "./method-worker-protocol";
export type { Built, M2Data, OpData, ThreeStyleData } from "./method-data";
export const m2opData = "m2op";
export const threeStyleForReader = "threeStyle";
interface MethodsByKind { m2op: { op: OpData; m2: M2Data }; threeStyle: ThreeStyleData }
const workerCache = new Map<string, Built<unknown>>();

/** All dataset parsing and system searches stay in disposable workers. */
export function useMethodData<K extends keyof MethodsByKind>(reader: Reader | undefined, kind: K): Built<MethodsByKind[K]> | undefined {
  type Data = MethodsByKind[K];
  const [result, setResult] = useState<{ key: string; built: Built<Data> } | undefined>();
  const puzzle = reader?.puzzle;
  const bufferKey = reader === undefined ? "" : JSON.stringify(reader.buffers);
  const key = `${kind}:${bufferKey}`;
  useEffect(() => {
    if (puzzle === undefined || bufferKey === "") return;
    const buffers = MethodRequestSchema.shape.buffers.parse(JSON.parse(bufferKey));
    const cached = workerCache.get(key);
    if (cached !== undefined) {
      const timer = window.setTimeout(() => { setResult({ key, built: cached as Built<Data> }); }, 0);
      return () => { window.clearTimeout(timer); };
    }
    if (typeof Worker === "undefined") {
      const timer = window.setTimeout(() => { setResult({ key, built: { ok: false, reason: "workers-unavailable" } }); }, 0);
      return () => { window.clearTimeout(timer); };
    }
    const worker = new Worker("/workers/methods.js", { type: "module" });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      setResult({ key, built: { ok: false, reason: "worker-timeout" } });
    }, 180_000);
    worker.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeout);
      const checked = checkedWorkerResult(kind, event.data);
      if (checked.ok) workerCache.set(key, checked);
      setResult({ key, built: checked as Built<Data> });
      worker.terminate();
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      setResult({ key, built: { ok: false, reason: "worker-failed" } });
      worker.terminate();
    };
    worker.postMessage({ kind, buffers });
    return () => { window.clearTimeout(timeout); worker.terminate(); };
  }, [puzzle, bufferKey, kind, key]);
  return result?.key === key ? result.built : undefined;
}
