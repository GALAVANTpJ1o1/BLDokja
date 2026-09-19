/**
 * The owner-supplied algorithm tables, transcribed from the screenshots in the polishing brief
 * ("BLDokja — First Major Polishing Pass"): 2-look OLL, 2-look PLL, full OLL and full PLL for two-handed
 * solving (2H), and full OLL and full PLL variants for one-handed solving (OH). These are the source of
 * truth for the curated datasets (DECISIONS D-080); `build-cfop-curated.ts` verifies every line against
 * the engine before it writes anything, so a transcription slip fails the build instead of shipping.
 *
 * The group label on each OLL row is the one printed beside it in the screenshot.
 */
export const EO_2LOOK = [
  { key: "dot", name: "Dot", alg: "F R U R' U' F' f R U R' U' f'" },
  { key: "line", name: "Line", alg: "F R U R' U' F'" },
  { key: "l-shape", name: "L-shape", alg: "f R U R' U' f'" },
] as const;

export const CO_2LOOK = [
  { key: "antisune", name: "Anti-Sune", alg: "R U2 R' U' R U' R'" },
  { key: "h", name: "H", alg: "R U R' U R U' R' U R U2 R'" },
  { key: "l", name: "L", alg: "F R' F' r U R U' r'" },
  { key: "pi", name: "Pi", alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { key: "sune", name: "Sune", alg: "R U R' U R U2 R'" },
  { key: "t", name: "T", alg: "r U R' U' r' F R F'" },
  { key: "u", name: "U", alg: "R2 D R' U2 R D' R' U2 R'" },
] as const;

export const CP_2LOOK = [
  { key: "diagonal", name: "Diagonal", alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { key: "headlights", name: "Headlights", alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
] as const;

export const EP_2LOOK = [
  { key: "h", name: "H", alg: "M2 U M2 U2 M2 U M2" },
  { key: "ua", name: "Ua", alg: "R U' R U R U R U' R' U' R2" },
  { key: "ub", name: "Ub", alg: "R2 U R U R' U' R' U' R' U R'" },
  { key: "z", name: "Z", alg: "M' U M2 U M2 U M' U2 M2" },
] as const;

export type OllGroup =
  | "Dot" | "Square Shape" | "Small Lightning Bolt" | "Fish Shape" | "Knight Move Shape" | "Cross" | "Corners Oriented"
  | "Awkward Shape" | "P Shape" | "T Shape" | "C Shape" | "W Shape" | "Big Lightning Bolt" | "Small L Shape" | "I Shape";

/** [number, group, 2H alg, OH alg, or undefined when the source has no one-handed row]. */
export const OLL: readonly (readonly [number, OllGroup, string, string | undefined])[] = [
  [1, "Dot", "R U2 R2 F R F' U2 R' F R F'", "R U2 R2 F R F' U2 R' F R F'"],
  [2, "Dot", "r U r' U2 r U2 R' U2 R U' r'", "r U r' U2 r U2 R' U2 R U' r'"],
  [3, "Dot", "r' R2 U R' U r U2 r' U M'", "r' R2 U R' U r U2 r' U R' r"],
  [4, "Dot", "M U' r U2 r' U' R U' R' M'", "r' R U' r U2 r' U' R U' R2 r"],
  [5, "Square Shape", "l' U2 L U L' U l", "r' U2 R U R' U r"],
  [6, "Square Shape", "r U2 R' U' R U' r'", "r U2 R' U' R U' r'"],
  [7, "Small Lightning Bolt", "r U R' U R U2 r'", "r U R' U R U2 r'"],
  [8, "Small Lightning Bolt", "l' U' L U' L' U2 l", "r' U' R U' R' U2 r"],
  [9, "Fish Shape", "R U R' U' R' F R2 U R' U' F'", "R U R' U' R' F R2 U R' U' F'"],
  [10, "Fish Shape", "R U R' U R' F R F' R U2 R'", "r U R' U R U' R' U' r' R U R U' R'"],
  [11, "Small Lightning Bolt", "r U R' U R' F R F' R U2 r'", "r' R2 U R' U R U2 R' U R' r"],
  [12, "Small Lightning Bolt", "M' R' U' R U' R' U2 R U' R r'", "r R2 U' R U' R' U2 R U' r' R"],
  [13, "Knight Move Shape", "F U R U' R2 F' R U R U' R'", "F U R U' R2 F' R U R U' R'"],
  [14, "Knight Move Shape", "R' F R U R' F' R F U' F'", "R' F R U R' F' R y' R U' R'"],
  [15, "Knight Move Shape", "l' U' l L' U' L U l' U l", "r' U' R' r U' R U r' U r"],
  [16, "Knight Move Shape", "r U r' R U R' U' r U' r'", "r U r' R U R' U' r U' r'"],
  [17, "Dot", "F R' F' R2 r' U R U' R' U' M'", "F R' F' R2 r' U R U' R' U' R' r"],
  [18, "Dot", "r U R' U R U2 r2 U' R U' R' U2 r", "r U R' U R U2 r2 U' R U' R' U2 r"],
  [19, "Dot", "r' R U R U R' U' M' R' F R F'", "r U2 R' U' R U' r2 U2 R U R' U r"],
  [20, "Dot", "r U R' U' M2 U R U' R' U' M'", "r U R' U' r2 R2 U R U' R' U' R' r"],
  [21, "Cross", "R U2 R' U' R U R' U' R U' R'", "R U2 R' U' R U R' U' R U' R'"],
  [22, "Cross", "R U2 R2 U' R2 U' R2 U2 R", "R U2 R2 U' R2 U' R2 U2 R"],
  [23, "Cross", "R2 D' R U2 R' D R U2 R", "R U R' U R U2 R2 U' R U' R' U2 R"],
  [24, "Cross", "r U R' U' r' F R F'", "r U R' U' r' F R F'"],
  [25, "Cross", "F' r U R' U' r' F R", "F R' F' r U R U' r'"],
  [26, "Cross", "R U2 R' U' R U' R'", "R U2 R' U' R U' R'"],
  [27, "Cross", "R U R' U R U2 R'", "R U R' U R U2 R'"],
  [28, "Corners Oriented", "r U R' U' r' R U R U' R'", "r U R' U' r' R U R U' R'"],
  [29, "Awkward Shape", "R U R' U' R U' R' F' U' F R U R'", "R U R' U' R U' R' F' U' F R U R'"],
  [30, "Awkward Shape", "F R' F R2 U' R' U' R U R' F2", "F U R U2 R' U' R U2 R' U' F'"],
  [31, "P Shape", "R' U' F U R U' R' F' R", "R' U' F U R U' R' F' R"],
  [32, "P Shape", "L U F' U' L' U L F L'", "L U F' U' L' U L F L'"],
  [33, "T Shape", "R U R' U' R' F R F'", "R U R' U' R' F R F'"],
  [34, "C Shape", "R U R2 U' R' F R U R U' F'", "R U R2 U' R' F R U R U' F'"],
  [35, "Fish Shape", "R U2 R2 F R F' R U2 R'", "R U2 R2 F R F' R U2 R'"],
  [36, "W Shape", "L' U' L U' L' U L U L F' L' F", "R' U' R U' R' U R U x' R U' R' U"],
  [37, "Fish Shape", "F R' F' R U R U' R'", "F R U' R' U' R U R' F'"],
  [38, "W Shape", "R U R' U R U' R' U' R' F R F'", "R U R' U R U' R' U' R' F R F'"],
  [39, "Big Lightning Bolt", "L F' L' U' L U F U' L'", "r U' r' U' r y R U R' f'"],
  [40, "Big Lightning Bolt", "R' F R U R' U' F' U R", "R' F R U R' U' F' U R"],
  [41, "Awkward Shape", "R U R' U R U2 R' F R U R' U' F'", "R U R' U R U2 R' F R U R' U' F'"],
  [42, "Awkward Shape", "R' U' R U' R' U2 R F R U R' U' F'", "R' U' R U' R' U2 R F R U R' U' F'"],
  [43, "P Shape", "F' U' L' U L F", "F' U' L' U L F"],
  [44, "P Shape", "F U R U' R' F'", "F U R U' R' F'"],
  [45, "T Shape", "F R U R' U' F'", "F R U R' U' F'"],
  [46, "C Shape", "R' U' R' F R F' U R", "R' U' R' F R F' U R"],
  [47, "Small L Shape", "R' U' R' F R F' R' F R F' U R", "R' U' x R' U R U' R' U R U' x' U R"],
  [48, "Small L Shape", "F R U R' U' R U R' U' F'", "F R U R' U' R U R' U' F'"],
  [49, "Small L Shape", "r U' r2 U r2 U r2 U' r", "R x' U' z u2 R u2 R u2 R' u"],
  [50, "Small L Shape", "r' U r2 U' r2 U' r2 U r'", "r' U r2 U' r2 U' r2 U r'"],
  [51, "I Shape", "F U R U' R' U R U' R' F'", "F U R U' R' U R U' R' F'"],
  [52, "I Shape", "R U R' U R U' B U' B' R'", "R U R' U R U' y R U' R' F'"],
  [53, "Small L Shape", "l' U2 L U L' U' L U L' U l", "r' U2 R U R' U' R U R' U r"],
  [54, "Small L Shape", "r U2 R' U' R U R' U' R U' r'", "r U2 R' U' R U R' U' R U' r'"],
  [55, "I Shape", "R' F R U R U' R2 F' R2 U' R' U R U R'", "R U2 R2 U' R U' R' U2 F R F'"],
  [56, "I Shape", "r' U' r U' R' U R U' R' U R r' U r", "r U r' U R U' R' U R U' R' r U' r'"],
  [57, "Corners Oriented", "R U R' U' M' U R U' r'", "R U R' U' R' r U R U' r'"],
];

export type PllGroup = "Adjacent Corner Swap" | "Diagonal Corner Swap" | "Edges Only";

/** [name, group, 2H alg, OH alg]. */
export const PLL: readonly (readonly [string, PllGroup, string, string])[] = [
  ["Aa", "Adjacent Corner Swap", "x L2 D2 L' U' L D2 L' U L'", "x R' U R' D2 R U' R' D2 R2"],
  ["Ab", "Adjacent Corner Swap", "x' L2 D2 L U L' D2 L U' L", "x R2 D2 R U R' D2 R U' R"],
  ["F", "Adjacent Corner Swap", "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R", "R U R' U' R' U R U2 R' L' U R U' L U' R U' R'"],
  ["Ga", "Adjacent Corner Swap", "R2 U R' U R' U' R U' R2 U' D R' U R D'", "R2 U R' U R' U' R U' R2 U' D R' U R D'"],
  ["Gb", "Adjacent Corner Swap", "R' U' R U D' R2 U R' U R U' R U' R2 D", "R' U' R U D' R2 U R' U R U' R U' R2 D"],
  ["Gc", "Adjacent Corner Swap", "R2 U' R U' R U R' U R2 U D' R U' R' D", "R2 U' R U' R U R' U R2 U D' R U' R' D"],
  ["Gd", "Adjacent Corner Swap", "R U R' U' D R2 U' R U' R' U R' U R2 D'", "R U R' U' D R2 U' R U' R' U R' U R2 D'"],
  ["Ja", "Adjacent Corner Swap", "x R2 F R F' R U2 r' U r U2", "R' U2 R U R' U2 L U' R U L'"],
  ["Jb", "Adjacent Corner Swap", "R U R' F' R U R' U' R' F R2 U' R'", "R U2 R' U' R U2 L' U R' U' r"],
  ["Ra", "Adjacent Corner Swap", "R U' R' U' R U R D R' U' R D' R' U2 R'", "R U' R' U' R U R D R' U' R D' R' U2 R'"],
  ["Rb", "Adjacent Corner Swap", "R2 F R U R U' R' F' R U2 R' U2 R", "R' U2 R' D' R U' R' D R U R U' R' U' R"],
  ["T", "Adjacent Corner Swap", "R U R' U' R' F R2 U' R' U' R U R' F'", "R U R' U' R' F R2 U' R' U' R U R' F'"],
  ["E", "Diagonal Corner Swap", "x' L' U L D' L' U' L D L' U' L D' L' U L D", "x' R U' R' D R U R' D' R U R' D R U' R' D'"],
  ["Na", "Diagonal Corner Swap", "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'", "R U R' U R U2 R' U' R U2 L' U R' U' L U' R U' R'"],
  ["Nb", "Diagonal Corner Swap", "R' U R U' R' F' U' F R U R' F R' F' R U' R", "R' U' R U' R' U2 R U R' U2 L U' R U L' U R' U R"],
  ["V", "Diagonal Corner Swap", "R' U R' U' y R' F' R2 U' R' U R' F R F", "R' U R U' x' U R U2 R' U' R U' R' U2 R U R' U'"],
  ["Y", "Diagonal Corner Swap", "F R U' R' U' R U R' F' R U R' U' R' F R F'", "R2 U' R' U R U' x' U' z' U' R U' R' U' r B"],
  ["H", "Edges Only", "M2 U M2 U2 M2 U M2", "R2 U2 R U2 R2 U2 R2 U2 R U2 R2"],
  ["Ua", "Edges Only", "M2 U M U2 M' U M2", "R U' R U R U R U' R' U' R2"],
  ["Ub", "Edges Only", "M2 U' M U2 M' U' M2", "L' U L' U' L' U' L' U L U L2"],
  ["Z", "Edges Only", "M' U M2 U M2 U M' U2 M2", "R' U' R U' R U R U' R' U R U R2 U' R'"],
];
