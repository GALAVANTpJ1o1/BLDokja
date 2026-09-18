"use client";

import { useEffect, useState } from "react";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import type { MigrationSummary } from "@/lib/sync/migration";
import { account } from "@/i18n/account";

const migration = () => import("@/lib/sync/migration");

type Step = "recovery-code" | "checking-guest-data" | "migration-prompt" | "migrating" | "migration-summary" | "done";

/**
 * Runs right after a successful sign-up or sign-in, before AccountProvider's own SIGNED_IN reload
 * is allowed to fire (the caller must have called deferNextAccountReload() before starting the auth
 * call itself -- see account-view.tsx). Shows the one-time recovery code (sign-up only), then offers
 * to migrate any local guest data into the new session, then reloads once the user has seen
 * everything -- the plan's own required order (v2 §F): validate, offer a backup, show a summary,
 * never do any of this silently.
 */
export function PostAuthFlow({ recoveryCode }: { recoveryCode?: string }) {
  const [step, setStep] = useState<Step>(recoveryCode !== undefined ? "recovery-code" : "checking-guest-data");
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<MigrationSummary | undefined>(undefined);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    if (step !== "checking-guest-data") return;
    let cancelled = false;
    void migration()
      .then((m) => m.guestDataExists())
      .then((exists) => {
        if (!cancelled) setStep(exists ? "migration-prompt" : "done");
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (step !== "done") return;
    window.location.reload();
  }, [step]);

  async function runMigration() {
    setStep("migrating");
    const { migrateGuestData } = await migration();
    const result = await migrateGuestData();
    setSummary(result);
    setStep("migration-summary");
  }

  async function downloadGuestBackup() {
    const { exportGuestData } = await migration();
    const envelope = await exportGuestData();
    if (envelope === undefined) return;
    const blob = new Blob([`${JSON.stringify(envelope, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bldokja-guest-backup-${envelope.exportedAt.slice(0, 10)}.export.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
  }

  if (step === "recovery-code" && recoveryCode !== undefined) {
    return (
      <TransmissionWindow open title={account.recoveryCodeReveal.title} onClose={() => undefined} actions={<button type="button" className="btn btn-strong" disabled={!confirmed} onClick={() => { setStep("checking-guest-data"); }}>{account.recoveryCodeReveal.continueButton}</button>}>
        <p className="t-body">{account.recoveryCodeReveal.body}</p>
        <p className="t-heading mono" style={{ letterSpacing: "0.1em" }}>{recoveryCode}</p>
        <button type="button" className="btn" onClick={() => { void navigator.clipboard.writeText(recoveryCode).then(() => { setCopied(true); }); }}>
          {copied ? account.recoveryCodeReveal.copied : account.recoveryCodeReveal.copy}
        </button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); }} />
          {account.recoveryCodeReveal.confirmCheckbox}
        </label>
      </TransmissionWindow>
    );
  }

  if (step === "migration-prompt") {
    return (
      <TransmissionWindow
        open
        title={account.migration.title}
        onClose={() => { setStep("done"); }}
        actions={
          <>
            <button type="button" className="btn" onClick={() => { setStep("done"); }}>{account.migration.skip}</button>
            <button type="button" className="btn btn-strong" onClick={() => void runMigration()}>{account.migration.migrate}</button>
          </>
        }
      >
        <p className="t-body">{account.migration.found}</p>
        <button type="button" className="btn" onClick={() => void downloadGuestBackup()}>{exported ? account.migration.exported : account.migration.exportFirst}</button>
      </TransmissionWindow>
    );
  }

  if (step === "migrating") {
    return (
      <TransmissionWindow open title={account.migration.title} onClose={() => undefined}>
        <p className="t-body" role="status">{account.migration.inProgress}</p>
      </TransmissionWindow>
    );
  }

  if (step === "migration-summary" && summary !== undefined) {
    const counts = summary.importResult?.ok === true ? summary.importResult.summary : undefined;
    return (
      <TransmissionWindow open title={account.migration.title} onClose={() => { setStep("done"); }} actions={<button type="button" className="btn btn-strong" onClick={() => { setStep("done"); }}>{account.migration.continueButton}</button>}>
        {counts !== undefined ? <p className="t-body">{account.migration.doneCounts(counts.letterPairs.inserted, counts.events.inserted)}</p> : null}
        {counts !== undefined && counts.conflicts.length > 0 ? <p className="t-body">{account.migration.conflicts(counts.conflicts.length)}</p> : null}
        {!summary.ok ? <p className="t-body">{account.migration.failed}</p> : null}
      </TransmissionWindow>
    );
  }

  return null;
}
