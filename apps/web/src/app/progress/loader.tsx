"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** Reads the event log in the browser, so it only renders there. */
export const ProgressLoader = dynamic(() => import("./progress-view").then((m) => m.ProgressView), {
  ssr: false,
  loading: () => <p className="t-meta text-quiet">{en.cube.loading}</p>,
});
