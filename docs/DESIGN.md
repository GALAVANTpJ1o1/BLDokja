# BLDokja design system

Design tokens and the reasoning behind them (BRIEF §9), combined with the constellation direction in `DESIGN-DIRECTION.md`. The base system comes from your answers on 2026-09-15; the constellation layer (starfield, page transitions, transmission window, letters as stars) is added on top of it, as DESIGN-DIRECTION.md §6 asks. Where I had to fill a gap or reconcile the two, it's named below and in `docs/OVERNIGHT.md`. Tokens live in `apps/web/src/styles/tokens.css`, and `/lab` shows every one of them.

## The idea underneath

Tracing a memo is drawing a path through fixed points in a fixed order. So the site's second layer of meaning is a night sky:

- a **sticker or letter** is a star;
- a **trace** is the line drawn from star to star as each target is shot;
- a **cycle** is a constellation closing into a shape;
- the **buffer** is the anchor star everything returns to.

The persistent starfield is the quiet version of this on every page. The loud version, where guided trace draws targets as points and a completed cycle closes into a visible shape, is a Phase 4 stretch goal. Nothing in this system should fight it.

## Four principles

1. **The cube is the only colour.** The six face colours are the only hues on the site, and **a colour always means its face**. A red mark says "this is on R". Everything else is slate, chalk and ink, the starfield and its glows included. Tracks, piece types and states are told apart by type, shape, position and tone, never by a colour of their own.
2. **Letters are places, and places are stars.** A letter is a sticker. Every letter the site shows can say where it lives: the live target sits on a tile in its sticker's colour, and letters elsewhere carry a small notch in their face colour. On the starfield, a letter can also be drawn as a star (chalk with a soft glow) to mark a completion or a target.
3. **Moves only when you do.** Nothing animates on a timer or on load. Motion happens only in response to what you do: a comm turning, a target advancing, a dialog opening where you asked for it, the stars drifting as you scroll, the sky rushing past as you move to another page. Motion that carries information (the cube) is primary; the atmospheric kind (parallax, page travel) stays small, short and optional.
4. **Everything collapses to still.** Under `prefers-reduced-motion`, nothing moves: no parallax, no page travel (a plain cross-fade instead), no dialog entrance, and cube animations jump to their end with stepping. This is checked in script and in tests, not left to a media query.

## Where this departs from the brief

BRIEF §9 suggests mapping *piece types, tracks and states* to face colours. That collides with the cube: on a screen with a cube, a red "corners" label would read as "the R face". So colour means one thing only, the face, and the rest of the information architecture is carried by type and layout. You chose this on 2026-09-15.

## Reconciling the constellation direction

DESIGN-DIRECTION.md extends this system; where the two touch, this is how they fit:

| DESIGN-DIRECTION.md says | Existing system | Combined |
|---|---|---|
| Stars "white/accent-tinted"; windows have a "glowing border in the accent colour" | There is no accent colour; colour means a face (principle 1) | Stars and glows are **chalk** (the warm off-white text colour) in the dim-room theme, **ink** where a window shows in daylight. No new hue. |
| §4: sticker colours stay "the primary semantic language across the UI (piece types, tracks, states)" | Your 2026-09-15 answer: colour means only its face | The face-only rule stands; DESIGN-DIRECTION.md §6 says to keep what's already decided. |
| Parallax on scroll, page travel, dialog entrance | "Still until touched"; CLAUDE.md: motion only in response to user action | Principle 3 is restated as "moves only when you do". All three respond to something you did (scroll, navigate, open) and never run on their own. |
| Angular transmission windows | Sticker grid: 4px radii | The transmission window is the one deliberately angular surface, so dialogs read as a different layer from the page. |
| Starfield in light mode: off or near zero | Daylight is a designed theme, not an inversion | The starfield isn't drawn in the light theme at all. |
| No references to any specific work | — | The HUD and starfield vocabulary stays generic; copy in windows is plain sentences. |

## Colour

### Interface colours

Six named colours, two themes. Neither theme is an inversion of the other: the light theme is the same room in daylight, with its own contrast decisions (for example, borders are darker in light, and the stage is lighter than the ground in dark but darker in light).

| Token | Role | Dim room (dark) | Daylight (light) |
|---|---|---|---|
| `--ground` | Page background | **Slate** `#2C2F45` | **Lilac mist** `#E8E7EF` |
| `--stage` | Behind the cube and the letter grid | `#34374F` | `#DCDAE6` |
| `--text` | Body text, letters | **Chalk** `#EFE9E1` | **Ink** `#23253A` |
| `--text-quiet` | Secondary text, labels | `#B9B6C4` | `#4E5068` |
| `--rule` | Borders, dividers, grid lines | `#4F5474` | `#A9A7BA` |
| `--focus` | Keyboard focus ring (2px, offset 2px) | Chalk | Ink |

- **No accent colour.** Links are underlined, buttons have a border and a heavier weight, the current nav item gets a solid bar. An accent hue would compete with the stickers and break principle 1.
- **Contrast (WCAG 2.x), checked in `apps/web/src/design/palette.test.ts`:**

  | Pair | Dark | Light | Floor |
  |---|---|---|---|
  | Text on ground | ≥ 7:1 | ≥ 7:1 | 7 (AAA) |
  | Quiet text on ground | ≥ 4.5:1 | ≥ 4.5:1 | 4.5 (AA) |
  | Text on stage | ≥ 4.5:1 | ≥ 4.5:1 | 4.5 |
  | Focus ring on ground | ≥ 3:1 | ≥ 3:1 | 3 (non-text) |
  | Rule on ground | ≥ 1.5:1 | ≥ 1.5:1 | a visible hairline |

  The test prints the exact ratios.

### Sticker palettes

Face colours are their own token set, `--face-u` … `--face-b`, switched as a whole by the palette setting. The same tokens drive the 3D cube, the 2D nets, letter tiles and notches, so a colourblind preset recolours every face colour on the site.

| Palette | U | F | R | D | L | B |
|---|---|---|---|---|---|---|
| **Standard** | `#F4F4F1` | `#1FA25A` | `#D63A3A` | `#FFD23F` | `#F57C1F` | `#2B6CD9` |
| **High contrast** | `#FFFFFF` | `#00B050` | `#E00000` | `#FFEE00` | `#FF8000` | `#0047FF` |
| **Deuteranopia-safe** | `#FFFFFF` | `#009E73` | `#D55E00` | `#F0E442` | `#CC79A7` | `#0072B2` |

- **Deuteranopia-safe** takes the Okabe–Ito colours. Red and green are replaced by vermillion and bluish green, and orange (which collapses into red for deuteranopes) becomes reddish purple. The letters stay on their usual faces; only the colours change.
- **The cube body is black** (`#0E0E10`) in every theme. It keeps white and yellow stickers readable on lilac mist and blue stickers readable on slate, the lowest-contrast pairs.
- **A tile's letter is ink or chalk,** whichever contrasts more with that face colour. Every face in every palette reaches at least 3:1, the WCAG floor for large text, which a 48px bold tile letter is. In the standard palette white, green, yellow and orange take ink; red and blue take chalk. The test checks every palette.

### States without colour

| State | Shown as |
|---|---|
| Correct | "Correct" in text, a check-shaped mark, the item settles in place |
| Wrong | "Not quite: it's M" in text, a cross-shaped mark, the right sticker highlighted on the cube |
| Due, new, mastered | a word label, plus a mark: an open ring (due), a dot (new), a filled square (mastered) |
| Mastery grids | one lightness ramp in `--text` at 5 steps (12% to 100% opacity), plus the marks above |
| Current nav item | a solid bar on the leading edge and a heavier weight |

## Type

**Recursive**, one variable family, self-hosted (`@fontsource-variable/recursive`), with its axes doing the work of three typefaces:

- **Linear sans** (`CASL 0, MONO 0`) for all reading text.
- **Casual** (`CASL 1`) only for big single letters: the live target, section letters in the lettering trainer. Its uppercase forms are distinctive enough to act as an element on their own.
- **Mono** (`MONO 1`) for alg notation, letter pairs in grids and memo lines, where columns must line up.

| Role | Size / line height | Settings | Used for |
|---|---|---|---|
| `display-letter` | 3rem / 1 | wght 700, CASL 1 | The live target tile (72px tile) |
| `title` | 2rem / 1.15 | wght 650 | Page titles |
| `heading` | 1.375rem / 1.25 | wght 620 | Section headings |
| `subheading` | 1.125rem / 1.35 | wght 600 | Sub-sections, panel titles |
| `body` | 1.0625rem / 1.6 | wght 420 | Lessons and descriptions |
| `ui` | 0.9375rem / 1.4 | wght 500 | Buttons, inputs, nav |
| `meta` | 0.8125rem / 1.4 | wght 450 | Captions, counts, hints |
| `notation` | 1rem / 1.5 | wght 520, MONO 1 | Algs, memo lines, pair grids |

- **Sentence case everywhere.** No tracked uppercase labels.
- **Line length:** lesson text is capped at 68ch.

## Shape and layout

**Sticker grid.** 4px corner radius on panels, buttons, inputs and tiles; 2px on small marks. Borders instead of shadows: a 1px `--rule` line, and nothing floats. Spacing is an 8px scale (`4 8 12 16 24 32 48 64`). Tiles and grid cells are square.

**The workbench.** Every page that has a cube is laid out around it.

- **Desktop (≥ 960px):** a nav rail on the left (Learn · Practice · Progress, settings at the bottom). The cube stage takes a sticky left column (min 360px); text and controls take the right.
- **Tablet (600–959px):** the rail collapses to icons with labels underneath; the stage sits above the content, at most 60% of the viewport height.
- **Phone (< 600px):** a bottom bar holds the three sections and settings. The stage is full-width and square, at least 300px of cube at 380px wide, and the controls it needs sit directly under it, within thumb reach.

Pages without a cube (the letter-pair library, progress) use the same rail and a single content column.

**Home adapts.** A new visitor lands on the learning path. Once any lesson or drill is started, home becomes *Today*: reviews due, the next lesson, the weak 20.

## The constellation layer

### Starfield (`components/starfield`)

- **One `<canvas>`** fixed behind all content: never per-star DOM nodes. It is `aria-hidden` and ignores the pointer.
- **Stars** are small points in chalk at 4–10% strength, three depth layers with slightly larger, brighter near stars. They're placed by a seeded best-candidate scatter, so the field is irregular (no grid, no clumps) and the same on every visit.
- **Parallax:** stars move only when you scroll, at 0.1×, 0.2× and 0.3× the scroll speed by layer. There is no animation loop: the canvas repaints on scroll, resize and theme change, and not otherwise.
- **Adaptive count:** one star per 9,000 px² of viewport, capped at 240 on large screens and 90 on phones, and halved again where the browser reports low memory, few CPU cores or data saving.
- **Contrast by construction:** each star is painted opaque, in the ground colour blended toward chalk by at most 10%, onto a canvas filled with the ground. Overlapping stars overwrite instead of adding up, so no pixel is brighter than one star at 10%. `starfield.test.ts` checks body text, quiet text and the focus ring against that brightest colour (brightest star colour `#404255`: text 8.2:1, quiet text 5.0:1, focus ring 8.2:1; the test prints the ratios).
- **Light theme:** not drawn.
- **Reduced motion:** scrolling isn't even listened to; the field is painted once and stays put. A test paints the whole field at two scroll positions and requires identical output.

### Moving between pages (`components/transitions`)

- **Mechanism:** the View Transitions API, through `TransitionLink` (used by the nav). The route change runs inside `document.startViewTransition`, and the kind of transition is stamped on `<html>` as `data-transition` while it runs.
- **Full motion, "travel":** the old sky streaks outward (scale to 1.08 with a faint blur) and fades; the old page recedes (scale 0.97) and fades; the new sky settles from 1.05 to rest while the new page arrives from 0.98. Nothing exceeds 110% scale, and everything finishes within 360ms.
- **Reduced motion, "fade":** a 160ms cross-fade of the whole page. Nothing scales, streaks or moves.
- **No View Transitions API:** the page just changes.
- The effect only shows once there are lessons to move between (Phase 3); the mechanism is in place now.

### Transmission window (`components/ui/transmission-window.tsx`)

- **The one dialog shell:** settings confirmations now, the first-visit voice picker and trainer dialogs later.
- **Shape:** a square-cornered panel on a slightly lifted ground, a 1px chalk border at 38% with a soft chalk glow, and small L-shaped corner brackets. The backdrop is the ground at 55% with a 6px blur, not a flat scrim.
- **Behaviour:** native `<dialog>` with `showModal()`, so focus stays inside, Escape and a backdrop click close it, and the page behind is inert.
- **Entrance:** scale from 95% and fade, 160ms. With reduced motion it simply appears.
- **Copy:** plain. A clear heading and ordinary sentences; no invented terminology, no bracketed system-message phrasing.

### Letters as stars

`LetterStar` draws a letter in chalk with a two-step soft glow, in the casual display style: for a lesson's completion mark, or a target display on the starfield. It's the literal form of principle 2.

## Motion

- **Durations:** 120ms for state changes in the interface (a mark appearing, a button state); 160ms for a dialog entrance and the reduced-motion cross-fade; up to 360ms for page travel. Cube move timing is cubing.js's, scaled by the tempo setting.
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)`, a quick start that settles; page travel accelerates out and decelerates in.
- **Allowed:** the cube turning; a tile flipping to its next letter; a dialog entering where you opened it; stars drifting while you scroll; page travel when you navigate.
- **Not allowed:** anything on a timer or on load; entrance animations for page sections; hover lifts; looping decoration; skeleton shimmer; zoom beyond 110%.
- **Reduced motion, checked in script as well as by media query** (`design/motion.ts` stamps `data-motion` on `<html>`, and the CSS keys its reduced rules on both):
  - no parallax;
  - page travel becomes a cross-fade;
  - dialogs appear without an entrance;
  - cube animations jump to their end.

  `motion.test.ts` checks the script path, the transition kinds, and that every moving rule in the stylesheet has both overrides.

## Review against the brief and CLAUDE.md

| Tell to avoid | Where it could creep in | What this design does instead |
|---|---|---|
| Near-black ground with one acid accent | A dark theme | Slate is clearly blue-violet (lightness 22%), and there is no accent at all |
| Cream ground, high-contrast serif, terracotta | A light theme | Lilac mist is cool, the type is a sans, and there's no terracotta or any accent |
| Identical rounded cards with soft grey shadows | Lesson lists, dashboards | No shadows; rules and square grids; lists are rows, not cards |
| Tracked-out uppercase eyebrow labels | Section labels | Sentence case only; sections are marked by position and weight |
| `01 / 02 / 03` on non-sequences | Feature lists | Numbers appear only on real sequences: lesson order, solve steps |
| One word coloured or italicised in a headline | Landing copy | Colour means a face; headlines are plain |
| `→` on buttons | Calls to action | Verbs only: "Start lesson", "Drill these" |
| Fade-and-slide-up entrances | Every section | Principle 3: nothing moves on load |
| Space theme as decoration | A starfield on every page | The starfield means something (letters are stars, traces are lines), stays at 4–10%, moves only with scroll, and gives nothing an exemption from the rules above |
| Glowing neon HUD everywhere | Dialogs | Only the transmission window uses the HUD vocabulary, in chalk, with plain copy |

**Is anything still generic?** The slate/lilac pairing is calm but plain on its own. What makes it this site is that the only colour anywhere is a sticker, the letters act as places, and places are stars. If `/lab` looks like "a dark dashboard" or "a generic space theme", the fix is more letters, cubes and traces, not an accent.

## Accessibility floor (built in from the start)

- Every cube has a text representation: a face-by-face description and, where a trace exists, the targets in order (`CubeDescription`).
- Full keyboard operation with visible focus (the `--focus` ring above); trainer shortcuts are single keys, listed under `?`.
- Every palette is available in both themes; a palette never depends on a theme.
- Touch targets at least 44×44px on phones.
- The starfield and page transitions are `aria-hidden` and decorative; screen-reader users lose nothing without them.
- Text over the starfield keeps WCAG AA against the brightest star colour possible, checked in `starfield.test.ts`.
- Reduced motion collapses every moving part to still (principle 4), checked in `motion.test.ts` and `starfield.test.ts`.
