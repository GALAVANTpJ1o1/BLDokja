"use client";

import dynamic from "next/dynamic";
import { TrainerLoading } from "@/components/trainer/trainer-header";
import { en } from "@/i18n/en";

/** Reads local preferences as it starts, so it only renders in the browser. */
export const FourBldTrainerLoader = dynamic(() => import("./four-bld-trainer").then((m) => m.FourBldTrainer), {
  ssr: false,
  loading: () => <TrainerLoading title={en.fourBld.title} intro={en.fourBld.intro} message={en.fourBld.loading} />,
});
