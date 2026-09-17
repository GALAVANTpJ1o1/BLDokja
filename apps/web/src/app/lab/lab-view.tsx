"use client";

import { drillScramble } from "@bld/cube-engine";
import { useMemo, useState } from "react";
import { Cube } from "@/components/cube/cube";
import { netCells, patternFor } from "@/components/cube/cube-state";
import { StickerNet } from "@/components/cube/sticker-net";
import { usePuzzle } from "@/components/cube/use-puzzle";
import { LetterNotch, LetterTile } from "@/components/letters/letters";
import { algDatasets } from "@/content/algs";
import { FACE_ORDER, STICKER_PALETTES, type FaceName } from "@/design/palette";
import { en } from "@/i18n/en";

const SPEFFZ_DEMO: readonly [string, FaceName][] = [["A", "U"], ["E", "L"], ["I", "F"], ["M", "R"], ["Q", "B"], ["U", "D"]];

const TYPE_ROLES = [
  ["t-display-letter", "M"],
  ["t-title", "Tracing a cycle"],
  ["t-heading", "Cycle breaks"],
  ["t-subheading", "When the buffer comes home"],
  ["t-body", "Read the sticker in the buffer, shoot it to where it belongs, and read what was there."],
  ["t-ui", "Start drill"],
  ["t-meta", "4 min · builds on Buffers"],
  ["t-notation", "[R': [R' B2 R, F]]  R2 B2 R F R' B2 R F' R"],
] as const;

export function LabView() {
  const puzzle = usePuzzle();
  const [drillStarted, setDrillStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [levelSelected, setLevelSelected] = useState(true);
  const comm = algDatasets().threeStyleCorners.records.find((r) => r.id === "UBR-UBL");
  const commAlg = comm?.algs[0];
  const setup = useMemo(() => {
    if (commAlg === undefined || puzzle === undefined) return "";
    const drill = drillScramble(puzzle, commAlg.moves);
    return drill.ok ? drill.value.scramble : "";
  }, [puzzle, commAlg]);
  const scrambledNet = useMemo(() => {
    if (puzzle === undefined) return undefined;
    const pattern = patternFor(puzzle, "R U R' U' F2 D L' B");
    return pattern === undefined ? undefined : netCells(puzzle, pattern);
  }, [puzzle]);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="t-title">{en.lab.title}</h1>
        <p className="t-body prose-measure text-quiet">{en.lab.intro}</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="t-heading">Interface colours</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[["ground", "--ground"], ["stage", "--stage"], ["text", "--text"], ["quiet text", "--text-quiet"], ["rule", "--rule"], ["cube body", "--cube-body"]].map(([name, token]) => (
            <div key={token} className="flex flex-col gap-1">
              <span className="block h-14 rounded-[4px] border border-rule" style={{ background: `var(${token ?? ""})` }} />
              <span className="t-meta">{name}</span>
              <span className="t-meta mono text-quiet">{token}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="t-heading">Sticker palettes</h2>
        {Object.entries(STICKER_PALETTES).map(([name, colours]) => (
          <div key={name} className="flex flex-wrap items-center gap-3">
            <span className="t-ui w-40">{en.settings.palettes[name as keyof typeof en.settings.palettes]}</span>
            <span className="inline-flex gap-1 rounded-[4px] bg-body p-1">
              {FACE_ORDER.map((f) => (
                <span key={f} className="grid h-8 w-8 place-items-center rounded-[2px] t-meta font-[700] text-ink" style={{ background: colours[f] }}>
                  {f}
                </span>
              ))}
            </span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="t-heading">Type roles</h2>
        {TYPE_ROLES.map(([role, sample]) => (
          <div key={role} className="grid gap-1 border-b border-rule pb-3 sm:grid-cols-[10rem_1fr]">
            <span className="t-meta mono text-quiet">{role}</span>
            <span className={role}>{sample}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="t-heading">Letters</h2>
        <div className="flex flex-wrap items-end gap-3">
          {SPEFFZ_DEMO.map(([letter, face]) => (
            <LetterTile key={letter} letter={letter} face={face} label={`${letter}, ${en.cube.faceNames[face]} face`} />
          ))}
        </div>
        <p className="flex flex-wrap items-baseline gap-2 t-body">
          <span className="text-quiet t-meta">Memo</span>
          <LetterNotch letter="E" face="L" />
          <LetterNotch letter="M" face="R" />
          <span aria-hidden className="w-3" />
          <LetterNotch letter="Q" face="B" />
          <LetterNotch letter="U" face="D" />
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="t-heading">Controls</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-strong" aria-pressed={drillStarted} onClick={() => { setDrillStarted(true); }}>{en.lab.startDrill}</button>
          <button type="button" className="btn" aria-pressed={revealed} onClick={() => { setRevealed((value) => !value); }}>{en.lab.reveal}</button>
          <button type="button" className="btn" aria-pressed={levelSelected} onClick={() => { setLevelSelected((value) => !value); }}>{en.lab.level}</button>
          <button type="button" className="btn" disabled>{en.lab.notAvailable}</button>
          <input className="field" placeholder={en.lab.typeLetter} aria-label={en.lab.typeLetter} />
        </div>
        <p className="t-meta" role="status">{drillStarted ? en.lab.drillStarted : revealed ? en.lab.revealed : levelSelected ? en.lab.levelSelected : ""}</p>
        <p className="t-body">
          A link reads like <a href="#content">this lesson on buffers</a>.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="t-heading">3D cube: a comm with only its three pieces lit</h2>
          {commAlg !== undefined ? (
            <>
              <p className="t-notation">{commAlg.alg}</p>
              <p className="t-meta text-quiet mono">{commAlg.moves}</p>
            </>
          ) : null}
          {setup !== "" && commAlg !== undefined ? <Cube setup={setup} alg={commAlg.moves} highlight={["UFR", "FUR", "RUF", "UBR", "BUR", "RUB", "UBL", "BUL", "LUB"]} controls label="UFR buffer, targets UBR then UBL" /> : null}
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="t-heading">Sticker net</h2>
          {scrambledNet !== undefined ? <StickerNet cells={scrambledNet} label="Net of the cube after R U R' U' F2 D L' B" highlight={new Set([8, 9, 29])} className="w-full max-w-[28rem]" /> : null}
        </div>
      </section>
    </div>
  );
}
