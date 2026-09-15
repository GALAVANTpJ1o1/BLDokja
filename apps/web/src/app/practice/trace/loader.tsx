"use client";

import dynamic from "next/dynamic";
import { en } from "@/i18n/en";

/** The trainer reads the URL and local preferences as it starts, so it only renders in the browser. */
export const TraceTrainerLoader = dynamic(() => import("./trace-trainer").then((m) => m.TraceTrainer), {
  ssr: false,
  loading: () => <p className="t-meta text-quiet">{en.trainer.loading}</p>,
});
