"use client";

import dynamic from "next/dynamic";
import { TrainerLoading } from "@/components/trainer/trainer-header";
import { en } from "@/i18n/en";

/** Builds its deck from the event log in the browser, so it only renders there. */
export const WeakLoader = dynamic(() => import("./weak-drill").then((m) => m.WeakDrill), {
  ssr: false,
  loading: () => <TrainerLoading title={en.weak.title} intro={en.weak.intro} message={en.cube.loading} />,
});
