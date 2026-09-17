"use client";

import { useId, useState } from "react";
import { COLOURWAYS, ENVIRONMENTS } from "@bld/storage/options";
import type { Settings } from "@bld/storage";
import { useSettings } from "./settings-provider";
import { COLOURWAY_COLOURS } from "@/design/appearance";
import { appearance as copy } from "@/i18n/appearance";

export function AppearanceChoices() {
  const { settings, update, ready } = useSettings();
  const name = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const save = async (patch: Partial<Settings>) => {
    setBusy(true); setStatus(copy.saving);
    try { await update(patch); setStatus(copy.saved); }
    catch { setStatus(copy.saveError); }
    finally { setBusy(false); }
  };
  return <div className="flex flex-col gap-5" aria-busy={busy}>
    <fieldset disabled={!ready || busy} className="flex flex-col gap-2"><legend className="t-subheading">{copy.colourway}</legend><p className="t-meta text-quiet">{copy.colourwayHint}</p>
      <div className="appearance-grid">{COLOURWAYS.map(id => {
        const c = COLOURWAY_COLOURS[id];
        return <label key={id} className="colourway-choice" data-selected={ready && settings.colourway === id}>
          <input className="sr-only" type="radio" name={`${name}-colour`} value={id} checked={ready && settings.colourway === id} onChange={() => { void save({ colourway: id }); }} />
          <span className="colourway-swatch" aria-hidden>{[c.dark.ground, c.dark.stage, c.dark.accent, c.light.stage, c.light.ground].map((colour, i) => <span key={i} style={{ background: colour }} />)}</span>
          <span className="t-ui">{copy.colourways[id]}</span><span className="t-meta min-h-4">{ready && settings.colourway === id ? copy.selected : ""}</span>
        </label>;
      })}</div>
    </fieldset>
    <fieldset disabled={!ready || busy} className="flex flex-col gap-2"><legend className="t-subheading">{copy.environment}</legend><p className="t-meta text-quiet">{copy.environmentHint}</p>
      <div className="appearance-grid">{ENVIRONMENTS.map(id => <label key={id} className="colourway-choice" data-selected={ready && settings.environment === id}>
        <input className="sr-only" type="radio" name={`${name}-scene`} value={id} checked={ready && settings.environment === id} onChange={() => { void save({ environment: id }); }} />
        <span className={`scenery-preview scenery-preview-${id}`} aria-hidden /><span className="t-ui">{copy.environments[id]}</span><span className="t-meta min-h-4">{ready && settings.environment === id ? copy.selected : ""}</span>
      </label>)}</div>
    </fieldset>
    <fieldset disabled={!ready || busy} className="flex flex-col gap-2"><legend className="t-subheading">{copy.density}</legend><p className="t-meta text-quiet">{copy.densityHint}</p><div className="flex flex-wrap gap-2">{(["comfortable", "compact"] as const).map(id => <label className="btn" key={id} data-selected={ready && (settings.compactLayout ? "compact" : "comfortable") === id}>
      <input className="sr-only" type="radio" name={`${name}-density`} value={id} checked={ready && (settings.compactLayout ? "compact" : "comfortable") === id} onChange={() => { void save({ compactLayout: id === "compact" }); }} />{copy.densities[id]}
    </label>)}</div></fieldset>
    <p role="status" className="t-meta min-h-5">{status}</p>
  </div>;
}
