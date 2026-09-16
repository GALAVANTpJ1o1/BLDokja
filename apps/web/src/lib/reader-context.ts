"use client";

import type { BufferPair } from "@bld/cube-engine";
import { createContext } from "react";

/**
 * The parts of the reader a page can use without loading the cube engine: the standard buffers and the
 * overrides context. Lesson pages read these on first paint; the reader itself (reader.ts) comes later.
 */

export type Method = "op" | "m2" | "threeStyle";

export const GATE_B_BUFFERS = {
  op: { corners: "UBL", edges: "UR" },
  m2: { corners: "UBL", edges: "DF" },
  threeStyle: { corners: "UFR", edges: "UF" },
} as const satisfies Record<Method, BufferPair>;

/**
 * What a part of the page reads instead of your settings. Lessons use it: their prose teaches the
 * standard buffers' swap spots and setup rules, and the Speffz lesson teaches Speffz (docs/OVERNIGHT.md).
 */
export interface ReaderOverrides {
  readonly lettering?: "speffz";
  readonly buffers?: "standard";
}

export const ReaderOverridesContext = createContext<ReaderOverrides>({});
