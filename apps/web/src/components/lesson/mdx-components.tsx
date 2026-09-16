import type { ComponentType } from "react";
import { Moves, Note } from "./inline-static";
import type { MdxComponentName } from "./mdx-component-names";
import {
  Buffer,
  Checkpoint,
  CommCase,
  CommParts,
  Cube,
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
  MoveExplorer,
  OpShot,
  Option,
  ParityAlg,
  Question,
  SolveMistake,
  SolveWalkthrough,
  SpeffzExplorer,
  SwapAlg,
  TraceWalk,
} from "./mdx-lazy";

/**
 * Every component a lesson file may use, by the name it's written with (the names list is checked against
 * this by the type). Interactive components load lazily (mdx-lazy.tsx); the two that only format text are
 * plain server components.
 */
export const MDX_COMPONENTS = {
  Buffer,
  Checkpoint,
  CommCase,
  CommParts,
  Cube,
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
