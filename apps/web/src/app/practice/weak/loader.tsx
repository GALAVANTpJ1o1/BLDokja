"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** Builds its deck from the event log in the browser, so it only renders there. */
export const WeakLoader = dynamic(() => import("./weak-drill").then((m) => m.WeakDrill), {
  ssr: false,
  loading: () => <p className="t-meta text-quiet">{en.cube.loading}</p>,
});
