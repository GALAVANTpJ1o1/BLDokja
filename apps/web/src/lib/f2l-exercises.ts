import { cfopData } from "@/content/cfop";
import { cfop } from "@/i18n/cfop";
import { f2lClue } from "./cfop-text";

/**
 * The three guided F2L exercises (polish brief §18-19), in increasing difficulty. Each is a start state made by running a
 * known solution backwards from a solved cube, so the state is legal by construction and the reference solution is exact.
 * Nothing about a state is assembled sticker by sticker.
 *
 *   1  the pair is already joined         pair → insert            "R U R'" run backwards, solution "R U' R'"
 *   2  the pieces are apart on top        set up → pair → insert   F2L case 20 from the verified set
 *   3  the corner is stuck in the slot    extract → set up → pair → insert   F2L case 16 from the verified set
 */
export interface Exercise {
  readonly n: 1 | 2 | 3;
  readonly setup: string;
  readonly reference: string;
  readonly referenceMoves: number;
  readonly family: string;
  readonly hints: readonly string[];
  readonly idea: string;
}

/** The inverse of a plain sequence of face turns (letters with ' or 2). Only used for the sequences above. */
export function invertSimple(alg: string): string {
  return alg.trim().split(/\s+/).filter((m) => m !== "").reverse().map((m) => (m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`)).join(" ");
}

const FIXED_ONE = { setup: "R U R'", reference: "R U' R'" } as const;

export function exercise(n: 1 | 2 | 3): Exercise {
  const first = (alg: string) => alg.split(/\s+/)[0] ?? "";
  if (n === 1) {
    return {
      n, setup: FIXED_ONE.setup, reference: FIXED_ONE.reference, referenceMoves: 3, family: "both-top",
      hints: [cfop.exercises.hint1(cfop.exercises.joined), cfop.exercises.hint2["both-top"] ?? "", cfop.exercises.hint3(first(FIXED_ONE.reference))],
      idea: cfop.exercises.idea[1]?.(FIXED_ONE.reference.split(" ")) ?? "",
    };
  }
  const caseNumber = n === 2 ? 20 : 16;
  const kase = cfopData().f2l.cases.find((c) => c.number === caseNumber);
  if (kase === undefined) throw new Error(`F2L exercise ${n}: case ${caseNumber} missing`);
  const reference = kase.algs["2H"].alg;
  return {
    n, setup: invertSimple(reference), reference, referenceMoves: kase.algs["2H"].moves, family: kase.family,
    hints: [cfop.exercises.hint1(f2lClue(kase)), cfop.exercises.hint2[kase.family] ?? "", cfop.exercises.hint3(first(reference))],
    idea: cfop.exercises.idea[n]?.(reference.split(" ")) ?? "",
  };
}

export const EXERCISES = [1, 2, 3] as const;
