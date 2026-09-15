"use client";

import dynamic from "next/dynamic";
import { TrainerLoading } from "@/components/trainer/trainer-header";
import { en } from "@/i18n/en";

/** The trainer reads the URL and local preferences as it starts, so it only renders in the browser. */
export const TraceTrainerLoader = dynamic(() => import("./trace-trainer").then((m) => m.TraceTrainer), {
  ssr: false,
  loading: () => <TrainerLoading title={en.trace.title} intro={en.trace.intro} lesson={{ href: "/learn/tracing-a-cycle/", title: en.trace.lessonTitle }} message={en.trainer.loading} />,
});
