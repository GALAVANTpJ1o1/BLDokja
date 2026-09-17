"use client";

import type { CubeView, ExportV1, ImportDataError, Palette, Theme, Voice } from "@bld/storage";
import { CUBE_VIEWS, PALETTES, THEMES, VOICES } from "@bld/storage/options";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import { en } from "@/i18n/en";
import { polish } from "@/i18n/polish";
import { OfflinePack } from "@/components/pwa/offline-pack";
import { AppearanceChoices } from "@/components/settings/appearance-choices";
import { useSpeechAvailable } from "@/lib/speech";
// Storage, and the export and import code with its schemas, load after the page has painted.
import { nowIso } from "@/lib/ids";
const storageClient = () => import("@/lib/storage-client");
const storageLibrary = () => import("@bld/storage");

const BACKUP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

function Choice<T extends string>({ legend, hint, options, labels, value, onChange }: { legend: string; hint?: string; options: readonly T[]; labels: Readonly<Record<T, string>>; value: T | undefined; onChange: (v: T) => void }) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="t-subheading">{legend}</legend>
      {hint !== undefined ? <p className="t-meta text-quiet">{hint}</p> : null}
      {/* A grid, not a wrapping row: the selected option is heavier (DESIGN.md), and in a row that changes
          where the options wrap when your saved choice arrives, which moves the page. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
        {options.map((option) => (
          <label key={option} className={`btn ${value === option ? "btn-strong" : ""}`}>
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => { onChange(option); }} className="sr-only" />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-rule pt-6">
      <h2 className="t-heading">{title}</h2>
      {children}
    </section>
  );
}

function importErrorText(error: ImportDataError): string {
  if (error.code === "newer-version") return en.settings.importNewer;
  if (error.code === "invalid") return `${en.settings.importFailed} ${error.issues.slice(0, 3).join("; ")}`;
  return en.settings.importFailed;
}

export function SettingsView() {
  const { settings, update, ready, request3D } = useSettings();
  // Checked in the browser: the server doesn't know whether this device has a voice.
  const speech = useSpeechAvailable();
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<ExportV1 | undefined>(undefined);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [quarantined, setQuarantined] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number | undefined>(undefined);
  const [persistentBackend, setPersistentBackend] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    void storageClient().then(async ({ getStorage, storageIsPersistent }) => {
      const q = await getStorage().quarantine();
      setQuarantined(q.length);
      setNow(Date.now());
      setPersistentBackend(storageIsPersistent());
    });
  }, []);

  const backupDue = now !== undefined && (settings.lastBackupAt === undefined || now - Date.parse(settings.lastBackupAt) > BACKUP_INTERVAL_MS);
  const persistence = persistentBackend === undefined ? en.settings.persistent.unknown : !persistentBackend ? en.settings.persistent.unsupported : settings.persistentStorage === undefined ? en.settings.persistent.unknown : en.settings.persistent[settings.persistentStorage];

  async function doExport() {
    setBusy(true);
    try {
      const at = nowIso();
      const [{ getStorage }, { exportData }] = await Promise.all([storageClient(), storageLibrary()]);
      const envelope = await exportData(getStorage(), at);
      const blob = new Blob([`${JSON.stringify(envelope, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bldokja-backup-${at.slice(0, 10)}.export.json`;
      a.click();
      URL.revokeObjectURL(url);
      await update({ lastBackupAt: at });
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(file: File) {
    setStatus(undefined);
    const { parseExport } = await storageLibrary();
    const parsed = parseExport(await file.text());
    if (!parsed.ok) {
      setStatus(importErrorText(parsed.error));
      return;
    }
    setPending(parsed.envelope);
  }

  async function confirmImport() {
    if (pending === undefined) return;
    setBusy(true);
    try {
      const [{ getStorage }, { importData }] = await Promise.all([storageClient(), storageLibrary()]);
      const result = await importData(getStorage(), pending);
      if (!result.ok) {
        setStatus(importErrorText(result.error));
        return;
      }
      const { summary } = result;
      setStatus([en.settings.importDone, en.settings.importCounts(summary.letterPairs.inserted, summary.events.inserted), summary.conflicts.length > 0 ? en.settings.importConflicts(summary.conflicts.length) : "", summary.stayedDeleted.length > 0 ? en.settings.importStayedDeleted(summary.stayedDeleted.length) : ""].filter(Boolean).join(" "));
      setPending(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    if (confirmText !== en.settings.deleteWord) return;
    const { getStorage } = await storageClient();
    await getStorage().clearAll();
    setConfirmText("");
    setStatus(en.settings.deleted);
    window.location.reload();
  }

  return (
    <div className="settings-stack flex max-w-3xl flex-col gap-8">
      <h1 className="t-title">{en.settings.title}</h1>

      <Section title={en.settings.appearance}>
        <Choice<Theme> legend={en.settings.theme} options={THEMES} labels={en.settings.themes} value={ready ? settings.theme : undefined} onChange={(theme) => void update({ theme })} />
        <AppearanceChoices />
        <Choice<Palette> legend={en.settings.palette} hint={en.settings.paletteHint} options={PALETTES} labels={en.settings.palettes} value={ready ? settings.palette : undefined} onChange={(palette) => void update({ palette })} />
        <Choice<CubeView> legend={en.settings.cubeView} hint={`${en.settings.cubeViewHint} ${polish.cube3DHint}`} options={CUBE_VIEWS} labels={en.settings.cubeViews} value={ready ? settings.cubeView : undefined} onChange={(cubeView) => { if (cubeView === "3d") request3D(); void update({ cubeView }); }} />
        <Choice<Voice> legend={en.settings.voice} hint={en.settings.voiceHint} options={VOICES} labels={en.settings.voices} value={settings.voice} onChange={(voice) => void update({ voice })} />
        <Choice<"on" | "off">
          legend={en.settings.readAloud}
          hint={speech ? en.settings.readAloudHint : `${en.settings.readAloudHint} ${en.settings.readAloudUnsupported}`}
          options={["on", "off"]}
          labels={en.settings.readAlouds}
          value={ready ? (settings.readAloud ? "on" : "off") : undefined}
          onChange={(v) => void update({ readAloud: v === "on" })}
        />
      </Section>

      <Section title={polish.offline.title}><OfflinePack /></Section>

      <Section title={en.scheme.lettering}>
        <p className="flex flex-col gap-1">
          <TransitionLink href="/settings/lettering/" className="t-ui font-[650]">{en.scheme.link}</TransitionLink>
          <span className="t-body text-quiet">{en.scheme.linkHint}</span>
        </p>
      </Section>

      <Section title={en.settings.data}>
        <p className="t-body">{en.settings.dataIntro}</p>
        <p className="t-meta text-quiet">{persistence}</p>
        <div className="flex flex-col gap-2">
          <p className="t-meta">{settings.lastBackupAt === undefined ? en.settings.neverBackedUp : en.settings.lastBackup(new Date(settings.lastBackupAt).toLocaleDateString("en-GB", { dateStyle: "long" }))}</p>
          {/* Both notices depend on stored data, which arrives after the first paint: one line is kept for them so nothing moves. */}
          <div className="min-h-[1.7rem]">
            {quarantined > 0 ? <p className="t-body">{en.settings.quarantine(quarantined)}</p> : null}
            {ready && backupDue ? <p className="t-body font-[600]">{en.settings.backupDue}</p> : null}
          </div>
          <div>
            <button type="button" className="btn btn-strong" disabled={busy} onClick={() => void doExport()}>
              {busy ? en.settings.exporting : en.settings.export}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="t-subheading">{en.settings.import}</h3>
          <label className="flex flex-col gap-1 t-ui">
            {en.settings.importPick}
            <input type="file" accept="application/json,.json" className="field py-2" onChange={(e) => { const f = e.target.files?.[0]; if (f !== undefined) void pickFile(f); }} />
          </label>
        </div>

        <TransmissionWindow
          open={pending !== undefined}
          title={en.settings.importReview}
          onClose={() => { setPending(undefined); }}
          actions={
            <>
              <button type="button" className="btn" onClick={() => { setPending(undefined); }}>{en.settings.importCancel}</button>
              <button type="button" className="btn btn-strong" disabled={busy} onClick={() => void confirmImport()}>{en.settings.importConfirm}</button>
            </>
          }
        >
          {pending !== undefined ? <p>{en.settings.importCounts(pending.letterPairs.length, pending.events.length)}</p> : null}
        </TransmissionWindow>

        <div className="flex flex-col gap-3">
          <h3 className="t-subheading">{en.settings.deleteAll}</h3>
          <div>
            <button type="button" className="btn" onClick={() => { setDeleting(true); }}>{en.settings.deleteAll}</button>
          </div>
        </div>

        <TransmissionWindow
          open={deleting}
          title={en.settings.deleteAll}
          onClose={() => { setDeleting(false); setConfirmText(""); }}
          actions={
            <>
              <button type="button" className="btn" onClick={() => { setDeleting(false); setConfirmText(""); }}>{en.settings.importCancel}</button>
              <button type="button" className="btn btn-strong" disabled={confirmText !== en.settings.deleteWord} onClick={() => void deleteAll()}>{en.settings.deleteAll}</button>
            </>
          }
        >
          <label className="flex flex-col gap-2">
            {en.settings.deleteConfirm}
            <input className="field max-w-48 mono" value={confirmText} onChange={(e) => { setConfirmText(e.target.value); }} autoComplete="off" />
          </label>
        </TransmissionWindow>
        <p role="status" className="t-body">{status}</p>
      </Section>
    </div>
  );
}
