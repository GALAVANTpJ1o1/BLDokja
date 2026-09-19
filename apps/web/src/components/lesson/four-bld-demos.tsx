"use client";

import { drillScramble, formatMoves, type FourBldPieceType, type FourBldSolution, type FourBldStep } from "@bld/cube-engine";
import { useId, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Cube } from "@/components/cube/cube";
import { netCells } from "@/components/cube/cube-state";
import { StickerNet } from "@/components/cube/sticker-net";
import { LetterNotch, LetterTile } from "@/components/letters/letters";
import { algDatasets } from "@/content/algs";
import { en } from "@/i18n/en";
import { FOUR_BLD_PIECES, stickersOfPieces, useReader4x4, type FourBldPieces, type Reader4x4 } from "@/lib/reader-4x4";
import { centreSession, fourBldSolution, traceOf, undoOf } from "@/trainers/four-bld";
import { traceSteps } from "@/trainers/trace-steps";

/**
 * The 4BLD lessons' interactive pieces (BRIEF §6, 4BLD track). Everything shown comes from the verified 4x4
 * datasets and the engine's 4BLD solver (D-038 to D-041); lessons.test.ts checks every prop against them.
 */

const copy = en.fourLesson;
const Loading = () => <p className="t-meta text-quiet">{copy.loading}</p>;
const ORIGIN: Record<"U" | "L" | "F" | "R" | "B" | "D", readonly [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

/** A 4x4 sticker's Speffz letter, with its face notch: `<FourLetter sticker="UBl" />` shows A. */
export function FourLetter({ sticker }: { sticker: string }) {
  const reader = useReader4x4();
  if (reader === undefined) return <span className="t-notation">…</span>;
  return <LetterNotch letter={reader.letterOf(sticker) ?? "?"} face={reader.faceOf(sticker)} />;
}

/** Speffz on a clickable 4x4 net, one piece type at a time. */
export function FourExplorer({ pieces = "wings" }: { pieces?: FourBldPieces }) {
  const reader = useReader4x4();
  const [type, setType] = useState<FourBldPieces>(pieces);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const cells = useMemo(() => (reader === undefined ? [] : netCells(reader.puzzle, reader.puzzle.kpuzzle.defaultPattern())), [reader]);
  if (reader === undefined) return <Loading />;
  const letters = reader.scheme.letters[type] ?? {};
  const pickedLetter = picked === undefined ? undefined : letters[picked];
  return (
    <div className="my-6 flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={copy.pieceTypeChoice}>
        {FOUR_BLD_PIECES.map((t) => (
          <button key={t} type="button" className="btn" aria-pressed={type === t} onClick={() => { setType(t); setPicked(undefined); }}>
            {en.fourBld.pieces[t]}
          </button>
        ))}
      </div>
      <div className="grid gap-[2px] self-center rounded-[4px] bg-body p-1" style={{ width: "min(100%, 36rem)", gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {cells.map((c) => {
          const [fx, fy] = ORIGIN[c.slotFace];
          const name = reader.nameOf(c.index);
          const letter = letters[name];
          const ofType = letter !== undefined;
          return (
            <button
              key={c.index}
              type="button"
              disabled={!ofType}
              aria-label={ofType ? `${name}, ${letter}` : undefined}
              aria-pressed={picked === name}
              onClick={() => { setPicked(name); }}
              className={`aspect-square rounded-[2px] text-[0.7rem] font-[700] casual sm:text-[0.85rem] disabled:cursor-default ${picked === name ? "outline-2 outline-offset-1 outline-[var(--focus)]" : ""}`}
              style={{ gridColumn: fx * 4 + c.col + 1, gridRow: fy * 4 + c.row + 1, background: `var(--face-${c.colour.toLowerCase()})`, color: "var(--cube-body)", opacity: ofType ? 1 : 0.35 }}
            >
              {letter}
            </button>
          );
        })}
      </div>
      <p className="flex min-h-[72px] items-center gap-4 t-body" aria-live="polite">
        {picked !== undefined && pickedLetter !== undefined ? (
          <>
            <LetterTile letter={pickedLetter} face={reader.faceOf(picked)} />
            <span>{copy.stickerIs(picked, pickedLetter, en.cube.faceNames[reader.faceOf(picked)])}</span>
          </>
        ) : (
          <span className="text-quiet">{copy.pickASticker}</span>
        )}
      </p>
    </div>
  );
}

interface WalkStep {
  readonly accepted: readonly string[];
  readonly letters: readonly string[];
  /** Where the learner reads the next target from. */
  readonly look: string;
  readonly chosen: boolean;
}

/**
 * Tracing one piece type of a 4x4 scramble, target by target. Wings and corners follow the engine's trace.
 * X-centres accept any slot of the right colour and follow the one given; a flat net lights the slots,
 * since the 3D cube can only light x-centres a colour at a time (D-040).
 * `mode="show"` steps through with Next; `mode="guided"` asks for each letter.
 */
export function FourTrace({ scramble, pieces, mode = "guided", label }: { scramble: string; pieces: FourBldPieces; mode?: "show" | "guided"; label: string }) {
  const reader = useReader4x4();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [answered, setAnswered] = useState<readonly { sticker: string; letter: string }[]>([]);
  const [typed, setTyped] = useState("");
  const [retype, setRetype] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  const session = useMemo(() => (reader === undefined || pieces !== "xcenters" ? undefined : centreSession(reader, scramble)), [reader, scramble, pieces]);
  const traced = useMemo(() => (reader === undefined || pieces === "xcenters" ? undefined : traceOf(reader, scramble, pieces)), [reader, scramble, pieces]);
  const steps = useMemo(() => (traced === undefined ? [] : traceSteps(traced)), [traced]);
  const position = answered.length;
  const step = useMemo((): WalkStep | undefined => {
    if (reader === undefined) return undefined;
    if (session !== undefined) {
      const next = session.next();
      return next === undefined ? undefined : { accepted: next.accepted, letters: next.letters, look: answered.at(-1)?.sticker ?? reader.buffers.xcenters, chosen: next.isBreak };
    }
    const s = steps[position];
    return s === undefined ? undefined : { accepted: [s.target], letters: [s.letter], look: s.look, chosen: s.chosen };
  }, [reader, session, steps, position, answered]);
  const cells = useMemo(() => (reader === undefined ? [] : netCells(reader.puzzle, reader.puzzle.kpuzzle.defaultPattern().applyAlg(scramble))), [reader, scramble]);
  if (reader === undefined || (session === undefined && traced === undefined)) return <Loading />;

  const buffer = reader.buffers[pieces];
  const lit = step === undefined ? [buffer] : [...new Set([buffer, step.look, ...(pieces === "xcenters" ? step.accepted : [])])];
  const netLit = new Set(reader.puzzle.geometry.stickers.filter((s) => stickersOfPieces(reader, lit).includes(reader.nameOf(s.index))).map((s) => s.index));

  const accept = (letter: string, sticker: string) => {
    session?.answer(letter);
    setAnswered((a) => [...a, { sticker, letter }]);
    setTyped("");
    setRetype(false);
    input.current?.focus();
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (step === undefined) return;
    const answer = typed.trim().toLocaleUpperCase("en-GB");
    const at = step.letters.findIndex((l) => l.toLocaleUpperCase("en-GB") === answer);
    const sticker = step.accepted[at];
    const letter = step.letters[at];
    if (sticker === undefined || letter === undefined) {
      if (!retype) setFeedback({ ok: false, text: copy.wrong(step.letters.length > 1 ? copy.anyOf(step.letters.join(", ")) : `${copy.retype(step.letters.join(""))}.`, answer) });
      setRetype(true);
      setTyped("");
      return;
    }
    setFeedback(retype ? undefined : { ok: true, text: `${copy.right(letter)}${step.letters.length > 1 ? ` ${copy.anyOf(step.letters.join(", "))}` : ""}` });
    accept(letter, sticker);
  };

  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Cube puzzleId="4x4x4" setup={scramble} {...(pieces === "xcenters" ? {} : { highlight: stickersOfPieces(reader, lit) })} label={`${label}. ${copy.scramble}: ${scramble}`} />
        {pieces === "xcenters" ? <StickerNet cells={cells} size={4} highlight={netLit} label={copy.netLabel} className="w-full max-w-[22rem] self-center" /> : null}
      </div>
      <div className="flex flex-col gap-4">
        <p className="t-meta text-quiet">
          {copy.scramble}: <span className="t-notation">{scramble}</span>
        </p>
        <p className="t-meta text-quiet">
          {en.fourBld.pieces[pieces]} · {copy.buffer} <span className="t-notation">{buffer}</span> ({reader.letterOf(buffer)})
        </p>
        {step === undefined ? (
          <p className="t-body" aria-live="polite">{copy.done}</p>
        ) : (
          <>
            <p className="t-body" aria-live="polite">{step.chosen ? copy.breakChoice : copy.look}</p>
            {mode === "show" ? (
              <div className="flex flex-wrap items-center gap-4">
                <LetterTile letter={step.letters[0] ?? "?"} face={reader.faceOf(step.accepted[0] ?? buffer)} label={`${step.accepted[0] ?? ""}, ${step.letters[0] ?? ""}`} />
                {step.letters.length > 1 ? <span className="t-body">{copy.anyOf(step.letters.join(", "))} {copy.weTake(step.letters[0] ?? "")}</span> : null}
                <button type="button" className="btn btn-strong" onClick={() => { accept(step.letters[0] ?? "", step.accepted[0] ?? ""); }}>{copy.next}</button>
              </div>
            ) : (
              <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-2">
                <label htmlFor={inputId} className="flex flex-col gap-1 t-ui">
                  {retype ? copy.retype(step.letters.join(" / ")) : copy.target(position + 1)}
                  <input ref={input} id={inputId} className="field w-24 text-center t-subheading casual" value={typed} maxLength={1} autoComplete="off" autoCapitalize="characters" onChange={(e) => { setTyped(e.target.value); }} />
                </label>
                <button type="submit" className="btn btn-strong">{copy.check}</button>
              </form>
            )}
            {feedback !== undefined ? (
              <p className="t-body" role="status">
                <span aria-hidden className="mr-2 inline-block font-[700]">{feedback.ok ? "✓" : "✗"}</span>
                {feedback.text}
              </p>
            ) : null}
          </>
        )}
        <div className="flex flex-col gap-1">
          <span className="t-meta text-quiet">{copy.memo}</span>
          <p className="flex min-h-9 flex-wrap items-baseline gap-x-1 gap-y-2">
            {answered.map((a, i) => (
              <span key={`${String(i)}-${a.sticker}`} className={i % 2 === 1 ? "mr-3" : ""}>
                <LetterNotch letter={a.letter} face={reader.faceOf(a.sticker)} />
              </span>
            ))}
          </p>
          {step === undefined && traced !== undefined ? <p className="t-meta">{traced.parity ? copy.parityOdd(en.fourBld.pieces[pieces]) : copy.parityEven(en.fourBld.pieces[pieces])}</p> : null}
        </div>
      </div>
    </div>
  );
}

type ShotMethod = "r2" | "u2" | "op";

function shotData(method: ShotMethod) {
  const { r2Wings, u2Centres, opCorners } = algDatasets();
  if (method === "op") {
    // On a 4x4 the corner swap also swaps the UB and UL wing pairs (D-041), so they're lit too.
    return { pieces: "corners" as const, buffer: opCorners.buffer, swap: opCorners.swap.alg, lit: [opCorners.swap.swapSticker, "UBl", "UBr", "ULb", "ULf"], record: (t: string) => opCorners.records.find((r) => r.target === t), oddRule: [] as { target: string; shootAs: string }[] };
  }
  const dataset = method === "r2" ? r2Wings : u2Centres;
  return { pieces: method === "r2" ? ("wings" as const) : ("xcenters" as const), buffer: dataset.buffer, swap: dataset.swap.alg, lit: [dataset.swap.swapSticker], record: (t: string) => dataset.records.find((r) => r.target === t), oddRule: dataset.oddStepRule };
}

/**
 * One target from a verified 4x4 dataset, animated: its setup, the swap and the undo, or its special alg.
 * `<FourShot method="r2" target="UBl" />`
 */
export function FourShot({ method, target }: { method: ShotMethod; target: string }) {
  const reader = useReader4x4();
  const data = shotData(method);
  const record = data.record(target);
  const alg = record?.algs[0];
  const drill = reader === undefined || alg === undefined ? undefined : drillScramble(reader.puzzle, alg.moves);
  if (reader === undefined || record === undefined || alg === undefined || drill?.ok !== true) return <Loading />;
  const setup = "setup" in record ? record.setup : "";
  const special = "kind" in record && record.kind === "special";
  const letter = reader.scheme.letters[data.pieces]?.[target] ?? "?";
  const shootAs = data.oddRule.find((r) => r.target === target)?.shootAs;
  const lit = stickersOfPieces(reader, [data.buffer, target, ...data.lit]);
  return (
    <div className="my-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Cube puzzleId="4x4x4" setup={drill.value.scramble} alg={alg.moves} highlight={lit} dim={method === "u2" ? "soft" : "strong"} controls label={special ? copy.specialLabel(target, letter) : copy.shotLabel(target, letter)} />
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 self-center">
        <dt className="t-meta text-quiet">{copy.target1}</dt>
        <dd className="flex items-baseline gap-2">
          <span className="t-notation">{target}</span>
          <LetterNotch letter={letter} face={reader.faceOf(target)} />
        </dd>
        {special ? (
          <>
            <dt className="t-meta text-quiet">{copy.alg}</dt>
            <dd className="t-notation">{alg.alg}</dd>
          </>
        ) : (
          <>
            <dt className="t-meta text-quiet">{copy.setup}</dt>
            <dd className="t-notation">{setup === "" ? copy.none : setup}</dd>
            <dt className="t-meta text-quiet">{copy.swap}</dt>
            <dd className="t-notation">{data.swap}</dd>
            <dt className="t-meta text-quiet">{copy.undo}</dt>
            <dd className="t-notation">{setup === "" ? copy.none : undoOf(reader.puzzle, setup)}</dd>
          </>
        )}
        {shootAs !== undefined ? <dd className="col-span-2 t-body">{copy.shootAs(shootAs)}</dd> : null}
      </dl>
    </div>
  );
}

/** A 4BLD parity alg from its verified dataset, animated from the leftover it undoes. `<FourParity pieces="wings" />` */
export function FourParity({ pieces }: { pieces: FourBldPieces }) {
  const reader = useReader4x4();
  const { r2Parity, u2Parity, cornerParity4x4 } = algDatasets();
  const record = (pieces === "wings" ? r2Parity : pieces === "xcenters" ? u2Parity : cornerParity4x4).records[0];
  const alg = record.algs[0];
  const drill = reader === undefined || alg === undefined ? undefined : drillScramble(reader.puzzle, alg.moves);
  if (reader === undefined || alg === undefined || drill?.ok !== true) return <Loading />;
  const lit = stickersOfPieces(reader, record.intendedEffect.stickerCycles.flat());
  const type = en.fourBld.pieces[pieces];
  return (
    <div className="my-6 flex flex-col gap-3">
      <p className="t-notation text-center">{alg.alg}</p>
      <Cube puzzleId="4x4x4" setup={drill.value.scramble} alg={alg.moves} highlight={lit} dim="soft" controls label={copy.parityLabel(type)} />
    </div>
  );
}

function stepTitle(reader: Reader4x4, solution: FourBldSolution, step: FourBldStep): string {
  const type = en.fourBld.pieces[step.pieceType];
  if (step.kind === "parity") return copy.walkParity(type);
  const letter = solution.traces[step.pieceType].targets[step.traceIndex] ?? reader.letterOf(step.target) ?? "?";
  return `${copy.walkTarget(type, letter, step.target)}${step.shotAs === undefined ? "" : ` · ${copy.walkShotAs(step.shotAs)}`}`;
}

function litFor(reader: Reader4x4, step: FourBldStep): string[] {
  const { r2Wings, u2Centres, opCorners } = algDatasets();
  const buffer = step.pieceType === "wings" ? r2Wings.buffer : step.pieceType === "xcenters" ? u2Centres.buffer : opCorners.buffer;
  return stickersOfPieces(reader, step.kind === "target" ? [buffer, step.target] : [buffer]);
}

/**
 * A whole 4BLD solve, step by step, from the engine's solver: the three memos, then centres, wings and
 * corners, each with its parity alg when its count is odd. `upto` stops after a piece type.
 */
export function FourSolve({ scramble, upto = "corners" }: { scramble: string; upto?: FourBldPieceType }) {
  const reader = useReader4x4();
  const solution = useMemo(() => (reader === undefined ? undefined : fourBldSolution(reader, scramble)), [reader, scramble]);
  const [index, setIndex] = useState(-1);
  if (reader === undefined || solution === undefined) return <Loading />;
  const order: FourBldPieceType[] = ["xcenters", "wings", "corners"];
  const shown = order.slice(0, order.indexOf(upto) + 1);
  const steps = solution.steps.filter((s) => shown.includes(s.pieceType));
  const step = index >= 0 ? steps[index] : undefined;
  const before = steps.slice(0, Math.max(0, index)).flatMap((s) => (s.kind === "target" ? [...s.setup, ...s.core, ...s.undo] : [...s.alg]));
  const stepMoves = step === undefined ? [] : step.kind === "target" ? [...step.setup, ...step.core, ...step.undo] : [...step.alg];

  return (
    <div className="my-6 flex flex-col gap-4">
      <p className="t-meta text-quiet">
        {copy.scramble}: <span className="t-notation">{scramble}</span>
      </p>
      <div className="panel flex flex-col gap-2 p-4">
        <span className="t-subheading">{copy.memo}</span>
        {shown.map((type) => {
          const traced = solution.traces[type];
          return (
            <div key={type} className="flex flex-col gap-1">
              <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2">
                <span className="mr-2 t-meta text-quiet">{en.fourBld.pieces[type]}</span>
                {traced.targets.map((letter, i) => (
                  <span key={`${type}-${String(i)}`} className={i % 2 === 1 ? "mr-3" : ""}>
                    <LetterNotch letter={letter} face={reader.faceOf(traced.targetStickers[i] ?? "U")} />
                  </span>
                ))}
              </p>
              <p className="t-meta text-quiet">{traced.targetStickers.length % 2 === 1 ? copy.parityOdd(en.fourBld.pieces[type]) : copy.parityEven(en.fourBld.pieces[type])}</p>
            </div>
          );
        })}
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Cube
          key={index}
          puzzleId="4x4x4"
          setup={index < 0 ? scramble : `${scramble} ${formatMoves(before)}`}
          alg={formatMoves(stepMoves)}
          {...(step === undefined ? {} : { highlight: step.pieceType === "xcenters" ? [] : litFor(reader, step) })}
          controls={step !== undefined}
          autoplay={step !== undefined}
          label={step === undefined ? copy.scrambled : stepTitle(reader, solution, step)}
        />
        <div className="flex flex-col gap-3 self-center">
          <p className="t-subheading" aria-live="polite">
            {step === undefined ? copy.walkStart(steps.length) : `${String(index + 1)} / ${String(steps.length)} · ${stepTitle(reader, solution, step)}`}
          </p>
          {step?.kind === "target" ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="t-meta text-quiet">{copy.setup}</dt>
              <dd className="t-notation">{step.setup.length === 0 ? copy.none : formatMoves(step.setup)}</dd>
              <dt className="t-meta text-quiet">{step.setup.length === 0 ? copy.alg : copy.swap}</dt>
              <dd className="t-notation">{formatMoves(step.core)}</dd>
              <dt className="t-meta text-quiet">{copy.undo}</dt>
              <dd className="t-notation">{step.undo.length === 0 ? copy.none : formatMoves(step.undo)}</dd>
            </dl>
          ) : step?.kind === "parity" ? (
            <p className="t-notation">{formatMoves(step.alg)}</p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={index < 0} onClick={() => { setIndex((i) => i - 1); }}>{copy.previous}</button>
            <button type="button" className="btn btn-strong" disabled={index >= steps.length - 1} onClick={() => { setIndex((i) => i + 1); }}>{index < 0 ? copy.start : copy.next}</button>
          </div>
          {index === steps.length - 1 ? <p className="t-body">{copy.walkDone}</p> : null}
        </div>
      </div>
    </div>
  );
}
