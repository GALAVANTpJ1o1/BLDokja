# September 17 work checkpoint

## Confirmed user scope

- Guided trace: fixed centre colours, reveal all stickers of one physical piece, identify the selected sticker rather than an ambiguous isolated colour.
- Visible Back controls for navigation and trace review.
- Timed Speffz practice: whole edges/corners, select coloured sticker, enter its letter, 10/20/30/50 pieces, coverage randomization and separate recognition analytics.
- CFOP (no beginner method): notation, beginner F2L, 2-look OLL/PLL, advanced intuitive F2L, full OLL/PLL, memorisation drills. User explicitly confirmed this order.
- Website tutorial.
- Extra palette themes informed by the two attached inspiration screenshots; optional galaxy/rain/snow/forest/ocean parallax. Core cube colours remain semantically separate from interface themes.
- Compact optional navigation cube with verified snake/checkerboard/superflip/donut/cube-in-cube patterns. Indian flag only if a verified normal-cube move sequence produces it (user explicitly confirmed); no decorative repainting.
- Resume after account usage pauses via attached hourly follow-up, without buying/redeeming credits or publishing.

## Starting state

Previous pass committed through dd52193; git status initially only user-owned untracked AGENTS.md. Do not edit or commit that file. Existing 3BLD lessons 1-23 and 4BLD lessons 1-10 are already present. Existing local workspaces, workers, PDF, offline support and cross-browser checks documented in ui-polish.md.

## Required skills

browser-act, design-taste-frontend, imagegen-frontend-web, motion-design frontend-ui-engineering, impeccable, frontend-design, gpt-taste. Read their complete instructions on a resumed turn. Frontend-design premium companion also applies. Preserve user-requested compact practical learning UI over conflicting marketing-page recipes. Impeccable context launcher failed due to missing engine/cache permissions; existing docs/DESIGN.md read directly per its fallback. BrowserAct/uv not installed at start; user approved official uv + BrowserAct installation.

## Progress

- Scope and two material questions confirmed; instruction/context loading under way.
- Account usage checked at 94% of five-hour window; hourly attached follow-up requested.
- Guided trace/Back milestone committed as d12f097: whole-piece highlight, fixed centres, neutral hidden net stickers including the 3D-loading fallback, explicit colour swatches with asked sticker outlined, Previous target review (does not duplicate attempts), and shared parent-route Back links.
- Speffz recognition is implemented: all 12 edges/8 corners in seeded coverage rounds of 10/20/30/50 pieces, click each coloured sticker and enter its letter, correction before advancement, total/per-piece time and separate saved first-attempt recognition accuracy/median. Unsaved attempts retain an idempotent retry; round time explicitly includes pauses. Full round state is session-only; individual attempts persist.
- Unit tests passed (engine 523, web 133); typecheck passed. Playwright Speffz checks passed 8/8 across Chromium, Firefox, WebKit and phone viewport, including all 10 corner pieces, reload persistence, masking and keyboard focus. Initial test incorrectly expected a navigation link to be a button; corrected. Lint submission-handler issue corrected; recheck pending. Production build pending.
- uv 0.12.15 and BrowserAct 1.4.2 installed from PyPI; BrowserAct core 2.0.2 loaded. BrowserAct has no configured browser or API key, so further browser creation requires its advanced instructions/confirmation. Playwright remains available.
- Attached automation resume-bldokja-improvements is ACTIVE hourly.
- PRODUCT.md records confirmed scope. Three separate theme-settings/Speffz/CFOP design references generated; these are direction references, not approved mathematical cube diagrams or shipped UI screenshots.

## Next actions

1. Commit verified Speffz milestone after final unit/lint checks. Inspect text-only guided trace for hidden-state disclosure.
2. Build extra interface colourways independently of cube-sticker palettes, optional galaxy/rain/snow/forest/ocean scenery, and compact density. Keep learning surfaces readable and no idle animation cost.
3. Add replayable site tutorial, CFOP content/verified complete case corpus and recall drills, then verified navigation-pattern cube. CFOP, tutorial and new scenery are not implemented yet.
4. BrowserAct is installed and its advanced instructions read. Its own confirmation gate requires a new end-of-turn approval before creating a blank local Chrome browser; installing uv/BrowserAct did not authorize browser creation. Continue local checks with installed Playwright meanwhile.
5. Run unit/type/lint/build and new browser checks; update this file at every milestone and commit logically (pnpm test before each commit). Respect the existing active hourly follow-up; don't duplicate it.

## Verification / open risks

Latest pre-task tests 706 passing / 1 skip, Playwright 57 passing / 3 skips. Mobile Lighthouse lesson/3-style scores ~77/78 remain below target; don't claim performance solved. Physical cube and real iOS testing remain manual. CFOP and decorative pattern algorithms must not ship from memory or with unverified effects.
