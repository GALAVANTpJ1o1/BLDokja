/**
 * Recognisable display states for the navigation cube. They start from a solved 3×3 and are
 * independently round-trip tested in navigation-patterns.test.ts before use in the renderer.
 * Sources: Speedcube Australia (checkerboard / superflip) and CubeMastery (cube in a cube),
 * both checked 2026-09-17. The engine test is the shipping authority for the notation.
 */
export const navigationPatterns = [
  { id: "solved", alg: "", order: 1 },
  { id: "checkerboard", alg: "M2' E2' S2'", order: 2 },
  { id: "cube-in-a-cube", alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U", order: 3 },
  { id: "superflip", alg: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2", order: 2 },
] as const;

export type NavigationPattern = (typeof navigationPatterns)[number];
