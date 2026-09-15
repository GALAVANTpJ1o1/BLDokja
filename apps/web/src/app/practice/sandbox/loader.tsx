"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** Reads your scratchpad from settings as it starts, so it only renders in the browser. */
export const SandboxLoader = dynamic(() => import("./comm-sandbox").then((m) => m.CommSandbox), {
  ssr: false,
  loading: () => <p className="t-meta text-quiet">{en.cube.loading}</p>,
});
