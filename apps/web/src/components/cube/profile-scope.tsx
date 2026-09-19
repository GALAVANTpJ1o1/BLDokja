"use client";

import { profileColours, type OrientationProfile } from "@bld/cube-engine/cfop-data";
import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { STICKER_PALETTES, type FaceName } from "@/design/palette";

/**
 * The orientation profile in force for the cubes on a page (polish brief §4-7). BLD keeps the standard scheme (white
 * top, green front) because lettering and tracing depend on it. CFOP and OH show yellow on top and a white cross on the
 * bottom. A profile changes only which colour each face shows: the case state and the algorithm are never touched.
 *
 * The colours are published as the `--face-*` properties on <html>, which the flat net, the diagrams and the 3D player
 * (which reads the same properties when it is created) all follow, so nothing else needs to know a profile exists.
 */
const ProfileContext = createContext<OrientationProfile>("BLD");

export function useCubeProfile(): OrientationProfile {
  return useContext(ProfileContext);
}

const FACES: readonly FaceName[] = ["U", "L", "F", "R", "B", "D"];

export function ProfileScope({ profile, children }: { profile: OrientationProfile; children: ReactNode }) {
  const { settings } = useSettings();
  const palette = settings.palette;
  useEffect(() => {
    if (profile === "BLD" || profile === "FREE") return;
    const root = document.documentElement;
    const shown = profileColours(profile);
    const colours = STICKER_PALETTES[palette];
    for (const face of FACES) root.style.setProperty(`--face-${face.toLowerCase()}`, colours[shown[face]]);
    root.dataset.cubeProfile = profile;
    return () => {
      for (const face of FACES) root.style.removeProperty(`--face-${face.toLowerCase()}`);
      delete root.dataset.cubeProfile;
    };
  }, [profile, palette]);
  // The wrapper carries the same colours so server-rendered cubes and diagrams are right from the first paint; the
  // <html> properties above are for the 3D player, which reads them there.
  const rotated = profile === "CFOP" || profile === "OH";
  const shown = profileColours(profile);
  const vars = Object.fromEntries(FACES.map((face) => [`--face-${face.toLowerCase()}`, STICKER_PALETTES[palette][shown[face]]])) as CSSProperties;
  return (
    <ProfileContext.Provider value={profile}>
      {rotated ? <div className="profile-scope" data-cube-profile={profile} style={vars}>{children}</div> : children}
    </ProfileContext.Provider>
  );
}
