"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** Reads local preferences as it starts, so it only renders in the browser. */
export const M2OpTrainerLoader = dynamic(() => import("./m2op-trainer").then((m) => m.M2OpTrainer), {
  ssr: false,
  loading: () => <p className="t-meta text-quiet">{en.trainer.loading}</p>,
});
