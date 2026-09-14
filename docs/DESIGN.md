# BLDokja design system

Design tokens and the reasoning behind them (BRIEF §9). The choices come from your answers on 2026-09-15; where I had to fill a gap, the gap is named in `docs/OVERNIGHT.md`. Tokens live in `apps/web/src/styles/tokens.css`, and `/lab` shows every one of them.

## Three principles

1. **The cube is the only colour.** The six face colours are the only hues on the site, and **a colour always means its face**. A red mark says "this is on R". Everything else is slate, chalk and ink. Tracks, piece types and states are told apart by type, shape, position and tone, never by a colour of their own.
2. **Letters are places.** A letter is a sticker. Every letter the site shows can say where it lives: the live target sits on a tile in its sticker's colour, and letters elsewhere carry a small notch in their face colour. The interface around the letters stays quiet so the letters and the cube read first.
3. **Still until touched.** Nothing moves on its own. Motion happens only in response to what you do, and only to show what changed: a comm turning, a target advancing, a panel opening where you clicked. `prefers-reduced-motion` turns every transition into an instant change, cube animations included (the cube jumps to the end state and offers stepping).

## Where this departs from the brief

BRIEF §9 suggests mapping *piece types, tracks and states* to face colours. That collides with the cube: on a screen with a cube, a red "corners" label would read as "the R face". So colour means one thing only, the face, and the rest of the information architecture is carried by type and layout. You chose this on 2026-09-15.

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

## Motion

- **Durations:** 120ms for state changes in the interface (a panel opening, a mark appearing); cube move timing is cubing.js's, scaled by the tempo setting.
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)`, a quick start that settles.
- **Allowed:** the cube turning; a tile flipping to its next letter; a panel expanding from the control that opened it.
- **Not allowed:** entrance animations, parallax, hover lifts, looping decoration, skeleton shimmer.
- **Reduced motion:** all of the above become instant; cube animations jump to their end with step controls.

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

**Is anything still generic?** The slate/lilac pairing is calm but plain on its own. What makes it this site is that the only colour anywhere is a sticker, and the letters act as places. If `/lab` looks like "a dark dashboard", the fix is more letters and cubes, not an accent.

## Accessibility floor (built in from the start)

- Every cube has a text representation: a face-by-face description and, where a trace exists, the targets in order (`CubeDescription`).
- Full keyboard operation with visible focus (the `--focus` ring above); trainer shortcuts are single keys, listed under `?`.
- Every palette is available in both themes; a palette never depends on a theme.
- Touch targets at least 44×44px on phones.
