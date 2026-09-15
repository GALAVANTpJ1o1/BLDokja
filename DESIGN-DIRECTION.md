# Design direction: constellation theme

> Drop this into the project root (or `docs/`) and point Claude Code at it
> alongside `BRIEF.md`. This supersedes/extends whatever `docs/DESIGN.md`
> already exists from Phase 2 — reconcile rather than discard; see §6.

## 1. The actual idea, not just the aesthetic

Tracing a BLD memo is drawing a path through fixed points in a fixed order.
A cycle closing is a constellation completing. That's the real anchor for
this theme — not "space looks cool," but "this is what the site's core
mechanic already looks like." Every visual choice below should trace back
to that, not to decoration for its own sake.

Concretely, this gives the site a second layer of meaning almost for free:

- A **sticker/letter** is a star.
- A **trace** is the line connecting stars as you shoot each target.
- A **cycle** is a constellation — literally closing a shape.
- A **buffer** is the anchor star everything returns to.

Phase 4's guided trace mode should eventually *be* this literally: targets
rendered as points, the trace drawn as connecting lines, a completed cycle
visibly closing into a shape. That's a stretch goal for Phase 4, not
something to build now — but Phase 2's visual language should be chosen so
that payoff is reachable later, not fought against.

## 2. What this is explicitly NOT

- Not a reproduction of any specific webtoon, novel, or anime's UI text,
  iconography, box styling, or wording. No "[Additional clear condition]"
  style bracketed system messages, no lifted phrasing, no character names
  or references anywhere in copy or asset names.
- Not a dependency on any third-party IP's fonts, logos, or art.
- The aesthetic family being used — holographic HUD panels, angular
  sci-fi frames, starfields, constellation lines — is generic and used
  across countless sci-fi interfaces. Stay in that generic register.

If the project's current name or any existing content references a
specific copyrighted work, that's worth revisiting before any public
launch — not a blocker for this design pass, but don't compound it by
adding more direct references now.

## 3. Visual language

**Background (persistent, every page):**
- Base ground colour stays as already established in the token system
  (the dim-room deep blue-violet from the original design brief, not
  near-black) — this theme *extends* that palette, it doesn't replace it.
- A starfield layer: small points at low opacity (roughly 4–10% white/
  accent-tinted), varied sizes, irregular (non-grid) placement so it
  doesn't read as a repeating pattern.
- Rendered as a single `<canvas>` layer behind all content, not per-element
  DOM nodes — hundreds of individual absolutely-positioned divs will wreck
  scroll performance.
- **Parallax on scroll:** stars drift at a fraction of scroll speed
  (roughly 0.1–0.3x), with 2–3 depth layers (distant stars slower, near
  stars faster) for actual depth rather than a flat scroll-tied shift.
- **Hard requirement, not optional:** the entire starfield — drift, page
  transitions, everything in this brief — must collapse to fully static
  under `prefers-reduced-motion: reduce`. This isn't new; it's already in
  `BRIEF.md`'s quality floor. This theme makes it more important to
  actually test, not less.
- Performance budget: the starfield must not push any page below the
  Lighthouse ≥95 performance target already required. Cap star count
  adaptively (fewer stars on lower-end devices / small viewports) rather
  than a fixed count that's fine on desktop and chokes on mobile.

**Page transitions ("traveling through space"):**
- Outgoing page: stars streak outward and scale up slightly (a "moving
  forward" feel), content fades/scales down together.
- Incoming page: stars settle from a slightly zoomed-in state to rest,
  content fades/scales in.
- Implementation: the View Transitions API where supported, with a
  reduced-motion fallback that's just a plain cross-fade — never a hard
  cut with no fallback, and never motion sickness-inducing zoom speed
  (keep the scale delta small, under ~110%, and the duration short,
  under ~400ms).
- This is a Phase 2 app-shell concern (the transition wrapper), but the
  actual effect only matters once there are multiple routes to move
  between — fine to stub the mechanism now and see the effect once
  Phase 3 content exists.

**Pop-ups, dialogs, and system messages:**
- A single reusable "transmission window" component: angular (not
  rounded) panel, thin glowing border in the accent colour, a corner-
  bracket motif (small L-shaped marks at the panel's corners, a common
  generic HUD device), subtle backdrop blur behind it rather than a flat
  scrim.
- Text inside styled plainly — no invented in-universe terminology, no
  bracketed system-message phrasing. It should read like a clean settings
  dialog that happens to be styled like a HUD panel, not like dialogue
  from a specific show.
- Entrance: a quick scale-in from ~95% plus fade, under 200ms. No bounce,
  no elaborate multi-stage reveal — the letters/type-treatment principle
  from the original brief (individual letters as an active design
  element) is the more distinctive move; the popup shell should stay
  restrained so it doesn't compete with that.

**Letters as stars, literally:** the original design brief already called
out A–X letterforms as a first-class design element. Tie that in directly
— e.g. a lesson's completion marker or a trainer's target display can
render the current letter with the same starfield/glow treatment as the
background points, visually confirming "a letter is a star" without
needing to say so anywhere.

## 4. What stays exactly as before

- The six sticker colours remain the primary semantic language across the
  UI (piece types, tracks, states) — this theme adds depth and atmosphere
  behind that system, it doesn't compete with or replace it.
- Warm off-white text, the existing type scale, the light-theme
  alternative — unchanged. The starfield either doesn't render in light
  mode or renders at near-zero opacity; don't force a space theme onto a
  light background where it won't read.
- Every anti-cliché item from the original brief still applies. A
  starfield does not exempt anything from "avoid identical rounded cards
  with the same soft grey shadow," etc.

## 5. Accessibility, restated because this theme raises the stakes

- `prefers-reduced-motion` kills all drift, parallax, and transition
  motion — test this explicitly, don't assume the media query alone
  guarantees it works everywhere it's used.
- Text contrast against the starfield background must still meet WCAG AA
  at every point a star could sit behind text — verify with actual
  contrast checks, not by eye, since a bright star behind small text is
  an easy way to silently fail this.
- Screen-reader users get none of this and should lose nothing for it —
  the starfield and transitions are `aria-hidden`, purely decorative,
  never load-bearing for any interaction.

## 6. Reconciling with existing Phase 2 work

If `docs/DESIGN.md` and an app shell already exist from the overnight run:
read them first. Keep the token names, the six-colour system, and
anything already correct per the original brief's §9. This document adds
the starfield layer, the transition mechanism, and the transmission-window
component on top of that — it's an addition and a refinement, not a
replacement. Update `docs/DESIGN.md` in place to describe the combined
direction rather than maintaining two competing design docs.
