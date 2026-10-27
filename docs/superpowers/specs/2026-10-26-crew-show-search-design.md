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
- Lists are capped in two different ways, and the difference matters. Some caps DROP rows from the DOM (only a "+N more" stub renders), so those rows are not on the page: `CREW_INLINE_CAP` and `CONTACTS_INLINE_CAP` (`CrewSection.tsx`) are of this kind. Others only FOLD rows into a closed `<details>`, so the rows are on the page and must be indexed: `SHOWS_CAP` in `KeyTimesStrip.tsx` keeps every overflow row inside a `<details>`. The remaining caps (`RUN_OF_SHOW_DISPLAY_CAP` in `lib/crew/agendaDisplay.ts`, `CASE_CAP` and `ROOM_DETAIL_CAP` in `GearSection.tsx`, `TRUNCATE_AT` and `SOURCE_CAP` in `TodaySection.tsx`, `INITIAL_VISIBLE` in `components/diagrams/Gallery.tsx`) are classified the same way by the plan, by rendering, not by reading their names. The design does not depend on getting that list right: the rule is "in the DOM means indexed, not in the DOM means not indexed", and INV-1 clause 5 (coverage) enforces it mechanically. `CASE_CAP` and `ROOM_DETAIL_CAP` are declared inside the section's render callback; `tests/components/tiles/CardinalityCapBoundary.test.tsx` duplicates `CASE_CAP` and reads the source by regex.
- `hideDates` in `TravelSection.tsx` strips the flight carrier and flight confirmation and the hotel check-in/out dates for date-suppressed viewers. It does NOT hide the hotel confirmation number, which renders for every viewer who sees the hotel (`reservationHasNonDateContent` counts it as non-date content). `suppressesDates` replaces the whole Schedule section with an "unconfirmed" message.
- `show.client_contact` is never shown to crew.

So an index built from the raw projection would leak. The index has to describe what each section RENDERS for this viewer.

### 2.3 The invariant: index equals render

**INV-1. Every search entry is a line the page renders for this viewer, and every rendered search target is an entry.** Concretely, for any viewer and any section:

Terms: a section's rendered output is its root element after render. A **target** is an element carrying `data-search-target`. A **group heading** is an element carrying `data-search-group` (`SectionCard` puts it on every card title; other headings that name a group of lines, such as an agenda day heading, carry it explicitly). A **skip** subtree is an element carrying `data-search-skip` (action controls and labels that are not sheet data: Report, copy, "Show all", "+N more", `<summary>` labels, "Open in Maps", `RightNowHero`, the gallery's invented "Diagram N" names). Text inside an `<svg>` (icon titles) is ignored. A target's **own text** is the whitespace-normalized text of its text nodes outside any nested skip subtree; for an image target (a diagram thumbnail button), the `alt` of its image. The **region** of an element is its nearest ancestor `[data-card-id]`, else the section root.

1. **Ids.** Each entry's `id` matches exactly one target in its section's rendered output. Each target has exactly one entry. Targets never nest.
2. **Nothing extra in the entry.** The target's own text contains the entry's `value`, and its `label` when non-null. `copy.text`, when set, is contained in the target's own text. The entry's `group` equals the text of a group heading in the target's region; when the region has no group heading at all (today: Today's Mode A `KeyTimesStrip`, which renders bare, outside every card), `group` is the empty string and the result row shows the label alone. Each `context` string appears in the region's text.
3. **Nothing missing from the entry.** Every text node of the target's own text (and an image target's `alt`) is contained in the entry's `label`, `value`, or one of its `context` strings. A row that renders a name and a note therefore cannot be indexed by the name alone: it carries two targets, one per line.
4. **Group headings are represented.** Each group heading's text equals the `group` of at least one entry whose target lies in the heading's region, unless its region contains no target at all, as when a card renders only its title.
5. **Coverage.** Every non-whitespace text node and every non-empty image `alt` in the section's rendered output lies inside a target, a group heading, or a skip subtree, and nowhere else. There is no blanket exemption for buttons, links or `aria-hidden`: a button or link whose text is sheet data (a named diagram thumbnail, an agenda file label, an address link) is a target, and an action control is a skip. This is an accept-set: any text the test cannot place fails it, so a line that loses its target, or a new line nobody marked, turns the suite red.

Clauses 1 and 2 prove the index holds only what renders. Clauses 3 to 5 prove everything that renders is in the index.

INV-1 is enforced by the parity suite (§11.1), which is the tripwire both this project and the redesign merge against.

### 2.4 How the index is built

- `buildSearchIndex(input)` (lib/search/buildSearchIndex.ts, new) runs on the server, inside `CrewShell`, from the same inputs the sections receive: `data`, `viewer`, `today`, plus what `CrewShell` already computes (`budgetVisible`, which is `financialsVisible(...)` evaluated once in `CrewShell`, and `staticPreview`). It returns a `SearchIndex` (§3).
- It calls one builder per section (lib/search/sections/<sectionId>.ts, new). **Each builder derives its lines through the same functions the section component uses** (`parseWifiValue`, `formatIsoDate`, `normalizeMeridiem`, `scheduleEntriesForViewer`, `selectPrimaryContact`, `partialAttendanceLabel`, `contactFallbackLabel` (module-local in `CrewSection.tsx` today; the plan exports it), `parseFlightItinerary`, `stripOpeningReelText`, the visibility predicates and the caps). Where a component computes a row list inline, the builder does not copy the computation: the plan extracts it into an exported pure function in the component's module or `lib/crew/`, and the component and the builder both call it. Caps that are not exported today (`CASE_CAP`, `ROOM_DETAIL_CAP`, `SHOWS_CAP`, `TRUNCATE_AT`, `SOURCE_CAP`, `INITIAL_VISIBLE`) become named module exports for the same reason, and `CardinalityCapBoundary.test.tsx` imports `CASE_CAP` instead of reading the source. No visual change.
- `CrewShell` passes the index to the client search island as a prop. The index is server-sourced on every render, including every `ShowRealtimeBridge → router.refresh()` re-render. The client never fetches, caches or derives section data (freshness invariant unchanged).
- Error boundaries: each section wraps its blocks in `WrappedSection`, which renders nothing (so no targets) when the block throws. The builder runs each block's derivation inside the same kind of guard and contributes no entries for a block whose derivation throws. A block outside any boundary (the Schedule agenda) has no such fallback in either place.
- Order: a builder emits entries in render order (the `~n` suffix in §3 depends on it). Where a component reorders rows (run of show moves strike and load-out last; gear scope cards reorder per viewer; Travel sorts hotels by ordinal while Today takes the first reservation), the builder calls the same ordering function.
- Sections not rendered for this viewer (Budget without entitlement) contribute nothing. `staticPreview` builds an index too (Doug's wizard preview searches like crew would), but disables miss logging and the report row (§7.4, §6.7).

### 2.5 What gets a target

Every line a section renders gets a target, Today included. Today repeats many facts from other sections (Tonight from Travel hotels, Where from Venue, Need something from Crew contacts, Key times and Run of show from Schedule, notes aggregated from several sources), and it is also the ONLY render site for some lines: room notes (`TodaySection.tsx` reads them from the room rows, and `lib/crew/roomDetailFields.ts` documents Today as their only render site), notes on contacts past the Crew inline cap (Today aggregates every contact's notes), the Need something contact when it sits past that cap, and the dress code (`DressCodeLines`). So Today is indexed like any other section, and repeats are removed at RESULT time instead (§5.5), which keeps INV-1 a strict two-way match. `RightNowHero` (client, live clock) is the one exception: it gets no targets and no entries. A note the Today card cuts at `TRUNCATE_AT` shows its full text inside a closed `<details>`; the entry's `value` is the full text, and a reveal opens the `<details>` (§6.6).

Visible text only, wherever it renders. `PersonRow` shows phone numbers and emails only as `tel:`/`mailto:` hrefs and aria-labels, so a crew or contact person's phone and email are not indexed; their names, roles and notes are. Phone numbers and emails that render as TEXT are indexed like any other text: the driver and load-out contact lines in Travel's Getting there (`TravelSection.tsx` builds them from name, phone and email) are the current instance, and clause 5 catches any other. `RightNowHero` (client, live clock) is wrapped in `data-search-skip`. Diagram names are the one image case: the gallery (`components/diagrams/Gallery.tsx`) shows each name as the thumbnail's `alt` and the button's `aria-label` ("Open {name}"), so a thumbnail with a real name is an image target, indexed through its image's `alt` (INV-1, image targets). The fallback name the gallery invents when a file has none ("Diagram N") is marked `data-search-skip` and not indexed. Only the thumbnails the gallery renders are indexed (§12 L10). The gallery card's own title is indexed, so "diagram" or "floor plan" always reaches the card.

The plan enumerates every target site from the live components (row primitives `KeyValueRows`, `FactRows`, `PersonRow`, and the rows that bypass them: `TravelRow`, `AnchorRow`, `RunOfShowEntry`, the agenda rows of `AgendaScheduleBlock` (`components/crew/AgendaScheduleBlock.tsx`), `DayCard`, inline markup for COI, hotel check-in/out, flights, pack list items and notes). The primitives gain an optional `searchTarget?: string` row field rendered as `data-search-target`; bypass rows get the attribute directly.

## 3. Index shape

```ts
// lib/search/types.ts
import type { SectionId } from "@/lib/crew/resolveActiveSection";

export type SearchCopy = {
  kind: "network" | "password" | "hotelConfirmation" | "flightConfirmation";
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

- An entry is created only when its `value` is non-empty after trimming. A value the page hides (sentinel-hidden, empty, whitespace) produces no entry, because the page renders no target for it (INV-1). Builders apply the same hiding rule each render site applies, never a look-alike: `shouldHideGenericOptional` (`lib/visibility/emptyState.ts`) where the line renders through `KeyValueRows`, and the site's own check where a bypass row decides for itself. These differ today (Travel checks the hotel name for empty only while Today sentinel-hides it; Travel formats check-in dates while Today shows the raw string; crew names have no guard), so a blanket predicate would drift. The parity suite catches a builder that guesses.
- `label` equal to `group` after normalization is stored as `null` so the row does not repeat itself.
- `id` is CONTENT-addressed, never positional: `<sectionId>:<region>:<hash>`, where `hash` is a 32-bit FNV-1a of the EXACT display strings `group`, `label` (empty when null) and `value`, joined by U+001F, written in base 36. No normalization happens before hashing: a password that changes from `ORDTG.` to `ordtg` must get a new id. When two entries in the same section and region have the same hash (byte-identical lines with the same group and label), the second and later get `~2`, `~3` in render order; those lines have identical text, so revealing either is correct. `region` is the value of the nearest ancestor `data-card-id` (every crew card carries one; most are keys of `CARD_REGION_MAP` in `lib/sheet-links/buildSheetDeepLink.ts`, and `venue-diagrams` is in that file's `OUT_OF_SCOPE_CARDS`), or the literal `none` for a line outside every card (the Schedule agenda in `section[data-testid="agenda-area"]`, and Today's Mode A `KeyTimesStrip`, rendered directly in `TodaySection.tsx`). Why content-addressed: a positional key (room index, flight segment index) survives a refresh that deletes or reorders rows and then names a DIFFERENT line, so a reveal would highlight the wrong one. With a content key, a changed or removed line simply has no target, and the reveal says so (§6.6). Duplicate ids fail the parity suite.
- `copy` is set for four kinds of value and only where the page renders them: the Wi-Fi network name and password (from `parseWifiValue`), each hotel confirmation number shown, and each flight confirmation shown (Travel renders a confirmation in two places, the itinerary and the segment; each rendered one is copyable). Under `hideDates` the flight confirmation is not rendered, so it is not indexed; the hotel confirmation still renders and is indexed.
- An empty index (a show with no visible content) is valid: the field still renders, and every query shows the no-match state.

Size: entries are bounded by what renders (caps above). The plan measures the serialized index for the seed fixture and the largest fixture show and records the numbers; there is no extra cap.

## 4. Coverage

Every section the viewer can open contributes its visible lines. By section, with the cards as they render today:

| Section | Indexed |
|---|---|
| Today | Every card except `RightNowHero`: Tonight, Where, Need something, Key times, Dress code, Show notes (full text of each note), Run of show when shown. Repeats are removed from results (§5.5). |
| Schedule | Day cards (day label as the group heading, since `schedule-days` has no card title; schedule window), run-of-show entries, agenda sessions (title, room, time), Crew Schedule key times. Nothing when `suppressesDates` replaces the section. |
| Venue | Where (venue name, address), Facilities rows (dock, parking when transport is visible, room, Wi-Fi network and password or the raw Crew Wi-Fi row, power), Venue status (COI, notes), the diagram gallery card title and the names of the thumbnails it renders (§2.5). |
| Travel | Your flight (segments, confirmation unless hidden), Getting there (driver, vehicle, load out, legs, transport notes) when transport is visible, Hotels (name, address, check-in/out, confirmation, notes). |
| Crew | Roster (name, role, partial attendance, You, Lead) up to the inline cap, key contacts (name or fallback label, notes) up to the inline cap. |
| Gear | Scope cards per discipline (audio, video, lighting, scenic, other), one row per room (room label, scope text), pack list items when visible today, tech specs, room details, keynote requirements, opening reel. |
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
- Repeat removal: when a hit from `today` has exactly the same `label` and `value` display strings (after trimming and collapsing whitespace, nothing else) as a hit from another section, the `today` hit is dropped. Lines that differ in case or punctuation are different lines and both stay. A Today line with no twin elsewhere (room notes, a contact note past the Crew cap) stays, grouped under Today.
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
| Idle | Search not active: the query is empty, or kept from a search a result tap ended | Field only, with the clear button when a query is kept. Page as today. |
| Hint | Search active, query under 2 characters | Cancel button. Below the header: hint text. Sub-nav and section body hidden. |
| Results | Search active, query ≥ 2 characters, ≥ 1 hit | Cancel, chips, grouped results, report row. Sub-nav and body hidden. |
| No match | Search active, query ≥ 2 characters, 0 hits | Cancel, no-match text, report row. Sub-nav and body hidden. |

- Focus alone changes nothing (WCAG 3.2.1 On Focus). Search hides the sub-nav and the section body, which is a change of context, so focusing the field, by keyboard, click or tap, never starts it.
- Search becomes active when an edit leaves the query non-empty. The first typed character enters Hint; a paste of 2 or more characters enters Results or No match directly. It stays active when the input blurs (dismissing the phone keyboard must not drop the results), and when an edit empties the query (Hint).
- It ends on Cancel, on Escape when the query is empty, and when a result is tapped. Cancel and Escape clear the query. Ending by a result tap keeps the query. Focusing the field again does not bring its results back, for the same 3.2.1 reason; the next edit that leaves the query non-empty does, and so does Enter (the phone keyboard's Search key), an explicit submit. An edit that empties a kept query, and Enter on an empty field, start nothing.
- The clear (×) button empties the query and refocuses the input. Search stays active if it was (Hint), and stays ended if it was (a kept query after a result tap). It renders only when the query is non-empty.
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
- On today's page the controller: sets the active section the way a tab tap does (`setActive`, `pushState` to the section href, as `onSelect` in `CrewSections.tsx` does). The destination section mounts only after `CrewSectionTransition` (`AnimatePresence mode="wait"`, 220 ms, 0 under reduced motion) finishes the outgoing exit, so the controller waits for the target: it looks for `[data-search-target="<id>"]` inside the section body on each animation frame until found or 1500 ms pass. When found, it opens every `<details>` that contains the target and every `<details>` inside it, scrolls the element to the vertical center, moves focus to it (`tabIndex=-1`, `preventScroll`) and sets `data-search-reveal` for the highlight.
- Highlight: a 2px `warning-text` ring plus a `warning-bg` tint, held at full strength for the first half of the 1600 ms window, then faded (DESIGN.md §5.5, `REVEAL_HIGHLIGHT_MS`). The tint alone was not findable (1.10:1 on a light card), so the ring carries the cue; its contrast is pinned in `tests/styles/searchRevealCue.test.ts`. Under `prefers-reduced-motion: reduce`, the tint and the ring are held steady for 2000 ms and removed at once.
- If the target is not found within 1500 ms (the line changed or was removed by a refresh; ids are content-addressed, so a changed line never matches an old id), the section stays open at the top and a polite live region says "That line isn't on the page anymore."
- Back after a reveal behaves like Back after a tab tap today (the `popstate` handler in `CrewSections.tsx` re-resolves `?s=`). Search does not reopen. No history entry is pushed when search opens.

### 6.7 Report row

- Always the last block in Results and No match. Text per §10. The button opens `ReportModal` (`components/shared/ReportModal.tsx`, controlled `open`/`onOpenChange`, required `surface`, `surfaceId`, `showId`). `surface` and the surface-id scope come from the page's existing card report context (`CardReportContext`: `surface`, `surfaceIdScope`, `extraContext`, built in `lib/crew/cardReportContext.ts`), so preview-as reports keep the admin surface and `crewPreview` capture exactly as card reports do. `surfaceId` is built the way `CardReportTrigger` builds it, with the card id `search`. `showId` is the page's show id. `autocapture.viewerVisibleSection` is `"search"` and `autocapture.rawSnippet` is `Searched for "<query>"`.
- Not rendered when reporting is off for the page (`staticPreview`, where `CrewShell` passes `cardReport = null`).

### 6.8 Accessibility

- The field is `<input type="search">` with an accessible name, inside `role="search"`.
- A polite live region announces the result count 300 ms after typing stops ("4 results", "1 result", "No matches").
- Escape: clears a non-empty query; ends search on an empty one. Focus returns to the input after clear.
- Cancel ends search and moves focus to the input, which is then idle and empty, so focus never falls to the document body. That focus starts nothing (§6.2).
- Focus alone never starts search (§6.2, WCAG 3.2.1).
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
| I ↔ R | Instant (R is reached from I by an edit or Enter on a field that kept its query, or by pasting 2 or more characters; never by focus, §6.2). |
| I ↔ N | Instant (same paths as I ↔ R). |
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

`POST /api/show/[slug]/search-miss` (app/api/show/[slug]/search-miss/route.ts, new). Body `{ query: string }`. The caller is identified the way the crew page's other data APIs identify it (`app/api/show/[slug]/version/route.ts` is the model), not by the share token: `resolveShowPageAccess` must stay page-route only (`tests/cross-cutting/picker-resolver-callsite-contract.test.ts`, "resolveShowPageAccess remains page-route only and is not imported by app/api").

1. Same-origin check. `sameOrigin(req)` in `app/api/observe/client-error/route.ts` is module-local today; the plan moves it to a shared module both routes import, unchanged.
2. Rate limit FIRST, before any parsing or database work: an in-memory bucket per server instance of 120 requests per 60 s across all shows, and 30 per 60 s per slug. A request over either bucket returns 204 immediately; the first one in each window logs `CREW_SEARCH_MISS_RATE_CAPPED` (`log.warn`), later ones in that window log nothing. This bounds both the database load of anonymous callers (every request that reaches step 5 queries the database) and every warning this route or the resolver can emit, since both run only for admitted requests.
3. Content type must be JSON. The body is read with a 2 KB limit before JSON parsing; over the limit returns 400.
4. `query` trimmed, 2 to 100 characters; longer is cut to 100.
5. Access, in the version route's order: the slug maps to a show id through a service-role lookup that destructures `{ data, error }` and returns a typed `infra_error`; `isAdminSession(request)` (`lib/auth/isAdminSession.ts`) admits an admin, who is NOT logged; otherwise `resolvePickerSelection({ showId, cookie })` (`lib/auth/picker/resolvePickerSelection.ts`) reads the `__Host-fxav_picker` cookie, and only a valid selection for that show is logged. A crew viewer of the page always holds that selection (`Viewer` in `lib/data/getShowForViewer.ts` is `crew`, `admin` or `admin_preview`). Every other outcome, including an unknown slug, returns 204 without logging.
6. Emit: `log.info(message, fields)` (`lib/log/logger.ts`, `LogFields` in `lib/log/types.ts`) with `source: "crew-search-miss"`, `code: "CREW_SEARCH_NO_RESULTS"`, the reserved top-level `showId`, and `query` (which the logger places in `context`; the logger's sanitizer redacts emails). A `log.info` with a code persists to `app_events` (`lib/log/persist.ts`). No viewer identity, picker id, IP or user agent is recorded.
7. Returns 204 on every well-formed request.

### 7.3 Invariants for the route

- Invariant 9: every Supabase call destructures `{ data, error }`. An infra fault logs `CREW_SEARCH_MISS_INFRA_ERROR` (`log.warn`) at most once per rate window and returns 204. The access helpers in step 5 may log their own warnings on infra failure; step 2 bounds how often they can run. The file constructs the service-role client, so it joins `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` in `tests/auth/_metaInfraContract.test.ts` with the call inside `try`. It also joins `DATA_API_CONSUMERS` in `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` (data APIs never import Google session validators).
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
| Copy aria-labels, by `copy.kind` | `network`: Copy Wi-Fi network / `password`: Copy Wi-Fi password / `hotelConfirmation`: Copy hotel confirmation / `flightConfirmation`: Copy flight confirmation |
| Copy toasts, by `copy.kind` | `network`: Network name copied / `password`: Password copied / `hotelConfirmation` and `flightConfirmation`: Confirmation copied |
| Copy failed | Couldn't copy. Tap the line, then press and hold the text. |
| No match | No matches. Try dock, hotel, or a name. |
| Report row | Not what you need? / Tell Doug what's missing from the sheet. / Report |
| Live region | {n} results / 1 result / No matches |
| Reveal fallback (live region) | That line isn't on the page anymore. |

The no-match text and the report row match the redesign's copy table (redesign spec §9.1, §9.3).

## 11. Tests

### 11.1 Parity suite (INV-1)

tests/search/indexRenderParity.test.tsx (new). For each viewer in a fixture matrix, for each section the viewer can open: render the section component with RTL (the pattern in `tests/components/crew/sections/TodaySection.test.tsx`, `makeShowForViewer` from `tests/fixtures/showForViewer.ts`), build the index with `buildSearchIndex`, and assert INV-1 clauses 1 to 5.

The matrix must make every gate in §2.2 flip both ways at least once, and each case asserts its own premise (`tests/_shared/premise.ts`) on its own inputs: a crew viewer without transport, with transport, a lead with financials, a date-suppressed viewer, a viewer past each inline cap, a show with a room note and with more contacts than the Crew cap (Today-only lines), a show with named and unnamed diagrams, and an admin viewer. The section list is derived from `BASE_SECTION_IDS` plus `"budget"`, so a new section cannot be skipped.

### 11.2 Leak suite

tests/search/indexLeak.test.ts (new). The fixture plants a unique sentinel string in each datum the page is expected to hide (§2.2 and §1.4): another viewer's hotel confirmation, another crew member's flight, the transport row and a load-out run-of-show entry for a viewer without transport, the flight confirmation under `hideDates`, financial fields without entitlement, `client_contact`, a non-whitelisted `event_details` key, and a crew member and a contact past each inline cap. Hiddenness is PROVEN, not assumed: for each sentinel, the test first renders every section the viewer can open and asserts the sentinel appears in no text node and no accessible name (the premise, stated with `tests/_shared/premise.ts` on that case's own render). Only then does it assert the serialized index lacks the sentinel. A contact past the cap is only hidden if it has no notes and is not the primary contact, since Today renders every contact's notes under "Contact: <name>" and `selectPrimaryContact` considers every contact; the fixture builds that contact accordingly, and the premise catches a fixture that does not. A positive control plants the same kind of sentinel in a visible field and asserts it IS in both the render and the index, so neither search can pass by being broken.

### 11.3 Matcher suite

tests/search/match.test.ts (new):

- Normalization offsets map back to the display string.
- Each match kind, its weight and the length thresholds, including the boundaries (3, 4, 7, 8).
- Every alias group member is in normalized form and appears in exactly one group.
- `aliasNote` set only for alias-only matches, quoting the display span.
- Repeat removal (§5.5): a Today hit with a twin in another section is dropped; a Today hit without one is kept.
- A realistic query table over a fixture index, with the expected top hit: "wifi", "wfii", "internet", "wi-fi password", "dock", "loading", "ballroom video", "foh", "mics", "client laptop", "projection", "parking", "hotel confirmation", "strike". The expected entry ids are derived from the fixture, not typed.

### 11.4 Route suite

tests/api/searchMissRoute.test.ts (new): bad origin, bad content type, oversize body, short and long query, invalid share token, admin session, rate cap, infra error, and the success path asserting the persisted code with a sink spy that records only after observing `CREW_SEARCH_NO_RESULTS`.

### 11.5 Component and e2e

- Component tests for the search island: state machine (§6.2), chips and caps (§6.3), highlight and snippet (§6.4), copy success and failure (§6.5), miss debounce and once-per-query (§7.1).
- e2e tests/e2e/crew-search.spec.ts (new) on the seeded crew page (`tests/e2e/crew-page.spec.ts` setup): type "wifi", see the grouped results, tap the password row's copy button and see "Password copied", tap a row and land on the Venue section with the line in view and highlighted; a zero-hit query sends one POST after the debounce (intercepted). Runs at a phone and a wide viewport.

## 12. Documented limits

- **L1.** Cell colors and other sheet formatting are not searchable (D9).
- **L2.** Diagram contents and linked file contents are not searchable. Diagram names are, through the thumbnail's accessible name, when the file has a real name.
- **L3.** Rows a cap drops from the DOM (the Crew roster and contacts past their inline caps) are not on the page, so they are not in search. Rows a cap folds into a closed `<details>` are on the page and are indexed.
- **L4.** Phone numbers and emails shown only as call and email links (`PersonRow`) are not searchable. Phone numbers and emails that render as text are.
- **L11.** Two different lines in one section and region whose 32-bit hashes of their exact strings collide would be told apart only by the `~n` suffix in render order. The chance is negligible at page scale (hundreds of lines); a collision reveals a line from the same card.
- **L5.** A Today line whose text differs from its twin elsewhere (Tonight shows the sheet's raw check-in string; Travel shows it formatted) is not recognized as a repeat, so both appear, under Today and Travel. Both are real lines.
- **L10.** Diagrams past the gallery's first 12 thumbnails are not rendered until "Show all", so they are not indexed by name. The gallery card title still is.
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
