import type { ComponentType } from "react";
import { Checkpoint, Option, Question } from "./checkpoint";
import { CommCase, CommParts, M2Shot, M2Tempting, SolveMistake } from "./extra-demos";
import { FourExplorer, FourLetter, FourParity, FourShot, FourSolve, FourTrace } from "./four-bld-demos";
import { Buffer, Letter, Moves, Note } from "./inline";
import { LessonCube } from "./lesson-cube";
import type { MdxComponentName } from "./mdx-component-names";
import { MoveExplorer } from "./move-explorer";
import { IllegalSetup, OpShot, ParityAlg, SwapAlg } from "./op-demos";
import { SolveWalkthrough } from "./solve-walkthrough";
import { SpeffzExplorer } from "./speffz-explorer";
import { TraceWalk } from "./trace-walk";

/** Every component a lesson file may use, by the name it's written with (the names list is checked against this by the type). */
export const MDX_COMPONENTS = {
  Buffer,
  Checkpoint,
  CommCase,
  CommParts,
  Cube: LessonCube,
  FourExplorer,
  FourLetter,
  FourParity,
  FourShot,
  FourSolve,
  FourTrace,
  IllegalSetup,
  Letter,
  M2Shot,
  M2Tempting,
  Moves,
  MoveExplorer,
  Note,
  OpShot,
  Option,
  ParityAlg,
  Question,
  SolveMistake,
  SolveWalkthrough,
  SpeffzExplorer,
  SwapAlg,
  TraceWalk,
} satisfies Record<MdxComponentName, ComponentType<never>>;
