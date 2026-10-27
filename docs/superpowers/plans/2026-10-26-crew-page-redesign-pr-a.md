# Crew page redesign, PR A: implementation plan

**Spec status:** approved at review round 6 (`docs/review-rounds/feat/crew-page-redesign/370e1cc9c263.md`).

**Spec:** `docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md` (§14, PR A).
**Branch:** `feat/crew-page-redesign`. **Implementer:** Opus / Claude Code (UI work, AGENTS.md routing hard rule).
**Scope:** everything the spec assigns to PR A: compact home (header, day row, pass, run of show, quick facts, show notes, Dress code card, "All sections"), the section sheet, the wide left nav with stacked sections, the shared theme store, the shared scroll lock, on today's crew section ids and bodies. Shared section bodies are PR B and PR C, with their own plans.

**Plan revision:** rewritten after plan review rounds 1 to 4 (11, 4, 9 and 7 findings; rounds 3 to 5 on a Claude reviewer while Codex was out of credits), then repaired by class after round 5 (6 findings). Three structural changes close the recurring classes: every task's commit gate is the full unit suite, not a chosen list of directories; every component lands together with its first production importer, so the home is composed incrementally and nothing is orphaned between commits; and every case title carries its task's filter word.

## Acceptance coverage

The criteria live in the spec (§13); this plan claims them by task.

| Spec criterion | Task(s) |
|---|---|
| AC-1 compact order | Task 6, Task 8, Task 9, Task 10, Task 11 |
| AC-2 sheet open/close/Back | Task 6 |
| AC-3 wide nav and stack | Task 6, Task 11 |
| AC-4 old `?s=` values | Task 6 (PR A ids unchanged; aliases arrive in PR B) |
| AC-5 theme switch | Task 1, Task 7 |
| AC-6 no withheld data | Task 2, Task 3, Task 4, Task 6, Task 8, Task 9, Task 10, Task 11 (harness rule "Client props") |
| AC-7 quick facts rules | Task 2, Task 11 |
| AC-8 copy toast | Task 11 |
| AC-9 admin renders shared bodies | PR B / PR C plans |
| AC-10 ids and groups equal admin | PR C plan |
| AC-11 dimensional invariants | Task 13 |
| AC-12 transitions | Task 12 |
| AC-13 copy | every UI task; closeout step 2 (copy sweep) |
| AC-14 UI gate | closeout |

## Meta-test inventory

- **Creates:** tests/styles/_metaBodyOverflowWriters.test.ts (new, Task 5): no file but the lock module writes `document.body.style.overflow`.
- **Extends**, each in the task that adds or moves the code it covers: `tests/components/tiles/_metaSentinelHidingContract.test.ts` and `tests/components/tiles/_pureRenderCompliance.test.ts` (new crew components); `tests/crew/_metaTileProducerTopology.test.ts` ownership map; `tests/styles/tapTargetCensus.ts`, `tests/styles/forcedColorsCensus.ts`, `tests/styles/subtleInteractiveExemptions.ts`, `controlOutlineScan.ts` rows; `tests/ci/_metaE2eWorkflowCoverage.test.ts`, `tests/ci/_metaSpecRegistration.test.ts` and `scripts/check-crew-e2e-executed.mjs` for the new wide spec (Task 6); `tests/styles/_metaZIndexBands.test.ts` band for the sheet (Task 6); `tests/docs/_metaInteractionTimingInventory.test.ts` rows in `DESIGN.md` §5.5 for every timer added or moved (Tasks 6, 8, 11, 12); `tests/crew/transitionAudit.test.ts` rows (Task 12).
- **Not applicable:** no Supabase call site, admin-alert producer, advisory lock, mutation surface or email path changes in PR A (invariants 2, 3, 9, 10).

## Commit gate (every task)

Before each task's commit, the full unit suite is green: `pnpm heavy pnpm vitest run`. Structural guards that name no file (orphaned components, live-region mounting, the interaction-timing inventory, re-export importers such as `tests/components/admin/wizard/Step3ReviewModal.test.tsx`) are only caught by running everything, so no task chooses directories. Each task also runs every Playwright spec it touched (through `pnpm heavy`), updates the crew e2e oracle (below) from the observed run, and re-captures the canonical baseline when it changes the pass's rect. The task bodies name the pins known at authoring time; this gate is what closes the set.

## E2E harness readiness

- **Boot:** the existing `playwright.config.ts` `webServer` (127.0.0.1, `E2E_PORT`), unchanged.
- **Readiness gate:** the section controller sets `data-crew-controller-ready="true"` on its root in a mount effect; every new case awaits that attribute before its first assertion, never `networkidle` alone.
- **Viewer per case:** cases that need a crew identity (personal pass cells, tonight's hotel, the flight-only viewer, a date-suppressed viewer) sign in as the admin fixture and load the preview route `/admin/show/<slug>/preview/<crewId>`, which renders the same `CrewShell` for that crew member as an `admin_preview` viewer (`app/admin/show/[slug]/preview/[crewId]/page.tsx:200-203`); WebKit cannot store a picker identity over plain http (`playwright.config.ts:62-70`). Cases about a plain admin use the share route as `tests/e2e/crew-page.spec.ts` does today.
- **Clock, both sides:** the server's `today` is pinned with the authenticated frozen-time headers (`X-Screenshot-Frozen-Now` plus `Authorization: Bearer ${TEST_AUTH_SECRET}`, honored by `lib/time/now.ts:36-47`, pattern at `tests/e2e/crew-layout-dimensions.spec.ts:302-311`), and the browser clock is pinned to the same instant before first hydration.
- **WebKit animations:** an installed page clock stalls framer `AnimatePresence` under mobile-safari and clicks hang (`tests/e2e/crew-page.spec.ts:1102-1105`). Every case that drives an animation pins the browser clock with `page.clock.setFixedTime`, which fixes `Date` but keeps timers running; `page.clock.install` is used only by cases that advance minute ticks and drive no animation.
- **Crew e2e execution oracle:** `scripts/check-crew-e2e-executed.mjs` keys an exact executed-case count per spec on the `crew-e2e.yml` run line, and `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` pins that table, every spec's enrolment and the exact skipped titles. Every task that adds, removes, retitles or skips a case in a crew-e2e spec updates the count from the observed run and the pinned titles in the same commit.
- **Filter words:** every case a task adds carries that task's `-g` filter word in its title, so the task's red collects it.
- **Client props carry only what the viewer may see:** every client component a PR A task adds or rewires receives props built by a server-side builder, never a raw projection or `RightNowContext`. The same task serializes those props (`JSON.stringify`) for a date-suppressed viewer, a viewer the transport gate excludes and an explicitly date-restricted viewer, and searches them for every withheld value it could carry: every ISO date of the show, every hotel date, every load-out entry, every transport field, every day outside the viewer's restriction. This binds Tasks 6 (list peeks), 8 (day row), 9 (pass), 10 (run card) and 11 (quick facts); a pure-model case alone does not satisfy it, because the leak sits at the client boundary (`components/crew/sections/TodaySection.tsx:644`).
- **Retiring a component retires its test ids too:** a retirement step derives the ids the component produces (`rg -o 'data-testid="[^"]+"' <file>`) and searches `tests` for each id as well as for the component name. Each id either stays on the component's successor or every spec using it migrates; every Playwright spec that references a retired or moved id runs in that task's commit gate, because the unit suite cannot see it.
- **Canonical baseline:** `tests/e2e/__baselines__/canonical-dimensions.json` holds the hero's full rect, compared within 0.5px (`tests/e2e/canonical-class-dimensions.spec.ts:66`, `tests/e2e/canonical-class-dimensions.spec.ts:656`). Each task that changes the pass's rect (Tasks 9, 11 and 13) re-captures it with the spec's capture mode (`tests/e2e/canonical-class-dimensions.spec.ts:21-34`) in the pinned Playwright image, version v1.59.1-jammy, run with `--platform linux/amd64`, never on a dev host, so `lifecycle-layout-e2e` stays green between tasks.
- **Detach safety:** geometry samplers read rects in one `page.evaluate` per sample rather than chained locator calls on elements a transition may unmount.
- **Projects:** compact cases live in `tests/e2e/crew-page.spec.ts` and `tests/e2e/crew-section-toggle.spec.ts`, which `mobile-safari` collects (`playwright.config.ts:83-84`); wide cases live in tests/e2e/crew-wide-nav.spec.ts (new), which Task 6 adds to `desktop-chromium`'s `testMatch` (`playwright.config.ts:98`). Every Playwright command passes both projects and the files it needs; each project collects only its own files.
- **Heavy phases:** every non-interactive Playwright command and every full or directory-wide Vitest run is wrapped as `pnpm heavy <command>` (AGENTS.md heavy-phase rule).

<!-- tasks: depth=2 -->

## Task 1: Shared theme store

<!-- task: red=`pnpm vitest run tests/components/layout/themeStoreAgreement.test.tsx` ac=AC-5 -->

Red: two mounted `ThemeToggle`s; toggling one leaves the other showing the old value, because `useAppliedTheme` keeps per-instance `useState` (`components/layout/useAppliedTheme.ts:71-89`). Green: `useAppliedTheme` reads the theme through `useSyncExternalStore` over one module-level subscription notified by `setTheme`, by the existing OS-change handler (still only when no choice is stored) and by the `storage` event; `mounted` stays a per-instance flag set in a post-mount effect, so the first client commit still reports `mounted: false` (the pre-mount click window `tests/components/layout/useAppliedThemePersistFailure.test.ts:139` pins); only the theme value moves, its snapshot being the `data-theme` attribute and its server snapshot light. Cases: both controls agree after either toggles; a `storage` event from another tab updates both; the no-stored-choice OS follow still works; SSR markup unchanged. Commit `feat(crew-page): share theme state across mounted controls`.

## Task 2: Quick facts module

<!-- task: red=`pnpm vitest run tests/crew/quickFacts.test.ts` ac=AC-6,AC-7 -->

Red: lib/crew/quickFacts.ts (new) does not exist. Green: `QuickFactId`, `DEFAULT_QUICK_FACT_ORDER`, `selectQuickFacts`, `reservationForNight` per spec §4.5. `ShowForViewer` carries no viewer kind, so `selectQuickFacts` takes a small viewer input the shell computes (personal, dates suppressed, transport visible, tonight's ISO date). The Venue section's Wi-Fi rule is more than the split: it sentinel-hides the cell and rejects the split when any derived field is a sentinel (`components/crew/sections/VenueSection.tsx:163-185`). That block moves into one exported helper in `lib/crew/wifiDisplay.ts` that both the Venue section and the tile call, so they cannot disagree; the Venue section's own cases stay green. Cases: order kept and capped at 4; empty and sentinel sources skipped; `parking` absent for a viewer `transportTileVisible` excludes; the client contact never selected; `hotel` and every personal fact absent for a plain `admin` viewer and for a date-suppressed viewer; `reservationForNight` includes the check-in night, excludes the check-out night, orders overlaps by `ordinal`, and returns null rather than the first reservation; the Wi-Fi fact goes through `parseWifiValue` (`lib/crew/wifiDisplay.ts:114`) and its copy action is "Copy Wi-Fi password" when a password splits out and "Copy Wi-Fi details" otherwise, including a split with a sentinel field, which shows and copies the raw text as the Venue section does; the hotel copy action is "Copy hotel confirmation number" (spec §9.4); contact actions follow field validity (Call and Text only with a non-empty `digitsOnly(phone)`, Email only with a non-sentinel email); the `address` fact's Directions link only when its URL passes `isParseableUrl`. Fixture values derive from the seeded fixtures, never literals.

## Task 3: Pass model

<!-- task: red=`pnpm vitest run tests/crew/passModel.test.ts` ac=AC-6 -->

Red: lib/crew/passModel.ts (new) does not exist. Green: the server-side builder of the pass props for `live` and every `day(iso)` (spec §4.3). Cases: each day phase; each restriction kind; personal cells only for `crew` and `admin_preview`; "Your lead" is the first LEAD in roster render order and is omitted when it is the viewer; the fact grid (Room from `compareRooms`, Strike only when it is not the big time and always with its day, Load in only on travel-in days with a Set anchor, no grid when zero cells resolve); countdown eligibility through `clockToMinutes` for a parseable start within 3 hours, a start already past, a start beyond 3 hours and a null conversion; for a suppressed viewer the whole props object is serialized and searched for every ISO date of the show and every hotel date (failure mode: the §2.2 leak), and the server-computed state kind equals `selectRightNowState` run with the real dates for every raw fixture.

## Task 4: Section membership and peeks

<!-- task: red=`pnpm vitest run tests/crew/crewSections.test.ts tests/crew/sectionPeek.test.ts` ac=AC-6 -->

Red: lib/crew/crewSections.ts (new) and lib/crew/sectionPeek.ts (new) do not exist. Green: PR A membership (the five base sections, `budget` only when `financialsVisible`, matching `app/show/[slug]/[shareToken]/_CrewShell.tsx:243`), and peeks that read only gated fields. Cases: a transport leg never feeds the Travel peek for a viewer the transport gate excludes; no date reaches a peek for a suppressed viewer; an empty peek is null, never placeholder text.

## Task 5: Shared sheet constants and scroll lock

<!-- task: red=`pnpm vitest run tests/components/shared/sheetConstants.test.ts tests/lib/ui/scrollLock.test.ts tests/styles/_metaBodyOverflowWriters.test.ts` ac=AC-2 -->

Red: no shared module exports the drag thresholds (`components/admin/review/ReviewModalShell.tsx:47-49` defines them locally); lib/ui/scrollLock.ts (new) does not exist; four files write `document.body.style.overflow` directly (`components/agenda/AgendaEmbed.tsx:113-116`, `components/diagrams/GalleryLightbox.tsx:723-726`, `components/admin/review/ReviewModalShell.tsx:241-244`, `components/admin/FinalizeButton.tsx:815-818`). Green: a shared constants module exports `DRAG_DISMISS_THRESHOLD_PX = 110` and `DRAG_SLOP_PX = 6`; `ReviewModalShell` imports them and keeps re-exporting them, so `Step3ReviewModal.tsx`'s re-exports (`components/admin/wizard/Step3ReviewModal.tsx:122-128`) and their importers are untouched; `acquireScrollLock()` is reference-counted (every release order of three holders restores the original value exactly once, after the last release; a double release is a no-op); all four writers migrate to it; the new structural test walks `app/`, `components/` and `lib/` and fails on any other writer, proven by planting a fifth writer in a temporary copy. Admin rendered DOM unchanged. Commit `refactor(ui): share one reference-counted body scroll lock`.

## Task 6: Section controller, sheet and wide nav

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-section-toggle.spec.ts tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "sheet|wide nav"` ac=AC-2,AC-3,AC-4 -->

Step 1, red: register tests/e2e/crew-wide-nav.spec.ts (new) in `playwright.config.ts` `desktop-chromium` `testMatch`, the `.github/workflows/crew-e2e.yml` run line, `scripts/check-crew-e2e-executed.mjs`, `tests/ci/_metaE2eWorkflowCoverage.test.ts` and `tests/ci/_metaSpecRegistration.test.ts`. Write the wide cases there (nav click scrolls and focuses the heading, `replaceState` only, scroll-spy follows and pauses during a nav-click scroll, deep link scrolls, Back/Forward over compact-created entries) and the compact cases in `crew-section-toggle.spec.ts` (every row of the spec §5.2 history table except "realtime refresh removes the open section", which Task 12 owns, and the in-sheet link row below; opening from an "All sections" row; a row link keeps `gate`; refresh with the sheet open; the sheet's close button is named "Close" plus the section name, spec §9.4). They fail because `components/crew/CrewSections.tsx` renders tabs: no sheet, no nav, no list, no `data-crew-controller-ready`.

Step 2, green, with Vitest cases alongside in `tests/components/crew/crewSections.test.tsx` and tests/components/crew/bottomSheet.test.tsx (new):
- The bottom sheet (spec §5.2): `role="dialog"`, `aria-modal`, labelled by its title; focus to the title on open and back to the opener on close; focus trap; page `inert`; scroll lock through Task 5; every close path (button, scrim, Esc, swipe past the Task 5 threshold) calls one `onRequestClose`; Esc, scrim and swipe ignored while another `aria-modal="true"` dialog is open; width rules; its z-index band registered.
- The scroll-spy rule: `activeSectionFor` (exported at `components/admin/review/ShowReviewSurface.tsx:97`) moves unchanged to a shared pure module so crew code never imports from `components/admin/**`; `ShowReviewSurface` imports it from there and keeps re-exporting it, so `components/admin/wizard/Step3ReviewModal.tsx:105-110` and its importers are untouched; admin DOM and the 50 section-header PNGs unchanged.
- The "All sections" list (spec §4.6, Task 4's membership and peeks, links from `buildSectionHref`), with the harness client-props case for its peeks.
- Paths nothing in PR A can trigger from a real page get Vitest cases on the controller with fixture section nodes: `openSectionAndReveal` in compact (opens the sheet, scrolls the target into view inside its body, highlights it) and wide (scrolls the page to the target, highlights it), called from a test consumer of `useSectionController()`; and the in-sheet link row of the §5.2 history table (a fixture node holding a `buildSectionHref` link: switching resets the sheet body's scroll to the top, and the following close lands on home, not the first section). No PR A section body contains an in-sheet link, and search's caller is unmerged (`feat/crew-show-search`), so the browser versions of these cases land with the first real caller: search's merge for `openSectionAndReveal`, PR B's shared bodies for in-sheet links.
- The controller: compact home plus sheet and wide nav plus stacked sections, from the same server-rendered `sectionNodes` (freshness invariant unchanged); the compact home shows today's Today section body followed by the list until Tasks 8 to 11 replace that body piece by piece; the §5.2 history table; the readiness attribute; the `useSectionController()` hook returning `{ openSectionAndReveal(sectionId, targetId) }` (the search session's §9 shape, branch `feat/crew-show-search`); compact behavior when `matchMedia` is absent. The sheet's animation durations get their `DESIGN.md` §5.5 rows.

Step 3, migrate then delete: re-run `rg -l "CrewSubNav|components/crew/CrewSections|data-active-section" tests`, plus the retired-id search (harness), and migrate every hit (including `tests/components/crew/crewSubNav.test.tsx`, `noPrefetchAlert.test.tsx`, and the nav cases in `crew-page.spec.ts` and `crew-section-toggle.spec.ts`), carrying each failure mode over (aria-current on the active item, 44px targets, no `next/link`, no network on a switch, the budget gate); then delete `CrewSubNav`. Compound transitions are Task 12.

## Task 7: Header

<!-- task: red=`pnpm vitest run tests/components/layout/crewHeader.test.tsx` ac=AC-5 -->

Red: `components/layout/Header.tsx:141` renders `ThemeToggle` only for identity-less viewers, and the client and venue render separately (`components/layout/Header.tsx:70-74`, `components/layout/Header.tsx:102-115`). Green: the joined eyebrow "client · venue" with each part sentinel-hidden and the separator only between two present parts; the toggle for every crew-page viewer; the search slot (renders search's field when present, otherwise nothing); the status slot. Cases: an identified viewer sees the header toggle and the avatar checkbox, and they agree (Task 1); each eyebrow sentinel combination. `tests/components/Header.test.tsx` cases pinning the old row (`tests/components/Header.test.tsx:51-104`) and the identity-less-only toggle (`tests/components/Header.test.tsx:184-190`) migrate in this commit.

## Task 8: Day row and shared crew clock

<!-- task: red=`pnpm vitest run tests/components/crew/dayRow.test.tsx tests/components/crew/useCrewClock.test.tsx` ac=AC-1,AC-6 -->

Red: neither the day row nor a shared clock exists; the client clock is private state inside `components/crew/RightNowHero.tsx:339` and `components/crew/RightNowHero.tsx:349-361`. Green: the clock (client `new Date()`, a 60s tick, the `visibilitychange` refresh) moves into one module-level store with a single timer and a single `visibilitychange` listener, attached while any subscriber is mounted, read through a `useCrewClock()` hook built on `useSyncExternalStore` (Task 1's pattern), so the day row, the pass and the run card's "Next" marker read one `now` and a remount never starts a second clock. `RightNowHero` uses it unchanged in behavior; the `DESIGN.md` §5.5 timer row moves with it. Clock cases: two subscribers mounted a minute apart read the same `now` after a tick; unmounting and remounting one leaves exactly one interval registered. The day row reads the same hook and mounts in the compact home above the Today body (and atop the wide Today block). Cases: `live` presses today's button only when today is in the set; a "Now" button renders exactly when today is not in the set, is pressed in `live`, and returns to `live`; tapping another day sets `day(iso)`; tapping today returns to `live`; hidden for suppressed, empty and degraded; layout counts buttons, not days (4 buttons in a grid, 5 or more scroll); accessible names per spec §9.4; the pressed button (or the nearest upcoming day) is scrolled into view on mount; a fresh mount starts in `live`; advancing fake timers past midnight in the show timezone moves the pressed Today button or brings "Now" in or out without a remount; the day set equals `ScheduleSection`'s rendered list for the same fixture and viewer. The server builds the day row's props (the filtered day set and labels) and passes nothing else across the client boundary; a case serializes them for a suppressed and an explicitly restricted viewer and searches for every withheld date.

## Task 9: Pass, retire RightNowHero

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/right-now-transitions.spec.ts tests/e2e/canonical-class-dimensions.spec.ts -g "pass"` ac=AC-1,AC-6 -->

Step 1, red: retarget the hero's browser coverage to the pass, titles carrying "pass": `tests/e2e/right-now-transitions.spec.ts` with `tests/e2e/helpers/rightNow.ts`, and `tests/e2e/canonical-class-dimensions.spec.ts` (its exact-key reads at `tests/e2e/canonical-class-dimensions.spec.ts:96`, `tests/e2e/canonical-class-dimensions.spec.ts:591`, `tests/e2e/canonical-class-dimensions.spec.ts:635`); add pass cases in `crew-page.spec.ts` (dark surface in both themes; the `live` body; tapping a day in the Task 8 row shows its `day(iso)` body; personal cells through the preview route). They fail: no pass exists.

Step 2, green: the pass per spec §4.3 replaces the hero in the home, wrapping its machinery with Task 8's clock and taking only Task 3's props, never `RightNowContext`; the harness client-props case serializes the pass's props for each named viewer; the `rightNowHero*` Vitest suites migrate to the pass; the baseline key is renamed and its value re-captured in this commit (harness, "Canonical baseline").

Step 3, migrate then delete: re-run `rg -l "RightNowHero|right-now-hero" tests`, plus the retired-id search (harness), and migrate every hit, including `tests/specLint/canonicalTokenIdentity.test.ts` and `tests/docs/_retiredIdentifiers.ts`; update `_metaTileProducerTopology`'s ownership map; then delete `RightNowHero`.

## Task 10: Run-of-show card

<!-- task: red=`pnpm vitest run tests/components/crew/runOfShowCard.test.tsx` ac=AC-1,AC-6 -->

Red: the card does not exist, so every case fails. Cases, each against the spec §4.4 rule it pins: the whole card, agenda merge included, is absent on a day that is not the viewer's own (`eligible`, `components/crew/sections/TodaySection.tsx:222-224`) and for a suppressed viewer; a raw entry, including a viewer-hidden load-out, suppresses the synthetic "Show Start" row; an agenda-only day with no `ScheduleDay` renders its sessions; more than 6 rows renders 6 and a "Full schedule" link that opens Schedule through Task 6's controller; the "Next" marker sits on the first row at or after now in `live` (Task 8's clock) and never in `day(iso)`; a null `clockToMinutes` row never gets the marker. The server builds each day's filtered rows and passes only those across the client boundary; a case serializes the card's props for a viewer the transport gate excludes and an explicitly restricted viewer and finds no load-out entry and no row from a day that is not theirs. Green: the card per spec §4.4, rendering through `ShowDayTimelineList` and `RunOfShowList` with Today's card header actions and card id (spec §6.4), replacing the Today body's run-of-show card in the home.

## Task 11: Home composition, retire TodaySection

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "home"` ac=AC-1,AC-3,AC-6,AC-7,AC-8 -->

Step 1, red: browser cases titled with "home": AC-1 order (header, day row, pass, run of show, quick facts, show notes, Dress code card, "All sections"); copy success and failure toasts with selectable text on failure; a flight-only viewer's HTML and RSC payload contain no transport field (preview route); tonight's hotel matches the server-pinned day (preview route); and in the wide spec, the Today block (quick facts beside the run of show, show notes and the Dress code card inside it, no "All sections") followed by every section. They fail: the home still shows the Today section body.

Step 2, green: the quick facts block (Task 2 data built on the server, with the harness client-props case; grid spans; a toast in a polite live region that stays mounted while only its text changes); the show notes card and the full Dress code card (today's renderings, kept through PR A and PR B) with their card ids (`today-notes`, `today-dress`); `_CrewShell` composes the finished home and wide Today block; the toast hold gets its `DESIGN.md` §5.5 row; the canonical baseline is re-captured (the pass moved).

Step 3, migrate then delete: re-run `rg -l "TodaySection" tests` (26 files at base `370e1cc9c`) plus the retired-id search (harness) and migrate every hit. The composed home keeps `data-testid="section-today"`, because it is the Today section of spec §5.1, so `tests/e2e/empty-state-reachability.spec.ts:294` and `tests/e2e/empty-state-reachability.spec.ts:469` (run by `.github/workflows/app-e2e.yml:188`) and `tests/e2e/crew-section-toggle.spec.ts:221`, `tests/e2e/crew-section-toggle.spec.ts:245` and `tests/e2e/crew-section-toggle.spec.ts:298` keep their marker and run in this task's gate. The hits include including its own suites, `tests/components/crew/sourceLinkCoverage.test.tsx` (now asserting the card ids on the home cards), `tests/e2e/crew-page.spec.ts:398` (`today-quick-cards`) and `tests/e2e/crew-page.spec.ts:728` (the key-times strip), and `tests/e2e/crew-layout-dimensions.spec.ts:1003` (`section-today`, run by `phantom-gap-e2e.yml`); update `_metaTileProducerTopology`; then delete `TodaySection`, so `_metaOrphanedComponents` stays green.

## Task 12: Compound transitions

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-section-toggle.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "compound"` ac=AC-12 -->

Step 1, red: browser cases titled with "compound" for every compound row of spec §7: viewport crossing into wide with the sheet open, mid-drag, and with a nested dialog open inside the sheet (the dialog unmounts with the sheet, and the page is scrollable afterwards whatever the unmount order); crossing back into compact (`replaceState` drops `s` and the marker); a realtime refresh with the sheet open (stays open) and one that removes the open section from membership (stays open, fresh empty or degraded state); a refresh removing the selected day (back to `live`); a refresh removing a nested dialog's owner (dialog unmounts alone, scroll stays locked); Esc with each nested dialog open (agenda viewer, lightbox, report modal: Esc closes only that dialog and focus returns inside the sheet); Back to another route with the sheet and a nested dialog open (destination page scrollable); a second day tap mid-crossfade (the second wins). They fail: Task 6 implemented only the simple paths, and `ReportModal` has no Escape handling.

Step 2, green: the breakpoint listener, the drag cancel, the day-row fallback to `live`, the never-close-on-refresh rule, the crossfade replacement, and Escape-to-close on `ReportModal`, which today handles only Ctrl/Cmd+Enter (`components/shared/ReportModal.tsx:331`): Escape runs the same `handleClose` as its close button and backdrop (`components/shared/ReportModal.tsx:440`), so its draft behavior is unchanged. Every `AnimatePresence`, ternary render and conditional block in the new components gets its row in `tests/crew/transitionAudit.test.ts` with the §7 treatment, reduced motion instant; the spec §7 table is copied into the test file header.

## Task 13: Layout dimensions

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "dimensional"` ac=AC-11 -->

Step 1, red: `getBoundingClientRect()` assertions (±0.5px), titled with "dimensional", for every spec §8 invariant, copied verbatim into the test file headers: compact cases in `crew-page.spec.ts`, wide cases in crew-wide-nav.spec.ts (new in Task 6). one or more assertions per spec §8 row: (1) at 4 buttons, equal tracks and every button the row's full height; at 5 or more, a scroll row with every button at least 64px wide and still the row's full height; (2) fact cells shrink rather than widen (the pass's minimum height is Task 9's, not re-asserted here); (3) quick-fact tiles in one row share a height, a spanning tile is full width; (4) sheet height at most 90dvh with the body scrolling inside; (5) wide nav 240px wide, sticky, its height the viewport minus the header, and the content column filling the rest; (6) header height equals a section anchor's scroll margin. Heights are measured on the visible element inside each grid or flex cell (the button face, the tile card), which fills its cell only through the named class, not on the cell, which the grid stretches by default. They fail because Tasks 6 to 11 build structure only: the invariant classes below are this task's production lines.

Step 2, green: add exactly the classes and token spec §8 names, row by row: day row `grid` + `grid-cols-[repeat(N,minmax(0,1fr))]` + `items-stretch` with `h-full` buttons, and at 5 or more a flex row with `min-w-16` `self-stretch` buttons and `snap-x`; `grid-cols-3` with `min-w-0` fact cells; quick facts `grid-cols-2` + `items-stretch`, `h-full` tiles, `col-span-2` for a spanning tile; the sheet `max-h-[90dvh]` flex column with a `shrink-0` header and a `flex-1 min-h-0 overflow-y-auto` body; the nav `w-60 shrink-0` sticky with `h-[calc(100dvh-var(--crew-header-h))]` and its own scroll, the content column `flex-1 min-w-0`; the `--crew-header-h` token on the header, the nav offset and every section anchor's `scroll-margin-top`. Re-capture the canonical baseline for the final layout.

<!-- tasks: end -->

## Closeout

1. **Full sweep.** `pnpm heavy pnpm vitest run` green; every crew e2e spec on the `crew-e2e.yml` run line plus `crew-layout-dimensions` and `canonical-class-dimensions` green through `pnpm heavy`; `rg -l "RightNowHero|CrewSubNav|components/crew/CrewSections|right-now-hero|TodaySection" tests` returns only migrated files, and every Playwright spec that references an id a retired component produced has run green.
2. **Copy sweep.** Every spec §9 string (labels, empty and failure copy, accessible names) is asserted by at least one case: for each literal in §9, `rg -F` over `tests` finds it, and any literal with no hit gets a case before the PR opens.
3. **Design record.** `DESIGN.md` amendments per spec §3.3 (section sheet exception, crew left nav), committed as `docs(design): record crew sheet and left nav`; `pnpm heavy pnpm vitest run tests/docs` stays green.
4. **Help screenshots.** Regenerate `public/help/screenshots/crew-preview-{today,gear,schedule}-mobile-{light,dark}.webp` through the pinned-image `screenshots-regen` workflow (`gh workflow run screenshots-regen.yml --ref feat/crew-page-redesign`), never from a dev host; the PR's `screenshots-drift` job must pass.
5. The invariant-8 UI gate runs on the PR A diff before the cross-model diff review; its findings and dispositions are recorded here, with the closeout marker line, in the gate-run commit. Then the whole-diff cross-model review to APPROVE, real CI green on every required check, `gh pr merge --merge`, and local `main` fast-forwarded to `0  0`.
