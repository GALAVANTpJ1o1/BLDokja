"use client";

import dynamic from "next/dynamic";
import { TrainerLoading } from "@/components/trainer/trainer-header";
import { en } from "@/i18n/en";

/** Reads local preferences as it starts, so it only renders in the browser. */
export const FourBldTrainerLoader = dynamic(() => import("./four-bld-trainer").then((m) => m.FourBldTrainer), {
  ssr: false,
  // The default drill traces x-centres, so the header links to that lesson, as the trainer will once it loads.
  loading: () => <TrainerLoading title={en.fourBld.title} intro={en.fourBld.intro} lesson={{ href: "/learn/4x4-lettering/", title: en.fourBld.lessons.trace }} message={en.fourBld.loading} />,
});
