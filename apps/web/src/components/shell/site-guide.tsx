"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSettings } from "@/components/settings/settings-provider";
import { TransmissionWindow } from "@/components/ui/transmission-window";
import { TransitionLink } from "@/components/transitions/transition-link";
import { siteGuide as copy } from "@/i18n/site-guide";
import type { Settings } from "@bld/storage";

export function SiteGuide({ invitation = false }: { invitation?: boolean }) {
  const { stored, ready, update } = useSettings();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement>(null);
  const index = stored?.siteGuideStep ?? 0;
  const step = copy.steps[index] ?? copy.steps[0];
  const save = async (patch: Partial<Settings>, close = false) => {
    if (busy) return;
    setBusy(true); setStatus(copy.saving);
    try { await update(patch); setStatus(""); if (close) setOpen(false); }
    catch { setStatus(copy.error); }
    finally { setBusy(false); }
  };
  const dismiss = () => { if (open) void save({ siteGuideSeen: true }, true); };
  const showInvitation = invitation && pathname === "/" && ready && stored?.siteGuideSeen !== true;
  const show = () => { returnFocus.current = invitation ? document.getElementById("site-guide-trigger") : trigger.current; setOpen(true); };
  return <>
    {invitation ? showInvitation ? <div className="guide-invitation"><p className="t-meta">{copy.welcome}</p><button ref={trigger} className="btn" type="button" onClick={show}>{index === 0 ? copy.start : copy.resume}</button></div> : null : <button ref={trigger} id="site-guide-trigger" className="btn" type="button" disabled={!ready} onClick={show}>{copy.title}</button>}
    <TransmissionWindow open={open} title={copy.title} onClose={dismiss} returnFocusRef={returnFocus} actions={<>
      <button type="button" className="btn" disabled={busy || index === 0} onClick={() => { void save({ siteGuideStep: index - 1 }); }}>{copy.previous}</button>
      <button type="button" className="btn btn-strong" disabled={busy} onClick={() => { void save(index === copy.steps.length - 1 ? { siteGuideSeen: true } : { siteGuideStep: index + 1 }, index === copy.steps.length - 1); }}>{index === copy.steps.length - 1 ? copy.finish : copy.next}</button>
      <button type="button" className="btn" disabled={busy} onClick={dismiss}>{copy.close}</button>
    </>}>
      <div aria-live="polite" className="flex flex-col gap-3"><p className="t-meta text-quiet">{copy.progress(index + 1, copy.steps.length)}</p><h3 className="t-heading">{step.title}</h3><p>{step.body}</p></div>
      <TransitionLink href={step.href} onClick={() => { setOpen(false); }}>{step.link}</TransitionLink>
      {index > 0 ? <button type="button" className="btn self-start" disabled={busy} onClick={() => { void save({ siteGuideStep: 0 }); }}>{copy.restart}</button> : null}
      <p role="status" className="t-meta min-h-5">{status}</p>
    </TransmissionWindow>
  </>;
}
