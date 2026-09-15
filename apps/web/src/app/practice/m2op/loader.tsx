"use client";

import dynamic from "next/dynamic";
import { TrainerLoading } from "@/components/trainer/trainer-header";
import { en } from "@/i18n/en";

/** Reads local preferences as it starts, so it only renders in the browser. */
export const M2OpTrainerLoader = dynamic(() => import("./m2op-trainer").then((m) => m.M2OpTrainer), {
  ssr: false,
  loading: () => <TrainerLoading title={en.m2op.title} intro={en.m2op.intro} lesson={{ href: "/learn/op-corners/", title: en.m2op.lessonTitle }} message={en.trainer.loading} />,
});
