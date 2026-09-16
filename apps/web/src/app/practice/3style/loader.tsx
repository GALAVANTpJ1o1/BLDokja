"use client";

import dynamic from "next/dynamic";
import { TrainerLoading } from "@/components/trainer/trainer-header";
import { en } from "@/i18n/en";

/** Reads your settings and history as it starts, so it only renders in the browser. */
export const ThreeStyleLoader = dynamic(() => import("./three-style-trainer").then((m) => m.ThreeStyleTrainer), {
  ssr: false,
  // Corners is the default, so the header links to that lesson, as the trainer will once it loads.
  loading: () => <TrainerLoading title={en.threeStyle.title} intro={en.threeStyle.intro} lesson={{ href: "/learn/three-style-corners/", title: en.threeStyle.lessonTitle }} message={en.threeStyle.building} />,
});
