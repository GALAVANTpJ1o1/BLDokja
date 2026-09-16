# Phase 8 checkpoint: accessibility, PWA, performance, deploy

Written 2026-09-16 on `phase-8/launch`, stacked on `phase-7/4bld`. BRIEF §14's checkpoint is **"Launch"**.
Nothing is merged to `master`, and **nothing is deployed**: publishing the site is yours to authorise.

## How to try it

```
pnpm build
npx serve apps/web/out -l 3200     # then http://localhost:3200/
```

To see it work offline: load a page, stop the server, and keep using the site.

## Two bugs the audit found in the built site

Both only happened in a production build, which is why no earlier phase saw them.

1. **A saved theme or palette never applied before first paint.** The boot script was injected inline at run
   time by `next/script`, and the site's own CSP blocked it. It's now a same-origin file in `<head>`, and
   the build refuses any build that injects one again.
2. **Every nested route's prefetch payload 404ed** (each trainer, each lesson), so those links fell back to a
   full page load. The flattening step now handles any depth: 29 payloads instead of 6.

## Accessibility

- **Audit:** `docs/reports/a11y-audit.md`. Accessibility and best practices score **100 on every route**, in
  both the mobile and desktop presets.
- **Text-only mode (new).** Cubes can be shown as the 3D player, a flat sticker net, or the state written
  out. The written-out mode loads no 3D at all. Every mode keeps the screen-reader description.
- **Trainers read aloud (new).** With the browser's own voice, nothing leaves the device, and it works
  offline. Each trainer speaks its current prompt; the toggle is in every trainer's header and in Settings.
- **Fixed:** a heat-grid cell carried a label on an element that may not have one; the label, focus and arrow
  keys moved to the cell itself.
- **Checked by hand:** the skip link, keyboard operation of the trainers, the modal keys dialog, focus rings,
  control names, and no horizontal scroll at 380px.

## Offline (PWA)

- **A generated service worker** precaches the whole static export: every page, script, font and dataset
  (263 files, about 7 MB).
- **A new deploy** installs in the background and takes over once every tab of the old version has closed, so
  a page never mixes files from two builds.
- **A manifest and icons**, drawn from the design tokens by a script rather than by hand.
- **Checked with the server stopped:** guided trace loads and grades an answer, navigation reaches a lesson
  and Progress, and a full page load of a lesson not yet opened shows its cubes and checkpoint.

## Performance

| What | Before | After |
|---|---|---|
| First-load script, Practice hub (uncompressed) | about 1.2 MB | about 600 KB |
| Font on a page without notation | 305 KB | 109 KB |
| Progress blocking time (mobile preset) | 2,420 ms | about 400 ms |
| Settings layout shift | 0.219 | 0 |
| M2/OP layout shift | 0.279 | about 0.01 |

What changed: the engine and Dexie left the shared layout bundle; Recursive is split into its casual and
mono axes; trainer headers render in the static HTML; Progress stopped rebuilding the committed 3-style
datasets (a test checks the shortcut matches a full rebuild record for record); Zod runs jitless; option
rows are a grid and the drill area keeps its height.

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

## What's checked automatically

New tests in this phase:

- **The boot script** applies a saved theme and palette, ignores unknown values and never throws.
- **3-style data:** the committed sets are used for their own buffers, and match their identity images
  record for record.
- **Settings:** the two new accessibility settings round-trip, and bad values are refused.
- **Announcements** join only the parts that are there.
- **The engine takes Zod from one module**, so `jitless` is set before any schema exists (a deliberate direct
  import was caught, then reverted).

**Totals:** engine 486, storage 36 (+1 skipped), srs 5, analytics 9, web 87. Typecheck, lint and the build
are clean.

## What needs you

1. **Deploying.** Nothing is published. `docs/DEPLOY.md` has the steps and the headers; the build writes
   `out/_headers`. Say the word, and where, and I'll prepare the host's config.
2. **Launch, or not yet.** BRIEF §14 calls this checkpoint "Launch", but Phase 7 (4BLD) stopped early. The
   3BLD site is complete; the 4BLD track doesn't exist yet. Launch now, or after Phase 7?
3. **Mobile Lighthouse.** Performance is 95+ on desktop but not on the mobile preset for the heavier routes.
   Closing that means shipping less JavaScript on first load, which is a product decision (see the audit's
   last section). Tell me if you want it before launch.
4. **Still open from earlier phases:** lessons keep the standard buffers; D-031's implication for Gate B;
   lessons 16–23; the analytics weights; legacy memo attempts.

## Known limits

- **Mobile performance** on the simulated slow-4G preset, as above. On this machine the text paints at about
  1 s; the model charges the whole first-load download against it.
- **The lesson page is the heaviest route**, because a lesson brings the engine and its interactive cubes.
- **A new version reaches an open tab only after it's closed.** That's deliberate; a "new version, reload"
  prompt would be a small addition if you want one.
- **Reading aloud depends on the device having a voice.** Settings says so when it doesn't.
- **The written-out cube shows the state**, not a step-by-step replay; the 3D player is still the only mode
  that animates.
- **No field measurements.** The site has no analytics by design, so performance is only ever measured here.
