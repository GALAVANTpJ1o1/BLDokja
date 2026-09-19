"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { guideUi } from "@/i18n/guides";
import { cardWidth, EDGE, placeCard, scrollDelta, SHEET_BELOW, spotBox, type Box, type Placement } from "./guide-layout";
import { neighbour, settle } from "./guide-steps";
import { hasSeen, markSeen } from "./guide-storage";
import { guideForPath, type Guide, type GuideStep } from "./guides";

/** Sent by the header's Page guide button to (re)open the guide for the page you are on. */
export const OPEN_GUIDE_EVENT = "bld:open-guide";

/** How often a running guide checks that its element is still where it was, and which steps the page still has. */
const REFRESH_MS = 250;
/** How long a page gets to show what a guide needs before the guide gives up opening by itself. */
const GIVE_UP_AFTER_POLLS = 160;
/** The time the page has to hold still, in polls, before the guide opens: layouts settle just after load. */
const STEADY_POLLS = 2;

/** True when the element, or a parent of it, is fixed to the screen: scrolling the page cannot move it. */
const isPinned = (element: HTMLElement): boolean => {
  for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) if (getComputedStyle(node).position === "fixed") return true;
  return false;
};

const boxOf = (rect: DOMRect): Box => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });

/** The first element matching a selector that is actually on screen: a page can hold a phone and a desktop copy of one thing. */
export function findTarget(selector: string): HTMLElement | undefined {
  let matches: NodeListOf<HTMLElement>;
  try {
    matches = document.querySelectorAll<HTMLElement>(selector);
  } catch {
    return undefined;
  }
  for (const element of Array.from(matches)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden") return element;
  }
  return undefined;
}

const availableIds = (guide: Guide): string[] => guide.steps.filter((step) => findTarget(step.target) !== undefined).map((step) => step.id);

interface View {
  readonly ids: readonly string[];
  readonly current: string;
  readonly spot: Box;
  readonly placement: Placement;
}

const sameView = (a: View | undefined, b: View): boolean =>
  a !== undefined &&
  a.current === b.current &&
  a.ids.join() === b.ids.join() &&
  a.spot.x === b.spot.x && a.spot.y === b.spot.y && a.spot.width === b.spot.width && a.spot.height === b.spot.height &&
  JSON.stringify(a.placement) === JSON.stringify(b.placement);

function GuideDialog({ guide, opener: pressed, onClose }: { guide: Guide; opener: HTMLElement | undefined; onClose: () => void }) {
  const titleId = useId();
  const bodyId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  // The step being shown, kept in a ref so timers and key handlers always see the latest without re-subscribing.
  const current = useRef<string | undefined>(undefined);
  const [view, setView] = useState<View | undefined>(undefined);

  /**
   * Reads the page and places the spotlight and card. `scroll` also brings the element into view first,
   * which is wanted when the step changes and not while the reader scrolls for themselves.
   */
  const measure = useCallback(
    (scroll: boolean) => {
      const order = guide.steps.map((step) => step.id);
      const ids = availableIds(guide);
      const chosen = current.current === undefined ? undefined : settle(order, ids, current.current);
      if (chosen === undefined) {
        onClose();
        return;
      }
      const changed = chosen !== current.current;
      current.current = chosen;
      const step = guide.steps.find((s) => s.id === chosen);
      const target = step === undefined ? undefined : findTarget(step.target);
      if (target === undefined) return;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const size = { width: cardWidth(viewport), height: card.current?.offsetHeight ?? 260 };
      const pinned = isPinned(target);
      if ((scroll || changed) && !pinned) {
        const sheet = viewport.width < SHEET_BELOW;
        const delta = scrollDelta(boxOf(target.getBoundingClientRect()), viewport, { top: 16, bottom: sheet ? size.height + EDGE + 8 : 0 });
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
      }
      const spot = spotBox(boxOf(target.getBoundingClientRect()));
      const next: View = { ids, current: chosen, spot, placement: placeCard(spot, size, viewport, pinned) };
      setView((previous) => (sameView(previous, next) ? previous : next));
    },
    [guide, onClose],
  );

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    // The button that opened the guide (or, failing that, whatever had focus) gets focus back when it closes.
    // Closing the dialog does that itself only while it is still in the page, which it is not once the guide has
    // unmounted, and Safari does not focus a button when it is clicked, so the button says who it is.
    const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : undefined;
    const opener = pressed ?? focused;
    if (!element.open) element.showModal();
    primary.current?.focus();
    current.current ??= availableIds(guide)[0];
    const frame = requestAnimationFrame(() => { measure(true); });
    const timer = window.setInterval(() => { measure(false); }, REFRESH_MS);
    const onMove = () => { measure(false); };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove);
      // close() (not just removal) is what hands focus back to the button that opened the guide.
      if (element.open) element.close();
      if (opener?.isConnected === true) opener.focus();
    };
  }, [guide, measure, pressed]);

  const go = (direction: 1 | -1) => {
    if (view === undefined) return;
    const target = neighbour(view.ids, view.current, direction);
    if (target === undefined) return;
    current.current = target;
    measure(true);
    // The card's height depends on the new words; place it again once they have been laid out.
    requestAnimationFrame(() => { measure(false); });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  };

  const step: GuideStep | undefined = guide.steps.find((s) => s.id === view?.current) ?? guide.steps[0];
  const total = view?.ids.length ?? 1;
  const position = view === undefined ? 1 : view.ids.indexOf(view.current) + 1;
  const first = position <= 1;
  const last = position >= total;
  const placement = view?.placement;
  const style: CSSProperties = view === undefined ? { visibility: "hidden" } : placement?.mode === "sheet" ? {} : { left: placement?.left ?? 0, top: placement?.top ?? 0, width: placement?.width ?? 340 };
  const arrow = placement?.mode === "beside" ? placement : undefined;

  return (
    <dialog ref={dialog} className="guide-layer" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={onKeyDown}>
      {view === undefined ? null : <div className="guide-spot" aria-hidden style={{ left: view.spot.x, top: view.spot.y, width: view.spot.width, height: view.spot.height }} />}
      <div ref={card} className="guide-card" data-mode={placement?.mode ?? "beside"} data-side={arrow?.side} data-dock={placement?.mode === "sheet" ? placement.dock : undefined} style={style}>
        {arrow === undefined ? null : <span className="guide-arrow" aria-hidden style={{ "--guide-arrow": `${String(arrow.arrow)}px` } as CSSProperties} />}
        <div className="guide-top">
          <span className="guide-step">{guideUi.step(position, total)}</span>
          <button type="button" className="guide-skip" onClick={onClose}>{guideUi.skip}</button>
        </div>
        <div className="guide-copy" aria-live="polite">
          <h2 id={titleId} className="guide-title">{step?.title}</h2>
          <p id={bodyId} className="guide-body">{step?.body}</p>
        </div>
        {/* The current step is the wide pill, so where you are never depends on colour alone. */}
        <div className="guide-progress" aria-hidden>
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className="guide-pip" data-state={index + 1 === position ? "current" : index + 1 < position ? "seen" : "ahead"} />
          ))}
        </div>
        <div className="guide-actions">
          {first ? null : <button type="button" className="btn" onClick={() => { go(-1); }}>{guideUi.back}</button>}
          <button ref={primary} type="button" className="btn btn-strong" onClick={last ? onClose : () => { go(1); }}>{last ? guideUi.done : guideUi.next}</button>
        </div>
      </div>
    </dialog>
  );
}

interface Running {
  readonly path: string;
  readonly guide: Guide;
  readonly opener: HTMLElement | undefined;
}

/**
 * The page guide: a short walk-through, one highlighted area at a time, that opens by itself the first time
 * you visit a page and again whenever the header's Page guide button is pressed. It waits for the page to
 * show what it needs and to settle, never opens over another dialog, and is remembered per browser.
 */
export function PageGuide() {
  const pathname = usePathname();
  const [running, setRunning] = useState<Running | undefined>(undefined);

  const start = useCallback((guide: Guide, path: string, opener?: HTMLElement) => {
    if (availableIds(guide).length === 0) return;
    markSeen(guide.id, guide.version);
    setRunning({ path, guide, opener });
  }, []);
  const close = useCallback(() => { setRunning(undefined); }, []);

  useEffect(() => {
    const guide = guideForPath(pathname);
    if (guide === undefined || hasSeen(guide.id, guide.version)) return;
    const readyWhen = guide.ready ?? (guide.steps[0] === undefined ? [] : [guide.steps[0].target]);
    let cancelled = false;
    let timer: number | undefined;
    let polls = 0;
    let steady = 0;
    let lastKey = "";
    const poll = () => {
      if (cancelled) return;
      polls += 1;
      // A page that is not on screen has no layout to point at, and another dialog (the lesson voice picker,
      // say) has to be answered first.
      const clear = document.visibilityState === "visible" && document.querySelector("dialog[open]") === null;
      const anchor = clear ? readyWhen.map(findTarget).find((element) => element !== undefined) : undefined;
      if (anchor === undefined) {
        steady = 0;
      } else {
        const rect = anchor.getBoundingClientRect();
        const key = [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(",");
        steady = key === lastKey ? steady + 1 : 0;
        lastKey = key;
        if (steady >= STEADY_POLLS) {
          start(guide, pathname);
          return;
        }
      }
      if (polls < GIVE_UP_AFTER_POLLS) timer = window.setTimeout(poll, REFRESH_MS);
    };
    timer = window.setTimeout(poll, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, start]);

  useEffect(() => {
    const open = (event: Event) => {
      const guide = guideForPath(pathname);
      const from: unknown = event instanceof CustomEvent ? (event.detail as { opener?: unknown } | null)?.opener : undefined;
      if (guide !== undefined) start(guide, pathname, from instanceof HTMLElement ? from : undefined);
    };
    window.addEventListener(OPEN_GUIDE_EVENT, open);
    return () => {
      window.removeEventListener(OPEN_GUIDE_EVENT, open);
    };
  }, [pathname, start]);

  // A guide belongs to the page it opened on; leaving the page ends it without any state to reset.
  if (running === undefined || running.path !== pathname) return null;
  return <GuideDialog key={`${running.guide.id}:${running.path}`} guide={running.guide} opener={running.opener} onClose={close} />;
}
