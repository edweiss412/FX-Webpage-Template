# Crew panel follow-ups: implementation plan

**Spec:** `docs/superpowers/specs/2026-11-07-crew-panel-followups-design.md` (sections cited as §). **Branch:** `feat/crew-panel-followups`, a worktree off `origin/main` at `9054c83c1`. **Implementer:** Opus / Claude Code (UI work, AGENTS.md routing hard rule).

Line numbers were read at `9054c83c1`. They are locators; the file and symbol are the anchor.

## Acceptance coverage

Spec §11's criteria, by task: AC-1, AC-2, AC-3 and AC-10 in Task 1 (AC-3 re-runs in every task's commit gate), AC-5 in Task 2, AC-4, AC-6 and AC-11 in Task 3, AC-7 and AC-8 in Task 4, AC-9 in Task 5.

## Meta-test inventory

Creates one guard, tests/styles/crewSectionTypeScale.test.ts (new; the static size walk, AC-10). It walks `components/show-panels` and `components/crew` from disk, so a new file is covered by default. Extends one: the registry in `tests/crew/transitionAudit.test.ts:907` and `tests/crew/transitionAudit.test.ts:928`, which enumerates every conditional render in `PanelCard` and `VenueBody` and rejects an unregistered one (`tests/crew/transitionAudit.test.ts:1385`). Task 2 registers `PanelCard`'s new header, title and group conditionals and `VenueBody`'s label conditional, each as `T.serverPresence`. `tests/components/show-panels/_metaShowPanelsBoundary.test.ts` still applies to `PanelCard` and is re-run in Task 2.

Two more pins move with any JSX ternary or line shift above a fault branch: the ternary population `tests/help/_metaRenderFaultMarking.test.ts:254` reads, declared in `tests/help/_renderFaultScan.ts:1053`, and the candidate digest at `tests/help/_metaRenderFaultMarking.test.ts:693`, which includes source line numbers. Each task runs that file in its commit gate. A new ternary updates the declared figure with a dated comment, and a moved line updates the digest with a comment naming each moved file, recomputed from `scanCandidates()`, the form the entries above each one already use. Membership must not change: a digest move with a changed member is a real fault branch to classify, not a number to update.

## Commit gate (every task)

`pnpm typecheck`, `pnpm exec eslint` on the touched files, `pnpm format:check` on them, the task's `red=` command green, `pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` green, and `pnpm vitest run tests/components/admin/wizard/adminSectionDom.test.tsx` green with `git status --short tests/components/admin/wizard/__golden__` empty (AC-3). No commit in the same shell chain as a transform.

## E2E harness rules

Server: `CI=1 BASELINE_SERVER_ONLY=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm heavy pnpm exec playwright test <files> --retries=0`, with port 3000 free and the seed fresh from `pnpm db:seed` under the same variable. `CI=1` takes the production branch of `playwright.config.ts:290` and turns off server reuse (`playwright.config.ts:311`), and `BASELINE_SERVER_ONLY` drops the servers on 3001 to 3004 (`playwright.config.ts:502`). `E2E_PORT` is not used: the first run showed `tests/e2e/helpers/signInAs.ts:60` still posts to 3000, and the locked fixture writers refuse the ambient remote `TEST_DATABASE_URL`. Without `CI` the config starts development mode and may reuse a stranger's server, so that form proves nothing here. Readiness: the spec files' existing helpers (`load`, `loadWide`, `gotoSection`) await `data-crew-controller-ready=true`, never `networkidle`. `tests/e2e/wifi-password-row.layout.spec.ts` belongs to its own config: `pnpm exec playwright test -c tests/e2e/standalone.config.ts tests/e2e/wifi-password-row.layout.spec.ts --retries=0`. Every `page.evaluate` here reads and returns in one call, so nothing outlives its element. Full runs go through `pnpm heavy`.

## Reader sweep

Run at plan time, against `9054c83c1`. Command, with goldens and the `SectionCard` and marker primitives' own tests left out because neither markup changes there:

```bash
grep -rnE 'section-card|panel-card-(chip|header)' tests --include='*.ts' --include='*.tsx' | grep -vE '__golden__|tests/components/crew/primitives.test|tests/search/primitiveMarkers'
```

| File and lines | Disposition |
| --- | --- |
| `tests/components/crew/diagramsBlock.test.tsx` 210 | Task 3: reads the panel chip |
| `tests/components/crew/runOfShowCard.test.tsx` 610 | none: the home's run card keeps `SectionCard` |
| `tests/components/crew/sections/AgendaSection.test.tsx` 198 | Task 2: untitled, reads no chip |
| `tests/components/crew/sections/CrewSection.test.tsx` 152, 153 | Task 2: untitled |
| `tests/components/crew/sections/EventSection.test.tsx` 78, 94 | Task 2: untitled |
| `tests/components/crew/sections/PackListSection.test.tsx` 128, 152 | Task 2: untitled |
| `tests/components/crew/sections/RoomsSection.test.tsx` 184, 222 | Task 2 and Task 3: panel untitled, Diagrams panel-titled |
| `tests/components/crew/sections/ScheduleSection.test.tsx` 159 to 190 | Task 2: the times card is an untitled `crew-panel-card` |
| `tests/components/crew/sections/TransportSection.test.tsx` 493, 501 | Task 2 and Task 3: the flight card is titled, the panel titled only under it |
| `tests/components/crew/sections/VenueSection.test.tsx` 181 | Task 2: untitled |
| `tests/components/crew/sourceLinkCoverage.test.tsx` 16, 424 | Task 3: its action-slot walk reads `section-card-action`, which `PanelCard` keeps; only its comments move |
| `tests/components/show-panels/contactsBody.test.tsx` 347, `crewBody.test.tsx` 319, `eventDetailsBody.test.tsx` 328 to 593, `venueBody.test.tsx` 192 | Task 2: read the new header |
| `tests/e2e/crew-layout-dimensions.spec.ts` 545 | none: the home's run card title |
| `tests/e2e/crew-page.spec.ts` 1276, 4699 | Task 3: the ancestor is `crew-panel-card` |
| `tests/e2e/crew-page.spec.ts` 3417 | Task 3: reads titled cards only |
| `tests/e2e/crew-page.spec.ts` 3794, 3795 | none: Venue keeps its action header, and these measure `venue-body` and the Maps link against it |
| `tests/e2e/crew-page.spec.ts` 3888, 3889, 3891 | Task 3: Billing has no chip now, so the chip geometry moves to Facilities, a titled panel card by then |
| `tests/e2e/crew-page.spec.ts` 4152, 4226 | none: the action slot stays |
| `tests/e2e/crew-wide-nav.spec.ts` 215, 216, 235 | Task 3: walks both card types |
| `tests/e2e/source-link-dimensional.spec.ts` 95 to 153 | Task 3: its dev page keeps `SectionCard`; no change expected, confirmed by running it |
| `tests/e2e/wifi-password-row.layout.spec.ts` 235 | Task 3: reads `crew-panel-card` |

A second sweep finds what reads a title or level rather than a hook:

```bash
grep -rnE 'level: ?[34]|h4|name: "(Hotels|Transport|Pack list|Billing|Agenda|Crew|Contacts|Venue|Event details|Rooms)' tests --include='*.ts' --include='*.tsx' | grep -E 'crew|show-panels|search/|stage-restricted'
```

| File and lines | Disposition |
| --- | --- |
| `tests/search/indexRenderParity.test.tsx` 760, 771 | Task 2: room premises select `h3` |
| `tests/components/show-panels/billingBody.test.tsx` 236 | Task 2: asserts the hidden group, no `h3` |
| `tests/components/crew/sections/HotelsSection.test.tsx` 83 | Task 2: same |
| `tests/crew/crewRegistryConsumption.test.tsx` 338, 339 | Task 2: the panel's registry name is read from the hidden group, and the glyph assertion leaves with the chip. Task 3: the loop at 335 then keeps only cards holding a hidden group, because Facilities' fixture renders a titled card with its own name |
| `tests/crew/crewRegistryConsumption.test.tsx` 346 | Task 2: the schedule now holds one panel card |
| `tests/components/crew/sections/EventSection.test.tsx` 142, 150, 208, 348 | Task 2: level 3 |
| `tests/components/crew/sections/RoomsSection.test.tsx`, `tests/components/crew/sections/AgendaSection.test.tsx`, `tests/components/crew/agendaScheduleBlockFold.test.tsx` | Task 2: level 3 on the crew render, `h4` on the default render |
| `tests/e2e/crew-section-toggle.spec.ts` 1661, 1792, 2359 | Task 3: read the sheet's `h2` |
| `tests/e2e/crew-page.spec.ts` 4154, 4342 | Task 3: level 3 |
| `tests/e2e/stage-restricted-crew-schedule.spec.ts` 468, 472, 511, 514 | Task 3: level 3 |
| `tests/components/crew/diagramsBlock.test.tsx` 235 | Task 3: `text-text-strong` |
| `tests/e2e/crew-wide-nav.spec.ts` 1157, 1162 | Task 4: rewritten to §6's rows |

Anything either sweep misses surfaces in each task's own run and in Closeout's full suite.

## Transition audit

Spec §9 has three rows, all instant. Task 4 adds no `AnimatePresence`, ternary or conditional beyond the slot's existing `runCard ?` render, and the slot's `empty:hidden` is its exit. The existing `compound:` cases at `tests/e2e/crew-wide-nav.spec.ts:750` run on a fixture with no run card, so they do not cover §9's compound row. Task 4 adds the case that does.

<!-- tasks: depth=2 -->

## Task 1: Section type scale

<!-- task: red=`pnpm vitest run tests/styles/crewSectionTypeScale.test.ts` ac=AC-1,AC-2,AC-3,AC-10 -->

RED: tests/styles/crewSectionTypeScale.test.ts (new). It reads `app/globals.css`, takes the `[data-crew-section-type]` rule set, walks both directories with `fs`, and collects every `text-[<n>px]` and `text-[<n>rem]` literal below 12px. Fails today: no such rule set exists, so the production defect is the missing rule. It states its premise with `premise` from `tests/_shared/premise.ts`: the walk saw `components/show-panels/FieldRowList.tsx` and at least one literal. A second case runs the matcher on a planted string, so the guard's own recognizer is shown to fire.

GREEN: §3's rule set in §3's order, placed after the last `@layer` block of `app/globals.css`. `data-crew-section-type=""` on `crew-section-sheet-body` (`components/crew/CrewSectionSheet.tsx:480`) and on `crew-wide-section` (`components/crew/CrewSections.tsx:1020`).

Browser: a case in `tests/e2e/crew-section-toggle.spec.ts` opens each section the seeded viewer has at 390 and walks text nodes under the attribute, asserting computed size 12px or more, with a premise that at least one `.uppercase` node and one `text-sm` node were seen. The same walk runs over `crew-wide-stack` in `tests/e2e/crew-wide-nav.spec.ts` at 1280. AC-2's samples read one `.uppercase`, one `.text-xs` and one `.text-sm` node in a section, and one `.text-xs` and `.text-sm` node on the home, deriving nothing from the CSS file. AC-11's size half reads a schedule `DayCard` weekday at 12px, which fails if the two rules swap. Failure caught: a rule dropped by a build, or a class a body uses that the rule set does not reach.

Mutants, before the commit: delete the label rule (browser walk fails); swap the two rules (the weekday case fails); drop `.text-\[9px\]` from it (static walk fails); remove the attribute from the sheet body (browser walk's premise fails). `scripts/check-crew-e2e-executed.mjs` counts move with the cases added.

## Task 2: One title per section

<!-- task: red=`pnpm vitest run tests/components/show-panels/panelCardParity.test.tsx tests/components/show-panels/venueBody.test.tsx tests/crew/transitionAudit.test.ts` ac=AC-5 -->

RED: `tests/components/show-panels/panelCardParity.test.tsx` gains: `sectionId` alone renders no chip and no `h3`, and exactly one `[data-search-group][hidden]` holding the label; with `actions`, the header holds only the action slot; with neither, no `header`; `titled` prints the label in an `h3`; `title` and `icon` print them and `titleSearchTarget` lands on the `h3`. The box and chip class parity cases keep passing on a titled render. `tests/components/show-panels/venueBody.test.tsx` gains `nameLabel: false` omits the label and the default keeps it. Both fail today because `PanelCard` always prints its title (`components/show-panels/PanelCard.tsx:33-34`) and `VenueBody` has no such prop. `tests/crew/transitionAudit.test.ts` gains the new registry rows, so it fails until the conditionals exist.

GREEN: §4's `PanelCard` props. `VenueBody` takes `nameLabel`; `components/crew/sections/VenueSection.tsx` passes false. `components/crew/sections/TransportSection.tsx` passes `titled` when the flight card renders. The schedule's times card moves to `PanelCard` here, `title` with `titled={false}` (`components/crew/sections/ScheduleSection.tsx:297`), because it is §4's repeated title. §4's heading levels: `titleAs` and `nameAs` accept `"h3"`, `AgendaScheduleBlock` takes `dayHeadingAs`, and `components/crew/sections/EventSection.tsx:112`, `components/crew/sections/RoomsSection.tsx:130` and `components/crew/sections/AgendaSection.tsx:97` pass `"h3"`. `tests/components/show-panels/eventDetailsBody.test.tsx` and the Rooms and Agenda section tests assert the crew's `h3` and the default's unchanged element.

The unit readers the sweeps give Task 2 move here, each to the new shape, none deleted. Search parity runs on its updated premises: `pnpm vitest run tests/search`.

Mutants: give the hidden span no `hidden` (unit fails); print the `h3` when `titled` is false (unit fails); pass `titled={false}` under the flight card (Transport test fails).

## Task 3: One card header

<!-- task: red=`pnpm vitest run tests/components/crew/sections/VenueSection.test.tsx tests/components/crew/sections/TransportSection.test.tsx tests/components/crew/diagramsBlock.test.tsx` ac=AC-4,AC-6,AC-11 -->

RED: each file asserts its crew-only card renders `crew-panel-card` with its title in an `h3`, and no `section-card`: Facilities, Venue status, Your flight, Diagrams. Fails today: all four are `SectionCard`s.

GREEN: §5. `components/crew/sections/VenueSection.tsx:222`, `components/crew/sections/VenueSection.tsx:242`, `components/crew/sections/TransportSection.tsx:135`, `components/crew/DiagramsBlock.tsx:72`. Every `action` becomes `actions`; `headingSearchTarget` becomes `titleSearchTarget`; glyph elements become component references.

`tests/e2e/_wifiPasswordRowLiveEntry.tsx:58` takes `PanelCard` and a `data-crew-section-type` wrapper, so the standalone Wi-Fi harness measures what production draws. The e2e readers the sweeps give Task 3 move here.

Browser, now that no repeated title or old card remains:

- AC-4: a case in `tests/e2e/crew-section-toggle.spec.ts`, per section, removes `hidden` elements from a clone of the body and asserts no leaf text equals the sheet's `h2` text, case-insensitive, with a premise that the clone holds text.
- AC-6: Facilities' `h3` computes 16px and font weight 600 in the browser, which fails if the panel title drops to `text-sm`, and a section body holds no `section-card`.
- AC-11: `tests/e2e/crew-wide-nav.spec.ts:185`'s outline walk already fails a skipped level, and it now also walks `crew-panel-card`; its `cards` premise counts `h3`s inside either card type, since only two home cards keep the old title.

## Task 4: Wide Today block

<!-- task: red=`pnpm vitest run tests/components/crew/runOfShowCard.test.tsx` ac=AC-7,AC-8 -->

RED: `tests/components/crew/runOfShowCard.test.tsx`, which already mounts the controller with a run card, asserts the card sits in `crew-today-run`, the lead's next sibling, and that the block's children read lead, run slot, home body. Fails today: the card is inside the lead (`components/crew/CrewSections.tsx:998`).

GREEN: §6.

Browser (AC-7): one case in `tests/e2e/crew-wide-nav.spec.ts` at 1280 on a show with a run of show. For each of §6's eight states it removes the absent nodes from the live DOM (`crew-quick-facts`, `today-notes`, the slot's child) and reads rects, since every rule reads the live DOM through has and empty selectors. Expected row and column come from a table in the test keyed by state; widths compare to the block within 0.5px, and rows by top order. §8's spacing is asserted too, on the visible card rather than its slot: `today-run-of-show`'s top equals the larger of the lead's and the quick facts' bottoms plus 16px, and the notes' top equals `today-run-of-show`'s bottom plus 16px, each within 0.5px. A margin left on the wrapper counts inside the slot, so measuring the slot would pass with it. `tests/e2e/crew-wide-nav.spec.ts:1157` and `tests/e2e/crew-wide-nav.spec.ts:1162` are rewritten to the same rows. AC-8: at 390, tops ascend in the order day row, pass, run, quick facts, notes.

Compound (§9): on the same show, a case tags the run card's element and its first run row, the row sitting inside `AnimatePresence`, crosses the viewport from 1280 to 390 and back, and asserts both tagged elements are still the ones in the DOM. A key that depends on the mode, on the slot or on the grid inside the card, remounts one of them, so it fails here, and a fade cannot be cut by a crossing that keeps those nodes.

Mutants: gate `TODAY_PACKED` back on `runCard === null` (state 1 fails); drop `empty:hidden` (a no-run state gains a gap); drop `lg:flex-wrap` (state 5 fails); add `lg:mt-2` to the slot, or leave the wrapper's `mb-4` (the spacing equation fails); add `key={mode}` to the slot (the compound case fails).

## Task 5: Docs and overflow

<!-- task: red=`pnpm vitest run tests/styles/designMdCrewType.test.ts` ac=AC-9 -->

RED: tests/styles/designMdCrewType.test.ts (new) asserts `DESIGN.md` §2 names `data-crew-section-type` and the three sizes. GREEN: the `DESIGN.md` note, and §12 and §13's "crew panel card" text brought to the new title rule.

AC-9: `tests/e2e/crew-section-toggle.spec.ts` gains a width sweep at 320, 390 and 768, asserting `scrollWidth` equals `clientWidth` on the document and on the sheet body for each section. `tests/e2e/crew-wide-nav.spec.ts` asserts the same on the document at 1024 and 1280, where the sheet does not mount (`components/crew/CrewSections.tsx:1052`).

<!-- tasks: end -->

## Closeout

Every change that merges lands before the final review, so the review covers what merges. In order:

1. The full unit suite and the crew e2e specs, through `pnpm heavy`, with the harness rules above.
2. The invariant-8 UI gate on the diff, its table added to this plan's §12.
3. Move the three `CREWPANEL-` rows to `DEFERRED-archive.md`, removing their in-progress markers, and mark question 2 answered in `docs/superpowers/plans/2026-11-05-crew-page-redesign-pr-c.md:452`.
4. Delete the moved help screenshots, push, run `screenshots-regen.yml` on the branch, and fast-forward its bot commit.
5. Whole-diff cross-model review to APPROVE. A repair restarts this step.
6. Push, real CI green, merge, fast-forward `main`, verify `0  0`.

The review-round corpus rows those last dispatches write land after step 5 by construction. That is the one exception, and they are records, not code.

## 12. Invariant-8 UI quality gate

Run on 2026-11-07 against `df5e99b10` and `d2af3121c`, on this branch's diff (`git diff origin/main..HEAD -- app components`) plus the new rule set in `app/globals.css`. Both passes ran with their setup gates: the context load of `PRODUCT.md` and `DESIGN.md`, then the register read. The critique ran as two isolated assessments, a design review and the detector with browser evidence, and scored 28/40. The audit scored 17/20. Together they raised 0 P0 and 1 P1 after merging. Measured at 320, 360, 375, 390, 768, 1024 and 1280, light and dark, on the crew route with a lead viewer on the seeded show: 134 captures plus each pass's own probes, no text under 12px, no overflow, lowest contrast 4.65:1 light and 5.86:1 dark, no skipped heading level. The detector found 0 issues in the changed files. Not reached: Safari and iOS, real touch, a seeded viewer with a Transport panel card.

The P1 and four other findings were repaired in-branch (`d77cc9645`, `fb1ad5d68`), the repairs each pinned by a browser case and a mutant that fails it. Every other finding is accepted with its reason, or is outside this diff. Nothing is deferred.

| # | Pass | Tier | Where | Finding | Disposition |
| --- | --- | --- | --- | --- | --- |
| 1 | both | P1 | `components/crew/primitives/FactRows.tsx` | A one-word SSID overprints its "Wi-Fi network" label: -12px at 360 on the seeded show, where main was clean, and -52px at 320 (main -36px). `wrap-break-word` does not lower the value's min-content. | Fixed, `d77cc9645`: `wrap-anywhere`. The Facilities case seeds a long SSID and password and fails on any label overlap at 390 and 320; reverting the class fails it. |
| 2 | audit | P2 | `components/crew/CrewSections.tsx` | The wide Today grid's dense flow puts the quick facts above the run of show while focus follows the DOM: a 654px jump back up at 1280, 820px at 1024. | Fixed, `d77cc9645`: `reading-flow: grid-rows` under the grid, pinned by a Tab-order case. Chromium only; Safari and Firefox keep DOM order (spec §12). |
| 3 | critique | P2 | `components/show-panels/PanelCard.tsx` | A titled card's header sat 6px above a first row of 15px values, so the 16px title read as one more row. | Fixed, `d77cc9645`: 12px under a printed title, pinned in the Facilities case. |
| 4 | critique | P2 | `components/crew/CrewSections.tsx` | With no quick facts, the phone margins stacked on the 24px gap: 40px around the run of show. | Fixed, `fb1ad5d68`: the margins drop at lg in the flex rows too. The state cases fail any row gap above 24px. |
| 5 | critique | P2 | `components/shared/CardReportTrigger.tsx` | The report flag rests at 2.2:1 light and 2.49:1 dark, under 3:1 for an icon-only control; `DESIGN.md` claims 3.35:1, which leaves out a 70% opacity. Outside this diff, and alone on every untitled card's action row. | Fixed, `d77cc9645`: the opacity goes, which is the 3.35:1 the doc states. |
| 6 | both | P2 | `components/crew/CrewSections.tsx`, 1024 | At 1024 the pass column ends 178px above the quick facts, whose tiles wrap at that width. | Accepted: row 1 can differ in either direction, now recorded in spec §12. The owner chose this layout from renders. |
| 7 | critique | P2 | `components/show-panels/PanelCard.tsx` | An untitled card reads as a card with a floating "In sheet" row, in eight of ten sections. | Accepted: ratified (spec §2.1). Putting the actions in the card's footer is the owner's next option if the row bothers. |
| 8 | critique | P2 | `components/crew/sections/EventSection.tsx` | Event details' field-card action rows grow their tap overlays in both directions. | Accepted: PR C set the directions so a report files against the right card (its gate row 8). |
| 9 | critique | P2 | spec §3 | Labels grew most (10 to 12px), and pack items keep the supporting tier at 13px. | Accepted: the sizes are ratified (spec §2.1). |
| 10 | audit | P3 | `components/crew/sections/VenueSection.tsx` | Venue's three action pairs share one accessible name. | Fixed, `d77cc9645`: each passes its card's title as `label`. |
| 11 | audit | P3 | `components/crew/CrewSections.tsx`, `components/crew/sections/ScheduleSection.tsx`, `components/crew/primitives/CardHeaderActions.tsx` | Comments described the old layout and the old card. | Fixed, `d77cc9645`. |
| 12 | audit | P3 | Schedule sheet | Text-only 200% (not page zoom) adds a 13px sideways scroll at 390. Page zoom at 200% and 400% is clean. | Accepted, recorded in spec §12. |
| 13 | both | P3 | report dialog | Opened from a section card, the dialog's body is 15px; from the home, 14px. | Accepted: it reads the scale of the card it was opened from. |
| 14 | audit | P3 | `tests/styles/crewSectionTypeScale.test.ts` | The static walk counts `sm:text-[10px]`, `text-[10px]/4` and `!text-[10px]` as covered, though the CSS does not reach them, and it walks two directories. | Accepted as a documented limit in spec §12; the browser walk covers what renders. |
| 15 | audit | P3 | headings | One heading level shows in four treatments, and the flight times stay at a literal 13px. | Accepted: each treatment belongs to an existing component. |
| 16 | critique | P3 | schedule times card, Venue status at 320, contacts spacing, Agenda title column, the pass in dark mode, the run of show's 12/14px beside the schedule's 13/15px | Notes. | Accepted: the run of show is on the home, outside the scale by ratification; the rest predate this diff or are minor. |
| 17 | both | P3 | outside this diff | Unbroken 60-character tokens scroll a sheet sideways; printing the wide page drops every stacked section; the day row is cut at 1024; nested field-card overlays reach nearby text; the quick fact tile breaks an SSID mid-word. | Outside this diff, all predating it. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded
