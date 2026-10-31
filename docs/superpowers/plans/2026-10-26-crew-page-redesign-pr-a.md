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
| AC-6 no withheld data | Task 2, Task 3, Task 4, Task 6, Task 8, Task 9, Task 10 (harness rule "Client props"); Task 11 (page-level payload search) |
| AC-7 quick facts rules | Task 2, Task 11 |
| AC-8 copy toast | Task 11 |
| AC-9 admin renders shared bodies | PR B / PR C plans |
| AC-10 ids and groups equal admin | PR C plan |
| AC-11 dimensional invariants | Task 13 |
| AC-12 transitions | Task 12 |
| AC-13 copy | the §9 rows of the clause map, each owned by a task |
| AC-14 UI gate | closeout |

## Spec clause map

Every bullet and table row of spec §3.1, §3.2, §4.1 to §4.6, §5.1 to §5.3, §7, §8, §9.1 to §9.4, §10 and §11, keyed by its spec line, with the task that builds it and the task whose cases pin it. The list was derived from the spec, not written from memory: a script extracts every list item and table row in those sections and checks that each line number appears below (181 clauses, 181 mapped). Copy rows are asserted through a template filled from fixture values, never a hardcoded example such as "Dana Ortiz" (spec §12). "PR B" and "PR C" mean that plan.

| Spec line | Clause | Task |
|---|---|---|
| L118 | Compact mode: home, sections in a sheet | 6, 11 |
| L119 | Wide mode: nav plus one column, Today block first | 6, 11 |
| L127 | Header row in both modes | 7 |
| L128 | Day row in both modes | 8 |
| L129 | Pass in both modes | 9 |
| L130 | Run-of-show card in both modes | 10 |
| L131 | Quick facts in both modes | 11 |
| L132 | Show notes card | 11 |
| L133 | Dress code card | 11 |
| L134 | "All sections" list, compact only | 6 |
| L135 | Left nav, wide only | 6 |
| L136 | Section panels inside the sheet (today's bodies in PR A) | 6 |
| L137 | `CrewSubNav` removed | 6 |
| L138 | Preview banner in both modes when previewing | 11 |
| L151 | Header eyebrow "client · venue" | 7 |
| L152 | Theme switch for every viewer | 1, 7 |
| L153 | Search slot | 7 |
| L154 | Status slot | 7 |
| L160 | Day row `live` | 8 |
| L161 | Day row `day(iso)` | 8 |
| L162 | "Now" button | 8 |
| L163 | Day set equals the Schedule list | 8 |
| L164 | Day row hidden (suppressed, empty, degraded) | 8 |
| L165 | Selection is client state; a reload returns to `live` | 8 |
| L166 | Button content (weekday or "Today", day, phase label, combined label) | 8 |
| L167 | Cap: 4 in a grid, 5 or more scroll, pressed day scrolled into view; 4 fit 288px at 320px | 8, 13 |
| L168 | Tap target 44px by 64px | 8 |
| L174 | Pass `live` follows every live state | 9 |
| L175 | Pass `day(iso)` static facts | 3, 9 |
| L176 | Pass layout | 3, 9 |
| L177 | Eyebrow row | 3, 9 |
| L178 | Status line and countdown window | 3, 9 |
| L179 | Big time per day kind | 3, 9 |
| L180 | Progress segments | 9 |
| L181 | Fact grid candidates, order, omission | 3, 9 |
| L182 | Personal cells only for `crew` and `admin_preview` | 3 |
| L183 | "Your lead" | 3 |
| L184 | "Hotel tonight" | 3 |
| L185 | Suppressed dates never reach the pass | 3, 9 |
| L186 | Degraded states | 3, 9 |
| L187 | Dark in both themes | 9 |
| L193 | Run card eligibility | 10 |
| L194 | Run card entries, transport filter, agenda merge | 10 |
| L195 | Run card omitted for suppressed viewers | 10 |
| L196 | Run card cap and "Full schedule" | 10 |
| L197 | "Next" marker | 10 |
| L198 | Run card header actions | 10 |
| L199 | Run card omitted when empty | 10 |
| L205 | `QuickFactId` and default order | 2 |
| L206 | `selectQuickFacts` | 2 |
| L207 | Sources reuse each section's field and gate | 2 |
| L211 | `wifi` source | 2 |
| L212 | `hotel` source | 2 |
| L213 | `dock` source | 2 |
| L214 | `contact` source | 2 |
| L215 | `parking` source | 2 |
| L216 | `dressCode` source | 2 |
| L217 | `address` source | 2 |
| L219 | Wi-Fi reuses the Venue rule | 2 |
| L220 | `reservationForNight` | 2 |
| L221 | Quick facts layout and spans | 11, 13 |
| L222 | Copy, toasts, selectable text | 11 |
| L223 | Truncation: 3 lines then ellipsis | 13 |
| L229 | List membership from `crewSectionsFor` | 4, 6 |
| L230 | Peek lines | 4, 6 |
| L231 | Rows are `buildSectionHref` links that work before hydration (the route's loading boundary hides content without JavaScript, so that half is checked on the raw HTML) | 6 |
| L237 | PR A ids and labels | 4, 6 |
| L238 | PR B registry | PR B |
| L239 | PR C moves | PR C |
| L240 | Membership from PR B on | PR B |
| L241 | Membership never depends on a fetch; each degraded state keeps its audience | 4, 11 |
| L242 | Legacy id aliases | PR B |
| L246 | Sheet URL; the server renders the sheet open for `?s=` | 6 |
| L247 | History rules | 6 |
| L251 | Open from home | 6 |
| L252 | Open another section while one is open | 6 |
| L253 | Close with the marker set | 6 |
| L254 | Close with the marker absent | 6 |
| L255 | `popstate` to an entry without `s` | 6 |
| L256 | `popstate` to an entitled `s` | 6 |
| L257 | `popstate` to an unknown or non-entitled `s` | 6 |
| L258 | Refresh removes the open section; lost entitlement closes to home (amendment 2026-10-27) | 12 |
| L261 | Drag to dismiss, shared thresholds | 5, 6 |
| L262 | Modal behavior | 6 |
| L263 | Nested dialogs | 12 |
| L264 | Reference-counted scroll lock | 5 |
| L265 | Sheet width below 640px and from 640px | 6 |
| L266 | History mechanism as spiked | 6 |
| L270 | Nav: 240px, sticky, "Today" then sections, no counts | 6, 13 |
| L271 | Stacked sections with anchors | 6, 13 |
| L272 | Nav click: scroll, focus, `replaceState`, instant under reduced motion | 6 |
| L273 | Scroll-spy through the shared rule | 6 |
| L274 | Back and Forward in wide mode | 6 |
| L275 | Deep link in wide mode | 6 |
| L276 | `openSectionAndReveal` in wide mode | 6 |
| L348 | Sheet open animation | 6, 12 |
| L349 | Sheet close animation | 6, 12 |
| L350 | Release past the threshold | 6, 12 |
| L351 | Release before the threshold springs back | 6, 12 |
| L352 | In-sheet switch crossfade | 6, 12 |
| L353 | Day crossfade; the pass keeps its height | 9, 10, 12 |
| L354 | Live-state pairs unchanged | 9 |
| L355 | Live to a day and back | 9, 12 |
| L356 | Day button colour transition | 8, 12 |
| L357 | "Now" appears or leaves instantly | 8 |
| L358 | Nav accent bar moves | 6, 12 |
| L359 | Copy toast fade, rise, hold | 11, 12 |
| L360 | Theme swap instant; the pass unchanged | 1, 9 |
| L361 | Server-driven presence changes instant | 12 |
| L367 | Compound: refresh with the sheet open | 12 |
| L368 | Compound: into wide with the sheet open | 12 |
| L369 | Compound: into wide mid-drag | 12 |
| L370 | Compound: into compact from a scrolled wide page | 12 |
| L371 | Compound: refresh removes the selected day | 12 |
| L372 | Compound: refresh removes the open section; lost entitlement closes | 12 |
| L373 | Compound: refresh removes a nested dialog's owner | 12 |
| L374 | Compound: Esc with a nested dialog open | 12 |
| L375 | Compound: second day tap mid-crossfade | 12 |
| L376 | Compound: theme switch unreachable while the sheet is open | 12 |
| L382 | Dimensions: day row | 13 |
| L383 | Dimensions: pass | 9, 13 |
| L384 | Dimensions: quick facts | 13 |
| L385 | Dimensions: sheet | 13 |
| L386 | Dimensions: wide layout | 13 |
| L387 | Dimensions: header height token | 13 |
| L397 | Copy: the day card's region label "Your day, <date>" | 9 |
| L398 | Copy: "Show day N" (day row), "Show day N of M" (pass) | 8, 9 |
| L399 | Copy: "Load in", combined "Travel in, load in" | 8, 9 |
| L400 | Copy: "Show" as the show-day big-time label | 9 |
| L401 | Copy: "Hotels" section label; "Hotel" tile; "Hotel tonight" cell | 2, 3, PR B |
| L402 | Copy: "Venue" section label; "Venue" tile | 2, PR B |
| L403 | Copy: "Transport" section label | PR B |
| L404 | Copy: "Crew" and "Contacts" section labels | PR B |
| L405 | Copy: "Billing & docs" section label | PR B |
| L406 | Copy: "Dress code" | 2, 11 |
| L407 | Copy: "Who to call" | 2 |
| L408 | Copy: "Run of show", "Full schedule" | 10 |
| L409 | Copy: "All sections" | 6 |
| L410 | Copy: "Copied" | 11 |
| L411 | Copy: report row "Something looks wrong?" and "Report this" | 11 |
| L415 | Copy: times as written; strike carries its day | 3, 9 |
| L416 | Copy: countdown wording | 3 |
| L417 | Copy: last run-of-show line is the sheet's own title | 10 |
| L418 | Copy: "Your lead" | 3 |
| L419 | Copy: transport times "leaves" | PR B |
| L420 | Copy: quick facts label every copyable value | 2 |
| L421 | Copy: the nav shows no counts | 6 |
| L422 | Copy: roles exactly as the sheet writes them | 3 |
| L423 | Copy: "Next" typed in sentence case, uppercased by CSS | 10 |
| L424 | Copy: "Wi-Fi" everywhere | 2, 11 |
| L430 | Copy: "Not scheduled today." and the next-day line | 9 |
| L431 | Copy: "Show started at <time>." | 3, 9 |
| L432 | Copy: "Your days are done." | 9 |
| L433 | Copy: "Your days aren't confirmed yet." | 9 |
| L434 | Copy: "Dates aren't finalized." | 9 |
| L435 | Copy: clipboard failure toast | 11 |
| L436 | Copy: no quick facts, no empty-state copy | 11 |
| L442 | Name: day buttons and "Now, your live status" | 8 |
| L443 | Name: copy buttons | 2, 11 |
| L444 | Name: sheet close "Close <section>" | 6 |
| L445 | Name: theme switch unchanged | 1, 7 |
| L446 | Name: "Call <name>", "Text <name>" | 11 |
| L452 | Flag: open section `s` | 6 |
| L453 | Flag: selected day | 8 |
| L454 | Flag: theme override | 1 |
| L455 | Flag: sheet history marker | 6 |
| L463 | Guard: `s` absent or unknown | 6 |
| L464 | Guard: day set empty or duplicated | 8 |
| L465 | Guard: selected day has no `ScheduleDay` | 3, 10 |
| L466 | Guard: `showStart` absent or unparseable | 3 |
| L467 | Guard: key-time anchors absent or sentinel | 3 |
| L468 | Guard: fact grid cell value absent | 3, 9 |
| L469 | Guard: every fact grid cell absent | 3, 9 |
| L470 | Guard: viewer role absent | 3 |
| L471 | Guard: quick fact source absent | 2 |
| L472 | Guard: every quick fact absent | 11 |
| L473 | Guard: clipboard absent or rejected | 11 |
| L474 | Guard: no reservation covers the night | 2, 3 |
| L475 | Guard: section peek absent | 4 |
| L476 | Guard: viewer has no sections (unreachable from a real page in PR A, where the five base sections are always listed; pinned by a Vitest controller case) | 6 |
| L477 | Guard: `matchMedia` unavailable | 6 |

## Meta-test inventory

- **Creates:** tests/styles/_metaBodyOverflowWriters.test.ts (new, Task 5): no file but the lock module writes `document.body.style.overflow`.
- **Extends**, each in the task that adds or moves the code it covers: `tests/components/tiles/_metaSentinelHidingContract.test.ts` and `tests/components/tiles/_pureRenderCompliance.test.ts` (new crew components); `tests/crew/_metaTileProducerTopology.test.ts` ownership map; `tests/styles/tapTargetCensus.ts`, `tests/styles/forcedColorsCensus.ts`, `tests/styles/subtleInteractiveExemptions.ts`, `controlOutlineScan.ts` rows; `tests/ci/_metaE2eWorkflowCoverage.test.ts`, `tests/ci/_metaSpecRegistration.test.ts` and `scripts/check-crew-e2e-executed.mjs` for the new wide spec (Task 6); `tests/styles/_metaZIndexBands.test.ts` band for the sheet (Task 6); `tests/docs/_metaInteractionTimingInventory.test.ts` rows in `DESIGN.md` §5.5 for every timer added or moved (Tasks 6, 8, 11, 12); `tests/crew/transitionAudit.test.ts` rows (Task 12).
- **Not applicable:** no Supabase call site, admin-alert producer, advisory lock, mutation surface or email path changes in PR A (invariants 2, 3, 9, 10).

## Commit gate (every task)

Before each task's commit, the full unit suite is green: `pnpm heavy pnpm vitest run`. Structural guards that name no file (orphaned components, live-region mounting, the interaction-timing inventory, re-export importers such as `tests/components/admin/wizard/Step3ReviewModal.test.tsx`) are only caught by running everything, so no task chooses directories. **Clause ledger.** Each task's commit body lists every clause-map row naming that task, as `L<line>: <case title>`, the case that pins it. A row the task builds but no case of it pins is not done; the commit waits until one does. The plan names the cases known at authoring time; this ledger is what closes the set, one row per spec line.

**Red covers every case.** Every case a task's text lists, in whichever step it is named, is written before that task's first production line and observed failing; a task with cases under both Vitest and Playwright runs both red and records both runs in its commit body. An absence check (a serialize-and-search case or a payload search) also carries a positive control: the same search over a viewer allowed to see the values must find them, so it cannot pass because the values were never there. Each task also runs every Playwright spec it touched (through `pnpm heavy`), updates the crew e2e oracle (below) from the observed run, and re-captures the canonical baseline when it changes the pass's rect. The task bodies name the pins known at authoring time; this gate is what closes the set.

## E2E harness readiness

- **Boot:** the existing `playwright.config.ts` `webServer` (127.0.0.1, `E2E_PORT`), unchanged.
- **Readiness gate:** the section controller sets `data-crew-controller-ready="true"` on its root in a mount effect; every new case awaits that attribute before its first assertion, never `networkidle` alone. The exception is a case that reads the raw server response to prove the server render (Task 6), which loads no page.
- **Viewer per case:** cases that need a crew identity (personal pass cells, tonight's hotel, the flight-only viewer, a date-suppressed viewer) sign in as the admin fixture and load the preview route `/admin/show/<slug>/preview/<crewId>`, which renders the same `CrewShell` for that crew member as an `admin_preview` viewer (`app/admin/show/[slug]/preview/[crewId]/page.tsx:200-203`); WebKit cannot store a picker identity over plain http (`playwright.config.ts:62-70`). Cases about a plain admin use the share route as `tests/e2e/crew-page.spec.ts` does today.
- **Clock, both sides:** the server's `today` is pinned with the authenticated frozen-time headers (`X-Screenshot-Frozen-Now` plus `Authorization: Bearer ${TEST_AUTH_SECRET}`, honored by `lib/time/now.ts:36-47`, pattern at `tests/e2e/crew-layout-dimensions.spec.ts:302-311`), and the browser clock is pinned to the same instant before first hydration.
- **WebKit animations:** an installed page clock stalls framer `AnimatePresence` under mobile-safari and clicks hang (`tests/e2e/crew-page.spec.ts:1102-1105`). Every case that drives an animation pins the browser clock with `page.clock.setFixedTime`, which fixes `Date` but keeps timers running; `page.clock.install` is used only by cases that advance minute ticks and drive no animation.
- **Crew e2e execution oracle:** `scripts/check-crew-e2e-executed.mjs` keys an exact executed-case count per spec on the `crew-e2e.yml` run line, and `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` pins that table, every spec's enrolment and the exact skipped titles. Every task that adds, removes, retitles or skips a case in a crew-e2e spec updates the count from the observed run and the pinned titles in the same commit.
- **Filter words:** every case a task adds carries that task's `-g` filter word in its title, so the task's red collects it.
- **Client props carry only what the viewer may see:** every client component a PR A task adds or rewires receives props built by a server-side builder, never a raw projection or `RightNowContext`. The same task serializes those props (`JSON.stringify`) and searches them for what each viewer is withheld, and only that: for a date-suppressed viewer, every ISO date of the show and every hotel date; for a viewer the transport gate excludes, every transport field and load-out entry; for an explicitly restricted viewer, only what the component itself filters to the viewer's days (the day row's day set, the run card's rows). An explicit viewer's show dates are not withheld (`lib/crew/dateSuppression.ts:62-63`), and the live pass needs them on the client for `selectRightNowState` (`lib/time/rightNow.ts:221-224`), so the pass is searched only for the first two viewers. This binds Tasks 6 (list peeks), 8 (day row), 9 (pass), 10 (run card) and 11 (quick facts); a pure-model case alone does not satisfy it, because the leak sits at the client boundary (`components/crew/sections/TodaySection.tsx:644`).
- **Retiring a component retires its test ids too:** a retirement step derives the ids the component produces (`rg -o 'data-testid="[^"]+"' <file>`) and searches `tests` for each id as well as for the component name. Each id either stays on the component's successor or every spec using it migrates; every Playwright spec that references a retired or moved id runs in that task's commit gate, because the unit suite cannot see it.
- **Canonical baseline:** `tests/e2e/__baselines__/canonical-dimensions.json` holds the hero's rect, with width and height compared within 0.5px (`tests/e2e/canonical-class-dimensions.spec.ts:66`, `tests/e2e/canonical-class-dimensions.spec.ts:656`). Each task that changes the pass's rect (Tasks 9, 11 and 13) re-captures it with the spec's capture mode (`tests/e2e/canonical-class-dimensions.spec.ts:21-34`) in the pinned Playwright image, version v1.59.1-jammy, run with `--platform linux/amd64`, never on a dev host, so `lifecycle-layout-e2e` stays green between tasks.
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

Red: lib/crew/passModel.ts (new) does not exist. Green: the server-side builder of the pass props for `live` and every `day(iso)` (spec §4.3). Cases: each day phase; each restriction kind; personal cells only for `crew` and `admin_preview`; "Your lead" is the first LEAD in roster render order and is omitted when it is the viewer; the fact grid (Room from `compareRooms`, Strike only when it is not the big time and always with its day, Load in only on travel-in days with a Set anchor, no grid when zero cells resolve); countdown eligibility through `clockToMinutes` for a parseable start within 3 hours, a start already past, a start beyond 3 hours and a null conversion; for a suppressed viewer the whole props object is serialized and searched for every ISO date of the show and every hotel date (failure mode: the §2.2 leak), and the server-computed state kind equals `selectRightNowState` run with the real dates for every raw fixture. Guard cases (spec §11): a selected day with no `ScheduleDay` still builds its anchors from the key times, its fact grid and its phase label, on `fixtures/shows/raw/2024-05-east-coast-family-office.md` (the load-in big time comes from the dates, not from a schedule row); an unparseable `showStart` renders as written with no countdown; a `TBD`, `N/A` or `TBA` anchor is treated as absent; an absent viewer role omits the eyebrow's right side.

## Task 4: Section membership and peeks

<!-- task: red=`pnpm vitest run tests/crew/crewSections.test.ts tests/crew/sectionPeek.test.ts` ac=AC-6 -->

Red: lib/crew/crewSections.ts (new) and lib/crew/sectionPeek.ts (new) do not exist. Green: PR A membership (the five base sections, `budget` only when `financialsVisible`, matching `app/show/[slug]/[shareToken]/_CrewShell.tsx:243`), and peeks that read only gated fields, each computed by calling its section's own gate helper rather than restating it (Gear's pack list through `isPackListVisibleToday`, `components/crew/sections/GearSection.tsx:200`, `lib/visibility/packList.ts:122-139`). Cases, one per peek that has a gate: the Gear peek counts only the cases its section shows that viewer today (a stage- or phase-gated pack list contributes nothing); a transport leg never feeds the Travel peek for a viewer the transport gate excludes; no date reaches a peek for a suppressed viewer; an empty peek is null, never placeholder text; a domain whose fetch failed (`tileErrors`) keeps its section listed (spec §5.1, L241).

## Task 5: Shared sheet constants and scroll lock

<!-- task: red=`pnpm vitest run tests/components/shared/sheetConstants.test.ts tests/lib/ui/scrollLock.test.ts tests/styles/_metaBodyOverflowWriters.test.ts` ac=AC-2 -->

Red: no shared module exports the drag thresholds (`components/admin/review/ReviewModalShell.tsx:47-49` defines them locally); lib/ui/scrollLock.ts (new) does not exist; four files write `document.body.style.overflow` directly (`components/agenda/AgendaEmbed.tsx:113-116`, `components/diagrams/GalleryLightbox.tsx:723-726`, `components/admin/review/ReviewModalShell.tsx:241-244`, `components/admin/FinalizeButton.tsx:815-818`). Green: a shared constants module exports `DRAG_DISMISS_THRESHOLD_PX = 110` and `DRAG_SLOP_PX = 6`; `ReviewModalShell` imports them and keeps re-exporting them, so `Step3ReviewModal.tsx`'s re-exports (`components/admin/wizard/Step3ReviewModal.tsx:105-110`) and their importers are untouched; `acquireScrollLock()` is reference-counted (every release order of three holders restores the original value exactly once, after the last release; a double release is a no-op); all four writers migrate to it; the new structural test walks `app/`, `components/` and `lib/` and fails on any other writer, proven by planting a fifth writer in a temporary copy. Admin rendered DOM unchanged. Commit `refactor(ui): share one reference-counted body scroll lock`.

## Task 6: Section controller, sheet and wide nav

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-section-toggle.spec.ts tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "sheet|wide nav"` ac=AC-2,AC-3,AC-4 -->

Step 1, red: register tests/e2e/crew-wide-nav.spec.ts (new) in `playwright.config.ts` `desktop-chromium` `testMatch`, the `.github/workflows/crew-e2e.yml` run line, `scripts/check-crew-e2e-executed.mjs`, `tests/ci/_metaE2eWorkflowCoverage.test.ts` and `tests/ci/_metaSpecRegistration.test.ts`. Write the wide cases there (nav click scrolls and focuses the heading, `replaceState` only, scroll-spy follows and pauses during a nav-click scroll, deep link scrolls, Back/Forward over compact-created entries) and the compact cases in `crew-section-toggle.spec.ts` (every row of the spec §5.2 history table except "realtime refresh removes the open section", which Task 12 owns, and the in-sheet link row below; opening from an "All sections" row; a row link keeps `gate`; refresh with the sheet open; the sheet's close button is named "Close" plus the section name, spec §9.4; a drag released before the threshold springs back to open; the sheet is full width below 640px and centred at the panel max width from 640px). The server render is checked on the raw response, not in a JavaScript-off browser: the crew route has a loading boundary (`app/show/[slug]/[shareToken]/loading.tsx`), so with JavaScript off the streamed content stays hidden behind its notice (`tests/e2e/nojs-loading-notice.spec.ts:1-6` measures the same on `/admin`). A request for `?s=venue` (Playwright `request`, admin session) returns HTML containing the open Venue sheet (its dialog and the Venue body), and every "All sections" row in the HTML is an anchor whose `href` carries `s` and the allow-listed `gate`, so a pre-hydration click or an open-in-new-tab lands on the sheet. `?s=today` renders the home with no sheet in compact and the top of the page in wide (spec §5.1: `today` now means home), and `tests/e2e/theme-toggle.spec.ts`, which loads it, runs in this task's gate. The wide cases also cover the nav's items ("Today" first, then `crewSectionsFor` order, each item's text exactly its label, no counts or status dots), a nav click under reduced motion (instant scroll) and the accent indicator moving to the active item. They fail because `components/crew/CrewSections.tsx` renders tabs: no sheet, no nav, no list, no `data-crew-controller-ready`.

Its Vitest cases, in `tests/components/crew/crewSections.test.tsx` and tests/components/crew/bottomSheet.test.tsx (new), are written in this step too and observed red (commit gate). They include the sheet's modal behavior (focus moves to the title on open and back to the opener on close, Tab stays inside, the page behind is `inert`, `role="dialog"` with `aria-modal` and `aria-labelledby`) and an empty membership input: no "All sections" card in compact and no nav in wide, while the Today block still renders (spec §11 L476; no real PR A page has zero sections).

Step 2, green:
- The bottom sheet (spec §5.2): `role="dialog"`, `aria-modal`, labelled by its title; focus to the title on open and back to the opener on close; focus trap; page `inert`; scroll lock through Task 5; every close path (button, scrim, Esc, swipe past the Task 5 threshold) calls one `onRequestClose`; Esc, scrim and swipe ignored while another `aria-modal="true"` dialog is open; width rules; its z-index band registered.
- The scroll-spy rule: `activeSectionFor` (exported at `components/admin/review/ShowReviewSurface.tsx:97`) moves unchanged to a shared pure module so crew code never imports from `components/admin/**`; `ShowReviewSurface` imports it from there and keeps re-exporting it, so `components/admin/wizard/Step3ReviewModal.tsx:122-128` and its importers are untouched; admin DOM and the 50 section-header PNGs unchanged.
- The "All sections" list (spec §4.6, Task 4's membership and peeks, links from `buildSectionHref`), with the harness client-props case for its peeks.
- Paths nothing in PR A can trigger from a real page get Vitest cases on the controller with fixture section nodes: `openSectionAndReveal` in compact (opens the sheet, scrolls the target into view inside its body, highlights it) and wide (scrolls the page to the target, highlights it), called from a test consumer of `useSectionController()`; and the in-sheet link row of the §5.2 history table (a fixture node holding a `buildSectionHref` link: switching resets the sheet body's scroll to the top, and the following close lands on home, not the first section). No PR A section body contains an in-sheet link, and search's caller is unmerged (`feat/crew-show-search`), so the browser versions of these cases land with the first real caller: search's merge for `openSectionAndReveal`, PR B's shared bodies for in-sheet links.
- The wide nav's active-item accent: one measured indicator that moves between items with `--duration-fast`, as the admin rail does (`components/admin/review/ShowReviewSurface.tsx:763-764`), not a per-item conditional render.
- The controller: compact home plus sheet and wide nav plus stacked sections, from the same server-rendered `sectionNodes` (freshness invariant unchanged); the compact home shows today's Today section body followed by the list until Tasks 8 to 11 replace that body piece by piece; the §5.2 history table; the readiness attribute; the `useSectionController()` hook returning `{ openSectionAndReveal(sectionId, targetId) }` (the search session's §9 shape, branch `feat/crew-show-search`); compact behavior when `matchMedia` is absent. The sheet's animation durations get their `DESIGN.md` §5.5 rows.

Step 3, migrate then delete: re-run `rg -l "CrewSubNav|components/crew/CrewSections|data-active-section" tests`, plus the retired-id search (harness), and migrate every hit (including `tests/components/crew/crewSubNav.test.tsx`, `noPrefetchAlert.test.tsx`, and the nav cases in `crew-page.spec.ts` and `crew-section-toggle.spec.ts`), carrying each failure mode over (aria-current on the active item, 44px targets, no `next/link`, no network on a switch, the budget gate); then delete `CrewSubNav`. Compound transitions are Task 12.

## Task 7: Header

<!-- task: red=`pnpm vitest run tests/components/layout/crewHeader.test.tsx` ac=AC-5 -->

Red: `components/layout/Header.tsx:141` renders `ThemeToggle` only for identity-less viewers, and the client and venue render separately (`components/layout/Header.tsx:70-74`, `components/layout/Header.tsx:102-115`). Green: the joined eyebrow "client · venue" with each part sentinel-hidden and the separator only between two present parts; the toggle for every crew-page viewer; the search slot (renders search's field when present, otherwise nothing); the status slot. Cases: an identified viewer sees the header toggle and the avatar checkbox, and they agree (Task 1); each eyebrow sentinel combination; the status slot is an empty element immediately after the header bar; the search slot renders the node it is given and no wrapper when given none. Slot placement per mode needs search's field to exist, so its browser case lands with search (spec §1.2): in search's own plan if search merges first, else in PR A's rebase onto it. `tests/components/Header.test.tsx` cases pinning the old row (`tests/components/Header.test.tsx:51-104`) and the identity-less-only toggle (`tests/components/Header.test.tsx:184-190`) migrate in this commit.

## Task 8: Day row and shared crew clock

<!-- task: red=`pnpm vitest run tests/components/crew/dayRow.test.tsx tests/components/crew/useCrewClock.test.tsx` ac=AC-1,AC-6 -->

Red: neither the day row nor a shared clock exists; the client clock is private state inside `components/crew/RightNowHero.tsx:339` and `components/crew/RightNowHero.tsx:349-361`. Green: the clock (client `new Date()`, a 60s tick, the `visibilitychange` refresh) moves into one module-level store with a single timer and a single `visibilitychange` listener, attached while any subscriber is mounted, read through a `useCrewClock()` hook built on `useSyncExternalStore` (Task 1's pattern), so the day row, the pass and the run card's "Next" marker read one `now` and a remount never starts a second clock. `RightNowHero` uses it unchanged in behavior; the `DESIGN.md` §5.5 timer row moves with it. Clock cases: two subscribers mounted a minute apart read the same `now` after a tick; unmounting and remounting one leaves exactly one interval registered. The day row reads the same hook and mounts in the compact home above the Today body (and atop the wide Today block). Cases: `live` presses today's button only when today is in the set; a "Now" button renders exactly when today is not in the set, is pressed in `live`, and returns to `live`; tapping another day sets `day(iso)`; tapping today returns to `live`; hidden for suppressed, empty and degraded; layout counts buttons, not days (4 buttons in a grid, 5 or more scroll); button content per spec §4.2 (weekday or "Today", day of month, phase label, "Travel in, load in" for a combined day) and accessible names per §9.4; every button at least 44px by 64px (its `tapTargetCensus` row); the pressed state changes background and text colour with a `--duration-fast` colour transition, instant under reduced motion; the pressed button (or the nearest upcoming day) is scrolled into view on mount; a fresh mount starts in `live`; advancing fake timers past midnight in the show timezone moves the pressed Today button or brings "Now" in or out without a remount; the day set equals `ScheduleSection`'s rendered list for the same fixture and viewer. The server builds the day row's props (the filtered day set and labels) and passes nothing else across the client boundary; a case serializes them for a suppressed and an explicitly restricted viewer and searches for every withheld date.

## Task 9: Pass, retire RightNowHero

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/right-now-transitions.spec.ts tests/e2e/canonical-class-dimensions.spec.ts -g "pass"` ac=AC-1,AC-6 -->

Step 1, red: retarget the hero's browser coverage to the pass, titles carrying "pass": `tests/e2e/right-now-transitions.spec.ts` with `tests/e2e/helpers/rightNow.ts`, and `tests/e2e/canonical-class-dimensions.spec.ts` (its exact-key reads at `tests/e2e/canonical-class-dimensions.spec.ts:96`, `tests/e2e/canonical-class-dimensions.spec.ts:591`, `tests/e2e/canonical-class-dimensions.spec.ts:635`); add pass cases in `crew-page.spec.ts` (dark surface in both themes; a day switch is a crossfade, not a swap: a mid-transition sample finds the outgoing and incoming bodies both mounted with opacity strictly between 0 and 1, and under reduced motion every sample finds one body; the pass's height never drops below the minimum-height token while a day crossfade and a live-state swap run, sampled every animation frame inside one `page.evaluate`, with the premise that at least one sample saw both bodies mounted (the canonical spec samples rest states only, `tests/e2e/canonical-class-dimensions.spec.ts:37`); the `live` body; tapping a day in the Task 8 row shows its `day(iso)` body; personal cells through the preview route). They fail: no pass exists.

Step 2, green: the pass per spec §4.3 replaces the hero in the home, wrapping its machinery with Task 8's clock and taking only Task 3's props, never `RightNowContext`; switching days, and switching between `live` and a day, crossfades the pass body with `--duration-normal` (an `AnimatePresence` keyed by the selected day, instant under reduced motion); the footer's report autocapture, which today forwards the full `RightNowContext` to the client `ReportButton` (`app/show/[slug]/[shareToken]/_CrewShell.tsx:546-557`, `components/layout/Footer.tsx:193`), receives the same scrubbed props; the harness client-props case serializes the pass's props for each named viewer; the `rightNowHero*` Vitest suites migrate to the pass; the baseline key is renamed and its value re-captured in this commit (harness, "Canonical baseline").

Step 3, migrate then delete: re-run `rg -l "RightNowHero|right-now-hero" tests`, plus the retired-id search (harness), and migrate every hit, including `tests/specLint/canonicalTokenIdentity.test.ts` and `tests/docs/_retiredIdentifiers.ts`; update `_metaTileProducerTopology`'s ownership map; then delete `RightNowHero`.

## Task 10: Run-of-show card

<!-- task: red=`pnpm vitest run tests/components/crew/runOfShowCard.test.tsx` ac=AC-1,AC-6 -->

Red: the card does not exist, so every case fails. Cases, each against the spec §4.4 rule it pins: the whole card, agenda merge included, is absent on a day that is not the viewer's own (`eligible`, `components/crew/sections/TodaySection.tsx:222-224`) and for a suppressed viewer; a raw entry, including a viewer-hidden load-out, suppresses the synthetic "Show Start" row; an agenda-only day with no `ScheduleDay` renders its sessions; more than 6 rows renders 6 and a "Full schedule" link that opens Schedule through Task 6's controller; the "Next" marker sits on the first row at or after now in `live` (Task 8's clock) and never in `day(iso)`; a null `clockToMinutes` row never gets the marker; a day with no displayable rows (no `ScheduleDay` and no agenda sessions, or only rows the viewer cannot see) omits the card, heading included. The server builds each day's filtered rows and passes only those across the client boundary; a case serializes the card's props for a viewer the transport gate excludes and an explicitly restricted viewer and finds no load-out entry and no row from a day that is not theirs. Green: the card per spec §4.4, crossfading its rows with `--duration-normal` when the selected day changes (instant under reduced motion; the browser case in `crew-page.spec.ts` that proves the pass's crossfade samples the run card too, and this task runs it), rendering through `ShowDayTimelineList` and `RunOfShowList` with Today's card header actions and card id (spec §6.4), replacing the Today body's run-of-show card in the home.

## Task 11: Home composition, retire TodaySection

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "home"` ac=AC-1,AC-3,AC-6,AC-7,AC-8 -->

Step 1, red: browser cases titled with "home": AC-1 order (header, day row, pass, run of show, quick facts, show notes, Dress code card, "All sections"); copy success and failure toasts with selectable text on failure; a flight-only viewer's HTML and RSC payload contain no transport field (preview route); a date-suppressed viewer's HTML and RSC payload contain no ISO date of the show other than the header's own date and no hotel date (preview route); the header's date is shown to every viewer by a recorded ruling (`lib/crew/dateSuppression.ts:51-56`, rendered at `components/layout/Header.tsx:105`), so the search excludes that one value and the fixture's other show days differ from it, with the same search over an unrestricted viewer's payload finding them as the positive control, so every carrier on the page is covered rather than the ones a task names; tonight's hotel matches the server-pinned day (preview route); the preview banner shows in both modes on the preview route; the copy toast fades and rises in, holds 2 seconds and fades out, instant under reduced motion; and in the wide spec, the Today block (quick facts beside the run of show, show notes and the Dress code card inside it, no "All sections") followed by every section. They fail: the home still shows the Today section body.

Step 2, green: the admin fetch-failure blocks Today renders for rooms, hotel and contacts (`components/crew/sections/TodaySection.tsx:365-373`, `components/crew/sections/TodaySection.tsx:646-648`) render on the composed home for the same audience, below the pass, so a failed fetch never shows an admin nothing (spec §5.1 L241; their pins at `tests/components/crew/sectionTileError.test.tsx:139` and `tests/components/crew/sectionTileError.test.tsx:258` migrate to the home); the home's pieces stay inside the render-fault wrapper Today uses (`crew:today:notes`, `components/crew/sections/TodaySection.tsx:183-186`), with `tests/crew/_metaTileProducerTopology.test.ts` updated to the new producer; the quick facts block (Task 2 data built on the server, with the harness client-props case; grid spans; a toast in a polite live region that stays mounted while only its text changes); the show notes card and the full Dress code card (today's renderings, kept through PR A and PR B) with their card ids (`today-notes`, `today-dress`); `_CrewShell` composes the finished home and wide Today block; the toast hold gets its `DESIGN.md` §5.5 row; the canonical baseline is re-captured (the pass moved).

Step 3, migrate then delete. First, every block Today renders gets its successor, derived from the file's own cards and test ids (`rg -n 'data-testid=|cardId=|<SectionTileError' components/crew/sections/TodaySection.tsx`) and listed in the commit body:

| Today block | Successor |
|---|---|
| `section-today` wrapper | the composed home, same test id |
| `crew:today:notes` render-fault wrapper | the same wrapper around the home's pieces |
| Tonight card (`today-tonight`, first reservation) | the `hotel` quick fact and the pass's "Hotel tonight" (Task 2's `reservationForNight`); card id retired, spec §6.4 gives composites no actions |
| Where card (`today-where`) | the `address` quick fact; card id retired |
| Need something card (`today-contact`) | the `contact` quick fact; card id retired |
| Key times strip (`today-key-times`, both modes) | the pass's big time and fact grid; card id retired |
| Right-now hero | the pass (Task 9) |
| Rooms, hotel, contacts fetch-failure blocks | the same blocks on the home (Step 2) |
| Run-of-show card (`today-run-of-show`) and its "Full agenda" chip | the run card (Task 10), same card id, link "Full schedule" |
| Dress code card (`today-dress`) | kept, same card id |
| Show notes card (`today-notes`, `today-notes-overflow`) | kept, same ids |
| Mode A and Mode B grids (`today-mode-a-grid`, `today-mode-b-grid`, `today-day-context`) | the compact and wide home layouts; ids retired |

Retired card ids leave `CARD_REGION_MAP` (`lib/sheet-links/buildSheetDeepLink.ts:177`) in this commit, and `tests/components/crew/sourceLinkCoverage.test.tsx` asserts the kept ids on the home. Then re-run `rg -l "TodaySection" tests` (26 files at base `370e1cc9c`) plus the retired-id search (harness) and migrate every hit. The composed home keeps `data-testid="section-today"`, because it is the Today section of spec §5.1, so `tests/e2e/empty-state-reachability.spec.ts:294` and `tests/e2e/empty-state-reachability.spec.ts:469` (run by `.github/workflows/app-e2e.yml:188`) and `tests/e2e/crew-section-toggle.spec.ts:221`, `tests/e2e/crew-section-toggle.spec.ts:245` and `tests/e2e/crew-section-toggle.spec.ts:298` keep their marker and run in this task's gate. The hits include including its own suites, `tests/components/crew/sourceLinkCoverage.test.tsx` (now asserting the card ids on the home cards), `tests/e2e/crew-page.spec.ts:398` (`today-quick-cards`) and `tests/e2e/crew-page.spec.ts:728` (the key-times strip), and `tests/e2e/crew-layout-dimensions.spec.ts:1003` (`section-today`, run by `phantom-gap-e2e.yml`); update `_metaTileProducerTopology`; then delete `TodaySection`, so `_metaOrphanedComponents` stays green.

## Task 12: Compound transitions

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-section-toggle.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "compound"` ac=AC-12 -->

Step 1, red: browser cases titled with "compound" for every compound row of spec §7: viewport crossing into wide with the sheet open, mid-drag, and with a nested dialog open inside the sheet (the dialog unmounts with the sheet, and the page is scrollable afterwards whatever the unmount order); crossing back into compact (`replaceState` drops `s` and the marker); a realtime refresh with the sheet open (stays open); a refresh after which a lead previewing Budget loses `financialsVisible` with the Budget sheet open (the sheet closes to home without animation, and the page holds no Budget value afterwards, spec §5.2 amendment 2026-10-27); a refresh that removes the open section for any other reason cannot happen in PR A, whose only removable section is Budget, so that row's browser case lands in PR B with content-driven membership; a refresh removing the selected day (back to `live`); a refresh removing a nested dialog's owner (dialog unmounts alone, scroll stays locked); Esc with each nested dialog open (agenda viewer, lightbox, report modal: Esc closes only that dialog and focus returns inside the sheet); Back to another route with the sheet and a nested dialog open (destination page scrollable); a second day tap mid-crossfade (the second wins). They fail: Task 6 implemented only the simple paths, and `ReportModal` has no Escape handling.

Step 2, green: the breakpoint listener, the drag cancel, the day-row fallback to `live`, the never-close-on-refresh rule, the crossfade replacement, and Escape-to-close on `ReportModal`, which today handles only Ctrl/Cmd+Enter (`components/shared/ReportModal.tsx:331`): Escape runs the same `handleClose` as its close button and backdrop (`components/shared/ReportModal.tsx:440`), so its draft behavior is unchanged. The spec §7 table is copied into the header of `tests/crew/transitionAudit.test.ts`, and every row of it (spec lines L348 to L361 in the clause map) is pinned there or by the browser case the map names, including the ones that are not conditional renders: the sheet spring-back, the nav indicator, the toast and the day button's colour transition. Every `AnimatePresence`, ternary render and conditional block in the new components also gets its row with its §7 treatment. Each row's reduced-motion treatment (instant) is asserted alongside it.

## Task 13: Layout dimensions

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-page.spec.ts tests/e2e/crew-wide-nav.spec.ts -g "dimensional"` ac=AC-11 -->

Step 1, red: `getBoundingClientRect()` assertions (±0.5px), titled with "dimensional", for every spec §8 invariant, copied verbatim into the test file headers: compact cases in `crew-page.spec.ts`, wide cases in crew-wide-nav.spec.ts (new in Task 6). one or more assertions per spec §8 row, plus the two truncation rules (spec §4.3 L181, §4.5 L223): a long quick-fact value stops at 3 lines with an ellipsis, and a long fact-grid value stays on one line with an ellipsis, each checked by its rendered line count and `text-overflow`: (1) at 4 buttons, equal tracks and every button the row's full height, and at a 320px viewport the four fit the 288px content box with every button at least 64px wide; at 5 or more, a scroll row with every button at least 64px wide and still the row's full height; (2) fact cells shrink rather than widen (the pass's minimum height is Task 9's, not re-asserted here); (3) quick-fact tiles in one row share a height, a spanning tile is full width; (4) sheet height at most 90dvh with the body scrolling inside; (5) wide nav 240px wide, sticky, its height the viewport minus the header, and the content column filling the rest; (6) header height equals a section anchor's scroll margin. Heights are measured on the visible element inside each grid or flex cell (the button face, the tile card), which fills its cell only through the named class, not on the cell, which the grid stretches by default. They fail because Tasks 6 to 11 build structure only: the invariant classes below are this task's production lines.

Step 2, green: add exactly the classes and token spec §8 names, row by row: day row `grid` + `grid-cols-[repeat(N,minmax(0,1fr))]` + `items-stretch` with `h-full` buttons, and at 5 or more a flex row with `min-w-16` `self-stretch` buttons and `snap-x`; `grid-cols-3` with `min-w-0` fact cells; quick facts `grid-cols-2` + `items-stretch`, `h-full` tiles, `col-span-2` for a spanning tile; the sheet `max-h-[90dvh]` flex column with a `shrink-0` header and a `flex-1 min-h-0 overflow-y-auto` body; the nav `w-60 shrink-0` sticky with `h-[calc(100dvh-var(--crew-header-h))]` and its own scroll, the content column `flex-1 min-w-0`; the `--crew-header-h` token on the header, the nav offset and every section anchor's `scroll-margin-top`. Truncation: `line-clamp-3` on quick-fact values and `truncate` on fact-grid values. Re-capture the canonical baseline for the final layout.

<!-- tasks: end -->

## Closeout

1. **Full sweep.** `pnpm heavy pnpm vitest run` green; every crew e2e spec on the `crew-e2e.yml` run line plus `crew-layout-dimensions` and `canonical-class-dimensions` green through `pnpm heavy`; `rg -l "RightNowHero|CrewSubNav|components/crew/CrewSections|right-now-hero|TodaySection" tests` returns only migrated files, and every Playwright spec that references an id a retired component produced has run green.
2. **Design record.** `DESIGN.md` amendments per spec §3.3 (section sheet exception, crew left nav), committed as `docs(design): record crew sheet and left nav`; `pnpm heavy pnpm vitest run tests/docs` stays green.
3. **Help screenshots.** Regenerate `public/help/screenshots/crew-preview-{today,gear,schedule}-mobile-{light,dark}.webp` through the pinned-image `screenshots-regen` workflow (`gh workflow run screenshots-regen.yml --ref feat/crew-page-redesign`), never from a dev host; the PR's `screenshots-drift` job must pass.
4. The invariant-8 UI gate runs on the PR A diff before the cross-model diff review; its findings and dispositions are recorded here, with the closeout marker line, in the gate-run commit. Then the whole-diff cross-model review to APPROVE, real CI green on every required check, `gh pr merge --merge`, and local `main` fast-forwarded to `0  0`.

## 12. Invariant-8 UI quality gate

Run by the orchestrator on `feat/crew-page-redesign` at 56d67a6ec (the full PR A UI diff of Tasks 1-13 plus the `DESIGN.md` amendment), with the setup gates (the impeccable context load of PRODUCT.md and DESIGN.md, then the register read: impeccable 4.5.0 has no product register file, so the Operate register) and each half in its own context: critique 28/40, audit 13/20. Both halves measured on a live dev server at 320, 390, 768, 1024 and 1280, both themes, the crew route and the admin preview route; the detector found nothing in the changed files. Then re-run, scoped to the fix diff and the loading skeletons (56d67a6ec..f6654e7c0) at f6654e7c0: critique 31/40, audit 17/20; all 22 first-run fixes (X1-X10, Y1-Y12) resolved, the focus-trap repair leaves every admin dialog behaving as on main, and the re-run found 0 P0, 1 P1, 3 P2 and 7 P3 (rows 27-37, overlaps merged). Its fixes landed in b0f7554cf..8728afbfd.

Neither half could render the run-of-show card or the Dress code card in a browser (no seeded show has either); the fix pass rendered both from fixtures and the re-run checked them.

| # | Pass | Tier | Where | Finding | Disposition |
|---|---|---|---|---|---|
| 1 | both | P1 | CrewPass.tsx | The pass cut off the show time (AM/PM lost at 1024), labels and the strike time (audit P1-1, P2-1; critique F1). | Fixed: 84ab5ebaa, d3a7c3d3c. The big time and time cells never truncate, labels never truncate, other values clamp at two lines; spec §4.3 amended on its line (overridable). |
| 2 | audit | P1 | Header.tsx, globals.css | The sticky wide header hid keyboard focus on Shift+Tab (WCAG 2.4.11). | Fixed: 6118d42b4 (scroll padding from the header height). |
| 3 | both | P1 | Header.tsx, PreviewBanner.tsx | On the admin preview route the preview banner covered the sticky crew header and its focusable controls (audit P1-3, critique F3). | Fixed: 6118d42b4 (the banner publishes its height; header, nav and scroll padding add it). |
| 4 | audit | P1 | globals.css | Forced colors: the selected day and the current nav item rendered their text invisible; the admin top bar's current link had the same fault. | Fixed: 2c958a29c (one `forced-color-adjust: none` selected-state rule, verified on rendered pixels); DESIGN.md §17. |
| 5 | both | P2 | passModel.ts, CrewPass.tsx | The pass eyebrow showed the raw roster role and lost its position code (audit P2-2, critique F2). | Fixed: 84ab5ebaa, d3a7c3d3c (wraps, clamps at three lines). |
| 6 | both | P2 | Header.tsx | The wide header truncated the show title (audit P2-3, critique F8). | Fixed: 48484c597 (title gets the larger share, status pill moves to the date line, `title` attribute). |
| 7 | audit | P2 | SectionCard.tsx, CrewSections.tsx | Heading levels were flat: card titles at the same level as their section (WCAG 1.3.1). | Fixed: 48a733742 (card titles one level under their section, swept to the Diagrams tile, Agenda and gear rooms). |
| 8 | audit | P2 | CrewSectionSheet.tsx | Closing a deep-linked sheet dropped focus to body. | Fixed: e04ed4ac9 (focus returns to the section's row). |
| 9 | audit | P2 | CrewSections.tsx | The wide nav's Today jump focused a 1px hidden heading. | Fixed: bc46f63fd. |
| 10 | critique | P2 | CrewSectionSheet.tsx | Closing one section and quickly opening another showed the old body under the new title. | Fixed: b35bbb2b5; spec §7 amended on its line with the compound row. |
| 11 | critique | P2 | CrewDayRow.tsx | After the show the day row scrolled the pressed Now out of view. | Fixed: 165aed6ad. |
| 12 | critique | P2 | CrewPass.tsx, CrewDayRow.tsx, globals.css | In dark the pass stopped being the focal point; the pressed day outshone it. | Fixed: d3bbd50fc (dark pass edge, quieter pressed day, new tokens with contrast pins). |
| 13 | critique | P2 | CrewSections.tsx | The wide Today block left a void under the pass with no run of show. | Fixed: f3938834c. |
| 14 | critique | P2 | quickFacts.ts | Who to call dropped the contact's role (spec §4.5). | Fixed: 75a006857. |
| 15 | audit | P3 | CrewPass.tsx, globals.css | Inactive progress segments vanished in forced colors. | Fixed: 5367f7d82, 2c958a29c. |
| 16 | audit | P3 | CrewPass.tsx, CrewDayRow.tsx | The live dot had no "Live" text; a day change was silent. | Fixed: fe92a4b32. |
| 17 | audit | P3 | HomeSection.tsx | Show notes that fit still rendered as empty disclosures. | Fixed: b43b399f1. |
| 18 | audit | P3 | CrewDayRow.tsx | Day-row overflow has no edge cue. | Accepted: behaviour follows spec §4.2. |
| 19 | audit | P3 | CrewSectionSheet.tsx | The sheet's inert sweep inerted Next's route announcer. | Fixed: 5adcaf34f. |
| 20 | critique | P3 | HomeSection.tsx, CrewQuickFacts.tsx | Three heading idioms on the home; Show notes nests bordered cards. | Accepted: spec §5.1 keeps today's Show notes and Dress code renderings through PR A and PR B; PR C revisits them. Heading levels fixed in row 7. |
| 21 | critique | P3 | Header.tsx | The header date is unlabeled. | Accepted: who sees the header date is a recorded ruling (`lib/crew/dateSuppression.ts`); unchanged presentation. |
| 22 | critique | P3 | CrewQuickFacts.tsx | The contact buttons wrapped at 390. | Fixed: dff9f2676. The Crew section's glyph icons filed as BL-CREW-SECTION-GLYPH-ICONS. |
| 23 | critique | P3 | CrewSectionSheet.tsx | The sheet panel had no lift in dark. | Fixed: ca10bc82d. |
| 24 | critique | P3 | CrewWideNav.tsx | The nav indicator animated `height`. | Fixed: 571765ef7 (transform only). |
| 25 | fix pass | P2 | CrewRunOfShowCard.tsx | Found while rendering the run card from a fixture: its title truncated at every width. | Fixed: 1a8e5784f ("Full schedule" moves to the card's foot). |
| 26 | critique | out of diff | Section.tsx, PersonRow.tsx | Diagrams heading contrast; Crew section role lines raw and truncated. | Filed: BL-DIAGRAMS-HEADING-FAINT-CONTRAST, BL-CREW-ROLE-LINE-RAW-TRUNCATED (4a98c2147). |

| 27 | re-run audit | P1 | CrewSections.tsx | From 1024px a Today-block search target (run-of-show line, show note, dress code) scrolled under the sticky header, fully hidden (WCAG 2.4.11); the reveal e2e passed because `toBeInViewport()` ignores what covers an element. | Fixed: 2bc77cdc1 (every reveal and nav-jump target clears the header, banner and focus ring; the e2e now checks the target is not covered). |
| 28 | re-run audit | P2 | CrewSectionSheet.tsx | Closing a deep-linked sheet focused the All-sections row with `preventScroll`, off screen. | Fixed: d934b5d7d (the focused row is brought into view). |
| 29 | re-run audit | P3 | CrewSections.tsx | The focus ring's top 5px sat under the sticky header after a jump. | Fixed: 2bc77cdc1 (same change as row 27). |
| 30 | re-run both | P3 | CrewLoadingSkeleton.tsx | The loading skeleton still jumped (+86px at 390, +92 on the preview route at 390, +29 on the preview route at 1280). | Fixed: d67f3c071 (lands within the case tolerance at 390 and 1280 on the crew and preview routes; the case now covers the preview route). |
| 31 | re-run both | P3 | CrewQuickFacts.tsx | Who to call put Email alone on a second row at 320, 360, 375 and 1024. | Fixed: 568087acd (one row at every width). |
| 32 | re-run both | P3 | CrewSearchField.tsx | The search placeholder was cut mid-word at 1024. | Fixed: a8d776258. |
| 33 | re-run critique | P2 | passModel.ts, CrewPass.tsx, quickFacts.ts | The pass's Dress code cell and tile ignored the day's phase. | Fixed: 01ae2f44d (the cell and tile show the attire for the day's phase; with no phase labels the whole value shows). |
| 34 | re-run critique | P2 | SectionCard.tsx | Card titles truncated beside "In sheet" and the report button (class of row 25). | Fixed: 064e4f507 (titles wrap beside their header actions; swept every SectionCard caller). |
| 35 | re-run critique | P3 | CrewSections.tsx | The wide Today block leaves about 350px empty in its right column when a run of show is present. | Accepted: PR C rebuilds this block when it moves the Dress code card out (spec §5.1). |
| 36 | re-run critique | P3 | CrewDayRow.tsx, globals.css | In dark the pressed day differed only by a 1px edge. | Fixed: a77f7cfe8 (an accent selection bar on the pressed day, contrast pinned). |
| 37 | re-run critique | P3 | Header.tsx | At 1024+ the status pill beside the unlabeled set date read as if the date were today's. | Fixed: 9f766288e (the status pill moves to the eyebrow line; the date stays visible per the ruling), 8728afbfd (the eyebrow carries client and venue whole as `title` where the line truncates). |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=5 dispositions=recorded
