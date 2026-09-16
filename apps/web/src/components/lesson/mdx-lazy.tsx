"use client";

import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

/**
 * The lesson components, each loaded only when a lesson renders it (Phase 8 follow-up: mobile performance).
 *
 * A lesson's text is static HTML and paints at once, but every interactive component brings the cube engine,
 * the verified datasets and Zod. Imported directly, all of that was in the first-load scripts of every lesson
 * page, whether the lesson used a component or not. Through `React.lazy` the server still renders each
 * component in full, so the page's HTML is unchanged; in the browser the component's code is fetched during
 * hydration, and React keeps the server's HTML on screen until it arrives, so nothing shifts.
 */
function deferred<P extends object>(load: () => Promise<ComponentType<P>>): (props: P) => ReactNode {
  const Lazy = lazy(async () => ({ default: await load() }));
  function Deferred(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Deferred;
}

export const Buffer = deferred(() => import("./inline").then((m) => m.Buffer));
export const Checkpoint = deferred(() => import("./checkpoint").then((m) => m.Checkpoint));
export const CommCase = deferred(() => import("./extra-demos").then((m) => m.CommCase));
export const CommParts = deferred(() => import("./comm-parts").then((m) => m.CommParts));
export const Cube = deferred(() => import("./lesson-cube").then((m) => m.LessonCube));
export const FourExplorer = deferred(() => import("./four-bld-demos").then((m) => m.FourExplorer));
export const FourLetter = deferred(() => import("./four-bld-demos").then((m) => m.FourLetter));
export const FourParity = deferred(() => import("./four-bld-demos").then((m) => m.FourParity));
export const FourShot = deferred(() => import("./four-bld-demos").then((m) => m.FourShot));
export const FourSolve = deferred(() => import("./four-bld-demos").then((m) => m.FourSolve));
export const FourTrace = deferred(() => import("./four-bld-demos").then((m) => m.FourTrace));
export const IllegalSetup = deferred(() => import("./op-demos").then((m) => m.IllegalSetup));
export const Letter = deferred(() => import("./inline").then((m) => m.Letter));
export const M2Shot = deferred(() => import("./extra-demos").then((m) => m.M2Shot));
export const M2Tempting = deferred(() => import("./extra-demos").then((m) => m.M2Tempting));
export const MoveExplorer = deferred(() => import("./move-explorer").then((m) => m.MoveExplorer));
export const OpShot = deferred(() => import("./op-demos").then((m) => m.OpShot));
export const Option = deferred(() => import("./checkpoint").then((m) => m.Option));
export const ParityAlg = deferred(() => import("./op-demos").then((m) => m.ParityAlg));
export const Question = deferred(() => import("./checkpoint").then((m) => m.Question));
export const SolveMistake = deferred(() => import("./extra-demos").then((m) => m.SolveMistake));
export const SolveWalkthrough = deferred(() => import("./solve-walkthrough").then((m) => m.SolveWalkthrough));
export const SpeffzExplorer = deferred(() => import("./speffz-explorer").then((m) => m.SpeffzExplorer));
export const SwapAlg = deferred(() => import("./op-demos").then((m) => m.SwapAlg));
export const TraceWalk = deferred(() => import("./trace-walk").then((m) => m.TraceWalk));
