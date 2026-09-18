"use client";

import { useState, type ReactNode } from "react";
import { useAccount } from "@/components/account/account-provider";
import { TransitionLink } from "@/components/transitions/transition-link";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import { AccountError, type AccountErrorCode } from "@/lib/account";
import { account } from "@/i18n/account";
import { contact } from "@/i18n/contact";
import { en } from "@/i18n/en";

function errorText(code: AccountErrorCode): string {
  if (code === "invalid-credentials") return account.errors.invalidCredentials;
  if (code === "username-taken") return account.errors.usernameTaken;
  if (code === "username-format") return account.errors.usernameFormat;
  if (code === "weak-password") return account.errors.weakPassword;
  if (code === "network") return account.errors.network;
  return account.errors.unknown;
}

function messageFor(error: unknown): string {
  return error instanceof AccountError ? errorText(error.code) : account.errors.unknown;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="t-heading">{title}</h2>
      {children}
    </section>
  );
}

function RecoveryCodeReveal({ code, onDone }: { code: string; onDone: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <TransmissionWindow open title={account.recoveryCodeReveal.title} onClose={() => undefined} actions={<button type="button" className="btn btn-strong" disabled={!confirmed} onClick={onDone}>{account.recoveryCodeReveal.continueButton}</button>}>
      <p className="t-body">{account.recoveryCodeReveal.body}</p>
      <p className="t-heading mono" style={{ letterSpacing: "0.1em" }}>{code}</p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => { setCopied(true); });
        }}
      >
        {copied ? account.recoveryCodeReveal.copied : account.recoveryCodeReveal.copy}
      </button>
      <label className="flex flex-col gap-2">
        <span className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); }} />{account.recoveryCodeReveal.confirmCheckbox}</span>
      </label>
    </TransmissionWindow>
  );
}

function SignedOutView() {
  const { signUp, signIn, redeemRecoveryCode } = useAccount();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">("sign-in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [revealCode, setRevealCode] = useState<string | undefined>(undefined);

  async function submitSignIn() {
    setBusy(true);
    setError(undefined);
    try {
      await signIn(username, password);
      // AccountProvider's auth-state listener reloads the page once the session lands.
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitSignUp() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await signUp(username, password);
      setRevealCode(result.recoveryCode);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot() {
    setBusy(true);
    setError(undefined);
    setStatus(undefined);
    try {
      const result = await redeemRecoveryCode(username, recoveryCode, newPassword);
      if (result.ok) {
        setStatus(account.forgotPassword.success);
        setMode("sign-in");
        setPassword("");
      } else if (result.error === "locked") {
        setError(account.forgotPassword.lockedOut);
      } else {
        setError(account.forgotPassword.invalid);
      }
    } catch {
      setError(account.errors.network);
    } finally {
      setBusy(false);
    }
  }

  if (revealCode !== undefined) return <RecoveryCodeReveal code={revealCode} onDone={() => { setRevealCode(undefined); }} />;

  return (
    <Section title={mode === "sign-up" ? account.signUp.title : mode === "forgot" ? account.forgotPassword.title : account.signIn.title}>
      <p className="t-body">{account.guestBanner}</p>

      {mode === "forgot" ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submitForgot(); }}>
          <p className="t-body">{account.forgotPassword.body}</p>
          <label className="flex flex-col gap-2">{account.forgotPassword.username}<input className="field" value={username} onChange={(e) => { setUsername(e.target.value); }} autoComplete="username" required /></label>
          <label className="flex flex-col gap-2">{account.forgotPassword.recoveryCode}<input className="field mono" value={recoveryCode} onChange={(e) => { setRecoveryCode(e.target.value); }} required /></label>
          <label className="flex flex-col gap-2">{account.forgotPassword.newPassword}<input className="field" type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); }} autoComplete="new-password" required minLength={8} /></label>
          {error !== undefined ? <p role="alert" className="t-body">{error}</p> : null}
          <button type="submit" className="btn btn-strong" disabled={busy}>{account.forgotPassword.submit}</button>
          <p className="t-meta text-quiet">{account.forgotPassword.noCodeLeft} <a href={`mailto:${contact.email}`}>{account.forgotPassword.contactSupport}</a></p>
          <button type="button" className="btn" onClick={() => { setMode("sign-in"); setError(undefined); }}>{account.signIn.title}</button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void (mode === "sign-up" ? submitSignUp() : submitSignIn()); }}>
          <label className="flex flex-col gap-2">
            {mode === "sign-up" ? account.signUp.username : account.signIn.username}
            <input className="field" value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase()); }} autoComplete="username" required pattern="[a-z0-9_-]{3,24}" />
          </label>
          {mode === "sign-up" ? <p className="t-meta text-quiet">{account.signUp.usernameHint}</p> : null}
          <label className="flex flex-col gap-2">
            {mode === "sign-up" ? account.signUp.password : account.signIn.password}
            <input className="field" type="password" value={password} onChange={(e) => { setPassword(e.target.value); }} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={mode === "sign-up" ? 8 : undefined} />
          </label>
          {mode === "sign-up" ? <p className="t-meta text-quiet">{account.signUp.passwordHint}</p> : null}
          {error !== undefined ? <p role="alert" className="t-body">{error}</p> : null}
          {status !== undefined ? <p role="status" className="t-body">{status}</p> : null}
          <button type="submit" className="btn btn-strong" disabled={busy}>{mode === "sign-up" ? account.signUp.submit : account.signIn.submit}</button>
          <div className="flex flex-col gap-1">
            <button type="button" className="btn" onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setError(undefined); }}>
              {mode === "sign-up" ? account.signUp.switchToSignIn : account.signIn.switchToSignUp}
            </button>
            {mode === "sign-in" ? <button type="button" className="btn" onClick={() => { setMode("forgot"); setError(undefined); }}>{account.signIn.forgotPassword}</button> : null}
          </div>
        </form>
      )}
    </Section>
  );
}

function SignedInView() {
  const { username, signOut, changeUsername, changePassword, regenerateRecoveryCode, setLeaderboardOptIn, deleteAccount } = useAccount();

  const [newUsername, setNewUsername] = useState("");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<string | undefined>(undefined);

  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | undefined>(undefined);

  const [revealCode, setRevealCode] = useState<string | undefined>(undefined);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const [optIn, setOptIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [leaderboardStatus, setLeaderboardStatus] = useState<string | undefined>(undefined);

  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function submitUsername() {
    setUsernameBusy(true);
    setUsernameStatus(undefined);
    try {
      await changeUsername(newUsername);
      setUsernameStatus(account.account.changeUsername.success);
      setNewUsername("");
    } catch (err) {
      setUsernameStatus(messageFor(err));
    } finally {
      setUsernameBusy(false);
    }
  }

  async function submitPassword() {
    setPasswordBusy(true);
    setPasswordStatus(undefined);
    try {
      await changePassword(newPassword);
      setPasswordStatus(account.account.changePassword.success);
      setNewPassword("");
    } catch (err) {
      setPasswordStatus(messageFor(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function doRegenerateRecoveryCode() {
    setRecoveryBusy(true);
    try {
      setRevealCode(await regenerateRecoveryCode());
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function submitLeaderboard() {
    try {
      await setLeaderboardOptIn(optIn, displayName.length > 0 ? displayName : undefined);
      setLeaderboardStatus(account.account.title);
    } catch (err) {
      setLeaderboardStatus(messageFor(err));
    }
  }

  async function doDeleteAccount() {
    setDeleteBusy(true);
    try {
      await deleteAccount();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      {revealCode !== undefined ? <RecoveryCodeReveal code={revealCode} onDone={() => { setRevealCode(undefined); }} /> : null}

      <Section title={account.account.title}>
        <p className="t-body">{account.account.signedInAs} <strong>{username}</strong></p>
        <button type="button" className="btn" onClick={() => void signOut()}>{account.account.signOut}</button>
      </Section>

      <Section title={account.account.changeUsername.title}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submitUsername(); }}>
          <label className="flex flex-col gap-2">{account.account.changeUsername.newUsername}<input className="field" value={newUsername} onChange={(e) => { setNewUsername(e.target.value.toLowerCase()); }} pattern="[a-z0-9_-]{3,24}" required /></label>
          {usernameStatus !== undefined ? <p className="t-body">{usernameStatus}</p> : null}
          <button type="submit" className="btn btn-strong" disabled={usernameBusy}>{account.account.changeUsername.submit}</button>
        </form>
      </Section>

      <Section title={account.account.changePassword.title}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submitPassword(); }}>
          <label className="flex flex-col gap-2">{account.account.changePassword.newPassword}<input className="field" type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); }} autoComplete="new-password" minLength={8} required /></label>
          {passwordStatus !== undefined ? <p className="t-body">{passwordStatus}</p> : null}
          <button type="submit" className="btn btn-strong" disabled={passwordBusy}>{account.account.changePassword.submit}</button>
        </form>
      </Section>

      <Section title={account.account.recoveryCode.title}>
        <p className="t-body">{account.account.recoveryCode.body}</p>
        <button type="button" className="btn" disabled={recoveryBusy} onClick={() => void doRegenerateRecoveryCode()}>{account.account.recoveryCode.regenerate}</button>
      </Section>

      <Section title={account.account.leaderboards.title}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submitLeaderboard(); }}>
          <label className="flex items-center gap-2"><input type="checkbox" checked={optIn} onChange={(e) => { setOptIn(e.target.checked); }} />{account.account.leaderboards.optIn}</label>
          <label className="flex flex-col gap-2">
            {account.account.leaderboards.displayName}
            <input className="field" value={displayName} onChange={(e) => { setDisplayName(e.target.value); }} maxLength={32} />
          </label>
          <p className="t-meta text-quiet">{account.account.leaderboards.displayNameHint}</p>
          {leaderboardStatus !== undefined ? <p className="t-body">{leaderboardStatus}</p> : null}
          <button type="submit" className="btn btn-strong">{account.account.leaderboards.title}</button>
        </form>
      </Section>

      <Section title={account.account.deleteAccount.title}>
        <p className="t-body">{account.account.exportFirst}</p>
        <p className="t-body">{account.account.deleteAccount.body}</p>
        <p className="t-meta text-quiet">{account.account.localDataIsSeparate} <TransitionLink href="/settings/">{en.nav.settings}</TransitionLink></p>
        <button type="button" className="btn" onClick={() => { setDeleting(true); }}>{account.account.deleteAccount.button}</button>
      </Section>

      <TransmissionWindow
        open={deleting}
        title={account.account.deleteAccount.title}
        onClose={() => { setDeleting(false); setDeleteConfirmText(""); }}
        actions={
          <>
            <button type="button" className="btn" onClick={() => { setDeleting(false); setDeleteConfirmText(""); }}>{account.account.cancel}</button>
            <button type="button" className="btn btn-strong" disabled={deleteConfirmText !== account.account.deleteAccount.confirmWord || deleteBusy} onClick={() => void doDeleteAccount()}>{account.account.deleteAccount.button}</button>
          </>
        }
      >
        <p className="t-body">{account.account.deleteAccount.confirm}</p>
        <label className="flex flex-col gap-2">
          {account.account.deleteAccount.typeToConfirm}
          <input className="field max-w-48 mono" value={deleteConfirmText} onChange={(e) => { setDeleteConfirmText(e.target.value); }} autoComplete="off" />
        </label>
      </TransmissionWindow>
    </div>
  );
}

export function AccountView() {
  const { ready, configured, signedIn } = useAccount();
  if (!configured) return <Section title={account.account.title}><p className="t-body">{account.notConfigured}</p></Section>;
  if (!ready) return null;
  return signedIn ? <SignedInView /> : <SignedOutView />;
}
