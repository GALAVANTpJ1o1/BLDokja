"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** Reads your settings and a shared preset from the address as it starts, so it only renders in the browser. */
export const DifficultyLoader = dynamic(() => import("./difficulty-editor").then((m) => m.DifficultyEditor), {
  ssr: false,
  loading: () => <p className="t-meta text-quiet">{en.cube.loading}</p>,
});
