"use client";

import { createContext } from "react";
import type { CheckpointSpec } from "@/content/lessons/schema";

/** The lesson a component sits in: its id and checkpoint rules, from frontmatter. */
export const LessonMetaContext = createContext<{ readonly lessonId: string; readonly checkpoints: readonly CheckpointSpec[] } | undefined>(undefined);
