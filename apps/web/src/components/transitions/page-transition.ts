/**
 * Page transitions through the View Transitions API (DESIGN.md, "Moving between pages"). This is the
 * mechanism only; the effect shows once there are lessons to move between.
 *
 * - Full motion: `travel`. The old page's stars streak outward and scale up while its content scales
 *   down and fades; the new page's stars settle from slightly zoomed in. Scale stays under 110% and
 *   everything finishes within 360ms.
 * - Reduced motion: `fade`. A plain cross-fade: no scaling, no streaking, nothing moves.
 * - No View Transitions API: the navigation simply happens.
 */
export type TransitionKind = "travel" | "fade" | "none";

export interface TransitionDocument {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
  readonly documentElement: { dataset: DOMStringMap };
}

export const TRAVEL_MAX_SCALE = 1.08;
export const TRAVEL_DURATION_MS = 360;
export const FADE_DURATION_MS = 160;

export function transitionKind(doc: TransitionDocument, reducedMotion: boolean): TransitionKind {
  if (typeof doc.startViewTransition !== "function") return "none";
  return reducedMotion ? "fade" : "travel";
}

/**
 * Runs `update` (the navigation) inside a view transition of the right kind. The kind is stamped on
 * <html> as `data-transition` for the CSS to read, and cleared when the transition ends.
 */
export async function runPageTransition(doc: TransitionDocument, reducedMotion: boolean, update: () => Promise<void>): Promise<TransitionKind> {
  const kind = transitionKind(doc, reducedMotion);
  const start = doc.startViewTransition;
  if (kind === "none" || start === undefined) {
    await update();
    return "none";
  }
  doc.documentElement.dataset.transition = kind;
  try {
    await start.call(doc, update).finished;
  } finally {
    delete doc.documentElement.dataset.transition;
  }
  return kind;
}
