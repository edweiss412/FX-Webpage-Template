# Crew show page search: design

**Status:** draft for adversarial review. Autonomous ship approved by Eric on 2026-10-26 (search brainstorm session).
**Branch:** `feat/crew-show-search`.
**Mockups:** https://claude.ai/artifact/APJoqTo3Q2rx8gBEZPG8Fd, page "Round 2: built on C", board `R2Search` ("Search: results grouped by section"). Header placement from boards `R2Home` (phone) and `R2Wide` (wide window).
**Related:** the crew page redesign (`feat/crew-page-redesign`, spec docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md on that branch) reserves a `CrewSearchSlot` in its header and carries this feature over. The contract between the two is §9.

## 1. Intent

Crew open the show page on a phone at the venue to find one fact fast and trust it. Eric's examples from this week's show, two general sessions on two floors: where each room is and how it's set, what gear goes in each room, anything marked or color coded, room diagrams (FOH, screens, stage), and role-scope details for a session: audio or video content, lighting, mic requests, client laptops, projection notes. They know roughly what they want. They don't know which tab Doug's sheet put it under.

Search answers that by pointing at a real line on the page. It never writes an answer of its own. Every result is a line the viewer could already see by scrolling, and tapping it takes them there with the line highlighted.

### 1.1 Resolved scope: do not relitigate

| # | Decision | Ratified by |
|---|---|---|
| D1 | Fuzzy, client-side search. No AI, no RAG, no server search: per-query cost, latency on venue cell signal, and an AI answer can sound right and be wrong. A result is always a real line from Doug's sheet as the page renders it. | Search session brief (parent session, 2026-10-26); redesign spec R9. |
| D2 | A short alias list closes wording gaps. A result matched only through an alias shows a `Matched "…"` note. | Brief. |
| D3 | Results grouped by section, filter chips with counts at the top, matched text highlighted, copy buttons on copyable values with a "copied" toast, last row "Not what you need?" opening the existing report form. | Brief; mockup `R2Search`. |
| D4 | Tapping a result opens that section with the line highlighted. On today's page that means switching the section tab. In the redesign, a bottom sheet on phones and a page scroll on wide windows (§9). | Brief; Eric chose "go live now" (D7). |
| D5 | Search covers every line the page shows THIS viewer, and nothing else. | Brief (visibility constraint); Eric confirmed the coverage playback, 2026-10-26. |
| D6 | Searches that find nothing are recorded in Eric's telemetry only. Nothing Doug sees. "If Doug needs access later we can adjust." | Eric, 2026-10-26. |
| D7 | Search goes live on TODAY's crew page now, before the redesign merges. The redesign carries it over. | Eric, 2026-10-26: "go live now, keep the redesign session updated". |
| D8 | Search is crew page only. The admin show popup does not get search in this project. | Playback accepted by Eric, 2026-10-26. |
| D9 | Sheet cell colors are not carried by the app today, so search finds text only. Color written as text is found. | §12 L1; parser has no cell-format capture (grep for `backgroundColor`/`effectiveFormat` under `lib/parser/**` and `lib/sync/**` returns nothing). |
| D10 | The search index is keyed by today's section ids (`SectionId`, `lib/crew/resolveActiveSection.ts`). The redesign migrates the keys when it moves to admin section ids. | Redesign session contract, 2026-10-26 (§9). |

### 1.2 Goals

- Find any visible line in a few keystrokes, with one-letter typos forgiven.
- Bridge the common wording gaps between how crew ask and how Doug writes.
- Copy a Wi-Fi password or a confirmation number straight from the result.
- Hand off to Doug when the sheet doesn't have it.

### 1.3 Non-goals

- Search inside diagram images or linked files. Diagram and file NAMES are searchable where the page renders them.
- Search across shows.
- Saving recent searches or the query in the URL.
- A Doug-facing view of missed searches (D6).
- Search on the admin show popup or the wizard review steps (D8). The two admin routes that render the crew page itself through `CrewShell` (preview-as and the wizard staged preview) show search exactly as crew see it, because they are previews of this page.

### 1.4 Anti-goals (a failure even if it technically works)

- **A result the viewer cannot see on the page.** Another crew member's hotel confirmation, someone else's flight, the transport row of a viewer whose transport tile is hidden, financials without `financialsVisible`, rows past an inline cap, event-details keys outside the crew whitelist. Any of these in a result is a P0 privacy bug.
- **A result that points at the wrong line,** or at nothing, after tapping.
- **Text search invented.** A snippet must be the line's own text, cut at word boundaries, never paraphrased.
- **Typing lag** on a mid-range phone.

## 2. Where the data comes from

### 2.1 Current page shape (facts this design rests on)

- The crew page is `app/show/[slug]/[shareToken]/page.tsx`, an async server component. It resolves access with `resolveShowPageAccess({ slug, shareToken, req })` and loads `getShowForViewer(showId, viewer)` (`lib/data/getShowForViewer.ts`, type `ShowForViewer`).
- `CrewShell` (`app/show/[slug]/[shareToken]/_CrewShell.tsx`, server) renders every entitled section on the server into `sectionNodes: Partial<Record<SectionId, ReactNode>>` and passes them to the client `CrewSections` (`components/crew/CrewSections.tsx`, props `CrewSectionsProps`). The raw `ShowForViewer` never reaches a client component.
- `CrewSections` carries the freshness invariant in its header comment: "the controller toggles VISIBILITY only. It never fetches, derives, or caches section data client-side." Only the active section's body is mounted.
- The section components are synchronous server components under `components/crew/sections/` (Today, Schedule, Venue, Travel, Crew, Gear, Budget). `CrewShell` also serves the admin preview-as route (`app/admin/show/[slug]/preview/[crewId]/page.tsx`) and the wizard staged preview (`app/admin/wizard/preview/[stagedId]/page.tsx`, `staticPreview`).

### 2.2 Why the index cannot be built from `ShowForViewer` directly

`getShowForViewer` filters a lot (financials to admin/LEAD/FINANCIALS viewers, hotels by viewer name, only the viewer's own flight, date restriction), but the section components hide more at render time:

- `financialsVisible` (`lib/visibility/scopeTiles.ts`) gates the Budget section in `CrewShell`.
- `transportTileVisible` (`lib/visibility/scopeTiles.ts`) gates Getting there (`TravelSection.tsx`), Parking and transport notes (`VenueSection.tsx`, `TodaySection.tsx`), and the load-out run-of-show entries (`ScheduleSection.tsx` through `scheduleEntriesForViewer`, `lib/crew/agendaDisplay.ts`), while `data.transportation` is present for every viewer.
- Tech specs render only `CREW_TECH_SPEC_KEYS` (`lib/crew/eventDetailsSpecs.ts`), while `event_details` carries every key.
- Inline caps drop rows from the DOM: `CREW_INLINE_CAP` and `CONTACTS_INLINE_CAP` (`CrewSection.tsx`), `RUN_OF_SHOW_DISPLAY_CAP` (`lib/crew/agendaDisplay.ts`), `SHOWS_CAP` (`KeyTimesStrip.tsx`, module-local), and `CASE_CAP` and `ROOM_DETAIL_CAP` (`GearSection.tsx`, declared inside the section's render callback; `tests/components/tiles/CardinalityCapBoundary.test.tsx` duplicates `CASE_CAP` and reads the source by regex). Rows past a cap are not in the DOM; only a "+N more" stub renders.
- `hideDates` in `TravelSection.tsx` strips the flight carrier and flight confirmation and the hotel check-in/out dates for date-suppressed viewers. It does NOT hide the hotel confirmation number, which renders for every viewer who sees the hotel (`reservationHasNonDateContent` counts it as non-date content). `suppressesDates` replaces the whole Schedule section with an "unconfirmed" message.
- `show.client_contact` is never shown to crew.

So an index built from the raw projection would leak. The index has to describe what each section RENDERS for this viewer.

### 2.3 The invariant: index equals render

**INV-1. Every search entry is a line the page renders for this viewer, and every rendered search target is an entry.** Concretely, for any viewer and any section:

1. Each entry's `id` matches exactly one element in that section's rendered output carrying `data-search-target="<id>"`.
2. Each element carrying `data-search-target` has exactly one entry.
3. The element's whitespace-normalized `textContent` contains the entry's `value`, and its `label` when the label is non-null.
4. Each `context` string of the entry, and its `group`, appears in the text of the target's enclosing card (`closest("[data-card-id]")`), or of the rendered section when the target has no card.

INV-1 is enforced by the parity suite (§11.1), which is the tripwire both this project and the redesign merge against.

### 2.4 How the index is built

- `buildSearchIndex(input)` (lib/search/buildSearchIndex.ts, new) runs on the server, inside `CrewShell`, from the same inputs the sections receive: `data`, `viewer`, `today`, plus what `CrewShell` already computes (`budgetVisible`, which is `financialsVisible(...)` evaluated once in `CrewShell`, and `staticPreview`). It returns a `SearchIndex` (§3).
- It calls one builder per section (lib/search/sections/<sectionId>.ts, new). **Each builder derives its lines through the same functions the section component uses** (`parseWifiValue`, `formatIsoDate`, `normalizeMeridiem`, `scheduleEntriesForViewer`, `selectPrimaryContact`, `partialAttendanceLabel`, `contactFallbackLabel` (module-local in `CrewSection.tsx` today; the plan exports it), `parseFlightItinerary`, `stripOpeningReelText`, the visibility predicates and the caps). Where a component computes a row list inline, the builder does not copy the computation: the plan extracts it into an exported pure function in the component's module or `lib/crew/`, and the component and the builder both call it. Caps that are not exported today (`CASE_CAP`, `ROOM_DETAIL_CAP`, `SHOWS_CAP`) become named module exports for the same reason, and `CardinalityCapBoundary.test.tsx` imports `CASE_CAP` instead of reading the source. No visual change.
- `CrewShell` passes the index to the client search island as a prop. The index is server-sourced on every render, including every `ShowRealtimeBridge → router.refresh()` re-render. The client never fetches, caches or derives section data (freshness invariant unchanged).
- Sections not rendered for this viewer (Budget without entitlement) contribute nothing. `staticPreview` builds an index too (Doug's wizard preview searches like crew would), but disables miss logging and the report row (§7.4, §6.7).

### 2.5 What gets a target (home-section rule)

A fact is indexed once, at its home section. Today's summary cards that repeat a fact from another section (Tonight from Travel hotels, Where from Venue, Need something from Crew contacts, Key times and Run of show from Schedule, the aggregated show notes) carry no targets. Today indexes only what renders nowhere else: the dress code (`DressCodeLines` in `TodaySection.tsx`, its only crew render site). `RightNowHero` (client, live clock) is not indexed.

Lines that are visible text only. Phone numbers and emails in `PersonRow` are `tel:`/`mailto:` hrefs and aria-labels, not text, so they are not indexed; names, roles and contact notes are.

The plan enumerates every target site from the live components (row primitives `KeyValueRows`, `FactRows`, `PersonRow`, and the rows that bypass them: `TravelRow`, `AnchorRow`, `RunOfShowEntry`, the agenda rows of `AgendaScheduleBlock` (`components/crew/AgendaScheduleBlock.tsx`), `DayCard`, inline markup for COI, hotel check-in/out, flights, pack list items and notes). The primitives gain an optional `searchTarget?: string` row field rendered as `data-search-target`; bypass rows get the attribute directly.

## 3. Index shape

```ts
// lib/search/types.ts
import type { SectionId } from "@/lib/crew/resolveActiveSection";

export type SearchCopy = {
  kind: "network" | "password" | "confirmation";
  text: string; // the exact string written to the clipboard
};

export type SearchEntry = {
  id: string; // the data-search-target value, unique within the index
  section: SectionId;
  group: string; // card title or sub-heading shown on the row, e.g. "Video"
  label: string | null; // field label, e.g. "Grand Ballroom"; null for free text
  value: string; // the line's displayed text
  context: readonly string[]; // other visible words that place the line, e.g. a day label
  copy: SearchCopy | null;
};

export type SearchIndex = { entries: readonly SearchEntry[] };
```

Guard conditions:

- An entry is created only when its `value` is non-empty after trimming. A value the page hides (sentinel-hidden, empty, whitespace) produces no entry, because the page renders no target for it (INV-1). Builders apply the same hiding predicate the row primitives apply (`shouldHideGenericOptional`, `lib/visibility/emptyState.ts`, used by `KeyValueRows`), never a look-alike.
- `label` equal to `group` after normalization is stored as `null` so the row does not repeat itself.
- `id` is `<sectionId>:<region>:<rowKey>`. `region` is the value of the nearest ancestor `data-card-id` (every crew card carries one; most are keys of `CARD_REGION_MAP` in `lib/sheet-links/buildSheetDeepLink.ts`, and `venue-diagrams` is in that file's `OUT_OF_SCOPE_CARDS`). Lines outside any card, which today means the Schedule agenda (`section[data-testid="agenda-area"]` in `ScheduleSection.tsx`), use the region `agenda`. `rowKey` is `rowKey` is stable within the card (field key, room index plus field, crew member id, segment index). Duplicate ids fail the parity suite.
- `copy` is set for exactly four values and only when the page renders them: the Wi-Fi network name and password (from `parseWifiValue`), the viewer's hotel confirmation number, and the viewer's flight confirmation. Under `hideDates` the flight confirmation is not rendered, so it is not indexed; the hotel confirmation still renders and is indexed.
- An empty index (a show with no visible content) is valid: the field still renders, and every query shows the no-match state.

Size: entries are bounded by what renders (caps above). The plan measures the serialized index for the seed fixture and the largest fixture show and records the numbers; there is no extra cap.

## 4. Coverage

Every section the viewer can open contributes its visible lines. By section, with the cards as they render today:

| Section | Indexed |
|---|---|
| Today | Dress code lines only (§2.5). |
| Schedule | Day cards (day label, schedule window), run-of-show entries, agenda sessions (title, room, time), Crew Schedule key times. Nothing when `suppressesDates` replaces the section. |
| Venue | Where (venue name, address), Facilities rows (dock, parking when transport is visible, room, Wi-Fi network and password or the raw Crew Wi-Fi row, power), Venue status (COI, notes), diagram and file names the gallery renders. |
| Travel | Your flight (segments, confirmation unless hidden), Getting there (driver, vehicle, load out, legs, transport notes) when transport is visible, Hotels (name, address, check-in/out, confirmation, notes). |
| Crew | Roster (name, role, partial attendance, You, Lead) up to the inline cap, key contacts (name or fallback label, notes) up to the inline cap. |
| Gear | Scope cards per room (room label, audio/video/lighting scope text), pack list items when visible today, tech specs, room details, keynote requirements, opening reel. |
| Budget | PO, Proposal, Invoice, Invoice notes, only when the section renders. |

Room-centred queries work through `group` and `label`. Gear scope cards are per discipline (`gear-scope-<discipline>` in `GearSection.tsx`), with one row per room: the Video card's Grand Ballroom row has `group: "Video"`, `label: "Grand Ballroom"`, `value` the scope text. "ballroom video" matches it even though the scope text says neither word.

## 5. Matching

All of this lives in `lib/search/` (new), runs in the browser, and is pure: same index plus same query gives the same result, with no clock, no storage and no network. No new dependency.

### 5.1 Normalization (one function for the index and the query)

`normalize(text)` returns tokens with offsets:

1. Unicode NFKD, then drop combining marks ("Café" → "cafe").
2. Lower case.
3. Delete a hyphen or apostrophe between two letters or digits ("Wi-Fi" → "wifi", "Doug's" → "dougs", "load-in" → "loadin").
4. Split on any run of characters that are not letters or digits; drop empty pieces.

Each token keeps its start and end offsets in the ORIGINAL display string, so highlight ranges point at what the viewer sees (§6.4).

### 5.2 Query tokens

- Stop words are dropped from the query: `a an the of is are where what when which who how my our for to at do does i me`. If every token is a stop word, none is dropped.
- A query under 2 characters after normalization runs no match (§6.2, hint state).
- Every remaining query token must match somewhere in the entry's `group`, `label`, `value` or `context` (AND). There is no OR mode.

### 5.3 Token match kinds

A query token `q` matches an entry token `t` by the first kind that applies:

| Kind | Rule | Weight |
|---|---|---|
| exact | `q === t` | 1.0 |
| prefix | `t.startsWith(q)` and `q.length >= 2` | 0.8 |
| alias | `t` is an alias token for `q` (§5.4), exact equality | 0.7 |
| fuzzy | `damerauLevenshtein(q, t)` (`lib/parser/fuzzyMatch.ts`) ≤ 1 when `q.length` is 4 to 7, ≤ 2 when `q.length` ≥ 8; never when `q.length` ≤ 3 | 0.5 |

A 1-character query token (the "b" in "ballroom b") matches by `exact` only.

### 5.4 Aliases

lib/search/aliases.ts exports `SEARCH_ALIAS_GROUPS: readonly (readonly string[])[]`. Each member is a word or a phrase, stored normalized (tokens joined by one space). A term appears in at most one group, so expansion never chains.

Expansion happens at index time. For each entry and each group: if any member occurs in the entry's token stream (a phrase occurs when its tokens appear consecutively), the entry gains the OTHER members' tokens as alias tokens. Each alias token remembers the display-text span that triggered it.

Example: "Internet hardline at front of house" contains `internet` (Wi-Fi group) and the phrase `front of house` (FOH group). It gains alias tokens `wifi`, `network`, `ssid`, `foh`. The query "wifi" matches by alias, and the row's note reads `Matched "Internet"`, quoting the span as displayed.

Starting list (my call; tuned from recorded misses later):

| Group | Members |
|---|---|
| Wi-Fi | wifi, internet, network, ssid |
| Password | password, passcode, pw |
| Dock | dock, loading dock, freight, loadin |
| Front of house | foh, front of house |
| General session | gs, general session, plenary |
| Breakout | breakout, break out |
| Microphones | mic, mics, microphone, microphones, mike |
| Lavalier | lav, lavs, lavalier |
| Laptops | laptop, laptops, computer, computers |
| Projection | projector, projectors, projection |
| LED | led wall, video wall |
| Lighting | lighting, lights, lx |
| Audio | audio, sound |
| Hotel | hotel, hotels, lodging, accommodation |
| Confirmation | confirmation, conf, reservation |
| Flight | flight, flights, airline |
| Parking | parking, garage |
| Call time | call time, crew call |
| Strike | strike, load out, loadout, teardown, tear down |
| Power | power, electrical, distro |
| Diagrams | diagram, diagrams, floor plan, stage plot, cad |
| Dress code | dress code, wardrobe, attire |
| Schedule | schedule, agenda, run of show, ros, rundown |
| Slides | slides, deck, powerpoint, ppt |
| Signage | signage, signs |
| Meals | lunch, dinner, breakfast, meal, catering |

Left out on purpose: `wireless` (in AV it means wireless mics), `keynote` (a session or Apple's app), `room` (event room or hotel room), `call` alone (phone call or call time).

### 5.5 Score and order

- Entry score: sum over query tokens of the best match weight times the field weight. Field weights: `label` and `value` 1.0; `group` and `context` 0.6.
- Within a section, rows sort by score, highest first; ties keep render order.
- Sections sort by their best row's score; ties keep the order `[...BASE_SECTION_IDS, "budget"]` (`lib/crew/resolveActiveSection.ts`). Chips use the section order.

### 5.6 Output

`searchIndex(index, query)` returns `{ total: number; sections: { section: SectionId; rows: SearchHit[] }[] }`, where a `SearchHit` carries the entry, its score, highlight ranges for `group`, `label` and `value`, and `aliasNote: string | null`. `aliasNote` is set only when no query token matched the entry by exact, prefix or fuzzy in a displayed field (`group`, `label`, `value`), and names the first alias source span.

## 6. Interface

### 6.1 Placement

- Today's page: `Header` (`components/layout/Header.tsx`, server) gains an optional `search?: ReactNode` prop, rendered as a full-width row under the title block. `CrewShell` passes the search field; admin surfaces pass nothing and render exactly as today.
- Redesign: the same field moves into `CrewSearchSlot` unchanged (§9).

### 6.2 States

The search island has four states. One mode at every width: results replace the page body below the header; there is no separate phone overlay or wide dropdown.

| State | When | Renders |
|---|---|---|
| Idle | Input not focused and query empty | Field only. Page as today. |
| Hint | Search active, query under 2 characters | Cancel button. Below the header: hint text. Sub-nav and section body hidden. |
| Results | Search active, query ≥ 2 characters, ≥ 1 hit | Cancel, chips, grouped results, report row. Sub-nav and body hidden. |
| No match | Search active, query ≥ 2 characters, 0 hits | Cancel, no-match text, report row. Sub-nav and body hidden. |

- Search becomes active when the input gains focus. It stays active when the input blurs (dismissing the phone keyboard must not drop the results).
- It ends on Cancel, on Escape when the query is empty, and when a result is tapped. Ending by a result tap keeps the query, so focusing the field again shows the same results. Cancel and Escape clear the query.
- The clear (×) button empties the query, keeps search active and refocuses the input. It renders only when the query is non-empty.
- Hiding uses the `hidden` attribute on `CrewSections`' sub-nav and section body, so section state (open disclosures) survives a search. The fixed bottom sub-nav on narrow screens (`CrewSubNav`) is hidden with it.

### 6.3 Chips

- A row of buttons under the header, `nav aria-label="Filter results by section"`, scrolling sideways on narrow screens. "All" first, then one chip per section with at least one hit, in §5.5 order. Text: section label from `SECTION_LABELS` (`components/crew/CrewSubNav.tsx`, module-local today; the plan exports it so chips and the sub-nav share one source) and the count, e.g. "Venue 2". Selected chip has `aria-pressed="true"`.
- All view: up to 5 rows per section, then a "Show all {n} in {Section}" button that selects that chip.
- Section view: up to 50 rows, then the note "Showing the first 50. Add a word to narrow it."
- When the query changes, the selected chip resets to All.

### 6.4 Result rows

Each section group is a heading (section label) and a list. Each row:

- One `<button type="button">` that opens the line (§6.6), holding: a first line `[group, label]` joined by " · " (muted, small); the value on the second line; the alias note chip under it when `aliasNote` is set.
- Matched ranges render in `<mark>`. Highlights never cross a token boundary they did not match.
- Values over 140 characters show a window of up to 140 characters around the first highlight, cut at word boundaries, with "…" on any cut side. A snippet never rewrites the line's words.
- Values of 40 characters or less render in the semibold value style; longer values in body style.
- When `copy` is set, a sibling `<button>` (not nested in the row button) with a copy icon, 44 by 44 px (`--spacing-tap-min`), `aria-label` per §10.

### 6.5 Copy

- Writes `copy.text` with `navigator.clipboard.writeText` (the mechanism `CopyFactValue` uses). On success: toast per kind (§10) for `COPY_FEEDBACK_RESET_MS` (`lib/ui/copyFeedback.ts`). On rejection or missing API: the failure toast.
- The toast is `role="status"`, sits over the results near the top of the viewport, and is announced once. A second copy replaces the first toast and restarts the timer.
- The app has no toast today (`ArchiveShowButton.tsx` comment). This adds one, local to the search island, not a global toast system.

### 6.6 Opening a result

- Tapping a row calls `openSectionAndReveal(entry.section, entry.id)` (§9.1) and ends search with the query kept.
- On today's page the controller: sets the active section the way a tab tap does (`setActive`, `pushState` to the section href, as `onSelect` in `CrewSections.tsx` does), then after the section commits, finds `[data-search-target="<id>"]` inside the section body, opens every ancestor `<details>`, scrolls the element to the vertical center, moves focus to it (`tabIndex=-1`, `preventScroll`) and sets `data-search-reveal` for the highlight.
- Highlight: a background tint that fades out over 1600 ms. Under `prefers-reduced-motion: reduce`, the tint shows without fading for 2000 ms and is removed instantly.
- If the target is missing (the sheet changed between search and tap), the section opens at the top and a polite live region says "That line isn't on the page anymore."
- Back after a reveal behaves like Back after a tab tap today (the `popstate` handler in `CrewSections.tsx` re-resolves `?s=`). Search does not reopen. No history entry is pushed when search opens.

### 6.7 Report row

- Always the last block in Results and No match. Text per §10. The button opens `ReportModal` (`components/shared/ReportModal.tsx`, controlled `open`/`onOpenChange`, required `surface`, `surfaceId`, `showId`). `surface` and the surface-id scope come from the page's existing card report context (`CardReportContext`: `surface`, `surfaceIdScope`, `extraContext`, built in `lib/crew/cardReportContext.ts`), so preview-as reports keep the admin surface and `crewPreview` capture exactly as card reports do. `surfaceId` is built the way `CardReportTrigger` builds it, with the card id `search`. `showId` is the page's show id. `autocapture.viewerVisibleSection` is `"search"` and `autocapture.rawSnippet` is `Searched for "<query>"`.
- Not rendered when reporting is off for the page (`staticPreview`, where `CrewShell` passes `cardReport = null`).

### 6.8 Accessibility

- The field is `<input type="search">` with an accessible name, inside `role="search"`.
- A polite live region announces the result count 300 ms after typing stops ("4 results", "1 result", "No matches").
- Escape: clears a non-empty query; ends search on an empty one. Focus returns to the input after clear.
- The page body is hidden with `hidden`, so assistive tech does not reach stale content behind results.
- Every interactive element is at least 44 px tall.

### 6.9 Dimensional invariants

- Field container (fixed height 52 px): the input fills it with `self-stretch`; the clear button is 44 by 44 px with `self-center`; the Cancel button is `min-h-tap-min` with `self-center`.
- Result row (no fixed height): the row button is `flex-1 min-w-0`; the copy button is `size-tap-min` (44 px) with `self-center`, `shrink-0`.
- No other fixed-dimension parents.

### 6.10 Transition inventory

States: Idle (I), Hint (H), Results (R), No match (N).

| Pair | Treatment |
|---|---|
| I ↔ H | Instant. |
| I ↔ R | Instant (R is reached from I only by focusing a field that kept its query). |
| I ↔ N | Instant (same path as I ↔ R). |
| H ↔ R | Instant. |
| H ↔ N | Instant. |
| R ↔ N | Instant. |

Compound cases:

- Copy toast while the query changes: the toast stays until its timer ends; it is not tied to the row.
- Realtime refresh (`router.refresh()`) during any state: the index prop updates and the current query re-runs; the selected chip resets to All only if its section no longer has hits.
- Reveal highlight while a refresh re-renders the section: the highlight is an attribute on the element; React keeps unknown attributes on a kept node, and a remounted node simply drops the highlight early. Accepted, no handling.
- Search activated while a reveal highlight is running: the body is hidden; the highlight ends on its own timer.

## 7. Missed searches (telemetry)

### 7.1 Client

- A miss is a query of 2 or more characters with 0 hits, observed either 2000 ms after the last keystroke or when search ends with that query.
- Each normalized query is sent at most once per page load.
- Sent with `fetch(url, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body })`; failures are ignored with no UI and no retry. Offline simply loses the miss.
- Disabled (no request at all) unless `viewer.kind` is crew and the page is not `staticPreview`. `CrewShell` passes `missLogging: boolean`. (`ctx.isAdmin` in `CrewShell` is false for admin preview-as, so it is not the gate.)

### 7.2 Route

`POST /api/show/[slug]/search-miss` (app/api/show/[slug]/search-miss/route.ts, new). Body `{ shareToken: string; query: string }`.

1. Same-origin check. `sameOrigin(req)` in `app/api/observe/client-error/route.ts` is module-local today; the plan moves it to a shared module both routes import, unchanged.
2. Content type must be JSON; body over 2 KB → 400.
3. `query` trimmed, 2 to 100 characters; longer is cut to 100. `shareToken` non-empty string.
4. Access: `resolveShowPageAccess({ slug, shareToken, req })` (`lib/auth/picker/resolveShowPageAccess.ts`), the resolution the page uses. It reads cookies and headers and writes nothing, so it is safe in a route handler. It already performs the admin check (`isAdminSession`) and returns `{ kind: "admin" }` for an admin session. Only `kind: "resolved"` (a crew viewer of a viewable show) is logged; `admin` and every other kind return 204 without logging.
5. In-memory rate limit: 30 accepted misses per show per 60 s per server instance; over the cap returns 204 and logs `CREW_SEARCH_MISS_RATE_CAPPED` once per window.
6. Emit: `log.info(message, fields)` (`lib/log/logger.ts`, `LogFields` in `lib/log/types.ts`) with `source: "crew-search-miss"`, `code: "CREW_SEARCH_NO_RESULTS"`, the reserved top-level `showId`, and `query` (which the logger places in `context`; the logger's sanitizer redacts emails). A `log.info` with a code persists to `app_events` (`lib/log/persist.ts`). No viewer identity, picker id, IP or user agent is recorded.
7. Returns 204 on every well-formed request.

### 7.3 Invariants for the route

- Invariant 9: every Supabase call destructures `{ data, error }`; an infra fault logs `CREW_SEARCH_MISS_INFRA_ERROR` (`log.warn`) and returns 204. The file joins `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` in `tests/auth/_metaInfraContract.test.ts` if it constructs a client.
- Invariant 10: the route is a non-admin mutation surface; its `log.info({ code })` satisfies `tests/log/_metaMutationSurfaceObservability.test.ts`.
- Invariant 5: none of these codes reach the UI. Telemetry-only codes need no §12.4 row (`stripLogEmissionCalls`, `lib/messages/__internal__/stripLogEmissionCalls.ts`).
- Invariant 2: no advisory lock; the route writes nothing but `app_events`.

### 7.4 Reading it

`pnpm observe` filtered by code `CREW_SEARCH_NO_RESULTS` (see `docs/agents/observe-cli.md`). No admin UI (D6).

## 8. Freshness and offline

- The index is part of the server render, so every realtime refresh replaces it. Nothing is cached client-side.
- Search works without signal once the page has loaded, because the index ships with the page. Keeping the page available offline belongs to the offline project; search adds no storage.

## 9. Contract with the redesign

Agreed with the redesign session on 2026-10-26 (recorded in both sessions' shared notes):

1. The search field mounts in today's header. The redesign moves it unchanged into `CrewSearchSlot`: a full-width row under the title on phones, between the title and the identity chip at 1024 px and up.
2. `data-search-target` on every searchable line moves with the line. The parity suite (§11.1) is the tripwire; neither side merges with it red.
3. Search navigates through ONE call, `openSectionAndReveal(sectionId, targetId)`. Today: switch `?s=` and reveal. Redesign: same signature; phones open that section's bottom sheet and reveal inside it, wide windows scroll the page to the target.
4. The index is keyed by today's section ids. The redesign migrates them.
5. Whoever lands second rebases.

### 9.1 Shape of the call

`components/crew/CrewSections.tsx` exports `useSectionController(): { openSectionAndReveal(sectionId: SectionId, targetId: string): void }`, provided by `CrewSections`. The search results render inside `CrewSections`' tree, so they reach it through context. A plain module-level function cannot reach React state without a registry; a hook keeps the same name and arguments the redesign agreed to, and the redesign re-implements the provider.

### 9.2 Shared search state

A client provider, `CrewSearchProvider` (components/crew/search/CrewSearchProvider.tsx, new), wraps `Header` and `CrewSections` in `CrewShell`, ABOVE both. The redesign asked for this placement explicitly: its home cards, sheets and wide stack live inside its controller, and the field in the header must share state with them. It holds the index, the query, whether search is active, and `missLogging`. The field (in the header) writes the query; `CrewSections` reads `active` to hide its body and render the results in its place.

## 10. Copy

All crew-visible strings. No em dashes. "Wi-Fi" in visible text, aria-labels and placeholders (redesign §9.2).

| Where | Text |
|---|---|
| Input placeholder | Find anything: Wi-Fi, dock, hotel… |
| Input accessible name | Search this show |
| Clear button aria-label | Clear search |
| Cancel button | Cancel |
| Hint | Search Wi-Fi, the dock, rooms, gear, people and more. |
| Chips nav aria-label | Filter results by section |
| Chip | All {n} / {Section label} {n} |
| Show all | Show all {n} in {Section label} |
| Section cap note | Showing the first 50. Add a word to narrow it. |
| Alias note | Matched "{span}" |
| Copy aria-labels | Copy Wi-Fi network / Copy Wi-Fi password / Copy hotel confirmation / Copy flight confirmation |
| Copy toasts | Network name copied / Password copied / Confirmation copied |
| Copy failed | Couldn't copy. Tap the line, then press and hold the text. |
| No match | No matches. Try dock, hotel, or a name. |
| Report row | Not what you need? / Tell Doug what's missing from the sheet. / Report |
| Live region | {n} results / 1 result / No matches |
| Reveal fallback (live region) | That line isn't on the page anymore. |

The no-match text and the report row match the redesign's copy table (redesign spec §9.1, §9.3).

## 11. Tests

### 11.1 Parity suite (INV-1)

tests/search/indexRenderParity.test.tsx (new). For each viewer in a fixture matrix, for each section the viewer can open: render the section component with RTL (the pattern in `tests/components/crew/sections/TodaySection.test.tsx`, `makeShowForViewer` from `tests/fixtures/showForViewer.ts`), build the index with `buildSearchIndex`, and assert INV-1 clauses 1 to 4.

The matrix must make every gate in §2.2 flip both ways at least once, and each case asserts its own premise (`tests/_shared/premise.ts`) on its own inputs: a crew viewer without transport, with transport, a lead with financials, a date-suppressed viewer, a viewer past each inline cap, and an admin viewer. The section list is derived from `BASE_SECTION_IDS` plus `"budget"`, so a new section cannot be skipped.

### 11.2 Leak suite

tests/search/indexLeak.test.ts (new). The fixture plants a unique sentinel string in every hidden datum of §2.2 and §1.4 (another viewer's hotel confirmation, another crew member's flight, the transport row and a load-out run-of-show entry for a viewer without transport, the flight confirmation under `hideDates`, financial fields without entitlement, `client_contact`, a non-whitelisted `event_details` key, the first row past each cap). The serialized index must contain none of them. A positive control plants the same sentinel in a visible field and asserts it IS found, so the serialization search cannot pass by being broken.

### 11.3 Matcher suite

tests/search/match.test.ts (new):

- Normalization offsets map back to the display string.
- Each match kind, its weight and the length thresholds, including the boundaries (3, 4, 7, 8).
- Every alias group member is in normalized form and appears in exactly one group.
- `aliasNote` set only for alias-only matches, quoting the display span.
- A realistic query table over a fixture index, with the expected top hit: "wifi", "wfii", "internet", "wi-fi password", "dock", "loading", "ballroom video", "foh", "mics", "client laptop", "projection", "parking", "hotel confirmation", "strike". The expected entry ids are derived from the fixture, not typed.

### 11.4 Route suite

tests/api/searchMissRoute.test.ts (new): bad origin, bad content type, oversize body, short and long query, invalid share token, admin session, rate cap, infra error, and the success path asserting the persisted code with a sink spy that records only after observing `CREW_SEARCH_NO_RESULTS`.

### 11.5 Component and e2e

- Component tests for the search island: state machine (§6.2), chips and caps (§6.3), highlight and snippet (§6.4), copy success and failure (§6.5), miss debounce and once-per-query (§7.1).
- e2e tests/e2e/crew-search.spec.ts (new) on the seeded crew page (`tests/e2e/crew-page.spec.ts` setup): type "wifi", see the grouped results, tap the password row's copy button and see "Password copied", tap a row and land on the Venue section with the line in view and highlighted; a zero-hit query sends one POST after the debounce (intercepted). Runs at a phone and a wide viewport.

## 12. Documented limits

- **L1.** Cell colors and other sheet formatting are not searchable (D9).
- **L2.** Diagram contents and linked file contents are not searchable; names are, where rendered.
- **L3.** Rows past an inline cap are not on the page, so they are not in search. Search matches the page.
- **L4.** Phone numbers and emails are not searchable (they are links, not text).
- **L5.** Today's summary cards are not separate results; their facts are found at their home sections.
- **L6.** No stemming beyond prefix and fuzzy matching. "mic" finds "mics" by prefix; "microphones" finds "mics" by alias.
- **L7.** The miss rate cap is per server instance, so the true cap across instances is a multiple. Telemetry only; acceptable.
- **L8.** Back after a reveal goes to the previous section, not back into search.
- **L9.** The copy failure path relies on the line being selectable in its section.

## 13. Invariant checklist

| AGENTS.md invariant | Applies | How |
|---|---|---|
| 1 TDD per task | Yes | Plan. |
| 2 Advisory lock | No | No writes to locked tables. |
| 3 Email canonicalization | No | No emails handled. |
| 4 No global cursor | No | Untouched. |
| 5 No raw codes in UI | Yes | §7.3, §10. |
| 8 Impeccable critique + audit | Yes | New UI under `components/` and `app/`. |
| 9 Supabase call boundary | Yes | §7.3. |
| 10 Mutation surface instrumented | Yes | §7.3. |
| 11 Worktree | Yes | `../FX-worktrees/crew-show-search`. |
| 12 Ledger claims | No entry | No `BL-`/`DEF-` row covers search. |
