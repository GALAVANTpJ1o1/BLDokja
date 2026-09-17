# September 17 recognition and learning-room extension

Local work on `4bld/complete`; no push, deployment or phase-marker change.

## Implemented

- Guided trace shows six fixed centres and all stickers of one physical piece. The asked sticker is explicit. Hidden stickers are neutral in the net/loading fallback and hidden in text descriptions. Previous target reviews without duplicate analytics; shared parent-route Back links are available.
- `/practice/speffz/` has seeded whole-edge/corner recognition rounds of 10/20/30/50 pieces. Each sticker is selected and named, correction precedes advancement, first-attempt recognition accuracy is separate from execution, and individual attempts persist with safe retry. Active round cursor is session-only; elapsed time includes pauses.
- Settings has six independently selectable paired light/dark interface palettes, six scenery choices including none, and compact/comfortable layouts. Sticker palettes remain separate. TypeScript/CSS drift, contrast, boot whitelists and backup compatibility are tested.
- Galaxy, rain, snow, forest and ocean use one adaptive decorative canvas. Scroll/settings/resize repaint it, and navigation animation is bounded to 360ms. No idle loop; reduced motion remains still, hidden tabs cancel frames, low-data/memory hints reduce work. Work surfaces are opaque for predictable contrast.
- A replayable six-step site guide stores its cursor, supports Previous/Next/restart and resumes after reload. Saving failures retain the current dialog/step. Escape/Close return focus to an explicit trigger.
- uv 0.12.15 and BrowserAct 1.4.2 installed with approval. No BrowserAct browser, imported profile, API key or remote session was configured. Its separate browser-creation approval is still needed.

## Skill influence and independent review

The requested frontend skills were used to extend the established cube-led workbench rather than invent unrelated marketing chrome. Generated theme/Speffz/CFOP concepts are unapproved direction references, not shipped assets or verified cube states. Impeccable's detector ran once on the new appearance/guide components and returned no findings.

Fresh-context finish review returned **fix**, scoped to appearance/scenery/guide and shared-shell effects. Findings were small Restart target/moving dialog geometry, mobile font hierarchy, horizontal overflow, disabled-state clarity and stale design documentation. The correction batch makes Restart a 44px button, uses opacity-only dialog entrance, sizes decorative canvas without scrollbar-gutter overflow, contains dialog scrolling/corner marks, and distinguishes disabled choices. The required documenter completed `docs/DESIGN.md` and `.impeccable/design.json`; main-agent validation confirms 91 actual colour tokens, nine type roles, eight previews and all 72 theme values matching runtime data.

The same reviewer's final fix-list verdict closes hit-testing, overflow, disabled treatment and documentation. Typography is **partial, environment-limited**: Chromium shows intended weights, but physical Safari or macOS WebKit evidence remains required. Final disposition is **fix** solely for that evidence limitation, not a demand to distort production CSS or a whole-product rejection. No correction-batch regression was identified.

The mobile Restart bug was reproduced with actual events: pointerdown reached its button, while click reached the parent during scale entrance. Tests were not bypassed with forced clicks. Appearance tests now wait for enabled radios instead of activating labels around disabled inputs.

## Verification

- Complete unit suite: 720 passing / one skipped (523 engine, 143 web, 39 storage, 10 analytics, 5 SRS).
- Typecheck and lint pass. Production static export passes with 59 pages and 504 offline files.
- Initial production appearance/guide/Speffz checks: 18/20 passing; reproduced mobile Restart and isolated a disabled-label readiness issue. A subsequent overflow assertion caught dialog corner marks extending four pixels beyond its scroll boundary; fixed inside the panel, not suppressed by changing assertions.
- Complete correction-batch production regression: **77 passing / three intentional skips** across Chromium, Firefox, WebKit and phone WebKit. All 20 appearance/guide/Speffz checks pass, including untouched assertions for modal/document overflow and reachable actions. Existing skips are emulated WebKit offline checks and the phone-only desktop case grid.
- Supplementary Chromium mobile captures retain the intended Recursive role hierarchy without injected CSS; required WebKit captures remain available with the Windows font-rendering caveat. The final independent fix-list verdict leaves that typography evidence open and closes the other four fixes.

### Font evidence limitation

Windows Playwright WebKit renders the loaded Recursive variable font with identical canvas ink at weights 420 and 700 (352542), while Chromium renders distinct weights (601214/818205). The font contains valid CASL and wght axes; computed CSS roles retain intended weights. This is consistent with reported Windows WebKit font-rendering limitations, not proof of a real Safari defect. No platform-specific CSS distortion or user-agent workaround was shipped to make the harness screenshot appear fixed. [Playwright issue 7441](https://github.com/microsoft/playwright/issues/7441), [issue 16104](https://github.com/microsoft/playwright/issues/16104), [browser guidance](https://playwright.dev/docs/browsers#webkit).

Capture mobile Chromium as additional visual evidence; retain WebKit interaction evidence and explicitly leave physical Safari typography/virtual-keyboard validation open.

### Strict audit, not a clean pass

The premium static auditor is scoped to actual `apps/web/src`, excluding generated exports/vendor modules. It returns 29 errors: 19 existing forms lacking `noValidate`, six existing textarea resize-policy mismatches, three lab button detections (handlers use props spread), and one hard-coded root DESIGN.md check despite the project's maintained `docs/DESIGN.md` equivalent. There are no ownership decisions left unresolved. These are recorded, not waived into a whole-site pass; fix true form issues in a separate logical reliability pass.

## Still pending

CFOP content and a complete engine-verified OLL/PLL case corpus/recall drills; verified navigation-cube sequences including the rare Indian flag only if a real normal-cube sequence is verified. The confirmed CFOP order is notation → beginner F2L → 2-look OLL/PLL → advanced intuitive F2L → full OLL/PLL; no beginner-method teaching.

Previous mobile Lighthouse snapshots remain about 77/78 on lesson/3-style, below the specification's 95 goal. No new Lighthouse improvement is claimed. Physical cube, physical iOS/Android, TTS and deployment-header checks remain hands-on work. The attached hourly resume automation remains active.
