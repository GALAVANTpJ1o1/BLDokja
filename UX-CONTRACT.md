# BLDokja UX contract

This records shared UI consequences, not new product scope or a phase advance. Product truth is in BRIEF.md and PRODUCT.md; visual rationale and token values remain in docs/DESIGN.md.

## Business-context sources

| Scope | Authoritative source | Reviewed |
|---|---|---|
| Local-only data, no accounts/telemetry | BRIEF.md §§2, 12; PRODUCT.md | 2026-09-17 |
| Verified cube effects and convention boundaries | AGENTS.md correctness rules; docs/ENGINE.md; docs/DECISIONS.md | 2026-09-17 |
| Learning/checkpoint flow | BRIEF.md §6; September 17 user request | 2026-09-17 |
| Appearance, scenery, Back and tutorial | September 17 user request; PRODUCT.md | 2026-09-17 |
| Export/import/data lifecycle | docs/MIGRATION.md; BRIEF.md §§8, 12 | 2026-09-17 |

Billing, authentication, permission roles and server mutations do not exist in v1. Do not add pretend authorization flows.

## Canonical UI map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Buttons/fields/focus | Native controls / globals.css | Shared focus and sizing rules | Semantic button and input types; important touch targets 44px | Keyboard and phone Playwright checks |
| Scrollbar | globals.css | Global theme tokens | Platform scrollbars; forced-colours override; no per-view opt-in | Desktop/phone viewport screenshots and natural document scrolling |
| Settings | SettingsProvider / StorageAdapter | Zod settings schema | Serialized validated writes; appearance-only first-paint mirror | Storage roundtrip and appearance-boot tests |
| Appearance choices | AppearanceChoices | design/appearance.ts / colourways.css | Native radios with selected text, pending/error and retry | Contrast/mirror tests and four-browser persistence checks |
| Dialogs | TransmissionWindow | Native modal and explicit returnFocusRef | Reachable internal overflow; Escape and inert background | Guide Escape/focus checks in four browser targets |
| Trainer round selections | TrainerShell / Segmented | Session configuration | Native labelled button groups; not shareable dataset filters | Trainer keyboard checks |
| Select/Listbox | Existing native selects | Native platform popup | Native ownership; no authored popup geometry claim | Settings and trainer browser checks |
| Date | Native timestamps / localized display | ISO UTC storage and en-GB display | No date-picker UI in this scope | Existing storage/export tests |
| Form | Native form / shared fields | App-owned noValidate handlers | Inline correction; preserve values; block duplicate save | Speffz correction, retry and keyboard tests |
| Toast | Inline status/alert at action scope | Operation-owned feedback | No separate toast framework; persistent errors near action | Save status and failure-path unit/browser checks |
| CRUD | StorageAdapter-backed workspaces | Versioned validated records | Create/edit/delete/export/import; irreversible deletion has explicit confirmation, no fake Undo | Existing workspace/storage tests; manual destructive-flow review still required |
| Cube | Cube / StickerNet / cube-state | One engine state | 3D, net and text replay hide the same recognition stickers | Engine tests, masked-description tests and Speffz checks |

## Flow ledger

| Operation | Pending | Outcome / failure recovery | Focus | Source |
|---|---|---|---|---|
| Change colour/scenery/layout | Disable appearance choices, announce saving | Commit only after stored write; keep prior settings on failure and allow retry | Remains in choice group | User appearance request |
| Speffz answer | Block duplicate submission while writing | Record first attempt only; correction is learning, not a second score. Failed event retains the same ID for retry and blocks advancement | Next unanswered sticker's field; Enter ignores IME commit | User Speffz request; BRIEF §8 |
| Speffz next piece | Only when every sticker is identified and saved | Seeded coverage; completed attempts persist, active round remains session-only; total includes between-piece pauses | Explicit next action; first sticker selectable by keyboard | User Speffz request |
| Previous trace target | No storage mutation | Read-only review, no duplicate timing/accuracy event; return to exact scored frontier | Visible return control | User Back request |
| Previous explorer move / reset | No storage mutation | Remove one move or clear only this explorer's history; net, text and opted-in 3D derive from the same sequence | First move receives focus when history becomes empty | User Back request; D-047 |
| Quiz checkpoint retry | Existing checkpoint event owner | Reset questions and answer registry together; no stale selections or zero-item retry | Native answer controls remain available | BRIEF §6; D-047 |
| Guide Next/Previous/Restart | Block duplicate write, announce saving | Persist step; failure keeps dialog and prior step; retry same action | Same action; changed step announced | User tutorial request |
| Guide Close/Escape/Finish | Wait for seen-state write | Close only on successful write; preserved step resumes when reopened | Explicit trigger; invitation returns to header guide control | User tutorial request |
| Export/import | Existing settings workflow | Versioned validated envelope; review before import; no silent replacement/deletion | App-owned confirmation | docs/MIGRATION.md |

## Navigation and responsive behavior

- Parent Back is a real route link, not browser history: trainer → practice, lesson → learning path, other main area → home. Browser Back remains available.
- Route document title policy: each Next route owns metadata; existing format is `{Page} · BLDokja`.
- Route errors: owned 404/error surfaces retain navigation. 403 is not applicable without roles/accounts.
- Desktop top navigation becomes phone bottom navigation; guide remains reachable in the header. Touch, keyboard and text-mode workflows are first-class.
- Genuine comparison tables scroll horizontally with labels/actions preserved; long lessons/forms keep natural document scrolling. No fixed-height shell for table sizing.
- Focus must not sit beneath bottom navigation. Root scroll padding and control scroll margins reserve safe-area space.

## Async, validation and data safety

- StorageAdapter and Zod own persistence boundaries. New appearance and guide fields are optional additive v1 extensions; old records remain valid.
- No forms use browser validation bubbles. Label inputs, own correction copy, preserve non-sensitive values after failure and prevent duplicate saves.
- Recognition attempt IDs are idempotent. UI changes do not discard pending attempts silently.
- Settings writes merge the latest stored record transactionally. Cross-tab screen refresh is not a real-time collaboration feature; do not claim otherwise.
- Existing delete-all is irreversible hard deletion, requires explicit app-owned confirmation and typed confirmation. It is not archive/soft-delete and offers no fake Undo.
- Offline uses existing service worker/pack. Update notice is discoverable; no added network/analytics service for scenery or guide.

## Visual and motion contract

Runtime theme data is canonical in design/appearance.ts, mirrored into styles/colourways.css and tested for drift/contrast. Sticker palettes remain in design/palette.ts and styles/tokens.css. Theme choice never changes a face's meaning.

One decorative, pointer-inert canvas paints on scroll/resize/settings and at most 360ms after navigation. No idle animation loop. Hidden documents cancel frames; reduced-motion ignores scroll and travel. Low-data/memory hints lower cost. Opaque reading/work surfaces isolate foreground contrast from scenery.

## Verification and remaining risks

Run pnpm test, pnpm typecheck, pnpm lint, pnpm build and Playwright checks across Chromium, Firefox, WebKit and phone viewport. Theme contrast/mirror, boot whitelists, masked descriptions, seeded coverage and persistence are unit-tested. Guide checks cover step persistence, Previous, Escape, focus and destination links.

Real iOS/Android virtual-keyboard checks and physical-cube verification remain manual. Earlier mobile Lighthouse lesson/3-style scores (~77/78) remain below BRIEF's 95 target. Automated browser engines are not physical-device evidence. The later CFOP extension adds independently verified notation and connected-pair insertion lessons, reversible explorer controls and reliable quiz retry; see D047 and docs/reports/cfop-learning-surface.md. The remaining CFOP course/drills and navigation-pattern work are pending, not completed by this contract.
