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
- Speffz milestone committed as a2497ad after unit/lint checks. Follow-up 8666c90 fixes hidden-state disclosure in text descriptions; visual and screen-reader masks now match.
- Six extra paired light/dark interface colourways and galaxy/rain/snow/forest/ocean/none scenery choices implemented independently from sticker palettes, with compact/comfortable density. Single adaptive canvas has no idle animation; navigation is bounded to 360ms and reduced motion stays still. Optional additive settings preserve old backups; contrast/CSS-mirror/boot/schema tests pass.
- Six-step replayable site guide implemented with persisted cursor, Previous/Next/restart, Escape and explicit return focus. Header entry plus non-modal home invitation; no surprise onboarding modal. Browser tests verify reload/resume and destination links.
- Fresh Impeccable finish review returned fix for guide hit-testing, mobile type hierarchy/overflow, disabled states and stale design docs. Mobile pointerdown-to-parent-click was reproduced during scale entrance; Restart now 44px and entrance opacity-only. Canvas width excludes scrollbar gutters and dialog corner marks are inside scroll bounds. Disabled appearance labels now visibly dim. Required documenter completed docs/DESIGN.md and .impeccable/design.json; main validation confirms 91 actual colours, nine type roles, eight previews and all 72 interface values matching runtime data. Same reviewer's final verdict closes four fixes, leaves typography partial/environment-limited, disposition fix pending physical Safari/macOS evidence; no fix-batch regression identified.
- Complete unit suite 720 passing / one skipped (523 engine, 143 web, 39 storage, 10 analytics, 5 SRS); typecheck/lint/build pass. Latest static export: 59 pages, 504 offline files, cache bldokja-0989093bb6939ed3. Full production Playwright regression: 77 passing / three existing intentional skips; all 20 new appearance/guide/Speffz checks pass.
- uv 0.12.15 and BrowserAct 1.4.2 installed from PyPI; BrowserAct core 2.0.2 loaded. BrowserAct has no configured browser or API key, so further browser creation requires its advanced instructions/confirmation. Playwright remains available.
- Attached automation resume-bldokja-improvements is ACTIVE hourly.
- PRODUCT.md records confirmed scope. Three separate theme-settings/Speffz/CFOP design references generated; these are direction references, not approved mathematical cube diagrams or shipped UI screenshots.

## Next actions

1. Correction-batch regression, required recaptures, same-reviewer fix-list verdict and documentation validation are complete. Save the logical appearance/guide milestone after the successful latest pnpm test; do not claim whole-site or physical Safari approval. Typography remains an explicit evidence limitation.
2. CFOP content/complete engine-verified OLL/PLL corpus and recall drills, then verified navigation-pattern cube remain unimplemented. Await answer to optional image-mockup-vs-direct-build preference question; do not store an unanswered default as user approval. All existing 3BLD/4BLD lessons already present.
3. Strict premium UI static audit is now scoped to app source (premium-ui.json): 29 pre-existing flags (19 noValidate, six textarea-policy mismatches, three lab props-spread false positives, and root DESIGN check despite maintained docs/DESIGN). No unresolved ownership. Fix true existing form issues in a separate logical reliability pass; do not pretend static audit passed.
4. BrowserAct is installed and its advanced instructions read. Its own confirmation gate requires a new end-of-turn approval before creating a blank local Chrome browser; installing uv/BrowserAct did not authorize browser creation. Continue local checks with installed Playwright meanwhile.
5. Run unit/type/lint/build and new browser checks; update this file at every milestone and commit logically (pnpm test before each commit). Respect the existing active hourly follow-up; don't duplicate it.

## Verification / open risks

Latest pre-task tests 706 passing / 1 skip, Playwright 57 passing / 3 skips. Mobile Lighthouse lesson/3-style scores ~77/78 remain below target; don't claim performance solved. Physical cube and real iOS testing remain manual. CFOP and decorative pattern algorithms must not ship from memory or with unverified effects.

Windows Playwright WebKit renders identical variable-font ink at weights 420/700 despite valid font axes; Chromium renders intended distinct weights. This is consistent with Windows WebKit font limitations. Preserve real CSS weights, keep WebKit interaction evidence, use supplementary Chromium mobile visual captures, and leave real Safari typography validation open. See september-17-ui.md.

Live production server: session 44506, http://localhost:3400, serving apps/web/out. Dev3000 stopped. Full browser run 66259 and latest unit run 12925 completed successfully. .impeccable/review captures are ignored local artifacts. BrowserAct create plan requiring end-turn approval: blank local Chrome named bldokja-local-checks, local website checks only, no imported login/profile or remote stealth browser. No BrowserAct browser exists yet.
