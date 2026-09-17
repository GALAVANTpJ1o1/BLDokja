"use client";

import { expandNodes, formatMoves, invertNodes, parseAlg } from "@bld/cube-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { en } from "@/i18n/en";
import { Cube } from "./cube";
import { navigationPatterns } from "./navigation-patterns";

function inverse(alg: string): string {
  const parsed = parseAlg("3x3x3", alg);
  return parsed.ok ? formatMoves(expandNodes(invertNodes(parsed.value.nodes))) : "";
}

/** A small real cube state for section changes: every route is inverse(current) then the next legal pattern. */
export function NavigationCube({ signal }: { signal: string }) {
  const target = useMemo(() => navigationPatterns[Math.abs(Array.from(signal).reduce((sum, letter) => sum + letter.charCodeAt(0), 0)) % navigationPatterns.length]?.alg ?? "", [signal]);
  const logical = useRef("");
  const [presentation, setPresentation] = useState({ setup: "", alg: "" });
  const firstRoute = useRef(true);
  const transition = useCallback((next: string) => {
    const previous = logical.current;
    setPresentation({ setup: previous, alg: `${inverse(previous)} ${next}`.trim() });
    logical.current = next;
  }, []);
  useEffect(() => { if (firstRoute.current) { firstRoute.current = false; return; } transition(target); }, [target, transition]);
  const advance = () => {
    const index = navigationPatterns.findIndex((pattern) => pattern.alg === logical.current);
    transition(navigationPatterns[(index + 1) % navigationPatterns.length]?.alg ?? "");
  };
  return <button type="button" className="nav-cube" aria-label={en.nav.cubeHint} onClick={advance}>
    <Cube eager force3D setup={presentation.setup} alg={presentation.alg} autoplay label={en.nav.cube} />
  </button>;
}
