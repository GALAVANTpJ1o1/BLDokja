"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** Reads your settings and history as it starts, so it only renders in the browser. */
export const ThreeStyleLoader = dynamic(() => import("./three-style-trainer").then((m) => m.ThreeStyleTrainer), {
  ssr: false,
  loading: () => <p className="t-meta text-quiet">{en.threeStyle.building}</p>,
});
