# CFOP additions to the existing learning surface

Mode: Read with interactive practice. This extends the established lesson renderer, learning-path rows and engine-driven cube; it is not a new identity or an approved image-comp recreation.

## Direction contract

THESIS: Explain the physical mechanism before asking for an algorithm. A connected pair is a two-colour block, not a flashcard with a memorised string.

OWN-WORLD: Inherit Recursive, opaque theme-aware lesson surfaces, semantic sticker colours, section rules, readable prose and the shared native controls. No new tokens, fonts, imagery or floating card grid.

STORY: A solver who already knows the beginner method refreshes notation, identifies a corner–edge pair, and follows opening, inserting and closing its slot. Blindfolded prerequisites and custom-buffer warnings do not belong to this independent course.

FIRST VIEWPORT: Existing lesson header and overview precede a short explanation and a large interactive cube. Face-turn controls sit directly below their cube. The first F2L cube appears before detailed prose; demonstrations each highlight the whole pair and fixed centre landmarks, with exact net/text state and optional 3D inspection. Track jump links avoid scrolling past all BLD lessons to find CFOP.

FORM: Local content and control extension inside the existing learning surface. No concept seed or image approval is claimed. Signature interaction: Previous move removes one explorer action, restores the exact previous state and returns focus to the first move when the history becomes empty; Start over clears only that explorer.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Scope and correctness

Notation and connected-pair insertions are the first delivered portion, not a complete CFOP course. Pairing/extraction, 2-look OLL/PLL, advanced F2L and full OLL/PLL memorisation remain pending. The course explicitly says this. Existing BLD lessons and their global roadmap behaviour are preserved; CFOP gets its own next-lesson marker.

Insertion demonstrations were selected from a computational search over side turns, U turns and inverse side turns. Tests independently assert starting target identities, all five sticker colours, the preserved cross and other slots, and the exact solved result after the taught moves. Nothing is accepted merely because it parses or because an inverse was constructed.

## Verification and review

- Final unit suite after the guide correction: 746 passing / one existing skip (547 engine, 145 web, 39 storage, 10 analytics, 5 SRS). Typecheck, lint and production build passed. Export: 61 pages, 516 offline files, cache `bldokja-3c241e4b9fc264df`.
- Eight new CFOP browser checks passed across Chromium, Firefox, Windows WebKit and iPhone-sized WebKit. They assert exact move reversal, focus recovery, net-first display, quiz retry, saved progress and both insertion cubes' forward/back/reset states.
- First full regression: 81 passing / three intentional skips / four failures. Two workspace fixtures navigated without confirming the persisted voice preference; another used an obsolete exact dialog-button name. The fourth was a five-second settings-ready timeout during six-browser/other-check CPU contention. Fixtures now wait for hydration and controlled saved selection, use the full accessible caption, and retain their original product assertions. Complete two-worker rerun: 84 passing / three intentional skips / one reproducible Firefox guide-reopen failure, with all earlier failures resolved. The initial fixture failures are not described as new CFOP product defects or a passing full regression.
- The Firefox failure is a real readiness mismatch: native diagnostics found DOM disabled=false while React's handler props still had disabled=true after reload. D048 documents the narrow native autocomplete-off correction and primary Mozilla references. The same independent reviewer found no material issue and retained CFOP's visual ship verdict; no extra visual recapture or second detector was needed for this attribute-only change. After rebuilding, the original Firefox save/Escape/reload/resume/restart test passed five consecutive runs, and native click-logging diagnostics passed ten fresh-context trials.
- **Final complete production regression:** 85 passing / three existing intentional skips, zero failures, across Chromium, Firefox, Windows WebKit and iPhone-sized WebKit; 88 tests, two workers, 3.2 minutes. The skips remain the two emulated-WebKit offline checks and the mobile Space-key check, not CFOP or guide failures. All eight new CFOP checks pass in this final run.
- Impeccable detector ran once for this milestone and returned `[]`. The separate strict premium audit was rerun after the guide policy: all 29 finding identities/locations are unchanged, with zero unresolved owners. It did not pass and was not weakened.
- Fresh independent finish reviewer inspected six actual desktop/mobile path, notation and F2L captures, plus a Chromium phone capture. Disposition: **ship** for these two lessons and controls; no material fixes. All captures were valid. This is an incumbent-system extension, not full-site, physical-Safari, phase-completion or complete-course approval.
- Main inspection produced one bounded batch: track jumps, earlier first cube, precise whole-pair highlights with centre landmarks, and fully hydrated checkpoint captures. No new token, font, shipped raster, identity, concept seed or image-comp approval is claimed.
- The required documenter's read-only check passed against actual PRODUCT.md, docs/DESIGN.md, .impeccable/design.json, UX-CONTRACT.md and this report, plus both lessons and shared controls. The incumbent design files remain unchanged; the UX contract's broad historical CFOP-pending statement was narrowed to the remaining course/drills. No full-site or physical-device certification is implied.

## Independent finish disposition

`/root/cfop_finish_reviewer`: **ship**, bounded to the two lessons, path entry and native recovery controls; retained after the attribute-only guide correction.

- **Persistence:** actual product/design/UX/direction files present; incumbent system preserved. No phase or physical-device approval inferred.
- **Fidelity:** Recursive roles, opaque cool lilac/slate surfaces, section rules, exact whole-pair nets/text, native controls and optional 3D match the documented lesson world. All six required captures are valid. Browser interaction results are parent-run evidence, not independently rerun by the reviewer.
- **Ceiling:** established Read/practice quality bar reached; no decorative substitute for the cube. Windows WebKit font-weight limitation remains pre-existing and physical Safari evidence remains open.
- **Material fixes:** none in the changed visual target; additional native guide policy reviewed without material issue. Final browser verification passed; this does not complete the remaining CFOP course or physical-device evidence.
- **Keep:** exact cube state, reversible focus-aware controls, independent CFOP entry and explicit unfinished-course limits. `/root/impeccable_documenter` confirmed the maintained design files need no redesign or token update.
