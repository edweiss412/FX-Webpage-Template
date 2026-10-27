# Crew show page search: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship client-side fuzzy search on today's crew show page: a server-built index that equals what each section renders, a matcher with aliases, grouped results with chips, copy and a report row, tap-to-reveal, and telemetry for searches that find nothing.

**Spec:** `docs/superpowers/specs/2026-10-26-crew-show-search-design.md`. Executors read it in full.

**Branch:** feat/crew-show-search

## Acceptance criteria

- AC-1 normalize: tokens and offsets per spec §5.1.
- AC-2 aliases: every member normalized, each term in one group (§5.4).
- AC-3 matcher: stop words, 2-char floor, AND, match kinds and thresholds, scores, order, repeat removal, aliasNote (§5.2 to §5.6).
- AC-4 snippet and highlight ranges (§6.4).
- AC-5 INV-1 parity for every section across the viewer matrix (§2.3, §11.1).
- AC-6 leak suite (§11.2).
- AC-7 route behaviour and invariants 9, 10 (§7.2, §7.3, §11.4).
- AC-8 search states and transitions (§6.2, §6.10).
- AC-9 chips and caps (§6.3).
- AC-10 copy and toast (§6.5).
- AC-11 reveal via useSectionController (§6.6, §9.1).
- AC-12 report row (§6.7).
- AC-13 miss logging client (§7.1).
- AC-14 accessibility (§6.8).
- AC-15 dimensional invariants in a real browser (§6.9).
- AC-16 e2e on the seeded crew page at phone and wide widths (§11.5).
- AC-17 copy table verbatim (§10).

## Meta-test inventory

EXTENDS:
- `tests/log/_metaMutationSurfaceObservability.test.ts`: discovers the new route; satisfied by its code-carrying `log.info`.
- `tests/auth/_metaInfraContract.test.ts`: the new route constructs the service-role client (spec §7.2 step 5, version-route model), so it gets a `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` row.
- `tests/cross-cutting/picker-resolver-callsite-contract.test.ts`: the route joins `DATA_API_CONSUMERS`; it never imports `resolveShowPageAccess`.
- `tests/cross-cutting/auth-chain-audit.test.ts` via `lib/audit/trustDomains.ts`: the route needs a `PROTECTED_ROUTES` row with the version route's chain (`auth-library-exception`).
- `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts`: the e2e spec named in `crew-e2e.yml` needs an `ENROLLED` row and an explicit `EXPECTED_SKIPS` row (or an `EXEMPT` reason).
- `tests/docs/_metaInteractionTimingInventory.test.ts` over `DESIGN.md` §5.5: every new timer under `components/` (reveal wait, highlight, live-region delay, miss debounce) gets its inventory row.
- `tests/components/tiles/CardinalityCapBoundary.test.tsx`: imports `CASE_CAP` instead of reading the source.
CREATES:
- tests/search/indexRenderParity.test.tsx (INV-1, walks `[...BASE_SECTION_IDS, "budget"]`).
- tests/search/indexLeak.test.ts.
Not applicable: advisory-lock topology (no lock), admin-alert catalog (no alert), email normalization (no email), §12.4 (telemetry-only codes).

## Inputs

- site-inventory.md in this directory (`docs/superpowers/plans/crew/2026-10-26-crew-show-search/site-inventory.md`): the drafting-time inventory of every line each section renders (line numbers are a locator at the commit it names, not a contract). Its §13 "Excluded already" note predates spec round 2: there is no blanket exemption for buttons, links or `aria-hidden`.

## Section task shape (Tasks 6 to 12)

Each section task has the same shape. Section order: Budget (6), Crew (7), Venue (8), Travel (9), Gear (10), Schedule (11), Today (12). Each task names its section's line kinds from site-inventory.md (this plan's directory) and its extractions from inventory §12.


Red because the section renders no targets and lib/search/sections/<id>.ts does not exist, so the section's parity case reports a coverage violation on every text node.

- [ ] Line-kind premise: the section's block also declares `LINE_KINDS` for its section, one row per line kind the inventory lists for it (`{ kind, caseName, present: (entries) => boolean }`), and asserts each row's case produces at least one entry of that kind. A line kind no case renders therefore fails the suite instead of passing parity vacuously.
- [ ] Error guard (spec §2.4), authored AFTER GREEN step (1) creates the sibling rows module and BEFORE step (3) writes the builder, so the file it spies on exists and the parity file still loads: one case per section makes one block's extracted derivation throw (`vi.spyOn` on the export of the sibling rows module, which both the component and the builder import, so both see the throwing function; a spy on a same-module export would not reach the component's local call) and asserts the section renders that block's fallback, the builder returns no entries for that block, the other blocks' entries are intact, and parity holds. Where the section has content outside the guarded block (Venue: everything but the diagrams; Schedule: the agenda), the case is observed red at that point, because the stub builder returns no entries for the intact blocks. Where the whole body is one guarded block (Budget, Crew, Travel, Gear, Today), the stub's empty set is already the correct answer, so the case is a regression guard rather than this task's RED: after GREEN, plant the mutant "builder without the guard", observe the case go red (the builder throws), restore, and record it in the commit body.
- [ ] RED: add the section's case to tests/search/indexRenderParity.test.tsx: for every viewer in tests/search/_viewerMatrix.ts that can open the section, render it with RTL exactly as `CrewShell` does (props per _CrewShell.tsx), build entries with `SECTION_BUILDERS[<id>](input)` from lib/search/sections/index.ts (Task 5 creates it with every builder a stub returning `[]`, so this RED compiles and fails on the parity assertion itself), and `expect(assertParity(root, entries)).toEqual([])`. Each matrix viewer asserts its own premise (`tests/_shared/premise.ts`): the gate it exists to flip is actually flipped in its own render (e.g. the no-transport viewer's render lacks the Getting there card; the over-cap viewer's render shows the "+N more" stub).
- [ ] GREEN, in this order: (1) extract the row computations inventory §12 lists for this section into exported pure functions; the component calls them; the existing section tests stay green, with only the pinned-guard re-derivations the rule above allows. (2) Mark every line the inventory lists with `data-search-target` (through primitives where possible), headings with `data-search-group`, and every inventory §13 site in this section with `data-search-skip`. (3) Write lib/search/sections/<id>.ts and point its `SECTION_BUILDERS` entry at it; the builder calls the same extracted functions, in render order, inside the same error guard `WrappedSection` applies, and emits `SearchEntry` values with `entryId`.
- Target placement rule (spec §2.3 "targets never nest"): a target goes on the innermost element that holds exactly one line. When a row renders several lines (a person's identity and their notes; a flight segment and its confirmation), each line's own element is a target and the wrapper is not. When a line is truncated with its full text inside a `<details>` (Today notes at `TodaySection.tsx` `TRUNCATE_AT`; long run-of-show titles in `RunOfShowList.tsx`), only the cut PREVIEW text carries `data-search-skip`; the target is the smallest element that holds both the line's label, if it has one, and its full text. For a Today note that is the note's list item: its label ("Room: <name>", "Hotel: <name>", "Contact: <name>", sheet data) stays in the target and becomes the entry's `label`, the full text is the `value`, and the `<details>` sits inside the target, so the reveal opens it as a descendant (Task 16). A long run-of-show title has no label in its summary, so either its list item or its full-text element can be the target. The inventory's element column predates this rule: where it names a wrapper that contains another listed element (PersonRow `<li>`; Travel segment wrapper `TravelSection.tsx:740` around its confirmation `TravelSection.tsx:792`), re-place per this rule.
- Inventory §13 is a list of sites to DECIDE, not a list to skip. Sheet data is a target: agenda document labels (`AgendaScheduleBlock.tsx`), a diagram's real name shown as gallery placeholder text when the image is unavailable (`Gallery.tsx`), and any button or link text that comes from the sheet. Only non-sheet text (action labels, stubs, empty states, error fallbacks, "In sheet", "Open in Maps", the invented "Diagram N") is a skip.
- Pinned guards. This repo has many tests that pin a component's source or output: path-and-anchor reads, digests over line numbers, `file:line`-keyed residue maps, byte-exact HTML fixtures. A sweep for the paths this plan edits (`rg -l "components/crew/|components/atoms/EmptyState|components/shared/TileErrorFallback|components/diagrams/Gallery|components/layout/Header" tests`) returned 144 files at plan time, so the plan does not enumerate them; the full suite in the closeout is the arbiter, and every task runs the crew, tiles, styles, help and docs test directories before committing. The rule for a guard a task trips: re-derive its pinned value from the new tree (with the guard's own generator where it has one) in the same commit, and check that the re-derivation changes only what the task changed: line shifts, or `data-search-*` attribute additions in a markup fixture (diff the fixture and confirm no other byte moved). A guard is never deleted, loosened, or re-pinned over a change the task did not intend. Known now: `tests/help/_metaRenderFaultMarking.test.ts` (digest over the `<SectionTileError>` line numbers in every section file, tripped by every section task); `tests/styles/controlOutlineScan.ts` with `tests/styles/_metaControlOutlineFill.test.ts` and `tests/styles/_metaControlOutlineResidue.test.ts` (keys on `PersonRow.tsx` and `KeyTimesStrip.tsx` line numbers, tripped by Tasks 5 and 11); `tests/components/crew/sections/VenueSection.wifiRoom.test.tsx` (anchors `const factRows: FactRow[] = []` and `const hasWhere =`, and compares `innerHTML` with `tests/fixtures/venueSectionRawWifi.html`, tripped by Tasks 5 and 8); `tests/components/crew/sections/ScheduleSection.fieldGuards.test.tsx` (run-of-show fields); `tests/components/tiles/CardinalityCapBoundary.test.tsx` (caps, migrated in Task 5). Extractions go to a sibling non-client module next to the component (components/crew/sections/<section>Rows.ts, and components/crew/diagramItems.ts for the gallery items now local to `DiagramsBlock.tsx`), imported by both the component and the builder. That is what lets the error-guard case throw for both callers, and it keeps builders off client modules. A pinned guard that read the moved code from the component file is re-pointed at the sibling module under the rule above. Each task lists in its commit body every guard it re-derived and why.
- Server boundary: a builder runs on the server inside `CrewShell`, so it imports only from modules WITHOUT `"use client"`. A value a builder needs from a client module moves to a sibling non-client module that both import (today: `INITIAL_VISIBLE` from `components/diagrams/Gallery.tsx`, done in Task 5). Importing a client module's export on the server yields a client reference, not the value (a probe in plan review round 2 got `Cannot access INITIAL_VISIBLE.valueOf on the server`), and Vitest would not show it; Task 13 pins the rule with a test.
- Naming: the parity suite names each section's block `describe("<sectionId>", ...)`, so the marker's `-t <sectionId>` selects it. A `-t` that matches nothing exits 0, so the RED step is OBSERVED failing (a coverage violation printed), not inferred from the exit code.
- [ ] Mutants recorded in the commit message: drop one target attribute (parity red, coverage); drop one entry (parity red, ids); index a hidden field into an existing entry's `context` (parity red, representation).
- [ ] Commit: `feat(search): <section> section search entries`.

<!-- tasks: depth=2 -->

## Task 1: normalize with display offsets

<!-- task: red=`pnpm exec vitest run tests/search/normalize.test.ts` ac=AC-1 -->

Red because lib/search/normalize.ts does not exist, so every import of `normalize` fails.

**Files:** create lib/search/normalize.ts, tests/search/normalize.test.ts.

- [ ] RED: write tests/search/normalize.test.ts (node env). Cases, each asserting `{ text, start, end }` tokens AND that `display.slice(start, end)` re-reads the original characters:
  - `"Wi-Fi password"` gives `wifi` (0 to 5) and `password` (6 to 14).
  - `"Café Doug's"` gives `cafe`, `dougs`; offsets cover `Café` and `Doug's`.
  - `"load-in 6:30 AM"` gives `loadin`, `6`, `30`, `am`.
  - Leading and trailing punctuation dropped: `"(GS)"` gives `gs` at 1 to 3.
  - A hyphen not between two alphanumerics splits: `"- dock -"` gives `dock`.
  - Empty and whitespace-only input gives `[]`.
  - Mutation check recorded in the commit: removing step 3 (hyphen join) turns the Wi-Fi case red.
- [ ] GREEN: implement `export type Token = { text: string; start: number; end: number }` and `export function normalize(display: string): Token[]`. Walk the display string once; NFKD each character, drop combining marks, lowercase; treat `-` and `'` and `’` as joiners only when both neighbours are letters or digits; emit tokens with offsets into the ORIGINAL string (not the NFKD string).
- [ ] Commit: `feat(search): normalize text into tokens with display offsets`.

## Task 2: alias groups

<!-- task: red=`pnpm exec vitest run tests/search/aliases.test.ts` ac=AC-2 -->

Red because lib/search/aliases.ts does not exist.

**Files:** create lib/search/aliases.ts, tests/search/aliases.test.ts.

- [ ] RED: tests: every member equals `normalize(member).map(t => t.text).join(" ")`; no term appears in two groups (build a map term to group index from the constant itself); the four deliberately absent words (`wireless`, `keynote`, `room`, `call`) appear in no group; every group has at least two members.
- [ ] GREEN: `export const SEARCH_ALIAS_GROUPS: readonly (readonly string[])[]` with the spec §5.4 table verbatim.
- [ ] Commit: `feat(search): starting alias groups`.

## Task 3: matcher

<!-- task: red=`pnpm exec vitest run tests/search/match.test.ts` ac=AC-3 -->

Red because lib/search/match.ts does not exist.

**Files:** create lib/search/types.ts (spec §3 types verbatim), lib/search/match.ts, tests/search/match.test.ts, tests/search/_fixtureIndex.ts (a hand-built `SearchIndex` of about 30 entries across sections, including a Today twin of a Venue line, a Today-only room note, an "Internet hardline at front of house" Gear row, Wi-Fi network and password with `copy`, and two rooms whose scope reads "TBD").

- [ ] RED, one `describe` per spec rule, expected entry ids looked up from the fixture by content (a `find` over `entries`), never typed as literals:
  - stop words dropped; an all-stop-word query keeps its tokens;
  - queries under 2 normalized characters return `{ total: 0, sections: [] }` without scanning (spy on a counter exported for tests only if needed, else assert output);
  - AND: "wifi dock" matches nothing when no entry holds both;
  - each match kind and weight; fuzzy boundaries at query lengths 3 (no fuzzy), 4 and 7 (distance 1), 8 (distance 2);
  - a 1-character token matches exact only;
  - alias expansion at prepare time, including a phrase member (`front of house`) and `aliasNote` quoting the DISPLAY span (`Internet`, capitalised as displayed);
  - `aliasNote` is null when any query token also matched exactly, by prefix or fuzzily in a displayed field;
  - field weights (`group`/`context` 0.6) change order between two otherwise equal entries;
  - repeat removal: the Today twin is dropped, the Today-only room note stays;
  - section order by best score, ties by `[...BASE_SECTION_IDS, "budget"]`;
  - highlight ranges for `group`, `label`, `value` cover exactly the matched tokens' display spans;
  - the realistic query table of spec §11.3.
- [ ] GREEN: `prepareIndex(index)` (tokenize every field once, attach alias tokens with source spans) and `searchIndex(prepared, query)` returning the spec §5.6 shape. Pure; no module state.
- [ ] Commit: `feat(search): fuzzy matcher with aliases, scoring and grouping`.

## Task 4: snippet window

<!-- task: red=`pnpm exec vitest run tests/search/snippet.test.ts` ac=AC-4 -->

Red because lib/search/snippet.ts does not exist.

**Files:** create lib/search/snippet.ts, tests/search/snippet.test.ts.

- [ ] RED: values of 140 characters or fewer come back whole with ranges unchanged; a longer value is windowed around the first range, cut at word boundaries, `…` on each cut side only, ranges shifted to the window; the window never splits a highlighted token; the window text is a substring of the original (plus ellipses), never rewritten.
- [ ] GREEN: `snippet(value, ranges, max = 140)`.
- [ ] Commit: `feat(search): snippet window around the first match`.

## Task 5: row primitives, shared markers, parity harness

<!-- task: red=`pnpm exec vitest run tests/search/parityHarness.test.tsx` ac=AC-5 -->

Red because tests/search/_parity.ts (the harness) does not exist and no primitive renders `data-search-target`, `data-search-group` or `data-search-skip`, so the harness self-test cannot import or observe them.

**Files:** modify `components/crew/primitives/KeyValueRows.tsx`, FactRows.tsx, PersonRow.tsx, SectionCard.tsx, `components/crew/primitives/SourceLink.tsx`, `components/atoms/EmptyState.tsx`, `components/crew/SectionTileError.tsx` and `components/shared/TileErrorFallback.tsx`; create lib/search/entryId.ts, tests/search/_parity.ts, tests/search/parityHarness.test.tsx, tests/search/entryId.test.ts; create tests/search/_viewerMatrix.ts, tests/search/primitiveMarkers.test.tsx, lib/search/sections/index.ts, components/diagrams/galleryLimits.ts; export the caps the matrix reads: `CASE_CAP` and `ROOM_DETAIL_CAP` lifted from the render callback to module scope in `components/crew/sections/GearSection.tsx`, `SHOWS_CAP` in `components/crew/primitives/KeyTimesStrip.tsx`, `SOURCE_CAP` and `TRUNCATE_AT` in `components/crew/sections/TodaySection.tsx`, and `INITIAL_VISIBLE` moved out of the client module `components/diagrams/Gallery.tsx` into components/diagrams/galleryLimits.ts (no `"use client"`), which `Gallery.tsx` imports; migrate `tests/components/tiles/CardinalityCapBoundary.test.tsx` from reading those constants by regex to importing them, with the same boundary assertions.

- [ ] RED tests/search/entryId.test.ts: `entryId(section, region, group, label, value, seen)` hashes the exact strings (FNV-1a 32-bit, base 36, U+001F joiner), `ORDTG.` and `ordtg` differ, a repeated hash in one section and region gets `~2`, `~3`.
- [ ] RED tests/search/parityHarness.test.tsx: drive the harness against hand-written DOM fixtures (no section yet), one fixture per clause of spec §2.3, each in a passing and a failing form: an entry with no target; a target with no entry; nested targets; a value not contained in its target; a target text node absent from the entry (the name-plus-note row of the round-2 finding); a group heading no entry names; an unmarked text node inside a `<button>`, an `<a>` and an `[aria-hidden]` (all three must FAIL coverage); an image target matched by `alt`; text inside `<svg>` ignored; text inside `data-search-skip` ignored. The harness exports `assertParity(sectionRoot, entries)` returning a list of violations (the test asserts the exact violation kinds), so a failing fixture proves the harness can fail.
- [ ] RED tests/search/primitiveMarkers.test.tsx (fails until the GREEN marker changes land): `KeyValueRows`, `FactRows` render `data-search-target` on the row element only when the row sets `searchTarget`, and not otherwise; `PersonRow` renders `data-search-target` on the identity block (name, role, chips) from `searchTarget.identity` and on the notes element from `searchTarget.notes`, never on the `<li>`, and the two never nest; `SectionCard` puts `data-search-group` on its title; `SourceLink`, `EmptyState`, `SectionTileError` and `TileErrorFallback` render `data-search-skip` on their root.
- [ ] tests/search/_viewerMatrix.ts builds, from `makeShowForViewer` (`tests/fixtures/showForViewer.ts`), the spec §11.1 cases as named exports, each a `{ name, data, viewer, today, budgetVisible }`: `crewNoTransport`, `crewWithTransport`, `leadWithFinancials`, `dateSuppressed`, `overCaps` (crew roster and contacts past `CREW_INLINE_CAP`/`CONTACTS_INLINE_CAP`, more than `SHOWS_CAP` key times, more than `CASE_CAP` cases and `ROOM_DETAIL_CAP` rooms, more than `SOURCE_CAP` notes, more than `INITIAL_VISIBLE` diagrams), `todayOnlyLines` (a room note; a contact past the cap with a note), `diagramsNamedAndUnnamed`, `adminViewer`, and CONTENT cases that make every line kind render at least once, since the default fixture renders almost none (no dates, empty `event_details`, no agenda links, no run of show): `wifiSplit`, `wifiRaw` and `wifiNotes` (the three `parseWifiValue` forms in `VenueSection.tsx`), `modeAToday` (`today` is a show day with run-of-show entries and agenda sessions, so Today renders Mode A including the bare `KeyTimesStrip`), `fullContent` (show days and dates, agenda links, run of show with a title longer than `TITLE_TRUNCATE_AT`, a note longer than `TRUNCATE_AT`, both dress-code forms, COI, venue notes, power, every whitelisted tech spec, keynote, opening reel, every gear discipline, pack list visible today, rooms with details), and `ALL_CASES`. It asserts nothing itself; each section task states, per case it uses, the premise its own render must show. Cap counts are read from the exported constants, never typed.
- [ ] GREEN: create lib/search/sections/index.ts exporting `SECTION_BUILDERS: Record<SectionId, (input: SectionBuildInput) => SearchEntry[]>` with every entry a stub returning `[]` (Tasks 6 to 12 replace them one by one); implement `entryId`; implement the harness over jsdom DOM per spec §2.3 terms and clauses 1 to 5; add `searchTarget?: string` to `KeyValueRow` and `FactRow` (rendered on the row element) and `searchTarget?: { identity: string; notes?: string }` to `Person` (rendered on the identity block and the notes element), each only when set; `SectionCard` title gets `data-search-group`; "In sheet" link, empty states and tile error fallbacks get `data-search-skip`. Existing primitive and section tests stay green (no visual change; snapshot tests, if any, updated only for the new attributes).
- [ ] Commit: `feat(search): row targets, group and skip markers, parity harness`.

## Task 6: Budget section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t budget` ac=AC-5 -->

Red because `BudgetSection` renders no `data-search-target` and lib/search/sections/budget.ts does not exist, so the budget parity case reports a coverage violation on every text node. Follows the section task shape above.

- four rows through `KeyValueRows`; only rendered when `budgetVisible`.

## Task 7: Crew section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t crew` ac=AC-5 -->

Red because `CrewSection` renders no `data-search-target` and lib/search/sections/crew.ts does not exist, so the crew parity case reports a coverage violation on every text node. Follows the section task shape above.

- roster and contacts up to `CREW_INLINE_CAP`/`CONTACTS_INLINE_CAP`; contact notes are their own target (spec §2.3 clause 3); export `contactFallbackLabel`.

## Task 8: Venue section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t venue` ac=AC-5 -->

Red because `VenueSection` renders no `data-search-target` and lib/search/sections/venue.ts does not exist, so the venue parity case reports a coverage violation on every text node. Follows the section task shape above.

- Where, Facilities (Wi-Fi network and password with `copy`), status, gallery. `INITIAL_VISIBLE` comes from components/diagrams/galleryLimits.ts (Task 5); the fallback-name decision lives in `components/crew/DiagramsBlock.tsx`; thumbnails are image targets.

## Task 9: Travel section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t travel` ac=AC-5 -->

Red because `TravelSection` renders no `data-search-target` and lib/search/sections/travel.ts does not exist, so the travel parity case reports a coverage violation on every text node. Follows the section task shape above.

- flight (two confirmation sites, both copyable), Getting there (driver and load-out text, phones and emails as text), hotels (confirmation copyable). `hideDates` rules from spec §2.2.

## Task 10: Gear section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t gear` ac=AC-5 -->

Red because `GearSection` renders no `data-search-target` and lib/search/sections/gear.ts does not exist, so the gear parity case reports a coverage violation on every text node. Follows the section task shape above.

- scope cards per discipline (audio, video, lighting, scenic, other), group = discipline, label = room; pack list when `isPackListVisibleToday`; tech specs; room details; keynote; opening reel. Caps were exported and the cap guard migrated in Task 5.

## Task 11: Schedule section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t schedule` ac=AC-5 -->

Red because `ScheduleSection` renders no `data-search-target` and lib/search/sections/schedule.ts does not exist, so the schedule parity case reports a coverage violation on every text node. Follows the section task shape above.

- day cards (DayCard needs a `searchTarget` prop; the day label is a group heading); run of show via `scheduleEntriesForViewer`; Crew Schedule `KeyTimesStrip` including the folded overflow; agenda (region `none`); suppressed-dates viewer renders the unconfirmed message only (skip) and zero entries.

## Task 12: Today section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t today` ac=AC-5 -->

Red because `TodaySection` renders no `data-search-target` and lib/search/sections/today.ts does not exist, so the today parity case reports a coverage violation on every text node. Follows the section task shape above.

- every card except `RightNowHero` (skip); Mode A key times region `none`; notes card full text; `TRUNCATE_AT` and `SOURCE_CAP` were exported in Task 5.

## Task 13: compose the index, leak suite

<!-- task: red=`pnpm exec vitest run tests/search/indexLeak.test.ts tests/search/buildSearchIndex.test.ts` ac=AC-5,AC-6 -->

Red because lib/search/buildSearchIndex.ts does not exist.

- [ ] RED: buildSearchIndex.test.ts: the index is the concatenation of section builders in `[...BASE_SECTION_IDS, "budget"]` order, Budget only when `budgetVisible`, ids unique across the index. indexLeak.test.ts per spec §11.2 (premise-proven hiddenness, positive control).
- [ ] Server boundary: tests/search/builderImports.test.ts reads every file under lib/search/ (walked from disk) and every module those files import from `@/components` or `@/lib`, and asserts none starts with `"use client"`; a planted fixture import of `Gallery.tsx` in the test's self-check proves it can fail.
- [ ] Index size (spec §3): tests/search/indexSize.test.ts builds the index for `makeShowForViewer()` and for `overCaps` and writes `{ case, entries, bytes }` (bytes of `JSON.stringify(index)`) to test-results/search-index-size.json (vitest swallows console output, so a file). The closeout records both numbers.
- [ ] GREEN: `buildSearchIndex({ data, viewer, today, budgetVisible, staticPreview })`.
- [ ] Commit: `feat(search): compose the search index and pin the leak suite`.

## Task 14: missed-search route

<!-- task: red=`pnpm exec vitest run tests/api/searchMissRoute.test.ts` ac=AC-7 -->

Red because the route file does not exist.

**Files:** create lib/http/sameOrigin.ts (moved verbatim from `app/api/observe/client-error/route.ts`, which then imports it), the route, its test; edit `tests/auth/_metaInfraContract.test.ts` (`SUPABASE_CONSTRUCTOR_CONTRACT_FILES`), `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` (`DATA_API_CONSUMERS`) and `lib/audit/trustDomains.ts` (a `PROTECTED_ROUTES` row, chain `auth-library-exception` like the version route), then run `tests/cross-cutting/auth-chain-audit.test.ts`.

- [ ] RED: spec §11.4 cases, plus: the rate limiter runs before any database call (a spy on the service-role client constructor sees zero calls for a capped request); the capped warning logs once per window; the success path's sink spy records only after observing `CREW_SEARCH_NO_RESULTS` with `showId` and `query` and no viewer identity.
- [ ] GREEN: per spec §7.2.
- [ ] Commit: `feat(search): record searches that find nothing`.

## Task 15: search state provider and the field

<!-- task: red=`pnpm exec vitest run tests/components/crew/search/CrewSearchField.test.tsx` ac=AC-8,AC-14,AC-17 -->

Red because components/crew/search/CrewSearchProvider.tsx and CrewSearchField.tsx do not exist.

**Files:** create both components and the test (jsdom, `@vitest-environment jsdom` pragma as in sibling component tests); modify `components/layout/Header.tsx` (optional `search?: ReactNode`, rendered as a full-width row under the title block; admin callers unchanged).

- [ ] RED: focus enters Hint (Cancel appears); blur keeps search active; typing 2 characters enters Results or No match; clear (×) empties, keeps active, refocuses; Escape with text clears, Escape when empty ends; Cancel clears and ends; the placeholder, accessible names, Cancel text and the Hint text ("Search Wi-Fi, the dock, rooms, gear, people and more.") are the spec §10 strings verbatim, and the Hint state renders that Hint text (the component reads them from one lib/search/copy.ts module; the TEST types each expected string literally, copied from spec §10, and never imports the module, so a wrong constant fails); `Header` without `search` renders the markup it renders today: FIRST, before any other step of this task, create tests/components/layout/Header.search.test.tsx importing only `Header` (which exists) and run it once so it records `toMatchInlineSnapshot()` of a no-`search` render for a crew-pill header and an admin header against the unchanged `Header.tsx`; commit nothing yet. GREEN must leave both inline snapshots unchanged, and a third case in that file asserts the `search` row renders only when the prop is set (red until `Header.tsx` gains the prop).
- [ ] GREEN: provider state `{ index, query, active, missLogging }` plus setters; field per spec §6.2 and §6.9.
- [ ] Commit: `feat(search): search field and shared search state`.

## Task 16: section controller and reveal

<!-- task: red=`pnpm exec vitest run tests/components/crew/CrewSections.search.test.tsx` ac=AC-8,AC-11 -->

Red because `CrewSections` exports no `useSectionController` and does not read search state.

- [ ] RED: while search is active the sub-nav and section body carry `hidden` and the results slot renders; ending search removes `hidden` and the previously open `<details>` is still open (state survived); `openSectionAndReveal("venue", id)` switches section (pushState to the section href), then, after the transition, finds the target, opens every `<details>` that contains the target AND every `<details>` inside it (the long-title and truncated-note sites are covered both ways), focuses it, sets `data-search-reveal`; a missing id announces "That line isn't on the page anymore." after 1500 ms (fake timers, frame callbacks stubbed); the reveal attribute clears after 1600 ms, and after 2000 ms with no transition class under reduced motion.
- [ ] GREEN: context provider inside `CrewSections`; reveal loop per spec §6.6; CSS for `[data-search-reveal]` in `app/globals.css` using existing tokens (no new color token; if one is unavoidable, its contrast is pinned per the repo's contrast meta-test pattern).
- [ ] Timing inventory: add `DESIGN.md` §5.5 rows for the 1500 ms reveal wait and the 1600 ms and 2000 ms highlight durations, in the form the scanner derives (`scripts/scan-interaction-timings.ts`), and run `tests/docs/_metaInteractionTimingInventory.test.ts`.
- [ ] Commit: `feat(search): open a section and reveal a line`.

## Task 17: results

<!-- task: red=`pnpm exec vitest run tests/components/crew/search/CrewSearchResults.test.tsx` ac=AC-9,AC-10,AC-12,AC-14,AC-17 -->

Red because CrewSearchResults.tsx does not exist.

- [ ] RED (fixture index from tests/search/_fixtureIndex.ts, plus a generated index for the caps: 60 entries in one section whose values share a token, built in the test from a loop so the count is derived, and a premise asserting the query hits more than 50 of them): chips "All n" plus one per section with hits, in §5.5 order, `aria-pressed`; All view caps at 5 per section with "Show all n in X" selecting the chip; section view caps at 50 with the note; chip resets to All on query change; rows render `[group, label]` joined by " · ", value snippet with `<mark>` ranges, alias note; copy button only when `copy` is set, 44 px, spec aria-labels; copy success toast per kind for `COPY_FEEDBACK_RESET_MS`, second copy replaces the first, rejection shows the failure toast (stub `navigator.clipboard`); the report row opens `ReportModal` with the spec §6.7 props (mock the modal module and assert received props); no report row when the shell passes reporting off; No match state text; live region text 300 ms after the last change; tapping a row calls `openSectionAndReveal(entry.section, entry.id)` and ends search keeping the query. Refresh (spec §6.10): rerender the provider with a new index while a query and a chip are set; the query stays, results recompute, the chip stays when its section still has hits and falls back to All when it has none. Labels: `SECTION_LABELS` is exported from `components/crew/CrewSubNav.tsx` (module-local today) and the chips import it; the test renders `CrewSubNav` and the chips and asserts each chip label equals the sub-nav label for the same section, read from both renders.
- [ ] GREEN.
- [ ] Copy (AC-17): every expected string in this test (chips, "Show all", the cap note, the alias note, copy aria-labels and toasts, the copy-failure text, No match, the report row, the live region) is typed literally from spec §10; the test never imports lib/search/copy.ts.
- [ ] Timing inventory: `DESIGN.md` §5.5 rows for the 300 ms live-region delay and the toast's `COPY_FEEDBACK_RESET_MS` use, then `tests/docs/_metaInteractionTimingInventory.test.ts`.
- [ ] Commit: `feat(search): grouped results with chips, copy and report row`.

## Task 18: missed-search client

<!-- task: red=`pnpm exec vitest run tests/components/crew/search/missLogging.test.tsx` ac=AC-13 -->

Red because nothing posts misses.

- [ ] RED (fake timers, `fetch` spy): a 0-hit query sends one POST to /api/show/<slug>/search-miss 2000 ms after the last keystroke with `{ query }`, `keepalive: true`; ending search with a 0-hit query sends immediately; the same normalized query never sends twice per page load; a query with hits never sends; `missLogging: false` never sends; a rejected fetch is swallowed with no UI change.
- [ ] GREEN.
- [ ] Timing inventory: `DESIGN.md` §5.5 row for the 2000 ms miss debounce, then `tests/docs/_metaInteractionTimingInventory.test.ts`.
- [ ] Commit: `feat(search): send searches that find nothing`.

## Task 19: wire the shell, end to end

<!-- task: red=`CREW_E2E_ONLY=1 E2E_PORT=3110 pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/crew-search.spec.ts` ac=AC-5,AC-11,AC-13,AC-15,AC-16 -->

Red because `_CrewShell.tsx` builds no index and mounts no search field, so the e2e's first step (find the search box named "Search this show" on the seeded crew page) fails; the component test's header assertion fails for the same reason. Everything the e2e exercises below the field was built in Tasks 15 to 18 and is reached on the real page for the first time here.

Harness readiness (writing-plans rule): (a) server boot is the repo's existing Playwright `webServer` in `playwright.config.ts`, filtered to the single crew server with `CREW_E2E_ONLY=1` (the variable `crew-e2e.yml` sets) and moved off the shared default port with `E2E_PORT=3110`, so no sibling session's dev server on :3000 is silently reused and the extra :3001-:3004 build servers are not booted; the spec runs in the `desktop-chromium` project, whose `testMatch` regex gains `crew-search` in this task (no project picks up a new file by default). WebKit is excluded on purpose: over plain http it does not store the `__Host-` picker cookie (`playwright.config.ts` comment on the `mobile-safari` project). The phone case uses `test.use({ viewport: { width: 390, height: 844 } })` inside Chromium. (b) Identity: the viewer must be CREW, because misses are not sent for admin viewers (spec §7.1); the spec seeds and selects a crew identity the way `tests/e2e/picker-flow.spec.ts` does (`seedShowWithCrew`, then drive the picker); the seed passes `eventDetails` with an `internet` value in the split form `parseWifiValue` recognizes, so the Venue Wi-Fi network and password rows exist (`seedShowWithCrew` writes `event_details` NULL otherwise). Clipboard: headless Chromium on http rejects `navigator.clipboard.writeText` (`NotAllowedError`), so the spec installs an `addInitScript` stub that records each written string and resolves (the precedent is `tests/e2e/share-link-flash.spec.ts`), and asserts both the recorded string equals the seeded password and the "Password copied" toast shows, not `crew-page.spec.ts`'s `signInAs(ADMIN_FIXTURE)`. The readiness gate before the first assertion is the picker spec's resolved-identity wait (`expectResolvedIdentity`), never `networkidle` alone. (c) No sampler or `locator.evaluate` outlives its element; the miss POST is observed with `page.waitForRequest` registered before typing.

**Files:** create tests/e2e/crew-search.spec.ts and tests/components/crew/crewShellSearch.test.tsx; in the six existing shell suites that mock every section module with component-only factories and thin fixtures (`tests/components/crew/crewShell.test.tsx`, `crewShellAlert.test.tsx`, `crewShellSections.test.tsx`, `crewShellSweep.test.tsx`, `crewShellTwoDistinctAlerts.test.tsx`, and `tests/components/crew/previewAsRoute.test.tsx`), add `vi.mock("@/lib/search/buildSearchIndex", () => ({ buildSearchIndex: () => ({ entries: [] }) }))`, because search is not their subject and a real builder would read exports their section mocks do not define or throw on their thin fixtures; crewShellSearch.test.tsx does NOT mock sections or the builder and uses the `fullContent` matrix case; modify `app/show/[slug]/[shareToken]/_CrewShell.tsx`, `playwright.config.ts` (`desktop-chromium` `testMatch` gains `crew-search`), `.github/workflows/crew-e2e.yml` (the crew spec set's `run` command gains the file), `tests/ci/_metaE2eWorkflowCoverage.test.ts` (a `"tests/e2e/crew-search.spec.ts": PATH_GATED_BY_EXCLUSION` row, the classification its sibling crew specs carry), `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (an `ENROLLED` row and an explicit `EXPECTED_SKIPS` row for the spec), and `scripts/check-crew-e2e-executed.mjs` (its expected-count map gains the spec with the number of tests the spec declares, counted from `playwright test --list` on the spec, not typed from memory).

- [ ] RED (e2e): spec §11.5 e2e at a 390 px phone viewport and a 1280 px wide viewport; plus `getBoundingClientRect` assertions for spec §6.9 (field container height 52 px; input height equals container height within 0.5 px; clear button and copy button 44 by 44 within 0.5 px; Cancel at least 44 px tall).
- [ ] RED (component): `render(await CrewShell(...))` (pattern of `tests/components/crew/crewShellSections.test.tsx`) for a crew viewer: the header contains the search field, the provider wraps header and sections, the index prop equals `buildSearchIndex` for the same inputs, `missLogging` is true; for `admin_preview` and `staticPreview` it is false; `staticPreview` renders no report row, asserted after focusing the field and typing a zero-hit query so the No match state (the state that carries the row) is on screen; the same steps on the crew viewer render the row, so the assertion can tell the two apart.
- [ ] Observe both RED before wiring: the e2e times out on the missing search box; the component test fails on the header assertion.
- [ ] GREEN: `_CrewShell.tsx` builds the index once per render and wraps `Header` and `CrewSections` in `CrewSearchProvider`; fix anything the browser exposes.
- [ ] Commit: `feat(search): mount search on the crew page`.

<!-- tasks: end -->

## Closeout

- Pre-code mechanical checks over every new string: no em dash, straight apostrophes, 44 px taps, existing type and color tokens only.
- Invariant 8 gate on the whole diff; findings and dispositions in closeout.md with the marker line.
- Full suite under `pnpm heavy pnpm test`; `pnpm typecheck` (8 GB heap per repo note); `pnpm exec eslint .`; `pnpm format:check`.
- Whole-diff cross-model review (split per surface: lib, sections, UI, route).
- Real CI green, merge, sync main.
