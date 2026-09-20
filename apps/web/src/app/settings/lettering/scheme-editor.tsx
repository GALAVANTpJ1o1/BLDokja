"use client";

import { pieceType, speffzScheme, type BufferPair, type SchemeIssue } from "@bld/cube-engine";
import { graphemes, type StoredScheme } from "@bld/storage";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { netCells } from "@/components/cube/cube-state";
import { useSettings } from "@/components/settings/settings-provider";
import { en } from "@/i18n/en";
import { availableBuffers, bufferOrientations, checkScheme, GATE_B_BUFFERS, readerFor, useReader, type Method } from "@/lib/reader";

const ORIGIN: Record<"U" | "L" | "F" | "R" | "B" | "D", readonly [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
type Pieces = "corners" | "edges";

function issueText(issue: SchemeIssue): string {
  const pieces = (id: string) => (id === "corners" || id === "edges" ? en.scheme.pieceTypes[id] : id);
  switch (issue.code) {
    case "duplicate-letter":
      return en.scheme.duplicate(pieces(issue.pieceType), issue.letter, issue.stickers.join(", "));
    case "missing-letter":
      return en.scheme.missing(pieces(issue.pieceType), issue.piece, issue.unlettered.join(", "));
    case "not-a-single-letter":
      return en.scheme.notALetter(issue.sticker, issue.letter);
    default:
      return en.scheme.otherIssue(issue.code);
  }
}

/**
 * The scheme editor (BRIEF §7.6): click a sticker, type a letter. The draft is checked by the engine on
 * every change (duplicates, gaps, anything that isn't one letter), and only a valid scheme can be saved.
 */
export function SchemeEditor() {
  const reader = useReader();
  const { stored, update } = useSettings();
  const [draft, setDraft] = useState<StoredScheme | undefined>(undefined);
  const [type, setType] = useState<Pieces>("corners");
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const grid = useRef<HTMLDivElement>(null);

  const puzzle = reader?.puzzle;
  const speffz = useMemo(() => (puzzle === undefined ? undefined : speffzScheme(puzzle)), [puzzle]);
  const fromScheme = (letters: { corners?: Record<string, string> | undefined; edges?: Record<string, string> | undefined }, name: string, id: string): StoredScheme => ({ id, name, letters: { corners: { ...(letters.corners ?? {}) }, edges: { ...(letters.edges ?? {}) } } });
  const working = draft ?? stored?.scheme ?? (speffz === undefined ? undefined : fromScheme(speffz.letters, en.scheme.defaultName, "mine"));
  const checked = useMemo(() => (puzzle === undefined || working === undefined ? undefined : checkScheme(puzzle, working)), [puzzle, working]);
  const cells = useMemo(() => (puzzle === undefined ? [] : netCells(puzzle, puzzle.kpuzzle.defaultPattern())), [puzzle]);

  if (reader === undefined || working === undefined || speffz === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;

  const order = cells.map((c) => reader.nameOf(c.index)).filter((name) => reader.pieceTypeOf(name) === type);
  const letterOf = (name: string) => working.letters[type]?.[name];
  const setLetter = (name: string, letter: string | undefined) => {
    const others = Object.entries(working.letters[type] ?? {}).filter(([sticker]) => sticker !== name);
    const next: Record<string, string> = Object.fromEntries(letter === undefined ? others : [...others, [name, letter]]);
    setDraft({ ...working, letters: { ...working.letters, [type]: next } });
    setMessage(undefined);
  };
  const focusSticker = (name: string | undefined) => {
    setSelected(name);
    if (name !== undefined) grid.current?.querySelector<HTMLButtonElement>(`[data-sticker="${name}"]`)?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, name: string) => {
    const index = order.indexOf(name);
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      setLetter(name, undefined);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusSticker(order[(index + 1) % order.length]);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusSticker(order[(index - 1 + order.length) % order.length]);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.length === 0 || event.key === " " || event.key === "Enter" || event.key === "Tab") return;
    const typed = graphemes(event.key);
    if (typed.length !== 1 || typed[0] === undefined || /^\s$/.test(typed[0])) return;
    event.preventDefault();
    setLetter(name, typed[0]);
    focusSticker(order[(index + 1) % order.length]);
  };

  const save = async () => {
    if (checked?.ok !== true) return;
    await update({ scheme: working });
    setDraft(undefined);
    setMessage(en.scheme.saved);
  };

  return (
    <section className="flex flex-col gap-4" data-guide="lettering-scheme">
      <h2 className="t-heading">{en.scheme.lettering}</h2>
      <p className="t-meta text-quiet">{en.scheme.current(reader.schemeSource === "custom" ? (stored?.scheme?.name ?? en.scheme.defaultName) : en.scheme.speffz)}</p>
      {reader.issues.some((i) => i.kind === "scheme") ? <p className="t-body border-l-2 border-text pl-3" role="alert">{en.scheme.storedInvalid}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => { setDraft(fromScheme(speffz.letters, working.name, working.id)); }}>{en.scheme.startSpeffz}</button>
        <button type="button" className="btn" onClick={() => { setDraft(fromScheme({}, working.name, working.id)); }}>{en.scheme.startBlank}</button>
        {stored?.scheme !== undefined ? (
          <button type="button" className="btn" onClick={() => { void update({ scheme: undefined }).then(() => { setDraft(undefined); setMessage(en.scheme.usingSpeffz); }); }}>{en.scheme.useSpeffz}</button>
        ) : null}
      </div>
      <label className="flex max-w-sm flex-col gap-1">
        <span className="t-meta text-quiet">{en.scheme.name}</span>
        <input className="field" value={working.name} maxLength={100} onChange={(e) => { setDraft({ ...working, name: e.target.value === "" ? en.scheme.defaultName : e.target.value }); }} />
      </label>
      <div className="flex gap-2" role="group" aria-label={en.scheme.pieces}>
        {(["corners", "edges"] as const).map((t) => (
          <button key={t} type="button" className="btn" aria-pressed={type === t} onClick={() => { setType(t); setSelected(undefined); }}>
            {en.scheme.pieceTypes[t]}
          </button>
        ))}
      </div>
      <p className="t-meta text-quiet">{en.scheme.typeHint}</p>
      <div ref={grid} role="group" aria-label={en.scheme.netLabel(en.scheme.pieceTypes[type])} className="grid grid-cols-12 gap-[2px] self-start rounded-[4px] bg-body p-1" style={{ width: "min(100%, 34rem)" }}>
        {cells.map((c) => {
          const [fx, fy] = ORIGIN[c.slotFace];
          const name = reader.nameOf(c.index);
          const ofType = reader.pieceTypeOf(name) === type;
          const letter = ofType ? letterOf(name) : undefined;
          return (
            <button
              key={c.index}
              type="button"
              data-sticker={ofType ? name : undefined}
              disabled={!ofType}
              aria-label={ofType ? en.scheme.stickerLabel(name, letter) : undefined}
              aria-pressed={ofType ? selected === name : undefined}
              onClick={() => { setSelected(name); }}
              onKeyDown={(e) => { onKey(e, name); }}
              className={`aspect-square rounded-[2px] t-ui font-[700] casual disabled:cursor-default ${selected === name ? "outline-2 outline-offset-1 outline-[var(--focus)]" : ""}`}
              style={{ gridColumn: fx * 3 + c.col + 1, gridRow: fy * 3 + c.row + 1, background: `var(--face-${c.colour.toLowerCase()})`, color: "var(--cube-body)", opacity: ofType ? 1 : 0.35 }}
            >
              {letter}
            </button>
          );
        })}
      </div>
      {selected !== undefined ? (
        <label className="flex max-w-xs flex-col gap-1">
          <span className="t-meta text-quiet">{en.scheme.letterFor(selected)}</span>
          <input
            className="field casual w-20 text-center text-[1.5rem]"
            value={letterOf(selected) ?? ""}
            autoComplete="off"
            onChange={(e) => {
              const typed = graphemes(e.target.value.trim());
              setLetter(selected, typed.length === 0 ? undefined : typed[typed.length - 1]);
            }}
          />
        </label>
      ) : null}
      <div aria-live="polite">
        {checked?.ok === true ? (
          <p className="t-meta">{en.scheme.valid}</p>
        ) : (
          <div className="flex flex-col gap-1" role="status">
            <p className="t-meta font-[650]">{en.scheme.issuesTitle}</p>
            <ul className="ml-5 list-disc t-meta">
              {(checked?.ok === false ? checked.issues : []).slice(0, 12).map((issue, i) => (
                <li key={`${issue.code}-${String(i)}`}>{issueText(issue)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-strong" disabled={checked?.ok !== true || draft === undefined} onClick={() => { void save(); }}>{en.scheme.save}</button>
        {message !== undefined ? <p className="t-meta" role="status">{message}</p> : null}
      </div>
    </section>
  );
}

/** Buffer selection per method (BRIEF §7.6), limited to what the engine can build and verify. */
export function BufferPicker() {
  const reader = useReader();
  const { stored, update } = useSettings();
  const [message, setMessage] = useState<string | undefined>(undefined);
  const options = useMemo(() => (reader === undefined ? undefined : availableBuffers(reader.puzzle)), [reader]);
  if (reader === undefined || options === undefined) return <p className="t-meta text-quiet">{en.cube.loading}</p>;
  // Letters in your scheme, even inside a lesson override (this page has none).
  const letters = readerFor(reader.puzzle, { scheme: stored?.scheme });
  const label = (pair: BufferPair, method: Method) =>
    `${en.scheme.pair(pair.corners, letters.letterOf(pair.corners) ?? "?", pair.edges, letters.letterOf(pair.edges) ?? "?")}${pair.corners === GATE_B_BUFFERS[method].corners && pair.edges === GATE_B_BUFFERS[method].edges ? ` · ${en.scheme.standard}` : ""}`;
  const reference = (typeId: Pieces) => pieceType(reader.puzzle, typeId).pieces.map((p) => (p.stickers.find((s) => s.isOrientationReference) ?? p.stickers[0])?.name ?? p.name);

  // Built from the settings as they are when the write happens: two quick choices (corner sticker, then edge sticker) must both stick.
  const save = async (method: Method, change: Partial<BufferPair>) => {
    await update((existing) => ({ buffers: { ...(existing?.buffers ?? {}), [method]: { ...(existing?.buffers?.[method] ?? reader.buffers[method]), ...change } } }));
    setMessage(en.scheme.buffersSaved);
  };

  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-6" data-guide="lettering-buffers">
      <h2 className="t-heading">{en.scheme.buffers}</h2>
      <p className="t-body text-quiet">{en.scheme.buffersIntro}</p>
      {reader.issues.flatMap((i) => (i.kind === "buffers" ? [i] : [])).map((i) => (
        <p key={i.method} className="t-body border-l-2 border-text pl-3" role="alert">{en.scheme.buffersInvalid(en.scheme.methods[i.method])}</p>
      ))}
      {(["op", "m2"] as const).map((method) => {
        const pairs = options[method];
        if (pairs === "any") return null;
        const current = reader.buffers[method];
        // The pair list names each piece by its reference sticker; the buffer you chose may be another sticker of the same piece.
        const onSamePieces = (p: BufferPair) => bufferOrientations(reader.puzzle, "corners", p.corners).includes(current.corners) && bufferOrientations(reader.puzzle, "edges", p.edges).includes(current.edges);
        const chosenPair = pairs.find(onSamePieces) ?? pairs[0];
        const standard = GATE_B_BUFFERS[method];
        return (
          <div key={method} className="flex max-w-xl flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="t-ui font-[650]">{en.scheme.methods[method]}</span>
              <select className="field" value={chosenPair === undefined ? "" : `${chosenPair.corners}/${chosenPair.edges}`} onChange={(e) => { const [corners = "", edges = ""] = e.target.value.split("/"); void save(method, { corners, edges }); }}>
                {pairs.map((p) => (
                  <option key={`${p.corners}/${p.edges}`} value={`${p.corners}/${p.edges}`}>{label(p, method)}</option>
                ))}
              </select>
            </label>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">{en.scheme.stickerGroup(en.scheme.methods[method])}</legend>
              {(["corners", "edges"] as const).map((typeId) => (
                <label key={typeId} className="flex flex-col gap-1">
                  <span className="t-meta text-quiet">{typeId === "corners" ? en.scheme.cornerSticker : en.scheme.edgeSticker}</span>
                  <select className="field" value={current[typeId]} onChange={(e) => { void save(method, { [typeId]: e.target.value }); }}>
                    {bufferOrientations(reader.puzzle, typeId, chosenPair?.[typeId] ?? current[typeId]).map((name) => (
                      <option key={name} value={name}>{`${name} (${letters.letterOf(name) ?? "?"})${name === standard[typeId] ? ` · ${en.scheme.standard}` : ""}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
          </div>
        );
      })}
      <fieldset className="flex flex-wrap gap-4">
        <legend className="t-ui mb-1 font-[650]">{en.scheme.methods.threeStyle}</legend>
        {(["corners", "edges"] as const).map((typeId) => (
          <label key={typeId} className="flex flex-col gap-1">
            <span className="t-meta text-quiet">{typeId === "corners" ? en.scheme.corners : en.scheme.edges}</span>
            <select className="field" value={reader.buffers.threeStyle[typeId]} onChange={(e) => { void save("threeStyle", { [typeId]: e.target.value }); }}>
              {reference(typeId).map((name) => (
                <option key={name} value={name}>{`${name} (${letters.letterOf(name) ?? "?"})${name === GATE_B_BUFFERS.threeStyle[typeId] ? ` · ${en.scheme.standard}` : ""}`}</option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      {message !== undefined ? <p className="t-meta" role="status">{message}</p> : null}
    </section>
  );
}
