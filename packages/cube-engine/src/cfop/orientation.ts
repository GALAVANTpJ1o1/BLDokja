/**
 * Orientation profiles (polish brief §3-7). Three things stay separate everywhere in the site:
 *
 *   case state  is not  display orientation  is not  algorithm
 *
 * The case state is a physical cube pattern in the engine's one frame (last layer on U, cross on D, front F). The
 * algorithm is a sequence written for a stated hold. What a *profile* decides is only which colour each face shows,
 * so the learner sees the cube the way that method is taught, and an algorithm is never rewritten to fit a view.
 *
 *  - BLD:  white U, yellow D, green F, red R. Fixed, because lettering, tracing and memo all depend on it.
 *  - CFOP: yellow U, white D (the cross), green F, orange R: the standard scheme turned over (z2).
 *  - OH:   the same colours as CFOP; what differs is the algorithm (dedicated one-handed variants), not the picture.
 *  - FREE: the standard scheme, for pages that let the reader pick their own hold.
 */
export const ORIENTATION_PROFILES = ["BLD", "CFOP", "OH", "FREE"] as const;
export type OrientationProfile = (typeof ORIENTATION_PROFILES)[number];
export type FaceLetter = "U" | "D" | "F" | "B" | "R" | "L";

/** For each engine face, the face whose colour it shows under a profile. */
export function profileColours(profile: OrientationProfile): Readonly<Record<FaceLetter, FaceLetter>> {
  if (profile === "CFOP" || profile === "OH") return { U: "D", D: "U", F: "F", B: "B", R: "L", L: "R" };
  return { U: "U", D: "D", F: "F", B: "B", R: "R", L: "L" };
}

/** The profile a lesson track is taught in. */
export function profileForTrack(track: string): OrientationProfile {
  if (track === "cfop") return "CFOP";
  if (track === "oh") return "OH";
  return "BLD";
}
