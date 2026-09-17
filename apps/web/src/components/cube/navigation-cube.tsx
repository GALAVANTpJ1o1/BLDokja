"use client";

import { expandNodes, formatMoves, invertNodes, parseAlg } from "@bld/cube-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { en } from "@/i18n/en";
import { Cube } from "./cube";

const patterns = ["", "R U R' U'", "R2 U2 F2 D2", "M2 U M2 U2 M2 U M2"] as const;

function inverse(alg: string): string {
  const parsed = parseAlg("3x3x3", alg);
  return parsed.ok ? formatMoves(expandNodes(invertNodes(parsed.value.nodes))) : "";
}

/** A small real cube state for section changes: every route is inverse(current) then the next legal pattern. */
export function NavigationCube({ signal }: { signal: string }) {
  const target = useMemo(() => patterns[Math.abs([...signal].reduce((sum, letter) => sum + letter.charCodeAt(0), 0)) % patterns.length] ?? "", [signal]);
  const [logical, setLogical] = useState("");
  const [presentation, setPresentation] = useState({ setup: "", alg: "" });
  const firstRoute = useRef(true);
  const transition = (next: string) => {
    setPresentation({ setup: logical, alg: `${inverse(logical)} ${next}`.trim() });
    setLogical(next);
  };
  useEffect(() => { if (firstRoute.current) { firstRoute.current = false; return; } transition(target); }, [target]);
  const advance = () => transition(patterns[(patterns.indexOf(logical as typeof patterns[number]) + 1) % patterns.length] ?? "");
  return <button type="button" className="nav-cube" aria-label={en.nav.cubeHint} onClick={advance}>
    <Cube eager force3D setup={presentation.setup} alg={presentation.alg} autoplay label={en.nav.cube} />
  </button>;
}
