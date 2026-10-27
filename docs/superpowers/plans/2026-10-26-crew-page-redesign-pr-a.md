# Crew page redesign, PR A: implementation plan

**Spec status:** approved at review round 6 (`docs/review-rounds/feat/crew-page-redesign/370e1cc9c263.md`).

**Spec:** `docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md` (§14, PR A).
**Branch:** `feat/crew-page-redesign`. **Implementer:** Opus / Claude Code (UI work, AGENTS.md routing hard rule).
**Scope:** everything the spec assigns to PR A: compact home (header, day row, pass, run of show, quick facts, show notes, Dress code card, "All sections"), the section sheet, the wide left nav with stacked sections, the shared theme store, the shared scroll lock, on today's crew section ids and bodies. Shared section bodies are PR B and PR C, with their own plans.

**Plan revision:** restructured after plan review round 1 (11 findings) and repaired after rounds 2 and 3: every behavior task writes its own browser cases as its red; every deletion migrates its tests in the same task from a derived file list; compound transitions and layout invariants are tasks that own their production code; the full-suite sweep is a closeout step.

## Acceptance coverage

The criteria live in the spec (§13); this plan claims them by task.

| Spec criterion | Task(s) |
|---|---|
| AC-1 compact order | Task 12, Task 13 |
| AC-2 sheet open/close/Back | Task 7, Task 8 |
| AC-3 wide nav and stack | Task 6, Task 8, Task 13 |
| AC-4 old `?s=` values | Task 8 (PR A ids unchanged; aliases arrive in PR B) |
| AC-5 theme switch | Task 1, Task 9 |
| AC-6 no withheld data | Task 3, Task 4, Task 11, Task 12, Task 13 |
| AC-7 quick facts rules | Task 2, Task 13 |
| AC-8 copy toast | Task 13 |
| AC-9 admin renders shared bodies | PR B / PR C plans |
| AC-10 ids and groups equal admin | PR C plan |
| AC-11 dimensional invariants | Task 15 |
| AC-12 transitions | Task 14 |
| AC-13 copy | every UI task; closeout sweep |
| AC-14 UI gate | closeout |

## Meta-test inventory

- **Creates:** tests/styles/_metaBodyOverflowWriters.test.ts (new, Task 5): no file but the lock module writes `document.body.style.overflow`.
- **Extends:** `tests/components/tiles/_metaSentinelHidingContract.test.ts` and `tests/components/tiles/_pureRenderCompliance.test.ts` walk the new crew components (the task that adds each component); `tests/crew/_metaTileProducerTopology.test.ts` ownership map (Task 11, Task 13); `tests/styles/tapTargetCensus.ts`, `tests/styles/forcedColorsCensus.ts`, `tests/styles/subtleInteractiveExemptions.ts` rows for new and moved controls (the task that adds or moves each control); `tests/ci/_metaE2eWorkflowCoverage.test.ts` and `tests/ci/_metaSpecRegistration.test.ts` for the new wide spec (Task 8); `tests/styles/_metaZIndexBands.test.ts` band for the sheet (Task 7); `tests/crew/transitionAudit.test.ts` rows (Task 14).
- **Not applicable:** no Supabase call site, admin-alert producer, advisory lock, mutation surface or email path changes in PR A (invariants 2, 3, 9, 10).

## E2E harness readiness

- **Boot:** the existing `playwright.config.ts` `webServer` (127.0.0.1, `E2E_PORT`), unchanged.
- **Readiness gate:** the section controller sets `data-crew-controller-ready="true"` on its root in a mount effect; every new case awaits that attribute before its first assertion, never `networkidle` alone.
- **Clock, both sides:** the server's `today` is pinned with the authenticated frozen-time headers (`X-Screenshot-Frozen-Now` plus `Authorization: Bearer ${TEST_AUTH_SECRET}`, honored by `lib/time/now.ts:36-47`, pattern at `tests/e2e/crew-layout-dimensions.spec.ts:302-311`), and the browser clock is pinned to the same instant before first hydration (`page.clock`, pattern `tests/e2e/crew-page.spec.ts:167`). Server-computed content (tonight's hotel, Today's eligibility) and the client pass then agree on the day.
- **WebKit animations:** an installed page clock stalls framer `AnimatePresence` under mobile-safari and clicks hang (`tests/e2e/crew-page.spec.ts:1102-1105`). Every case that drives an animation (sheet open/close, crossfades, drag) pins the browser clock with `page.clock.setFixedTime`, which fixes `Date` but keeps timers running; `page.clock.install` is used only by cases that advance minute ticks and drive no animation.
- **Crew e2e execution oracle:** `scripts/check-crew-e2e-executed.mjs` keys an exact executed-case count per spec on the `crew-e2e.yml` run line, and `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` pins that table, the enrolment of every spec on the run line and the exact skipped titles. Every task that adds, removes, retitles or skips a case in a crew-e2e spec updates the count (from the observed run, never arithmetic) and the pinned titles in the same commit; Task 8 enrols crew-wide-nav.spec.ts (new).
- **Pins derived by execution, not by list:** before each task's commit, run `pnpm heavy pnpm vitest run tests/styles tests/help tests/crew tests/adminAlerts tests/cross-cutting tests/ci tests/specLint` and `rg -l` over `tests/` for the basename and every `data-testid` of each production file the task edited, and update every hit in that commit. The task bodies name the pins known at authoring time; this step is what closes the set (round 1 and round 3 of plan review each found pins a hand list missed).
- **Detach safety:** geometry samplers read rects in one `page.evaluate` per sample rather than chained locator calls on elements a transition may unmount.
- **Projects:** compact cases live in `tests/e2e/crew-page.spec.ts` and `tests/e2e/crew-section-toggle.spec.ts`, which `mobile-safari` collects (`playwright.config.ts:83-84`); wide cases live in the new tests/e2e/crew-wide-nav.spec.ts (new), which Task 8 adds to `desktop-chromium`'s `testMatch` (`playwright.config.ts:98`). Every Playwright command passes both projects and the files it needs; each project collects only its own files.
- **Heavy phases:** every non-interactive Playwright command and every directory-wide Vitest run in this plan is wrapped as `pnpm heavy <command>` (AGENTS.md heavy-phase rule).

<!-- tasks: depth=2 -->

## Task 1: Shared theme store

<!-- task: red=`pnpm vitest run tests/components/layout/themeStoreAgreement.test.tsx` ac=AC-5 -->

Red: two mounted `ThemeToggle`s; toggling one leaves the other showing the old value, because `useAppliedTheme` keeps per-instance `useState` (`components/layout/useAppliedTheme.ts:71-89`). Green: `useAppliedTheme` reads the theme through `useSyncExternalStore` over one module-level subscription notified by `setTheme`, by the existing OS-change handler (still only when no choice is stored) and by the `storage` event; `mounted` comes from a hydration-safe `useSyncExternalStore` that is false on the server and during hydration. Cases: both controls agree after either toggles; a `storage` event from another tab updates both; the no-stored-choice OS follow still works; SSR markup unchanged. Commit `feat(crew-page): share theme state across mounted controls`.

## Task 2: Quick facts module

<!-- task: red=`pnpm vitest run tests/crew/quickFacts.test.ts` ac=AC-7 -->

Red: lib/crew/quickFacts.ts (new) does not exist. Green: `QuickFactId`, `DEFAULT_QUICK_FACT_ORDER`, `selectQuickFacts`, `reservationForNight` per spec §4.5. Cases: order kept and capped at 4; empty and sentinel sources skipped; `parking` absent for a viewer `transportTileVisible` excludes; the client contact never selected; `hotel` and every personal fact absent for a plain `admin` viewer; `reservationForNight` includes the check-in night, excludes the check-out night, orders overlaps by `ordinal`, and returns null rather than the first reservation; the Wi-Fi fact goes through `parseWifiValue` (`lib/crew/wifiDisplay.ts:114`) so it matches the Venue section; the contact actions follow field validity (Call and Text only with a non-empty `digitsOnly(phone)`, Email only with a non-sentinel email); the `address` fact's Directions link only when its URL passes `isParseableUrl`; the Wi-Fi copy action is "Copy Wi-Fi password" when a password splits out and "Copy Wi-Fi details" otherwise. Fixture values derive from the seeded fixtures, never literals.

## Task 3: Pass model

<!-- task: red=`pnpm vitest run tests/crew/passModel.test.ts` ac=AC-6 -->

Red: lib/crew/passModel.ts (new) does not exist. Green: the server-side builder of the pass props for `live` and every `day(iso)` (spec §4.3). Cases: each day phase; each restriction kind; personal cells only for `crew` and `admin_preview`; "Your lead" is the first LEAD in roster render order and is omitted when it is the viewer; countdown eligibility through `clockToMinutes` for a parseable start within 3 hours, a start already past ("Show started at ..."), a start beyond 3 hours (no status line) and a null conversion (no status line); for a suppressed viewer the whole props object is serialized and searched for every ISO date of the show and every hotel date (failure mode: the §2.2 leak returning through any field), and the server-computed state kind equals `selectRightNowState` run with the real dates (`dateless`, `unknown`, `viewer_unconfirmed`) for every raw fixture.

## Task 4: Section membership and peeks

<!-- task: red=`pnpm vitest run tests/crew/crewSections.test.ts tests/crew/sectionPeek.test.ts` ac=AC-6 -->

Red: lib/crew/crewSections.ts (new) and lib/crew/sectionPeek.ts (new) do not exist. Green: PR A membership (the five base sections, `budget` only when `financialsVisible`, matching `app/show/[slug]/[shareToken]/_CrewShell.tsx:243`), and peeks that read only gated fields. Cases: a transport leg never feeds the Travel peek for a viewer the transport gate excludes; no date reaches a peek for a suppressed viewer; an empty peek is null, never placeholder text.

## Task 5: Shared sheet constants and scroll lock

<!-- task: red=`pnpm vitest run tests/components/shared/sheetConstants.test.ts tests/lib/ui/scrollLock.test.ts tests/styles/_metaBodyOverflowWriters.test.ts` ac=AC-2 -->

Red: no shared module exports the drag thresholds (`components/admin/review/ReviewModalShell.tsx:47-49` defines them locally); lib/ui/scrollLock.ts (new) does not exist; four files write `document.body.style.overflow` directly (`components/agenda/AgendaEmbed.tsx:113-116`, `components/diagrams/GalleryLightbox.tsx:723-726`, `components/admin/review/ReviewModalShell.tsx:241-244`, `components/admin/FinalizeButton.tsx:815-818`). Green: a shared constants module exports `DRAG_DISMISS_THRESHOLD_PX = 110` and `DRAG_SLOP_PX = 6`, and `ReviewModalShell` imports them; `acquireScrollLock()` is reference-counted (every release order of three holders restores the original value exactly once, after the last release; a double release is a no-op); all four writers migrate to it; the new structural test walks `app/`, `components/` and `lib/` and fails on any other writer, proven by planting a fifth writer in a temporary copy. Admin rendered DOM unchanged; the existing `ReviewModalShell` and `FinalizeButton` suites stay green unmodified; the line-keyed rows that name the edited files move with them in this commit (`tests/styles/tapTargetCensus.ts` rows for `GalleryLightbox`, `ReviewModalShell` and `FinalizeButton`; `controlOutlineScan.ts` rows for `GalleryLightbox` and `AgendaEmbed`), then the harness's derivation step closes the rest. Commit `refactor(ui): share one reference-counted body scroll lock`.

## Task 6: Shared scroll-spy rule

<!-- task: red=`pnpm vitest run tests/components/shared/activeSectionFor.test.ts` ac=AC-3 -->

Red: `activeSectionFor` is private to `components/admin/review/ShowReviewSurface.tsx:97-115`, so the new test cannot import it. Green: extracted unchanged (same offset) to a shared pure module that `ShowReviewSurface` calls; its rendered DOM and the 50 section-header PNGs are unchanged; the line pins that name `ShowReviewSurface.tsx` (`tests/styles/forcedColorsCensus.ts`, and `controlOutlineScan.ts` rows matched by `_metaControlOutlineFill.test.ts`) are updated in this commit. Cases: the boundary at the offset, the last section when scrolled to the bottom, an empty list.

## Task 7: Bottom sheet component

<!-- task: red=`pnpm vitest run tests/components/crew/bottomSheet.test.tsx` ac=AC-2 -->

Red: the component does not exist. Green: the sheet per spec §5.2: `role="dialog"`, `aria-modal`, labelled by its title; focus to the title on open and back to the opener on close; focus trap; page `inert`; body scroll through `acquireScrollLock()` (Task 5); every close path (button, scrim, Esc, swipe past the Task 5 threshold) calls one `onRequestClose`; Esc, scrim and swipe ignored while another `aria-modal="true"` dialog is open; width rules per §5.2; its z-index band registered for `tests/styles/_metaZIndexBands.test.ts` (exemptions in `tests/styles/zIndexExemptions.ts`).

## Task 8: Section controller, retire the tab bar

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-section-toggle.spec.ts tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "sheet|wide nav"` ac=AC-2,AC-3,AC-4 -->

Step 1, red: register tests/e2e/crew-wide-nav.spec.ts (new) in `playwright.config.ts` `desktop-chromium` `testMatch`, the `.github/workflows/crew-e2e.yml` run line, `tests/ci/_metaE2eWorkflowCoverage.test.ts` and `tests/ci/_metaSpecRegistration.test.ts`; write the wide cases there (nav click scrolls and focuses the heading, `replaceState` only, scroll-spy follows via Task 6, deep link scrolls, Back/Forward over compact-created entries, the scroll-spy paused during a nav-click scroll, `openSectionAndReveal` scrolling to and highlighting its target) and the compact cases in `crew-section-toggle.spec.ts` (every row of the spec §5.2 history table except "realtime refresh removes the open section", which Task 14 owns; opening from an "All sections" row; a row link keeps `gate`; refresh with the sheet open; switching sections inside the sheet resets its scroll to the top; `openSectionAndReveal` opens the sheet and reveals its target). A unit case: with no `matchMedia` the controller behaves as compact. They fail because `components/crew/CrewSections.tsx` renders tabs: there is no sheet, no nav and no `data-crew-controller-ready`. Matching Vitest cases go in `tests/components/crew/crewSections.test.tsx`.

Step 2, green: the "All sections" list (spec §4.6: rows from Task 4's membership and peeks, links built with `buildSectionHref` so `gate` survives); the controller renders compact home plus sheet (Task 7) and wide nav plus stacked sections from the same server-rendered `sectionNodes` (freshness invariant unchanged); applies the §5.2 history table; sets the readiness attribute; exports the `useSectionController()` hook returning `{ openSectionAndReveal(sectionId, targetId) }`, the shape the search session's spec uses (its §9, branch `feat/crew-show-search`). Compound transitions (§7 compound rows) are Task 14, not this task.

Step 3, migrate then delete: re-run `rg -l "CrewSubNav|components/crew/CrewSections|data-active-section" tests` and migrate every hit (including `tests/components/crew/crewSubNav.test.tsx`, `noPrefetchAlert.test.tsx`, and the nav cases in `crew-page.spec.ts` and `crew-section-toggle.spec.ts`), carrying each failure mode over (aria-current on the active item, 44px targets, no `next/link`, no network on a switch, the budget gate); update the `forcedColorsCensus.ts` and `subtleInteractiveExemptions.ts` rows that pin `CrewSubNav.tsx`, and the crew-e2e oracle counts; then delete `CrewSubNav`.

## Task 9: Header

<!-- task: red=`pnpm vitest run tests/components/layout/crewHeader.test.tsx` ac=AC-5 -->

Red: `components/layout/Header.tsx:141` renders `ThemeToggle` only for identity-less viewers, and the client and venue render separately (`components/layout/Header.tsx:70-74`, `components/layout/Header.tsx:102-115`). Green: the joined eyebrow "client · venue" with each part sentinel-hidden and the separator only between two present parts; the toggle for every crew-page viewer; the search slot (renders search's field when present, otherwise nothing); the status slot. Cases: identified viewer sees the header toggle and the avatar checkbox, and they agree (Task 1); each eyebrow sentinel combination. `tests/components/Header.test.tsx` cases that pin the old date-and-venue row (`tests/components/Header.test.tsx:51-104`) and the toggle only in the identity-less branch (`tests/components/Header.test.tsx:184-190`) are migrated in this commit, keeping their failure modes where the behavior survives.

## Task 10: Day row

<!-- task: red=`pnpm vitest run tests/components/crew/dayRow.test.tsx` ac=AC-1,AC-6 -->

Red: the component does not exist. Green: spec §4.2. Cases: `live` presses today's button only when today is in the set; a "Now" button renders exactly when today is not in the set, is pressed in `live`, and returns to `live`; tapping another day sets `day(iso)`; tapping today returns to `live`; hidden for suppressed, empty and degraded; layout counts buttons, not days: up to 4 buttons in a grid, 5 or more scroll (so 4 days plus "Now" scroll); accessible names per spec §9.4; the pressed button (or, in `live` with no pressed day, the nearest upcoming day) is scrolled into view on mount (spy on `scrollIntoView`); a fresh mount always starts in `live`, so a reload resets a chosen day; the row reads the same client clock as the pass, and advancing fake timers past midnight in the show timezone moves the pressed Today button or brings the "Now" button in or out without a remount. The day set equals `ScheduleSection`'s rendered day list for the same fixture and viewer. The server builds the day row's props (the filtered day set and each day's label) and passes nothing else across the client boundary; a case serializes those props for a suppressed viewer and an explicitly restricted viewer and searches them for every withheld date.

## Task 11: Pass component, retire RightNowHero

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/right-now-transitions.spec.ts tests/e2e/canonical-class-dimensions.spec.ts -g "pass"` ac=AC-1,AC-6 -->

Step 1, red: retarget the hero's browser coverage to the pass: `tests/e2e/right-now-transitions.spec.ts` and `tests/e2e/helpers/rightNow.ts`, the hero cases in `tests/e2e/crew-layout-dimensions.spec.ts`, and `tests/e2e/canonical-class-dimensions.spec.ts` (its exact-key reads at `tests/e2e/canonical-class-dimensions.spec.ts:96`, `tests/e2e/canonical-class-dimensions.spec.ts:591`, `tests/e2e/canonical-class-dimensions.spec.ts:635`, with the `right-now-hero-card` key in `tests/e2e/__baselines__/canonical-dimensions.json` renamed to the pass key in the same commit); add the pass cases in `crew-page.spec.ts` (computed background is the dark surface in both themes; the `live` body). Every retargeted and new case carries "pass" in its title, so the task's `-g "pass"` filter collects them. `day(iso)` bodies need the day row on the page, so their browser cases are Task 13's. They fail: no pass exists.

Step 2, green: the pass per spec §4.3, wrapping the `RightNowHero` machinery, props from Task 3; the `rightNowHero*` Vitest suites migrate to the pass (state coverage, recovery, reduced-motion initial); component cases for the fact grid: Room from `compareRooms`, Strike only when it is not the big time and always with its day (§9.2), Load in only on travel-in days with a Set anchor, no divider and no grid when zero cells resolve; the `day(iso)` body by props. The baseline key is renamed here; its value is re-captured once, in Task 15, after the final layout.

Step 3, migrate then delete: re-run `rg -l "RightNowHero|right-now-hero" tests` and migrate every hit, including `tests/specLint/canonicalTokenIdentity.test.ts` and `tests/docs/_retiredIdentifiers.ts`; update `_metaTileProducerTopology`'s ownership map; then delete `RightNowHero`.

## Task 12: Run-of-show card

<!-- task: red=`pnpm vitest run tests/components/crew/runOfShowCard.test.tsx` ac=AC-1,AC-6 -->

Red: the card does not exist, so every case fails. Cases, each against the spec §4.4 rule it pins: the whole card, agenda merge included, is absent on a day that is not the viewer's own (`eligible`, `components/crew/sections/TodaySection.tsx:222-224`) and for a suppressed viewer; a raw entry, including a viewer-hidden load-out, suppresses the synthetic "Show Start" row; an agenda-only day with no `ScheduleDay` renders its sessions; more than 6 rows renders 6 and a "Full schedule" link; the "Next" marker sits on the first row at or after now in `live` and never in `day(iso)`; a null `clockToMinutes` row never gets the marker; "Full schedule" opens the Schedule section through the controller (Task 8). The server builds each day's filtered rows (viewer eligibility, `scheduleEntriesForViewer`, the agenda merge) and passes only those across the client boundary; a case serializes the card's props for a viewer the transport gate excludes and an explicitly restricted viewer and finds no load-out entry and no row from a day that is not theirs. Green: the card per spec §4.4, rendering through `ShowDayTimelineList` and `RunOfShowList` as Today does now, with Today's card header actions (spec §6.4).

## Task 13: Home composition

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "home"` ac=AC-1,AC-3,AC-6,AC-7,AC-8 -->

Step 1, red: browser cases in `crew-page.spec.ts` for AC-1 order (header, day row, pass, run of show, quick facts, show notes, Dress code card, "All sections"); copy success and failure toasts with selectable text on failure; a flight-only viewer's HTML and RSC payload contain no transport field; tonight's hotel matches the server-pinned day; tapping a day shows that day's pass body and run of show (moved here from Task 11); and, in crew-wide-nav.spec.ts (new in Task 8), the wide Today block (quick facts beside the run of show, show notes and the Dress code card inside the block, no "All sections" list) followed by every section. They fail: the shell still renders the Today section.

Step 2, green: the quick facts block (Task 2 data, polite live-region toast, grid spans); the show notes card and the full Dress code card (today's renderings, kept on home through PR A and PR B); `_CrewShell` composes the home from Tasks 9 to 12 and the Task 8 list. Cases that pin the old Today surface migrate in this commit: `tests/e2e/crew-page.spec.ts:398` (`today-quick-cards`) and `tests/e2e/crew-page.spec.ts:728` (the key-times strip, whose runtime skip would also drop the crew-page executed count), and `tests/e2e/crew-layout-dimensions.spec.ts:1003` (`section-today`, run by `phantom-gap-e2e.yml`), plus whatever the harness's derivation step finds. Vitest component cases in tests/components/crew/homeCards.test.tsx (new).

## Task 14: Compound transitions

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-section-toggle.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "compound"` ac=AC-12 -->

Step 1, red: browser cases for every compound row of spec §7: viewport crossing into wide with the sheet open and mid-drag; crossing back into compact (`replaceState` drops `s` and the marker); a realtime refresh with the sheet open (stays open) and one that removes the open section from membership (stays open, fresh empty or degraded state); a refresh removing the selected day (back to `live`); a refresh removing a nested dialog's owner (dialog unmounts alone, scroll stays locked); Esc with each nested dialog open (agenda viewer, lightbox, report modal: Esc closes only that dialog and focus returns inside the sheet); Back to another route with the sheet and a nested dialog open (destination page scrollable); a second day tap mid-crossfade (the second wins). They fail: Task 8 implemented only the simple paths, and `ReportModal` has no Escape handling.

Step 2, green: the controller's breakpoint listener (dismiss without animation, scroll to the section, keep or drop the marker per §7), the drag cancel on breakpoint change, the day-row fallback to `live` on removal, the never-close-on-refresh rule, the crossfade replacement, and Escape-to-close on `ReportModal`, which today handles only Ctrl/Cmd+Enter (`components/shared/ReportModal.tsx:331`): Escape runs the same `handleClose` as its close button and backdrop (`components/shared/ReportModal.tsx:440`), so its draft behavior is unchanged; every `AnimatePresence`, ternary render and conditional block in the new components gets its row in `tests/crew/transitionAudit.test.ts` with the §7 treatment, reduced motion instant. The spec §7 table is copied into the test file header.

## Task 15: Layout dimensions

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "dimensional"` ac=AC-11 -->

Step 1, red: `getBoundingClientRect()` assertions (±0.5px) for every spec §8 invariant, copied verbatim into the test file headers: compact cases in `crew-page.spec.ts`, wide cases in crew-wide-nav.spec.ts (new in Task 8). (1) day row equal tracks and full-height buttons at 4 buttons, scroll with 64px minimum at 5; (2) fact cells shrink rather than widen (the pass minimum height is carried over from the hero in Task 11 and only re-asserted here); (3) quick-fact tiles share a row height, a spanning tile is full width; (4) sheet height at most 90dvh with the body scrolling inside; (5) wide nav 240px, sticky, content column fills; (6) header height equals a section anchor's scroll margin. They fail because Tasks 7 to 13 build structure only: the invariant classes are this task's production lines.

Step 2, green: add exactly the classes and token spec §8 names (`items-stretch` + `h-full` on the day row and quick facts, `min-w-0` on fact cells, `max-h-[90dvh]` with `flex-1 min-h-0 overflow-y-auto` on the sheet body, `w-60 shrink-0` sticky nav with `h-[calc(100dvh-var(--crew-header-h))]`, the `--crew-header-h` token on the header and as `scroll-margin-top`). Then re-capture the pass entry in `tests/e2e/__baselines__/canonical-dimensions.json` with the spec's capture mode (`tests/e2e/canonical-class-dimensions.spec.ts:21-34`) in the pinned CI image, never on a dev host, so the baseline measures the final layout.

<!-- tasks: end -->

## Closeout

1. **Full-suite sweep.** `pnpm heavy pnpm vitest run tests/styles tests/crew tests/components tests/help tests/docs tests/specLint tests/adminAlerts tests/cross-cutting tests/ci`, every crew e2e spec on the `crew-e2e.yml` run line plus `crew-layout-dimensions` and `canonical-class-dimensions` through `pnpm heavy`, plus `rg -l "RightNowHero|CrewSubNav|components/crew/CrewSections|right-now-hero" tests` (42 files at base `370e1cc9c`) returning only migrated files. Every pin that moved with code was updated in its task's commit; this step only proves it before review.
2. **Design record.** `DESIGN.md` amendments per spec §3.3 (section sheet exception, crew left nav), committed as `docs(design): record crew sheet and left nav`; `pnpm heavy pnpm vitest run tests/docs` stays green.
3. **Help screenshots.** Regenerate `public/help/screenshots/crew-preview-{today,gear,schedule}-mobile-{light,dark}.webp` through the pinned-image `screenshots-regen` workflow (`gh workflow run screenshots-regen.yml --ref feat/crew-page-redesign`), never from a dev host; the PR's `screenshots-drift` job must pass.
4. The invariant-8 UI gate runs on the PR A diff before the cross-model diff review; its findings and dispositions are recorded here, with the closeout marker line, in the gate-run commit. Then the whole-diff cross-model review to APPROVE, real CI green on every required check, `gh pr merge --merge`, and local `main` fast-forwarded to `0  0`.
