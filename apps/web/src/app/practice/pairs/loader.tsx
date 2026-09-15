"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** Reads local preferences and your library as it starts, so it only renders in the browser. */
export const PairsLibraryLoader = dynamic(() => import("./pairs-library").then((m) => m.PairsLibrary), {
  ssr: false,
  loading: () => <p className="t-meta text-quiet">{en.pairs.loading}</p>,
});
