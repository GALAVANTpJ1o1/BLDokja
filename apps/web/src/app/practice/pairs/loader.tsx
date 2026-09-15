"use client";

import dynamic from "next/dynamic";
import { TrainerLoading } from "@/components/trainer/trainer-header";
import { en } from "@/i18n/en";

/** Reads local preferences and your library as it starts, so it only renders in the browser. */
export const PairsLibraryLoader = dynamic(() => import("./pairs-library").then((m) => m.PairsLibrary), {
  ssr: false,
  loading: () => <TrainerLoading title={en.pairs.title} intro={en.pairs.intro} lesson={{ href: "/learn/letter-pairs/", title: en.pairs.lessonTitle }} message={en.pairs.loading} />,
});
