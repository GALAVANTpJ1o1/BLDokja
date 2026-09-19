/** The names lesson files may use (kept apart from the components so tests can read it without loading React or cubing.js). */
export const MDX_COMPONENT_NAMES = [
  "Buffer",
  "CaseCards",
  "Checkpoint",
  "CommCase",
  "CommParts",
  "Cube",
  "F2LReference",
  "FourExplorer",
  "FourLetter",
  "FourParity",
  "FourShot",
  "FourSolve",
  "FourTrace",
  "IllegalSetup",
  "Letter",
  "M2Shot",
  "M2Tempting",
  "Moves",
  "MoveExplorer",
  "Note",
  "OpShot",
  "Option",
  "ParityAlg",
  "PracticeLink",
  "Question",
  "SolveWalkthrough",
  "SolveMistake",
  "SpeffzExplorer",
  "SwapAlg",
  "TraceWalk",
] as const;

export type MdxComponentName = (typeof MDX_COMPONENT_NAMES)[number];

/** Components that put something the reader can turn, press or answer on the page (BRIEF §6: every lesson needs one). */
export const INTERACTIVE_COMPONENTS: readonly MdxComponentName[] = ["Cube", "MoveExplorer", "SpeffzExplorer", "TraceWalk", "OpShot", "IllegalSetup", "ParityAlg", "SolveWalkthrough", "Checkpoint", "CaseCards", "F2LReference", "FourExplorer", "FourTrace", "FourShot", "FourParity", "FourSolve", "M2Shot", "M2Tempting", "CommParts", "CommCase", "SolveMistake"];
