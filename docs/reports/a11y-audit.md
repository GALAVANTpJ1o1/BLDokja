# Accessibility and performance audit

Phase 8. Run against the production build (`pnpm build`) served as static files, with Lighthouse 12.8.2 and
the installed Chrome, on 2026-09-16. Two presets: Lighthouse's mobile default (a throttled phone on slow 4G)
and its desktop preset.

## Scores

Performance is the median of three mobile runs; accessibility and best practices were 100 on every route in every run, in both presets.

| Route | Performance (mobile) | Performance (desktop) | Accessibility | Best practices |
|---|---|---|---|---|
| `/` | 92 | 100 | 100 | 100 |
| `/learn/` | 91 | 100 | 100 | 100 |
| `/learn/<lesson>/` | 72 | 100 | 100 | 100 |
| `/practice/` | 95 | 100 | 100 | 100 |
| `/practice/trace/` | 89 | 98 | 100 | 100 |
| `/practice/m2op/` | 87 | 100 | 100 | 100 |
| `/practice/pairs/` | 91 | 100 | 100 | 100 |
| `/practice/3style/` | 82 | 100 | 100 | 100 |
| `/progress/` | 89 | 100 | 100 | 100 |
| `/settings/` | 92 | 100 | 100 | 100 |

Accessibility and best practices are **100 on every route, in both presets**. `/practice/3style/` and the
lesson page vary most between runs, because their blocking time depends on how the machine is loaded.

## How to re-run it

```
pnpm build
npx serve apps/web/out -l 3200
npx lighthouse http://localhost:3200/practice/trace/ --only-categories=performance,accessibility,best-practices --chrome-flags="--headless=new" --view
```

Add `--preset=desktop` for the desktop numbers. Lighthouse 12 no longer scores PWAs; the installability
pieces are checked by hand instead: a manifest with name, icons (192, 512 and maskable), `display:
standalone` and a same-origin `start_url`, a service worker with a `/` scope, and HTTPS in production.

## What the audit found, and what changed

| Finding | Fix |
|---|---|
| The theme boot script was blocked by the site's own CSP in every built version, so a saved theme applied only after hydration | It's a same-origin file in `<head>`; the build refuses any injected `beforeInteractive` script |
| Prefetch payloads 404ed for every nested route | The flattening step handles any depth |
| Zod's `new Function` probe was reported as a CSP violation on every page | Zod runs jitless (D-034) |
| No favicon: `/favicon.ico` 404ed | Icons drawn from the design tokens, plus a manifest (D-035) |
| Progress had 2.4 s of blocking time | It stopped rebuilding the committed 3-style datasets |
| Settings and M2/OP shifted as they loaded | Option rows are a grid; the drill area keeps its height |
| Every page downloaded the engine and Dexie | Neither is in the first load any more |
| The font was 305 KB | 109 KB, plus 73 KB only where notation appears |
| Trainers showed no text until their JavaScript arrived | Their headers are in the static HTML |
| A heat-grid cell carried `aria-label` on a span, which the rule forbids | The label, focus and keys moved to the cell |

## Checked by hand, not by the tool

- **Keyboard:** the first Tab gives "Skip to content"; every trainer runs from the keyboard (`?` lists its
  keys); the heat grids are one tab stop with arrow keys; the keys dialog is a real modal `<dialog>` that
  keeps focus inside and closes on Escape and on a backdrop click.
- **Focus:** `:focus-visible` outlines are in the base stylesheet, and the heat grid draws its own ring.
- **Names:** every control on the trainer pages has a name, and cube figures carry a written description.
- **Phone width:** no horizontal scroll at 380px on the pages changed in this phase.
- **Text-only and speech:** the written-out cube mode loads no 3D player; trainers speak each prompt when
  reading aloud is on (D-036).
- **Offline:** with the server stopped, trainers, lessons and navigation all work (D-035).

## Why mobile performance isn't 95 everywhere

Lighthouse's mobile preset simulates slow 4G and a 4× slower CPU, and charges the whole first-load
JavaScript against the largest paint. In the actual run on this machine the text paints at about 1.0–1.1 s;
the simulated figure is 2.6–5.7 s depending on the route, because 276–424 KB of script (React, the router,
and the trainer's own chunk) is downloaded first.

Closing that gap needs less JavaScript on first load, not more tuning: fewer client components on content
pages, or a rendering approach that doesn't ship a router and a React runtime to read a lesson. That's a
product decision, not a Phase 8 polish item, so it's listed in the checkpoint as a known limit.
