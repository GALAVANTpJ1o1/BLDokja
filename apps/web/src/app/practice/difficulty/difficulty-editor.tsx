"use client";

import type { Difficulty, DifficultyPreset } from "@bld/storage";
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { Segmented } from "@/components/trainer/trainer-shell";
import { en } from "@/i18n/en";
import { m2opData, threeStyleForReader, useMethodData } from "@/lib/methods";
import { useReader, type Reader } from "@/lib/reader";
import { newId } from "@/lib/storage-client";
import { describeDifficulty } from "@/components/trainer/difficulty-summary";
import { CASE_SUBSET_KEYS, presetFragment, readPresetFragment, type CaseSubsetKey } from "@/trainers/difficulty";
import { shotCases } from "@/trainers/m2op-cases";
import { commCases, gridStickers } from "@/trainers/three-style";

type Pieces = "both" | "edges" | "corners";
type Tri = "any" | "force" | "forbid";
type Range = { min?: number; max?: number };

const numberOrUndefined = (text: string): number | undefined => (text.trim() === "" || !/^\d+$/.test(text.trim()) ? undefined : Number(text.trim()));
function cleanRange(range: Range): Range | undefined {
  const out: Range = {};
  if (range.min !== undefined) out.min = range.min;
  if (range.max !== undefined) out.max = range.max;
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) out.max = out.min;
  return Object.keys(out).length === 0 ? undefined : out;
}

function RangeField({ label, value, onChange }: { label: string; value: Range | undefined; onChange: (r: Range | undefined) => void }) {
  return (
    <fieldset className="flex flex-wrap items-end gap-2">
      <legend className="t-meta text-quiet">{label}</legend>
      {(["min", "max"] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="t-meta">{k === "min" ? en.difficulty.min : en.difficulty.max}</span>
          <input className="field w-20" inputMode="numeric" value={value?.[k] ?? ""} onChange={(e) => { onChange(cleanRange({ ...(value ?? {}), [k]: numberOrUndefined(e.target.value) })); }} />
        </label>
      ))}
    </fieldset>
  );
}

/** Targets to offer in each case subset, with the case ids a tick stands for. */
function useSubsetChoices(reader: Reader | undefined): Partial<Record<CaseSubsetKey, { sticker: string; letter: string; ids: string[] }[]>> {
  const m2op = useMethodData(reader, m2opData);
  const threeStyle = useMethodData(reader, threeStyleForReader);
  return useMemo(() => {
    if (reader === undefined) return {};
    const out: Partial<Record<CaseSubsetKey, { sticker: string; letter: string; ids: string[] }[]>> = {};
    const group = (items: { target: string; id: string }[]) => {
      const byTarget = new Map<string, string[]>();
      for (const item of items) byTarget.set(item.target, [...(byTarget.get(item.target) ?? []), item.id]);
      return [...byTarget].map(([sticker, ids]) => ({ sticker, letter: reader.letterOf(sticker) ?? "?", ids })).sort((a, b) => a.letter.localeCompare(b.letter) || (a.sticker < b.sticker ? -1 : 1));
    };
    if (m2op?.ok === true) out.m2op = group((["op-corners", "op-edges", "m2-edges", "m2-special"] as const).flatMap((mode) => shotCases(mode, m2op.value, reader.scheme).map((c) => ({ target: c.target, id: c.id }))));
    if (threeStyle?.ok === true) {
      for (const pieces of ["corners", "edges"] as const) {
        const dataset = threeStyle.value[pieces];
        const cases = commCases(reader.puzzle, dataset, reader.scheme, undefined).cases;
        const order = gridStickers(reader.puzzle, dataset, reader.scheme);
        out[pieces === "corners" ? "3style-corners" : "3style-edges"] = order.map((sticker) => ({ sticker, letter: reader.letterOf(sticker) ?? "?", ids: cases.filter((c) => c.targets[0] === sticker).map((c) => c.id) }));
      }
    }
    return out;
  }, [reader, m2op, threeStyle]);
}

/**
 * The difficulty customiser (BRIEF §7.7). Edits the one shared settings object, saves named presets, and
 * shares a preset as a link that carries it in the URL fragment.
 */
export function DifficultyEditor() {
  const reader = useReader();
  const { stored, update } = useSettings();
  const [presetName, setPresetName] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [shareFor, setShareFor] = useState<string | undefined>(undefined);
  const [shared, setShared] = useState<DifficultyPreset | undefined>(undefined);
  const subsets = useSubsetChoices(reader);
  const difficulty: Difficulty = stored?.difficulty ?? {};
  const presets = stored?.difficultyPresets ?? [];

  useEffect(() => {
    const read = () => { setShared(readPresetFragment(window.location.hash)); };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      window.removeEventListener("hashchange", read);
    };
  }, []);

  const save = async (next: Difficulty) => {
    await update({ difficulty: next });
    setMessage(en.difficulty.saved);
  };
  const setPiece = (pieces: "edges" | "corners", patch: Record<string, unknown>) => {
    const current: Record<string, unknown> = { ...(difficulty.constraints?.[pieces] ?? {}), ...patch };
    const cleaned = Object.fromEntries(Object.entries(current).filter(([, v]) => v !== undefined));
    const constraints = { ...(difficulty.constraints ?? {}), [pieces]: cleaned };
    void save({ ...difficulty, constraints });
  };
  const tri = (pieces: "edges" | "corners"): Tri => {
    const m = difficulty.constraints?.[pieces]?.misoriented;
    return m?.min !== undefined ? "force" : m?.max === 0 ? "forbid" : "any";
  };
  const parity: Tri = difficulty.constraints?.edges?.parity === true ? "force" : difficulty.constraints?.edges?.parity === false ? "forbid" : "any";
  const setParity = (value: Tri) => {
    const p = value === "any" ? undefined : value === "force";
    const constraints = { ...(difficulty.constraints ?? {}) };
    for (const pieces of ["edges", "corners"] as const) {
      const rest = Object.fromEntries(Object.entries({ ...(constraints[pieces] ?? {}), parity: p }).filter(([, v]) => v !== undefined));
      constraints[pieces] = rest;
    }
    void save({ ...difficulty, constraints });
  };
  const timeMode = difficulty.time?.mode ?? "none";
  const seconds = difficulty.time !== undefined && difficulty.time.mode !== "none" ? difficulty.time.seconds : 5;

  const toggleSubset = (key: CaseSubsetKey, ids: string[]) => {
    const current = new Set(difficulty.cases?.[key] ?? []);
    const allIn = ids.every((id) => current.has(id));
    for (const id of ids) {
      if (allIn) current.delete(id);
      else current.add(id);
    }
    void save({ ...difficulty, cases: { ...(difficulty.cases ?? {}), [key]: [...current].slice(0, 1000) } });
  };

  const summary = describeDifficulty(difficulty, { scrambles: true, subsets: true, time: true, relook: true, seed: true });

  return (
    <div className="flex flex-col gap-8">
      {shared !== undefined ? (
        <section className="panel flex flex-col gap-3 p-4" aria-live="polite">
          <h2 className="t-subheading">{en.difficulty.sharedTitle(shared.name)}</h2>
          <p className="t-meta">{describeDifficulty(shared.difficulty, { scrambles: true, subsets: true, time: true, relook: true, seed: true }).join(" · ") || en.difficulty.summaryNone}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-strong" onClick={() => { void save(shared.difficulty); }}>{en.difficulty.sharedApply}</button>
            <button type="button" className="btn" onClick={() => { void update({ difficultyPresets: [...presets.filter((p) => p.id !== shared.id), shared].slice(-50) }).then(() => { setMessage(en.difficulty.saved); }); }}>{en.difficulty.sharedSave}</button>
          </div>
        </section>
      ) : null}

      <p className="t-body">
        <span className="text-quiet">{en.difficulty.summary}: </span>
        {summary.length === 0 ? en.difficulty.summaryNone : summary.join(" · ")}
      </p>

      <section className="flex flex-col gap-4">
        <h2 className="t-heading">{en.difficulty.scrambles}</h2>
        <p className="t-meta text-quiet">{en.difficulty.scramblesHint}</p>
        <Segmented<Pieces> label={en.difficulty.pieces} options={["both", "edges", "corners"]} labels={en.difficulty.pieceOptions} value={difficulty.pieces ?? "both"} onChange={(v) => { void save({ ...difficulty, pieces: v }); }} />
        {(["edges", "corners"] as const).map((pieces) => (
          <fieldset key={pieces} className="flex flex-col gap-3 border-t border-rule pt-3" disabled={difficulty.pieces === (pieces === "edges" ? "corners" : "edges")}>
            <legend className="t-subheading">{en.scheme.pieceTypes[pieces]}</legend>
            <div className="flex flex-wrap gap-6">
              <RangeField label={en.difficulty.targets} value={difficulty.constraints?.[pieces]?.targets} onChange={(r) => { setPiece(pieces, { targets: r }); }} />
              <RangeField label={en.difficulty.breaks} value={difficulty.constraints?.[pieces]?.cycleBreaks} onChange={(r) => { setPiece(pieces, { cycleBreaks: r }); }} />
            </div>
            <Segmented<Tri> label={pieces === "edges" ? en.difficulty.flipped : en.difficulty.twisted} options={["any", "force", "forbid"]} labels={en.difficulty.tri} value={tri(pieces)} onChange={(v) => { setPiece(pieces, { misoriented: v === "any" ? undefined : v === "force" ? { min: 1 } : { max: 0 } }); }} />
          </fieldset>
        ))}
        <Segmented<Tri> label={en.difficulty.parity} options={["any", "force", "forbid"]} labels={en.difficulty.tri} value={parity} onChange={setParity} />
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="t-heading">{en.difficulty.subsets}</h2>
        <p className="t-meta text-quiet">{en.difficulty.subsetsHint}</p>
        {CASE_SUBSET_KEYS.map((key) => {
          const choices = subsets[key];
          const chosen = new Set(difficulty.cases?.[key] ?? []);
          return (
            <fieldset key={key} className="flex flex-col gap-2">
              <legend className="t-ui font-[650]">
                {en.difficulty.subsetTrainers[key]} <span className="t-meta text-quiet">({en.difficulty.subsetCount(chosen.size)})</span>
              </legend>
              {choices === undefined ? (
                <p className="t-meta text-quiet">{en.cube.loading}</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {choices.map((c) => {
                    const on = c.ids.length > 0 && c.ids.every((id) => chosen.has(id));
                    return (
                      <button key={c.sticker} type="button" className="btn casual min-h-10 min-w-10 px-2" aria-pressed={on} aria-label={`${c.letter}, ${c.sticker}`} title={c.sticker} onClick={() => { toggleSubset(key, c.ids); }}>
                        {c.letter}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>
          );
        })}
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="t-heading">{en.difficulty.time}</h2>
        <Segmented<"none" | "soft" | "hard"> label={en.difficulty.time} options={["none", "soft", "hard"]} labels={en.difficulty.timeModes} value={timeMode} onChange={(v) => { void save({ ...difficulty, time: v === "none" ? { mode: "none" } : { mode: v, seconds } }); }} />
        {timeMode !== "none" ? (
          <label className="flex max-w-xs flex-col gap-1">
            <span className="t-meta text-quiet">{en.difficulty.seconds}</span>
            <input className="field w-24" type="number" min={1} max={600} step={0.5} value={seconds} onChange={(e) => { const n = Number(e.target.value); if (n > 0 && n <= 600) void save({ ...difficulty, time: { mode: timeMode, seconds: n } }); }} />
          </label>
        ) : null}
        <p className="t-meta text-quiet">{en.difficulty.timeHint}</p>
        <Segmented<"allowed" | "forbidden"> label={en.difficulty.relook} options={["allowed", "forbidden"]} labels={en.difficulty.relookOptions} value={difficulty.relook === false ? "forbidden" : "allowed"} onChange={(v) => { void save({ ...difficulty, relook: v === "allowed" }); }} />
        <p className="t-meta text-quiet">{en.difficulty.relookHint}</p>
        <label className="flex max-w-sm flex-col gap-1">
          <span className="t-ui font-[650]">{en.difficulty.seed}</span>
          <input
            className="field mono"
            maxLength={64}
            value={difficulty.seed ?? ""}
            onChange={(e) => {
              const seed = e.target.value.trim();
              const { seed: _old, ...rest } = difficulty;
              void save(seed === "" ? rest : { ...rest, seed });
            }}
          />
        </label>
        <p className="t-meta text-quiet">{en.difficulty.seedHint}</p>
        <div>
          <button type="button" className="btn" onClick={() => { void save({}); }}>{en.difficulty.reset}</button>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="t-heading">{en.difficulty.presets}</h2>
        <form
          noValidate
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = presetName.trim();
            if (name === "") return;
            void update({ difficultyPresets: [...presets, { id: newId(), name: name.slice(0, 60), difficulty }].slice(-50) }).then(() => {
              setPresetName("");
              setMessage(en.difficulty.saved);
            });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="t-meta text-quiet">{en.difficulty.presetName}</span>
            <input className="field" maxLength={60} value={presetName} onChange={(e) => { setPresetName(e.target.value); }} />
          </label>
          <button type="submit" className="btn" disabled={presetName.trim() === ""}>{en.difficulty.savePreset}</button>
        </form>
        {presets.length === 0 ? <p className="t-meta text-quiet">{en.difficulty.noPresets}</p> : null}
        <ul className="flex flex-col gap-3">
          {presets.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 border-t border-rule pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="t-ui font-[650]">{p.name}</span>
                <span className="t-meta text-quiet">{describeDifficulty(p.difficulty, { scrambles: true, subsets: true, time: true, relook: true, seed: true }).join(" · ") || en.difficulty.summaryNone}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn min-h-9 px-2" onClick={() => { void save(p.difficulty); }}>{en.difficulty.apply}</button>
                <button type="button" className="btn min-h-9 px-2" aria-expanded={shareFor === p.id} onClick={() => { setShareFor(shareFor === p.id ? undefined : p.id); }}>{en.difficulty.share}</button>
                <button type="button" className="btn min-h-9 px-2" onClick={() => { void update({ difficultyPresets: presets.filter((q) => q.id !== p.id) }); }}>{en.difficulty.remove}</button>
              </div>
              {shareFor === p.id ? (
                <label className="flex flex-col gap-1">
                  <span className="t-meta text-quiet">{en.difficulty.shareHint}</span>
                  <input className="field mono text-[0.75rem]" readOnly value={`${window.location.origin}/practice/difficulty/#${presetFragment(p)}`} onFocus={(e) => { e.target.select(); }} />
                </label>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {message !== undefined ? <p className="t-meta" role="status">{message}</p> : null}
    </div>
  );
}
