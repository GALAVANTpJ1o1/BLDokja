"use client";

import dynamic from "next/dynamic";
import { TrainerLoading } from "@/components/trainer/trainer-header";
import { en } from "@/i18n/en";

/** Reads your settings and history as it starts, so it only renders in the browser. */
export const ThreeStyleLoader = dynamic(() => import("./three-style-trainer").then((m) => m.ThreeStyleTrainer), {
  ssr: false,
  loading: () => <TrainerLoading title={en.threeStyle.title} intro={en.threeStyle.intro} message={en.threeStyle.building} />,
});
