# Crew page redesign, PR A: implementation plan

**Spec status:** approved at review round 6 (`docs/review-rounds/feat/crew-page-redesign/370e1cc9c263.md`).

**Spec:** `docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md` (§14, PR A).
**Branch:** `feat/crew-page-redesign`. **Implementer:** Opus / Claude Code (UI work, AGENTS.md routing hard rule).
**Scope:** everything the spec assigns to PR A: compact home (header, day row, pass, run of show, quick facts, show notes, "All sections"), the section sheet, the wide left nav with stacked sections, the shared theme store, `DESIGN.md` amendments, on today's crew section ids and bodies. Shared section bodies are PR B and PR C, with their own plans.

## Acceptance coverage

The criteria live in the spec (§13); this plan claims them by task.

| Spec criterion | Task(s) |
|---|---|
| AC-1 compact order | Task 10, Task 13, closeout step 2 |
| AC-2 sheet open/close/Back | Task 6, Task 7, Task 13 |
| AC-3 wide nav and stack | Task 7, Task 14 |
| AC-4 old `?s=` values | Task 7 (PR A ids unchanged; aliases arrive in PR B) |
| AC-5 theme switch | Task 1, Task 8, Task 13 |
| AC-6 no withheld data | Task 3, Task 4, Task 10, Task 13 |
| AC-7 quick facts rules | Task 2, Task 11 |
| AC-8 copy toast | Task 11 |
| AC-9 admin renders shared bodies | PR B / PR C plans |
| AC-10 ids and groups equal admin | PR C plan |
| AC-11 dimensional invariants | Task 15 |
| AC-12 transitions | Task 16 |
| AC-13 copy | every UI task; Task 17 sweep |
| AC-14 UI gate | closeout |

## Meta-test inventory

- **Extends:** `tests/components/tiles/_metaSentinelHidingContract.test.ts` and `tests/components/tiles/_pureRenderCompliance.test.ts` walk the new crew components (Task 17); `tests/crew/_metaTileProducerTopology.test.ts` ownership map (Task 10); `tests/styles/tapTargetCensus.ts`, `tests/styles/forcedColorsCensus.ts`, `tests/styles/subtleInteractiveExemptions.ts` rows for new and moved controls (Task 17); `tests/ci/_metaE2eWorkflowCoverage.test.ts` and `tests/ci/_metaSpecRegistration.test.ts` for the new wide spec (Task 14); `tests/styles/_metaZIndexBands.test.ts` band (exemptions in `tests/styles/zIndexExemptions.ts`) for the sheet (Task 6).
- **Creates:** none. No Supabase call site, admin-alert producer, advisory lock, mutation surface or email path changes in PR A (invariants 2, 3, 9, 10 do not apply).

## E2E harness readiness

- **Boot:** the existing `playwright.config.ts` `webServer` (127.0.0.1, `E2E_PORT`), unchanged.
- **Readiness gate:** the section controller sets `data-crew-controller-ready="true"` on its root in a mount effect; every new case awaits that attribute before its first assertion, never `networkidle` alone.
- **Clock:** pinned before first hydration with the existing `SHOW_DAY_N_INSTANT` pattern (`tests/e2e/crew-page.spec.ts:167`).
- **Detach safety:** geometry samplers read rects in one `page.evaluate` call per sample rather than chained locator calls on elements a transition may unmount.
- **Projects:** compact cases run under `mobile-safari` (crew-page and crew-section-toggle specs); wide cases run under `desktop-chromium` in the new tests/e2e/crew-wide-nav.spec.ts (new), which `desktop-chromium`'s `testMatch` (`playwright.config.ts:98`) does not cover today and Task 14 registers.

<!-- tasks: depth=2 -->

## Task 1: Shared theme store

<!-- task: red=`pnpm vitest run tests/components/layout/themeStoreAgreement.test.tsx` ac=AC-5 -->

Red: two mounted `ThemeToggle`s; toggling one leaves the other showing the old value, because `useAppliedTheme` keeps per-instance `useState` (`components/layout/useAppliedTheme.ts:71-89`). Green: a module-level store read through `useSyncExternalStore`, notified by `setTheme` and the `storage` event. Also asserts a `storage` event from another tab updates both. Failure mode caught: the two controls disagree, or a toggle computes from a stale value. Commit `feat(crew-page): share theme state across mounted controls`.

## Task 2: Quick facts module

<!-- task: red=`pnpm vitest run tests/crew/quickFacts.test.ts` ac=AC-7 -->

Red: the module lib/crew/quickFacts.ts does not exist. Green: `QuickFactId`, `DEFAULT_QUICK_FACT_ORDER`, `selectQuickFacts`, `reservationForNight` per spec §4.5. Cases: order kept and capped at 4; empty and sentinel sources skipped; `parking` absent for a viewer `transportTileVisible` excludes; the client contact never selected; `hotel` and every personal fact absent for a plain `admin` viewer; `reservationForNight` includes the check-in night, excludes the check-out night, orders overlaps by `ordinal`, returns null rather than the first reservation; the Wi-Fi fact uses `parseWifiValue` (`lib/crew/wifiDisplay.ts:114`) so it matches the Venue section. Fixture values derive from the seeded show fixtures, never literals.

## Task 3: Pass model

<!-- task: red=`pnpm vitest run tests/crew/passModel.test.ts` ac=AC-6 -->

Red: lib/crew/passModel.ts does not exist. Green: the server-side builder of the pass props for `live` and every `day(iso)` (spec §4.3), including countdown eligibility through `clockToMinutes`. Cases: each day phase; each restriction kind; personal cells only for `crew` and `admin_preview`; "Your lead" first LEAD in roster render order, omitted when it is the viewer; the suppressed-dates case serializes the whole props object and searches it for every ISO date of the show and every hotel date (failure mode: the §2.2 leak returning through any field), and asserts the server-computed state kind equals `selectRightNowState` run with the real dates for each fixture (`dateless`, `unknown`, `viewer_unconfirmed`); `clockToMinutes` null gives no status line.

## Task 4: Section membership and peeks

<!-- task: red=`pnpm vitest run tests/crew/crewSections.test.ts tests/crew/sectionPeek.test.ts` ac=AC-6 -->

Red: lib/crew/crewSections.ts and lib/crew/sectionPeek.ts do not exist. Green: PR A membership (six base sections, `budget` only when `financialsVisible`, matching `app/show/[slug]/[shareToken]/_CrewShell.tsx:243`), and peeks that read only gated fields. Cases: a transport leg never feeds the Travel peek for a viewer the transport gate excludes; no date reaches a peek for a suppressed viewer; empty peek is null, never placeholder text.

## Task 5: Shared sheet constants and scroll lock

<!-- task: red=`pnpm vitest run tests/components/shared/sheetConstants.test.ts tests/lib/ui/scrollLock.test.ts tests/styles/_metaBodyOverflowWriters.test.ts` ac=AC-2 -->

Red: no shared module exports the drag thresholds (`components/admin/review/ReviewModalShell.tsx:47-49` defines them locally); lib/ui/scrollLock.ts (new) does not exist; four files write `document.body.style.overflow` directly (`components/agenda/AgendaEmbed.tsx:113-116`, `components/diagrams/GalleryLightbox.tsx:723-726`, `components/admin/review/ReviewModalShell.tsx:241-244`, `components/admin/FinalizeButton.tsx:815-818`). Green: the shared constants module exports `DRAG_DISMISS_THRESHOLD_PX = 110` and `DRAG_SLOP_PX = 6` and `ReviewModalShell` imports them; `acquireScrollLock()` is reference-counted (unit cases: every release order of three holders restores the original value exactly once, after the last release; a double release is a no-op); all four writers migrate to it; the new structural test walks `app/`, `components/` and `lib/` and fails on any other writer, proven by planting a fifth writer in a temp copy and seeing it fail. Admin rendered DOM unchanged; `ReviewModalShell` and `FinalizeButton` existing tests stay green unmodified. Commit `refactor(ui): share one reference-counted body scroll lock`.

## Task 6: Bottom sheet component

<!-- task: red=`pnpm vitest run tests/components/crew/bottomSheet.test.tsx` ac=AC-2 -->

Red: the component does not exist. Green: the sheet per spec §5.2: `role="dialog"`, `aria-modal`, labelled by its title; focus to the title on open and back to the opener on close; focus trap; page `inert`; body scroll lock; every close path calls one `onRequestClose`; Esc, scrim and swipe ignored while another `aria-modal="true"` dialog is open; body scroll locked through `acquireScrollLock()` from Task 5 (case: the sheet and a nested dialog unmounting in one commit leave the body unlocked); drag thresholds from Task 5; z-index band registered for `tests/styles/_metaZIndexBands.test.ts`. Width rules per §5.2.

## Task 7: Section controller

<!-- task: red=`pnpm vitest run tests/components/crew/crewSections.test.tsx` ac=AC-2,AC-3,AC-4 -->

Red: new cases for each row of the spec §5.2 history table and the §5.3 wide rules fail against today's tab controller (`components/crew/CrewSections.tsx`). Green: the controller renders compact home plus sheet and wide nav plus stacked sections from the same server-rendered `sectionNodes` (freshness invariant unchanged); exports the `useSectionController()` hook returning `{ openSectionAndReveal(sectionId, targetId) }`, the shape the search session's spec uses (its §9, branch `feat/crew-show-search`), so search's code does not change when this lands; sets the readiness attribute; calls the shared `activeSectionFor` (Task 12). `CrewSubNav` and its tests are retired here after their failure modes move into these cases (aria-current on the active item, 44px targets, no `next/link`, budget gate). Failure modes: an in-sheet switch then close lands on the first section; a deep-link close leaves the page; an unknown `s` stays open; a realtime refresh that drops the open section from membership closes the sheet (it must stay open with fresh content).

## Task 8: Header

<!-- task: red=`pnpm vitest run tests/components/layout/crewHeader.test.tsx` ac=AC-5 -->

Red: `components/layout/Header.tsx:141` renders `ThemeToggle` only for identity-less viewers. Green: the toggle for every crew-page viewer; the search slot (renders search's field when present, otherwise nothing); the status slot. Case: an identified viewer sees the header toggle and the avatar checkbox, and they agree (Task 1).

## Task 9: Day row

<!-- task: red=`pnpm vitest run tests/components/crew/dayRow.test.tsx` ac=AC-1,AC-6 -->

Red: the component does not exist. Green: spec §4.2. Cases: `live` presses today's button only when today is in the set; a "Now" button renders exactly when today is not in the set and returns to `live`; tapping another day sets `day(iso)`; tapping today returns to `live`; hidden for suppressed, empty and degraded; grid at 4 days, scroll at 5; accessible names per §9.4. The day set comes from the Schedule section's own filtering, asserted by comparing against `ScheduleSection`'s rendered day list for the same fixture.

## Task 10: Pass component, retire RightNowHero

<!-- task: red=`pnpm vitest run tests/components/crew/pass.test.tsx` ac=AC-1,AC-6 -->

Red: the component does not exist. Green: the pass per spec §4.3, wrapping the `RightNowHero` machinery; props from Task 3. The `rightNowHero*` suites migrate to the pass (state coverage, recovery, reduced motion initial) before `RightNowHero` is deleted; `tests/e2e/__baselines__/canonical-dimensions.json` `right-now-hero-card` is replaced by the pass entry, measured in the pinned CI image. `_metaTileProducerTopology`'s ownership map updates for the new home composition.

## Task 11: Run of show, quick facts, show notes

<!-- task: red=`pnpm vitest run tests/components/crew/homeCards.test.tsx` ac=AC-1,AC-7,AC-8 -->

Red: the cards do not exist. Green: the run-of-show card (spec §4.4: the `eligible` gate of `components/crew/sections/TodaySection.tsx:222-224` around the whole card including the agenda merge; cap 6; `live`-only Next marker; raw entries to `showStartDisplayEntry`; an agenda-only day with no `ScheduleDay` still renders); the quick facts block (Task 2 data; copy success and failure toasts in a polite live region, selectable text on failure; grid spans); the show notes card (today's aggregation, caps unchanged); the full Dress code card (today's `TodaySection` rendering, kept on the home screen through PR A and PR B). Card header actions per §6.4.

## Task 12: Shared scroll-spy rule

<!-- task: red=`pnpm vitest run tests/components/shared/activeSectionFor.test.ts` ac=AC-3 -->

Red: `activeSectionFor` is private to `components/admin/review/ShowReviewSurface.tsx:97-115`. Green: extracted to a shared pure module with the same offset; `ShowReviewSurface` calls it; its rendered DOM and the 50 section-header PNGs are unchanged; `tests/styles/forcedColorsCensus.ts` line pins for `ShowReviewSurface.tsx` are updated in this commit.

## Task 13: Compact e2e

<!-- task: red=`pnpm exec playwright test --project=mobile-safari tests/e2e/crew-page.spec.ts tests/e2e/crew-section-toggle.spec.ts` ac=AC-1,AC-2,AC-5,AC-6 -->

Red: new cases fail against the tab layout. Green: AC-1 order (including the Dress code card); every §5.2 history table row; nested dialogs (agenda viewer, lightbox, report modal): Esc closes only the dialog, focus returns inside the sheet, and Back to another route with both open leaves the destination page scrollable; `gate` preserved by a row link; refresh with the sheet open; realtime refresh with the sheet open; a flight-only viewer's HTML and RSC payload contain no transport field; the pass computed background is the dark surface in both themes. Existing cases that pin removed structure are retargeted (spec §12).

## Task 14: Wide e2e and wiring

<!-- task: red=`pnpm exec playwright test --project=desktop-chromium tests/e2e/crew-wide-nav.spec.ts` ac=AC-3 -->

Red: the spec file does not exist and no project matches it. Green: the spec (nav click scrolls and focuses the heading, URL via `replaceState`, scroll-spy follows, deep link scrolls, Back/Forward over compact-created entries, `openSectionAndReveal` scrolls and highlights), registered in `playwright.config.ts` `desktop-chromium` `testMatch`, the `crew-e2e.yml` run line, `tests/ci/_metaE2eWorkflowCoverage.test.ts` and `tests/ci/_metaSpecRegistration.test.ts`.

## Task 15: Layout dimensions

<!-- task: red=`pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-wide-nav.spec.ts -g "dimensional"` ac=AC-11 -->

Red: the cases do not exist. Green: every spec §8 invariant asserted with `getBoundingClientRect()` at ±0.5px, copied verbatim into the test file header: (1) day row tracks and heights at 4 and 5 days; (2) pass minimum height constant across a day crossfade and a live-state swap, fact cells `min-w-0`; (3) quick-fact tiles share a row height, spanning tile full width; (4) sheet within 90dvh, body scrolls inside; (5) wide nav 240px, sticky, content column fills; (6) header height equals the scroll margin of a section anchor.

## Task 16: Transition audit

<!-- task: red=`pnpm vitest run tests/crew/transitionAudit.test.ts` ac=AC-12 -->

Red: new rows for the sheet, day crossfade, day buttons, nav indicator and toast are absent from the audit. Green: every `AnimatePresence`, ternary render and conditional block in the new components is listed with its treatment from the spec §7 table, including the compound rows (realtime refresh with the sheet open, breakpoint changes in both directions, removed day, nested dialog Esc, second day tap mid-fade); reduced motion collapses each to instant.

## Task 17: Structural sweep

<!-- task: red=`pnpm heavy pnpm vitest run tests/styles tests/crew tests/components tests/help tests/docs tests/specLint tests/adminAlerts` ac=AC-13 -->

Red: the suites listed in spec §12 that pin moved code fail after Tasks 6-12. Green: each pin updated in the commit that moved its code (this task only collects stragglers); the two walkers cover the new components; the derived sweep `rg -l "RightNowHero|CrewSubNav|components/crew/CrewSections|right-now-hero" tests` (42 files at base `370e1cc9c`) returns only files already migrated; the full run is green before any review dispatch.

<!-- tasks: end -->

## Closeout

1. **Design record.** `DESIGN.md` amendments per spec §3.3 (section sheet exception, crew left nav), committed as `docs(design): record crew sheet and left nav`; `pnpm vitest run tests/docs` stays green.
2. **Help screenshots.** Regenerate `public/help/screenshots/crew-preview-{today,gear,schedule}-mobile-{light,dark}.webp` through the pinned-image `screenshots-regen` workflow (`gh workflow run screenshots-regen.yml --ref feat/crew-page-redesign`), never from a dev host; the PR's `screenshots-drift` job must pass.
3. The invariant-8 UI gate runs on the PR A diff before the cross-model diff review; its findings and dispositions are recorded here, with the closeout marker line, in the gate-run commit. Then the whole-diff cross-model review to APPROVE, real CI green on every required check, `gh pr merge --merge`, and local `main` fast-forwarded to `0  0`.
