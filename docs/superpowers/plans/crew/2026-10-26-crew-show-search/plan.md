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
- `tests/auth/_metaInfraContract.test.ts`: new route row in `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` if it constructs a client; otherwise none (it calls `resolveShowPageAccess`).
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

- [ ] RED: add the section's case to tests/search/indexRenderParity.test.tsx: for every viewer in tests/search/_viewerMatrix.ts that can open the section, render it with RTL exactly as `CrewShell` does (props per _CrewShell.tsx), build entries with `buildSectionEntries.<id>(input)`, and `expect(assertParity(root, entries)).toEqual([])`. Each matrix viewer asserts its own premise (`tests/_shared/premise.ts`): the gate it exists to flip is actually flipped in its own render (e.g. the no-transport viewer's render lacks the Getting there card; the over-cap viewer's render shows the "+N more" stub).
- [ ] GREEN, in this order: (1) extract the row computations inventory §12 lists for this section into exported pure functions; the component calls them; the existing section tests stay green unchanged. (2) Mark every line the inventory lists with `data-search-target` (through primitives where possible), headings with `data-search-group`, and every inventory §13 site in this section with `data-search-skip`. (3) Write lib/search/sections/<id>.ts, which calls the same extracted functions, in render order, inside the same error guard `WrappedSection` applies, and emits `SearchEntry` values with `entryId`.
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

**Files:** modify `components/crew/primitives/KeyValueRows.tsx`, FactRows.tsx, PersonRow.tsx, SectionCard.tsx, `components/crew/primitives/SourceLink.tsx`, `components/atoms/EmptyState.tsx`, `components/crew/SectionTileError.tsx` and `components/shared/TileErrorFallback.tsx`; create lib/search/entryId.ts, tests/search/_parity.ts, tests/search/parityHarness.test.tsx, tests/search/entryId.test.ts.

- [ ] RED tests/search/entryId.test.ts: `entryId(section, region, group, label, value, seen)` hashes the exact strings (FNV-1a 32-bit, base 36, U+001F joiner), `ORDTG.` and `ordtg` differ, a repeated hash in one section and region gets `~2`, `~3`.
- [ ] RED tests/search/parityHarness.test.tsx: drive the harness against hand-written DOM fixtures (no section yet), one fixture per clause of spec §2.3, each in a passing and a failing form: an entry with no target; a target with no entry; nested targets; a value not contained in its target; a target text node absent from the entry (the name-plus-note row of the round-2 finding); a group heading no entry names; an unmarked text node inside a `<button>`, an `<a>` and an `[aria-hidden]` (all three must FAIL coverage); an image target matched by `alt`; text inside `<svg>` ignored; text inside `data-search-skip` ignored. The harness exports `assertParity(sectionRoot, entries)` returning a list of violations (the test asserts the exact violation kinds), so a failing fixture proves the harness can fail.
- [ ] GREEN: implement `entryId`; implement the harness over jsdom DOM per spec §2.3 terms and clauses 1 to 5; add `searchTarget?: string` to `KeyValueRow`, `FactRow` and `Person`, rendered as `data-search-target` on the row element (inventory §0.1) and only when set; `SectionCard` title gets `data-search-group`; "In sheet" link, empty states and tile error fallbacks get `data-search-skip`. Existing primitive and section tests stay green (no visual change; snapshot tests, if any, updated only for the new attributes).
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

- Where, Facilities (Wi-Fi network and password with `copy`), status, gallery. `INITIAL_VISIBLE` and the fallback-name decision live in DiagramsBlock.tsx/Gallery.tsx; thumbnails are image targets.

## Task 9: Travel section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t travel` ac=AC-5 -->

Red because `TravelSection` renders no `data-search-target` and lib/search/sections/travel.ts does not exist, so the travel parity case reports a coverage violation on every text node. Follows the section task shape above.

- flight (two confirmation sites, both copyable), Getting there (driver and load-out text, phones and emails as text), hotels (confirmation copyable). `hideDates` rules from spec §2.2.

## Task 10: Gear section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t gear` ac=AC-5 -->

Red because `GearSection` renders no `data-search-target` and lib/search/sections/gear.ts does not exist, so the gear parity case reports a coverage violation on every text node. Follows the section task shape above.

- scope cards per discipline (audio, video, lighting, scenic, other), group = discipline, label = room; pack list when `isPackListVisibleToday`; tech specs; room details; keynote; opening reel. CardinalityCapBoundary.test.tsx imports the newly exported caps instead of reading source.

## Task 11: Schedule section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t schedule` ac=AC-5 -->

Red because `ScheduleSection` renders no `data-search-target` and lib/search/sections/schedule.ts does not exist, so the schedule parity case reports a coverage violation on every text node. Follows the section task shape above.

- day cards (DayCard needs a `searchTarget` prop; the day label is a group heading); run of show via `scheduleEntriesForViewer`; Crew Schedule `KeyTimesStrip` including the folded overflow; agenda (region `none`); suppressed-dates viewer renders the unconfirmed message only (skip) and zero entries.

## Task 12: Today section entries

<!-- task: red=`pnpm exec vitest run tests/search/indexRenderParity.test.tsx -t today` ac=AC-5 -->

Red because `TodaySection` renders no `data-search-target` and lib/search/sections/today.ts does not exist, so the today parity case reports a coverage violation on every text node. Follows the section task shape above.

- every card except `RightNowHero` (skip); Mode A key times region `none`; notes card full text; `TRUNCATE_AT`, `SOURCE_CAP` exported.

## Task 13: compose the index, leak suite

<!-- task: red=`pnpm exec vitest run tests/search/indexLeak.test.ts tests/search/buildSearchIndex.test.ts` ac=AC-5,AC-6 -->

Red because lib/search/buildSearchIndex.ts does not exist.

- [ ] RED: buildSearchIndex.test.ts: the index is the concatenation of section builders in `[...BASE_SECTION_IDS, "budget"]` order, Budget only when `budgetVisible`, ids unique across the index. indexLeak.test.ts per spec §11.2 (premise-proven hiddenness, positive control).
- [ ] GREEN: `buildSearchIndex({ data, viewer, today, budgetVisible, staticPreview })`.
- [ ] Commit: `feat(search): compose the search index and pin the leak suite`.

## Task 14: missed-search route

<!-- task: red=`pnpm exec vitest run tests/api/searchMissRoute.test.ts` ac=AC-7 -->

Red because the route file does not exist.

**Files:** create lib/http/sameOrigin.ts (moved verbatim from `app/api/observe/client-error/route.ts`, which then imports it), the route, its test; edit `tests/auth/_metaInfraContract.test.ts` (`SUPABASE_CONSTRUCTOR_CONTRACT_FILES`) and `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` (`DATA_API_CONSUMERS`).

- [ ] RED: spec §11.4 cases, plus: the rate limiter runs before any database call (a spy on the service-role client constructor sees zero calls for a capped request); the capped warning logs once per window; the success path's sink spy records only after observing `CREW_SEARCH_NO_RESULTS` with `showId` and `query` and no viewer identity.
- [ ] GREEN: per spec §7.2.
- [ ] Commit: `feat(search): record searches that find nothing`.

## Task 15: search state provider and the field

<!-- task: red=`pnpm exec vitest run tests/components/crew/search/CrewSearchField.test.tsx` ac=AC-8,AC-14,AC-17 -->

Red because components/crew/search/CrewSearchProvider.tsx and CrewSearchField.tsx do not exist.

**Files:** create both components and the test (jsdom, `@vitest-environment jsdom` pragma as in sibling component tests); modify `components/layout/Header.tsx` (optional `search?: ReactNode`, rendered as a full-width row under the title block; admin callers unchanged).

- [ ] RED: focus enters Hint (Cancel appears); blur keeps search active; typing 2 characters enters Results or No match; clear (×) empties, keeps active, refocuses; Escape with text clears, Escape when empty ends; Cancel clears and ends; the placeholder, accessible names and Cancel text are the spec §10 strings verbatim (imported from one lib/search/copy.ts constant module, which the test reads too, so the copy has one source); `Header` without `search` renders byte-identical markup to today (render both and compare `innerHTML`).
- [ ] GREEN: provider state `{ index, query, active, missLogging }` plus setters; field per spec §6.2 and §6.9.
- [ ] Commit: `feat(search): search field and shared search state`.

## Task 16: section controller and reveal

<!-- task: red=`pnpm exec vitest run tests/components/crew/CrewSections.search.test.tsx` ac=AC-8,AC-11 -->

Red because `CrewSections` exports no `useSectionController` and does not read search state.

- [ ] RED: while search is active the sub-nav and section body carry `hidden` and the results slot renders; ending search removes `hidden` and the previously open `<details>` is still open (state survived); `openSectionAndReveal("venue", id)` switches section (pushState to the section href), then, after the transition, finds the target, opens ancestor `<details>`, focuses it, sets `data-search-reveal`; a missing id announces "That line isn't on the page anymore." after 1500 ms (fake timers, frame callbacks stubbed); the reveal attribute clears after 1600 ms, and after 2000 ms with no transition class under reduced motion.
- [ ] GREEN: context provider inside `CrewSections`; reveal loop per spec §6.6; CSS for `[data-search-reveal]` in `app/globals.css` using existing tokens (no new color token; if one is unavoidable, its contrast is pinned per the repo's contrast meta-test pattern).
- [ ] Commit: `feat(search): open a section and reveal a line`.

## Task 17: results

<!-- task: red=`pnpm exec vitest run tests/components/crew/search/CrewSearchResults.test.tsx` ac=AC-9,AC-10,AC-12,AC-14,AC-17 -->

Red because CrewSearchResults.tsx does not exist.

- [ ] RED (fixture index from tests/search/_fixtureIndex.ts): chips "All n" plus one per section with hits, in §5.5 order, `aria-pressed`; All view caps at 5 per section with "Show all n in X" selecting the chip; section view caps at 50 with the note; chip resets to All on query change; rows render `[group, label]` joined by " · ", value snippet with `<mark>` ranges, alias note; copy button only when `copy` is set, 44 px, spec aria-labels; copy success toast per kind for `COPY_FEEDBACK_RESET_MS`, second copy replaces the first, rejection shows the failure toast (stub `navigator.clipboard`); the report row opens `ReportModal` with the spec §6.7 props (mock the modal module and assert received props); no report row when the shell passes reporting off; No match state text; live region text 300 ms after the last change; tapping a row calls `openSectionAndReveal(entry.section, entry.id)` and ends search keeping the query.
- [ ] GREEN.
- [ ] Commit: `feat(search): grouped results with chips, copy and report row`.

## Task 18: missed-search client

<!-- task: red=`pnpm exec vitest run tests/components/crew/search/missLogging.test.tsx` ac=AC-13 -->

Red because nothing posts misses.

- [ ] RED (fake timers, `fetch` spy): a 0-hit query sends one POST to /api/show/<slug>/search-miss 2000 ms after the last keystroke with `{ query }`, `keepalive: true`; ending search with a 0-hit query sends immediately; the same normalized query never sends twice per page load; a query with hits never sends; `missLogging: false` never sends; a rejected fetch is swallowed with no UI change.
- [ ] GREEN.
- [ ] Commit: `feat(search): send searches that find nothing`.

## Task 19: wire the shell

<!-- task: red=`pnpm exec vitest run tests/components/crew/crewShellSearch.test.tsx` ac=AC-5,AC-11,AC-13 -->

Red because `CrewShell` builds no index and mounts no search.

- [ ] RED: `render(await CrewShell(...))` (pattern of `tests/components/crew/crewShellSections.test.tsx`) for a crew viewer: the header contains the search field, the provider wraps header and sections, the index prop equals `buildSearchIndex` for the same inputs, `missLogging` is true; for `admin_preview` and `staticPreview` it is false; `staticPreview` renders no report row.
- [ ] GREEN: _CrewShell.tsx builds the index once per render and wraps `Header` and `CrewSections` in `CrewSearchProvider`.
- [ ] Commit: `feat(search): mount search on the crew page`.

## Task 20: end to end, layout dimensions

<!-- task: red=`pnpm heavy pnpm exec playwright test tests/e2e/crew-search.spec.ts` ac=AC-15,AC-16 -->

Red because the spec file does not exist.

Harness readiness (writing-plans rule): server boot is the repo's existing Playwright `webServer` config used by `tests/e2e/crew-page.spec.ts`; the readiness gate is the same hydration wait that spec uses before its first assertion, never `networkidle` alone; no sampler outlives its element.

- [ ] RED: spec §11.5 e2e at a 390 px phone viewport and a 1280 px wide viewport; plus `getBoundingClientRect` assertions for spec §6.9 (field container height 52 px; input height equals container height within 0.5 px; clear button and copy button 44 by 44 within 0.5 px; Cancel at least 44 px tall).
- [ ] GREEN: fix anything the browser exposes.
- [ ] Commit: `test(search): crew page search end to end`.

<!-- tasks: end -->

## Closeout

- Pre-code mechanical checks over every new string: no em dash, straight apostrophes, 44 px taps, existing type and color tokens only.
- Invariant 8 gate on the whole diff; findings and dispositions in closeout.md with the marker line.
- Full suite under `pnpm heavy pnpm test`; `pnpm typecheck` (8 GB heap per repo note); `pnpm exec eslint .`; `pnpm format:check`.
- Whole-diff cross-model review (split per surface: lib, sections, UI, route).
- Real CI green, merge, sync main.
