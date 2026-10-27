# Crew page redesign: one design language with the admin popup

**Status:** draft, autonomous ship approved by Eric 2026-10-26.
**Branch:** `feat/crew-page-redesign`.
**Mockups (canonical visual reference):** https://claude.ai/artifact/APJoqTo3Q2rx8gBEZPG8Fd, page "Round 2: built on C". Boards: `R2Home` (phone home), `R2Sheet` (phone section sheet), `R2Details` (shared section panels), `R2Wide` (wide window, left nav), `R2Search` (search, out of scope here, see §1.2). Board `R2WideAll` is a rejected alternative kept for reference.

## 0. Why

Crew open their page on a phone, on site, to find one fact from Doug's sheet: a call time, the dock, the wifi password, tonight's hotel, who to call. They need to find it fast and trust it. Most of the trust comes from Doug reviewing the sheet before publishing, so the admin show popup Doug reviews in should show the same section panels the crew see. Today the two surfaces look and behave differently: the admin popup is one scrolling column of grouped panels with a side rail, while the crew page is a set of tabs showing one section at a time. This spec gives both surfaces one design language and rebuilds the crew page around the "find one fact fast" moment.

## 1. Goals, non-goals, anti-goals

### Goals

- **G1. Phone home built for the on-site moment.** Header with the show name and a light/dark switch, a row of the show's days, a "pass" card for the selected day, the day's run of show, four quick facts, and a list of every other section.
- **G2. Phone sections open in a bottom sheet** over the home screen, so a crew member peeks at a section without losing their place.
- **G3. Wide windows use a left nav like the admin popup.** "Today" first, then the section groups; sections stack in one scrolling column; the nav tracks the section in view.
- **G4. One set of section panels.** The crew page and the admin popup render the same panel components for every shared section. The admin popup adds its admin-only chrome around them; the crew page adds nothing the admin cannot preview.
- **G5. Dark mode switch on the crew page.** Follows the device setting until the crew member picks one; the pick is remembered on that device.
- **G6. Consistent, plain copy** across both surfaces, from the copy audit in §9.

### Non-goals (each is its own project, already split off)

- **Search** (project 3, separate session). This spec reserves the header slot only; see §1.2.
- **Offline copy with a "last updated" note** (project 2, separate session).
- **Doug's per-show quick-facts picker** (project 4). This spec defines the default quick-facts set and its field identifiers so project 4 can extend it without reworking the component.
- Any change to what data a viewer can see, to parsing, sync, auth, or the database.

### Anti-goals (failure even if everything else works)

- The crew page and the admin popup drift apart again because each keeps its own copy of a panel.
- A fact that is one tap away today becomes two taps away.
- A crew member sees something the admin preview of that crew member does not show, or the reverse.
- An empty tile, an empty card, or a raw machine token anywhere on the crew page.

## 1.1 Resolved scope: do not relitigate

Ratified by Eric in the 2026-10-26 design conversation, recorded on the mockup canvas named above.

| # | Decision | Ratification |
|---|---|---|
| R1 | Build on round-1 option C (search and shortcuts first), reworked with patterns from travel and event apps (boarding pass, day strip, itinerary timeline, booking card). | Canvas page "Round 2: built on C"; Eric: "Round 2 is the direction." |
| R2 | Wide windows use a left nav like the admin popup. The everything-on-one-page grid was tried and rejected as too busy. | Boards `R2Wide` (chosen) vs `R2WideAll` (rejected). |
| R3 | On phones, sections open in a bottom sheet. | Eric: "a bottom sheet would work well for most of those items if not all"; board `R2Sheet`. |
| R4 | Quick facts start from a fixed default set; Doug can change them per show later (project 4). | Eric: "a default that's changeable by Doug if he wants to." |
| R5 | A light/dark switch lives in the crew page header. | Canvas comment thread "need a dark mode option". |
| R6 | The pass card and the day row are personal to the viewer. The admin popup shows them only while Doug previews the page as a specific crew member. | Playback accepted by Eric ("otherwise sounds good"). |
| R7 | The pass card stays dark in both themes so it remains the page's focal point. | Same playback. |
| R8 | Search, offline, and the quick-facts picker ship as separate projects, in parallel where practical. | Eric: "yes though we should work concurrently if practical." |
| R9 | Search is fuzzy and client-side with an alias list, never AI/RAG. Recorded here only because §1.2 reserves its slot. | Brainstorm decision, search session brief. |

## 1.2 Seams with the parallel projects

- **Search.** The header renders a search slot component that this project ships as nothing at all (no inert box). The search project replaces it. Placement contract: §4.1.
- **Offline.** The page shell exposes one slot above the day row for a status note. This project renders nothing there; the offline project fills it.
- **Quick-facts picker.** Quick facts are chosen from a typed, ordered list of fact identifiers (§4.5). This project hardcodes the default order; project 4 replaces the source of that order with a per-show setting.

## 2. Current state

Line numbers are drafting-time locators at base `370e1cc9c`; the file and symbol are the durable anchor.

### 2.1 Crew route and sections

- Section ids: `today | schedule | venue | travel | crew | gear | budget` (`lib/crew/resolveActiveSection.ts:1`, `SectionId`); `BASE_SECTION_IDS` excludes `budget` (`lib/crew/resolveActiveSection.ts:2`). An invalid `?s=`, or `budget` for a non-entitled viewer, resolves to `today` (`lib/crew/resolveActiveSection.ts:22-29`).
- `page.tsx` reads `s` (`app/show/[slug]/[shareToken]/page.tsx:186-189`), allow-lists it for redirects (`app/show/[slug]/[shareToken]/page.tsx:195`), and passes the raw value to the shell (`app/show/[slug]/[shareToken]/page.tsx:255`, `app/show/[slug]/[shareToken]/page.tsx:310`).
- `_CrewShell` renders **every** entitled section body on the server (`_CrewShell.tsx:364-444`, budget at `_CrewShell.tsx:449-454`) and hands them to `CrewSections` as `sectionNodes` (`_CrewShell.tsx:525-529`). The freshness invariant is written at `_CrewShell.tsx:336-341` and `components/crew/CrewSections.tsx:13-18`: the client toggles visibility only, never fetches or caches.
- `CrewSections`: a tab tap is `setActive` + `history.pushState` + scroll to top, no `router.push` (`CrewSections.tsx:75-86`); `popstate` resync (`CrewSections.tsx:88-95`); server-driven resync when `initialSection` changes (`CrewSections.tsx:65-73`).
- `CrewSubNav` renders controlled buttons (`components/crew/CrewSubNav.tsx:72-76`, `components/crew/CrewSubNav.tsx:114-127`): a top tab row at 720px and up, a fixed bottom bar below (phase 1 §4.7).
- Realtime: `ShowRealtimeBridge` mounts in the shell (`_CrewShell.tsx:532-534`) and calls a debounced `router.refresh()` (`components/realtime/ShowRealtimeBridge.tsx:272-284`).
- `SectionChipLink` is a `next/link` to a `?s=` URL with prefetch off (`components/crew/SectionChipLink.tsx:43-66`); `CrewSectionTransition` crossfades on section change, 220ms, 0ms under reduced motion (`components/crew/CrewSectionTransition.tsx:38-59`); `WrappedSection` contains a block's render throw and records it (`components/crew/WrappedSection.tsx:86-112`).

### 2.2 Right-now hero

- `RightNowHero` takes `{ context: RightNowContext }` only (`components/crew/RightNowHero.tsx:328-330`; type at `components/right-now/buildRightNowContext.ts:35-62`). It owns a client clock (`components/crew/RightNowHero.tsx:339`), a 60s tick plus `visibilitychange` (`components/crew/RightNowHero.tsx:349-361`) and calls `selectRightNowState` (`components/crew/RightNowHero.tsx:363-365`).
- States rendered: show day (`components/crew/RightNowHero.tsx:147-180`), travel in (`components/crew/RightNowHero.tsx:181-195`), set day (`components/crew/RightNowHero.tsx:196-208`), travel out (`components/crew/RightNowHero.tsx:209-223`), pre-travel countdown (`components/crew/RightNowHero.tsx:224-237`), not scheduled today (`components/crew/RightNowHero.tsx:238-256`), not scheduled yet (`components/crew/RightNowHero.tsx:257-272`), days done (`components/crew/RightNowHero.tsx:273-288`), post show (`components/crew/RightNowHero.tsx:289-299`), not confirmed (`components/crew/RightNowHero.tsx:300-307`), unknown (`components/crew/RightNowHero.tsx:308-315`), dateless (`components/crew/RightNowHero.tsx:316-324`). Degraded states drop stats and progress (`components/crew/RightNowHero.tsx:435-447`); stats cap at 3 (`components/crew/RightNowHero.tsx:576`).
- Travel-day stats come from `hotelReservations[0]` (`buildRightNowContext.ts:99`, `buildRightNowContext.ts:122-124`), including check-in and check-out dates for viewers whose dates are suppressed; they are hidden only at render (`RightNowHero.tsx:441`). §4.3 closes this: the pass's context never carries suppressed dates.

### 2.3 Data the new pieces read

- The projection type `ShowForViewer` (`lib/data/getShowForViewer.ts:143-321`).
- Per-day schedule: `ScheduleDay { entries, showStart, window }` and `AgendaEntry { start, title, room?, kind? }` (`lib/parser/types.ts:486-501`). The projection limits it to the viewer's days and returns none for suppressed viewers (`getShowForViewer.ts:804-833`).
- Key times: `KeyTimeAnchors = { set?, shows?: ShowAnchor[], strike? }` (`lib/crew/resolveKeyTimes.ts:18`); stage restriction gates Set and Strike (`lib/crew/resolveKeyTimes.ts:114-142`); per-day Show anchors (`lib/crew/resolveKeyTimes.ts:144-194`).
- No per-viewer call time and no doors time exist: the roster select has no such column (`getShowForViewer.ts:472`).
- Hotels: filtered to the viewer for non-admins (`getShowForViewer.ts:126-131`, `getShowForViewer.ts:784-787`); `check_in`/`check_out` are ISO dates and `confirmation_no` exists (`lib/parser/types.ts:256-265`).
- Wi-Fi: `event_details.internet`, split for display into `{ ssid, password, notes }` by `lib/crew/wifiDisplay.ts:45-49`, `lib/crew/wifiDisplay.ts:114`.
- Loading dock: `show.venue.loadingDock` (`lib/parser/types.ts:213`). Dress code: `event_details.dress_code` (`lib/parser/blocks/event.ts:112-115`). Lead: `roleFlags` contains `"LEAD"` (`getShowForViewer.ts:158`). Rooms: `name`, `set_time`, `show_time`, `strike_time` (`lib/parser/types.ts:270-276`).
- Transport legs are `{ stage, date, time, assigned_names }` with no origin or destination (`lib/parser/types.ts:293-298`); `transportTileVisible` is a render-time gate (`lib/visibility/scopeTiles.ts:180-246`).
- Financials: returned only when entitled (`getShowForViewer.ts:380-385`, `getShowForViewer.ts:746`; `financialsVisible`, `scopeTiles.ts:140-142`).
- Date suppression: `suppressesDates` (`lib/crew/dateSuppression.ts:70-72`; gated surfaces listed at `lib/crew/dateSuppression.ts:16-48`).
- Days: `aggregateDays` and `visibleShowDays` (`lib/crew/agendaDisplay.ts:114-156`); run-of-show helpers `scheduleEntriesForViewer`, `showStartDisplayEntry`, `RUN_OF_SHOW_DISPLAY_CAP`, `TITLE_TRUNCATE_AT` (same file).

### 2.4 Admin popup

- `ShowReviewSurface` (`components/admin/review/ShowReviewSurface.tsx`): props at `components/admin/review/ShowReviewSurface.tsx:176-225`; desktop rail `hidden w-60 ... lg:flex` (`components/admin/review/ShowReviewSurface.tsx:897`), grouped by `STEP3_SECTION_GROUPS`, with a sliding active indicator (`components/admin/review/ShowReviewSurface.tsx:763-798`); chip rail `lg:hidden` (`components/admin/review/ShowReviewSurface.tsx:1019`); scroll-spy `activeSectionFor` (`components/admin/review/ShowReviewSurface.tsx:97-115`) driven by a rAF-throttled scroll listener (`components/admin/review/ShowReviewSurface.tsx:623-729`), suppressed during a nav-click scroll (`components/admin/review/ShowReviewSurface.tsx:436-487`).
- Registry: `Step3SectionDef { id, label, group, Icon, railCount, hideDot?, render(d) }` (`components/admin/wizard/step3ReviewSections.tsx:4144-4162`), `STEP3_SECTION_GROUPS` (`components/admin/wizard/step3ReviewSections.tsx:4165-4173`), `step3Sections` (`components/admin/wizard/step3ReviewSections.tsx:5122-5366`). The restyle contract pins every `-breakdown-*` testid and empty-state string (`components/admin/wizard/step3ReviewSections.tsx:12-15`).
- Admin chrome is opt-in: `BreakdownSection` renders `ModalSectionChrome` only under a `Step3SectionChromeContext` provider, otherwise a plain eyebrow (`components/admin/wizard/step3ReviewSections.tsx:1155-1188`); `ModalSectionChrome` holds the sheet link, status pills, flag callout and section extras (`components/admin/wizard/step3ReviewSections.tsx:944-1150`).
- Each registry entry slices plain props off `SectionData` (e.g. `VenueBreakdown({ dfid, venue })`, `components/admin/wizard/step3ReviewSections.tsx:1312`, `components/admin/wizard/step3ReviewSections.tsx:5130`); `SectionData` is defined in `components/admin/review/sectionData.ts:27-104`, mapped from the snapshot by `components/admin/review/publishedAdapter.ts:44-113`.
- Shell: `ReviewModalShell` is a bottom sheet below 640px and a centred panel above (`components/admin/review/ReviewModalShell.tsx:3-24`), with drag-dismiss constants `DRAG_DISMISS_THRESHOLD_PX = 110` and `DRAG_SLOP_PX = 6` (`components/admin/review/ReviewModalShell.tsx:47`, `components/admin/review/ReviewModalShell.tsx:49`), background inert (`components/admin/review/ReviewModalShell.tsx:188`), focus trap (`components/admin/review/ReviewModalShell.tsx:216`), scroll lock (`components/admin/review/ReviewModalShell.tsx:241-244`). It is admin-coupled (`AdminAnnounceProvider`, `PopoverHostContext`, `components/admin/review/ReviewModalShell.tsx:37-38`).

### 2.5 Preview as crew

`app/admin/show/[slug]/preview/[crewId]/page.tsx` loads `getShowForViewer(showId, { kind: "admin_preview", crewMemberId })` (`app/admin/show/[slug]/preview/[crewId]/page.tsx:200-203`) and renders `PreviewBanner` above the same `CrewShell` crew see (`app/admin/show/[slug]/preview/[crewId]/page.tsx:227-243`). Every change in this spec reaches the preview route through `CrewShell`, with no preview-specific work.

### 2.6 Theme

Stored in `localStorage` under `fxav-theme` (`components/layout/useAppliedTheme.ts:31`); follows the OS while unset (`components/layout/useAppliedTheme.ts:101-117`); `setTheme` at `components/layout/useAppliedTheme.ts:120-139`; a no-flash script applies it before paint (`app/layout.tsx:52`, `app/layout.tsx:63`). `ThemeToggle` (`components/layout/ThemeToggle.tsx:64-144`) is mounted in the crew `Header` only for viewers without an identity (`components/layout/Header.tsx:141`); identified viewers get a menu checkbox in `components/auth/AvatarMenu.tsx:438-442`. The dark token block uses an unscoped `[data-theme="dark"]` selector (`app/globals.css:487`).

### 2.7 Design system

`DESIGN.md` breakpoints are 640 / 1024 / 1200 (`DESIGN.md:833`). It treats modals as a last resort (`DESIGN.md:702`, `DESIGN.md:912`) and warns against a dense sidebar nav (`DESIGN.md:915`). This spec amends both points for the crew page (§3.3).

## 3. Modes and layout

### 3.1 Modes

Two layout modes, switched at **1024px**, the breakpoint where the admin rail appears (`lg:` at `ShowReviewSurface.tsx:897`; `DESIGN.md:833`).

- **Compact (below 1024px):** home screen (§4.1 to §4.6), sections in a bottom sheet (§5.2).
- **Wide (1024px and up):** left nav plus one scrolling column: the Today block (day row, pass, run of show, quick facts) first, then every section stacked in registry order (§5.3).

The admin popup keeps its own shell and rail. It changes only in that its section bodies are the shared panels (§6).

### 3.2 Mode boundaries

| Element | Compact | Wide | Admin popup |
|---|---|---|---|
| Header: show name, theme switch, search slot | ✓ | ✓ | ✗ (admin header) |
| Day row (§4.2) | ✓ | ✓, top of Today | ✗ |
| Pass (§4.3) | ✓ | ✓ | ✗ |
| Run of show card (§4.4) | ✓ | ✓ | ✗ (its Agenda section shows the full agenda) |
| Quick facts (§4.5) | ✓ | ✓, beside the run of show | ✗ |
| Show notes card (§6.2) | ✓, below quick facts | ✓, in the Today block | ✗ |
| "All sections" list (§4.6) | ✓ | ✗ | ✗ |
| Left nav (§5.3) | ✗ | ✓ | ✗ (its own rail, unchanged) |
| Section panels (§6) | inside the sheet | stacked inline | stacked inline, unchanged |
| `CrewSubNav` tabs and bottom bar | removed | removed | n/a |
| Preview banner | ✓ when previewing | ✓ when previewing | n/a |

Both modes are present in one DOM; CSS switches layout at the breakpoint (the established dual-render pattern, phase 1 §4.7). Behavior that differs by mode (sheet focus trap, history entries) reads `matchMedia("(min-width: 1024px)")` on the client and re-evaluates on change (compound rows in §7).

### 3.3 `DESIGN.md` amendments (same PR)

- **Crew section sheet.** The bottom sheet is the compact crew page's primary way to open a section, replacing the tab bar (R3). It is not a confirmation modal; `DESIGN.md`'s last-resort rule for modals (`DESIGN.md:702`, `DESIGN.md:912`) gets a named exception for it.
- **Crew left nav.** The wide-mode nav mirrors the admin rail: one level, at most 12 items in at most 6 groups, no counts (§9.2). It is recorded as the crew page's wide navigation so the dense-sidebar warning (`DESIGN.md:915`) is not read against it.

## 4. Components

### 4.1 Header

- Eyebrow: client name and venue name, joined by " · ", each omitted when sentinel-hidden. Title (`h1`): the show title. The existing status pill and identity chip stay where `Header` renders them today.
- **Theme switch: always visible** in the crew header, for viewers with and without an identity. `components/layout/Header.tsx:141` mounts `ThemeToggle` only for identity-less viewers today; this project mounts it for every crew-page viewer. The `AvatarMenu` checkbox (`AvatarMenu.tsx:438-442`) stays; both controls drive the same `useAppliedTheme` state, so they always agree.
- **Search slot:** a `CrewSearchSlot` component that this project renders as nothing at all (§1.2). Its position is fixed now so the search project changes no layout: compact, a full-width row under the title; wide, between the title and the identity chip.
- **Status slot** for the offline project: an empty element directly under the header (§1.2).

### 4.2 Day row

A row of the days this viewer may see, above the pass. Selecting a day re-points the pass (§4.3) and the run of show (§4.4) at that day. Nothing else on the page changes with the selection.

- **Day set (single source).** `aggregateDays(show.dates)` (`lib/crew/agendaDisplay.ts`, `aggregateDays`) filtered through the same date restriction the Schedule section applies (`visibleShowDays`, same file, the "SINGLE SOURCE" contract in its doc comment). The row never computes its own day list. Travel and set days pass through the same filter the Schedule section applies to them (cited in §2).
- **Privacy floor.** When the viewer's restriction suppresses dates (`suppressesDates`, `lib/crew/dateSuppression.ts`, the `unknown_asterisk` contract of phase 1 §4.2: "zero day cards, the viewer must not be able to infer which show days exist"), the row is **not rendered at all**. Same when the day set is empty.
- **Default selection.** Today's ISO date in the show timezone (`todayIsoInShowTimezone` / `resolveShowTimezone`, phase 1 §4.16) when it is in the day set. Otherwise the first day in the set after today. Otherwise the last day in the set. Computed on the client from the same clock the pass uses (§4.3), so a page left open overnight moves its default at midnight only if the viewer has not picked a day.
- **Selection is client state only.** Not written to the URL. A reload returns to the default. (The URL already carries the open section, §5; two independent URL params for one screen is more than the job needs.)
- **Button content.** Weekday ("Sat") or "Today", the day of month ("13"), and a short phase label: "Travel in", "Load in", "Show day 1", "Travel out", or "Travel in, load in" for a combined day. Accessible name per §9.4. `aria-pressed` on the selected button.
- **Cap.** Up to 5 days fit at 390px. More than 5 scroll horizontally with scroll snapping, and the selected day is scrolled into view on mount. No hard cap: a 30-day tour scrolls.
- **Tap target.** Each day button is at least 44px tall and 64px wide (`min-h-tap-min`).

### 4.3 Pass

The dark card for the selected day. It replaces `RightNowHero` (`components/crew/RightNowHero.tsx`) on the crew page and keeps all of its state machinery: the same `selectRightNowState` states, the minute tick, the `visibilitychange` refresh, the `lastGood` morph and the 66-pair transition table (phase 1 §4.3, §4.16). The pass is a re-skin plus a day selector, not a new state machine.

- **When the selected day is today:** the pass body is driven by the live state exactly as `RightNowHero` is today (eyebrow, lead, progress, stats), re-skinned into the pass layout below.
- **When another day is selected:** the pass shows that day's static facts (phase label, the day's anchor time, the fact grid). No countdown, no live dot.
- **Layout (top to bottom):**
  1. Eyebrow row: left, the day label ("Show day 1 of 2", "Load in", "Travel in", "Travel out"); right, the viewer's role from the roster ("You, A1") when the role is non-empty.
  2. Status line (selected day is today only): the countdown "Show starts in 25 min" when the day's `showStart` parses as a clock time and is within the next 3 hours; "Show started at 7:45 AM" once it has passed. Unparseable or absent `showStart` renders no status line (documented limit L1).
  3. Big time: the day's anchor. Show day: "Show" + `showStart` (from `KeyTimeAnchors.shows` for that date, `lib/crew/resolveKeyTimes.ts`). Load-in day: "Load in" + the Set anchor. Last show day additionally shows "Strike" + the strike anchor at the right edge. Travel days have no big time: hotel check-in and check-out are dates, never times (phase 1 watchpoint 3).
  4. Progress segments: show days only, one segment per show day, as today.
  5. Perforated divider, then the fact grid: up to 6 cells in a 3-column grid. Candidates in order: "Room" (the deterministic GS room per `compareRooms`, `lib/crew/resolveKeyTimes.ts`), "Your lead", "Hotel tonight" (the viewer's reservation covering that night), "Dress code", "Strike" (only when not already the big time), "Load in" (only on travel-in days when a Set anchor exists). A cell with no value is omitted. Zero cells omits the divider and the grid. Each value is one line, truncated with an ellipsis. The full value is one tap away in its section.
- **Degraded states** (`dateless`, `unknown`, `viewer_unconfirmed`): eyebrow and lead only, using the §9.3 copy. No times, no grid, no day row (the row is hidden for these, §4.2).
- **Not scheduled on the selected day** (explicit restriction, day outside the viewer's days but inside the row because it is a travel or set day the Schedule shows them): lead "You're not scheduled this day." plus the next day line from §9.3.
- **Color.** Dark in both themes (R7). It uses the dark-theme surface and text tokens directly, so the theme switch never changes it.

### 4.4 Run of show

The selected day's run of show, below the pass.

- **Entries.** The selected day's `ScheduleDay.entries` through `scheduleEntriesForViewer(entries, { transportVisible })` (`lib/crew/agendaDisplay.ts`), so a load-out entry stays hidden from viewers who cannot see transport. A bare show day with only a `showStart` gets the synthetic "Show Start" row from `showStartDisplayEntry` (same file). Nothing else is synthesized.
- **Cap.** 6 rows on the home screen. Beyond 6, a "Full schedule" link opens the Schedule section (sheet on compact, scroll on wide). The Schedule section keeps its own cap, `RUN_OF_SHOW_DISPLAY_CAP` (`lib/crew/agendaDisplay.ts`). Titles truncate at `TITLE_TRUNCATE_AT` (same file), as they do today.
- **"Next" marker.** Only when the selected day is today. It sits on the first entry whose start parses as a clock time at or after now. Unparseable starts never get the marker (documented limit L1).
- **Empty.** No displayable entries: the card is omitted.

### 4.5 Quick facts

Up to four small tiles under the run of show (compact) or beside it (wide). They answer the most-hunted facts without opening anything.

- **Identifiers.** A closed, ordered union `QuickFactId = "wifi" | "hotel" | "dock" | "contact" | "parking" | "dressCode" | "address"`, exported from a new pure module lib/crew/quickFacts.ts (new) together with `DEFAULT_QUICK_FACT_ORDER: readonly QuickFactId[]` in exactly that order. Project 4 replaces the source of the order with a per-show setting. This project hardcodes the default.
- **Selection.** `selectQuickFacts(order, data, viewer)` walks the order and keeps the first 4 ids that resolve to a value for this viewer. Pure function, unit-tested, no React.
- **Sources (each reuses the field and gate the live page already uses, cited in §2):**

| Id | Label | Value | Action | Gate |
|---|---|---|---|---|
| `wifi` | "Wi-Fi" | the Venue section's own Wi-Fi display: network and password as two labeled lines when `lib/crew/wifiDisplay.ts` splits them, otherwise its notes text | Copy the password when present ("Copy Wi-Fi password"), otherwise copy the whole text ("Copy Wi-Fi details") | sentinel hiding (`shouldHideGenericOptional`) |
| `hotel` | "Hotel" | the viewer's reservation for the selected night per `reservationForNight` (below): hotel name, plus "Confirmation" and its `confirmation_no` when present | Copy the confirmation number | the projection already returns only the viewer's own reservations to non-admins (`getShowForViewer` hotel filter, §2) |
| `dock` | "Loading dock" | the venue loading dock text | none | sentinel hiding |
| `contact` | "Who to call" | `selectPrimaryContact(contacts)` name and kind label | Call (and Text when a phone exists) | client contact never eligible (phase 1 §4.2) |
| `parking` | "Parking" | transport parking text | none | `transportTileVisible` (phase 1 §4.13a) |
| `dressCode` | "Dress code" | the dress code text Today shows | none | sentinel hiding |
| `address` | "Venue" | venue name and address | Directions link, only when the map URL passes `isParseableUrl` | sentinel hiding |

- **Wi-Fi reuses the Venue split.** `event_details.internet` is one free-text field; `lib/crew/wifiDisplay.ts` already splits it into network, password and notes for the Venue section. The tile calls the same function, so the tile and the Venue section can never disagree. When the split finds no password, the tile shows the text and copies all of it (documented limit L2).
- **`reservationForNight(reservations, isoDate)`.** New pure helper in lib/crew/quickFacts.ts (new): the reservation whose `check_in <= isoDate < check_out`, ties broken by `ordinal`. No match returns null and the tile (and the pass's "Hotel tonight" cell) is omitted. It never falls back to `reservations[0]`, which is what today's "Tonight" card does (`TodaySection`, cited in §2) and which can name the wrong hotel on a multi-hotel tour. When the viewer's dates are suppressed (`suppressesDates`), the helper is not called and both the tile and the cell are omitted.
- **Layout.** A 2-column grid. Three tiles: the third spans both columns. One tile spans both columns. Zero tiles: the block and its heading are omitted (§9.3).
- **Copy.** `navigator.clipboard.writeText`. Success shows the "Copied" toast for 2 seconds. Failure (no clipboard API, permission denied, insecure context) shows the §9.3 failure toast, and the value text stays selectable (`select-text`) so press-and-hold copying works. The toast is a polite live region.
- **Truncation.** Values wrap to at most 3 lines, then ellipsis. The full text is in the section the fact comes from.

### 4.6 "All sections" list (compact only)

A single card listing every section this viewer may open, in registry order (§5.1), one row each: icon, label, a one-line peek, a chevron. Tapping a row opens that section's sheet (§5.2).

- **Peek line.** A short, data-derived summary per section, computed server-side by a pure `sectionPeek(id, data, viewer)` in lib/crew/sectionPeek.ts (new) (e.g. Venue: venue name; Crew: "6 people"; Pack list: "14 cases"; Transport: the next leg's stage and time). A section whose peek resolves to nothing shows no peek line, never placeholder text. Peeks obey every gate the section itself obeys, because they are computed from the same gated inputs.
- **Membership.** Exactly the sections the viewer is entitled to and that have content (§5.1); the same set the wide nav lists. One source: both read `crewSectionsFor(data, viewer)`.
- **Rows** are links (`<a href="?s=<id>">`), so they work before hydration and with JavaScript off (the server renders the sheet open for `?s=`).

## 5. Navigation and URL

### 5.1 One section registry

A new module lib/showSections/registry.ts (new) holds the section metadata both surfaces read: `{ id, label, group, icon }` for `venue`, `event`, `crew`, `contacts`, `schedule`, `agenda`, `hotels`, `transport`, `rooms`, `packlist`, `billing`, in that order, with the six groups of `STEP3_SECTION_GROUPS` minus "Checks" ("The show", "People", "Schedule", "Logistics", "Gear", "Money"). Labels are the admin labels verbatim ("Rooms & scope", "Billing & docs", "Crew schedule", ...), so admin tests that pin them keep passing. `step3ReviewSections.tsx` reads its shared entries' `label`/`group`/`Icon` from this module; its admin-only entries (warnings, report) and its `render`/`railCount`/`hideDot` stay where they are.

`crewSectionsFor(data, viewer)` (pure, lib/crew/crewSections.ts (new)) returns the registry entries this viewer gets, applying the gates the live page applies today: `billing` only when `financialsVisible`; `transport` only when `transportTileVisible` or the viewer has their own flight; `packlist` only when `isPackListVisibleToday`; `agenda` only when the viewer has run-of-show entries or agenda links; any section whose shared panel reports no content is dropped (the section-level empty state of phase 1 §4.2 becomes "not listed").

### 5.2 Compact: the section sheet

- **URL.** `?s=<id>` means "the sheet is open on `<id>`". The server renders it open on first load, so a deep link or a refresh lands with the sheet up.
- **Legacy ids.** Old links keep working through an alias map applied wherever `s` is resolved (`resolveActiveSection` and the redirect allow-list at `page.tsx:195`): `today` → home (no sheet), `schedule` → `schedule`, `venue` → `venue`, `travel` → `hotels`, `crew` → `crew`, `gear` → `rooms`, `budget` → `billing`. A non-entitled or unknown id resolves to home, exactly as an invalid `s` resolves to `today` now. `?s=` and `?gate=` stay independent through every auth and picker redirect (phase 1 §4.1a).
- **Opening** from the "All sections" list or an in-page link: `history.pushState` with the new `s` and a history-state marker `{ crewSheet: true }`, the same no-router mechanism `CrewSections` uses (`CrewSections.tsx:75-86`).
- **Closing.** Close button, scrim tap, Esc, swipe down past the threshold, or browser Back. If the current history entry carries the marker, the close calls `history.back()` (so Back and the close button land on the same entry). If not (deep link or refresh), it calls `history.replaceState` without `s`. A `popstate` that removes `s` closes the sheet; one that adds `s` opens it.
- **Drag to dismiss** uses the same thresholds as the admin sheet. `DRAG_DISMISS_THRESHOLD_PX` and `DRAG_SLOP_PX` move from `ReviewModalShell.tsx:47-49` to a shared constants module that both import; their values do not change.
- **Modal behavior.** Focus moves to the sheet title on open and back to the row that opened it on close; focus is trapped inside; the page behind is `inert`; body scroll is locked. The sheet is a `role="dialog"` with `aria-modal="true"` and `aria-labelledby` its title.
- **Width.** Full width below 640px; from 640px up to the wide breakpoint, centred at the bottom with the existing panel max width (`DESIGN.md:684`).
- **Mechanism is UNRATIFIED** until a spike: Next 16's handling of a raw `pushState` carrying a state object alongside `useSearchParams`, and `popstate` ordering against the existing resync in `CrewSections.tsx:65-73`. The plan's first task is that spike (a throwaway route plus a Playwright probe of open, close, Back, deep link, refresh). If the spike shows the history-state marker is lost or reordered, the fallback is: close always uses `replaceState`, and Back is honored through `popstate` alone.

### 5.3 Wide: left nav and one column

- The nav is 240px wide, sticky under the header, listing "Today" then the groups and their sections from `crewSectionsFor` (same set as §4.6). No counts, no status dots.
- Sections stack in registry order below the Today block, each with an anchor `id` and a `scroll-margin-top` of the header height (§8).
- **Nav click:** smooth-scroll to the section (instant under reduced motion), move focus to its heading (`tabindex="-1"`), and `history.replaceState` the `s` param, never `pushState`, so scrolling around does not fill the history.
- **Scroll-spy:** the active nav item follows the section in view using the admin rule (`activeSectionFor`, `ShowReviewSurface.tsx:97-115`), extracted into a shared pure function both surfaces call, with the same offset; it is suppressed while a nav-click scroll runs, as the admin rail does (`ShowReviewSurface.tsx:436-487`).
- **Deep link `?s=<id>`** on load scrolls to that section after hydration.

## 6. Shared section panels

### 6.1 Where the shared bodies live

The admin bodies cannot be imported by the crew page as they are. `components/admin/wizard/step3ReviewSections.tsx` is a `"use client"` module (`components/admin/wizard/step3ReviewSections.tsx:1`) that imports admin server actions and admin API callers (e.g. `CrewRowActions`, `RescanSheetButton`, `VenueMapTile`, the data-quality warning controls; imports at `components/admin/wizard/step3ReviewSections.tsx:94-187`), and every body reads `Step3SectionChromeContext` through `BreakdownSection` (`components/admin/wizard/step3ReviewSections.tsx:1155-1188`). Importing it would ship admin code in the crew bundle.

So each shared body moves to a new neutral directory, components/show-panels/ (new):

- No module-level `"use client"`, no context reads, no imports from `components/admin/**`, `lib/admin/**`, or any server-only module. A structural test walks the directory and fails on any of these.
- Each body takes plain props: the section's data **already gated by the caller**, presentation props listed in §6.2, a `testIdPrefix`, and `ReactNode` slots for surface-specific extras.
- Interactive leaves (a "Show all" toggle, a copy button) are small `"use client"` components inside the same directory, under the same import ban.
- **Admin:** each `step3Sections` entry's `render` calls the shared body with the admin props, passing `testIdPrefix = wizard-step3-card-${dfid}-breakdown` and the admin-only pieces through slots. `BreakdownSection` and `ModalSectionChrome` stay in `step3ReviewSections.tsx` and wrap the shared body. The rendered DOM is unchanged (§12, PR B invariant).
- **Crew:** each section renders a crew panel card (the admin card's surface, border, radius, padding and shadow tokens, and its 28px icon chip with an `h3` label) around the shared body, inside `WrappedSection` so a render throw stays contained and recorded as today. A parity test compares the crew card's classes with the admin card's.
- **Sentinels.** The admin shows parsed values as parsed, including sentinels, muted; the crew page hides them (`shouldHideGenericOptional`, `lib/visibility/emptyState.ts:79`). Every shared body takes `sentinels: "show" | "hide"`.

### 6.2 Per-section decisions

Admin bodies and crew equivalents as compared at base `370e1cc9c`. "Crew keeps" lists the existing crew contracts the crew props must preserve; each is pinned by an existing test that migrates (§12).

| Section | Shared body (from) | Crew props and blocks | Admin props and slots | Crew keeps |
|---|---|---|---|---|
| `venue` | Where core of `VenueBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:1312`) | Maps link only when `isParseableUrl`; crew-only blocks below the body: Facilities (dock; parking behind `transportTileVisible`; Wi-Fi split with password copy; power), Status (COI with `data-testid="coi-status"`; venue notes) | `VenueMapTile` slot | COI stays visible to all crew here. Moving it to Billing would hide it from non-leads. |
| `event` | `EventDetailsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:2305`) | `keys`: the crew subset `CREW_TECH_SPEC_KEYS` (`lib/crew/eventDetailsSpecs.ts`) plus dress code and keynote; opening reel text through `stripOpeningReelText`, with the `OpeningReelVideo` player as a crew slot | all keys, Yes/No chips, attention from props | The reel URL strip (no `https://`, `drive.google.com`, `docs.google.com` in crew DOM). Wi-Fi and power stay in Venue. |
| `crew` | `CrewBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:1706`) | `cap` = `CREW_INLINE_CAP` with the crew overflow copy; "You", "Lead" and partial-attendance chips (humanized); call and text actions only when `digitsOnly(phone)` is non-empty | `cap` = admin `CREW_CAP` with its copy; `rowActions` slot (`CrewRowActions`); `underRow` slot (attention stack) | Overflow derives from `length - cap`. |
| `contacts` | `ContactsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:1232`) | `includeClient: false`; `cap` = `CONTACTS_INLINE_CAP`; `showNotes: true` | `includeClient: true`; no cap; `showNotes: false` | The client contact never reaches the crew DOM. |
| `schedule` | `ScheduleDayRow` (`components/admin/wizard/step3ReviewSections.tsx:1911`) | today pin; entries via `scheduleEntriesForViewer`; Set-day meta; `RUN_OF_SHOW_DISPLAY_CAP`; the key-times card stays above the days | admin entries cap with "Show all M times" | The day list itself stays per surface: the crew list keeps the date-restriction privacy contract (placeholder only for suppressed viewers, zero day rows). |
| `agenda` | `AgendaScheduleBlock`, already shared (`components/admin/wizard/step3ReviewSections.tsx:3755`) | wrapper unchanged (`AgendaEmbed` + viewer days) | wrappers unchanged | Hidden for suppressed viewers. |
| `hotels` | `HotelCard` (`components/admin/wizard/step3ReviewSections.tsx:2889`) | `showConfirmation: true`, `showNotes: true`, `showGuests: false`, `hideDates` when `suppressesDates`; ordered by `ordinal` | `showConfirmation: false`, `showNotes: false`, `showGuests: true`; `HOTELS_CAP` | Each surface keeps exactly the fields it shows today. The projection already limits crew to their own reservations. |
| `transport` | `TransportBody` (`components/admin/wizard/step3ReviewSections.tsx:1531`) | `hideDates` when suppressed; `linkifyContacts: true` (tap to call the driver; same data the assigned viewer already sees as text); crew-only block above the body: "Your flight" | `linkifyContacts: true` | The caller renders the section only when `transportTileVisible` or the viewer has a flight; the body never decides visibility. |
| `rooms` | `RoomsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:2125`) | crew adopts the admin's room-first layout; `emphasize`: the viewer's disciplines get the "Your scope" label inside each room; `dropEmpty: true` (no "Not specified" rows); crew-only block below: Diagrams (the existing crew diagrams logic, embedded-first, MIME allowlist) | `ROOMS_CAP`; all five disciplines; diagrams sub-block as today | Every discipline stays visible to everyone; only emphasis differs (phase 1 D-5). Distinct discipline icons stay. |
| `packlist` | `PackListBreakdown` case list (`components/admin/wizard/step3ReviewSections.tsx:2529`) | `itemsCap: none`, `showRawSnippet: true`, `numbered: true` | items cap with toggle; archived-tab affordances as a slot | The caller renders it only when `isPackListVisibleToday`; the 12-case cap and overflow stay. |
| `billing` | key-value rows of `OpsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:1640`) | PO, Proposal, Invoice, Invoice notes | all five rows including COI | Rendered only when `financialsVisible` and the projection returned financials. |

**Crew-only content that has no admin section stays crew-only:**

- **Show notes** (the five-source aggregation of today's Today section, 8 sources, 280-character truncation) stay on the home screen as a card below quick facts (compact) and in the Today block (wide). Removing them from the first screen would push them one tap further away (anti-goal).
- **"Your flight"** sits at the top of Transport.
- **COI** sits in Venue (row above).
- **Diagrams** sit in Rooms (row above).

### 6.3 Rollout of the shared bodies

The sections whose crew layout keeps its structure (`venue`, `crew`, `contacts`, `schedule`, `agenda`, `hotels`, `transport`, `billing`) move in PR B. The sections where the crew page adopts the admin's structure (`event`, `rooms`, `packlist`) move in PR C, because each reorganizes crew content and migrates the most crew tests.

## 6A. Documented limits

Conservative behavior plus a visible fallback, not defects. A review finding that restates one of these without a probe showing silent wrong output files here, not as a round.

- **L1. Free-text times.** The countdown (§4.3) and the "Next" marker (§4.4) need a start time that parses as a clock time. Sheet times are free text ("7:45 AM", "10/20 @ TBD", "after lunch"). Anything that does not parse gets no countdown and no marker; the time still renders as written. Never a guessed time.
- **L2. Wi-Fi text that `wifiDisplay` cannot split** shows as one block and copies whole. The split heuristic itself is unchanged by this project.
- **L3. Hotel check-in and check-out are dates.** No clock times on travel days.
- **L4. No labeled crew call or doors time.** The per-day anchor is labeled "Show" (§9.1).
- **L5. Day selection resets on reload** (§4.2).
- **L6. The header search slot is empty** until the search project ships (§1.2).

## 7. Transition inventory

Every state change gets a treatment. Durations come from the existing tokens (`--duration-fast`, `--duration-normal`, `--ease-out-quart`, cited in §2); reduced motion collapses every row to instant through those tokens.

| From → To | Treatment |
|---|---|
| Sheet closed → open | Sheet slides up from the bottom edge, scrim fades in, `--duration-normal`, `--ease-out-quart`. |
| Sheet open → closed (close button, scrim tap, Esc, swipe down, browser Back) | Reverse of the above, same duration. Every close path runs the same exit. |
| Sheet open, dragging → released past the close threshold | Continues to closed with the exit animation. |
| Sheet open, dragging → released before the threshold | Springs back to open, `--duration-fast`. |
| Sheet open on section A → section B (an in-sheet link to another section) | Sheet stays up; body crossfades, `--duration-normal`; scroll position resets to top. |
| Day A selected → day B | Pass body and run-of-show card crossfade, `--duration-normal`; the pass keeps its height during the fade (§8). |
| Pass, today: live state X → live state Y | Existing 66-pair `transitionTreatment` table, unchanged. |
| Pass, today (live) → another day (static), and back | Crossfade, `--duration-normal`. |
| Day button unselected ↔ selected | Background and text color, `--duration-fast`. |
| Wide nav item inactive ↔ active | Accent bar moves to the active item, `--duration-fast` (matching the admin rail). |
| Copy toast hidden → shown → hidden | Fade and 4px rise in, `--duration-fast`; holds 2 s; fades out, `--duration-fast`. |
| Light ↔ dark theme | Instant (CSS variable swap). The pass does not change. |
| Quick fact, section card, run-of-show row present ↔ omitted | Instant. Only a server render changes these. |

**Compound transitions.**

| While | Then | Treatment |
|---|---|---|
| Sheet open | Realtime refresh re-renders the page (`ShowRealtimeBridge` → `router.refresh()`) | Sheet stays open on the same section; its body updates in place with no animation. The open section survives because the controller stays mounted (the freshness invariant cited in §2). |
| Sheet open | Viewport crosses into wide (rotation, window resize) | Sheet is dismissed without animation; the page shows the wide layout scrolled to that section; the URL keeps `?s=`. |
| Sheet mid-drag | Viewport crosses into wide | Drag is cancelled, then the row above applies. |
| Wide, scrolled to section A | Viewport crosses into compact | Home screen at the top; no sheet opens automatically; the URL drops `?s=` with `replaceState`. |
| Day crossfade running | Another day tapped | The second selection wins; the running fade is replaced, never queued. |
| Sheet open | Theme switched | Not reachable: the header is behind the scrim and inert while the sheet is open. |

## 8. Dimensional invariants

Tailwind v4 here does not stretch flex children by default; each relationship below names the class that guarantees it, and the plan asserts each with `getBoundingClientRect()` in a real browser.

1. **Day row.** Up to 5 days: a grid with one equal track per day (`grid` + `grid-cols-[repeat(N,minmax(0,1fr))]`), every button the full row height (`items-stretch` on the row, `h-full` on the button). More than 5: a flex row with `min-w-16` buttons and `snap-x`, buttons still `self-stretch`.
2. **Pass.** The card keeps a fixed minimum height across day crossfades and live-state swaps (the existing `--spacing-right-now-min-h`, carried from `RightNowHero`). The fact grid is `grid-cols-3`, every cell `min-w-0` so values truncate instead of widening the column.
3. **Quick facts.** `grid-cols-2` with `items-stretch`; every tile `h-full`, so tiles in one row share a height. A spanning tile is `col-span-2`.
4. **Section sheet (compact).** Fixed to the viewport bottom, `max-h-[90dvh]`, a flex column: the header row is `shrink-0`, the body is `flex-1 min-h-0 overflow-y-auto`. The sheet never grows past 90% of the dynamic viewport height, and its body scrolls inside it.
5. **Wide layout.** The nav is `w-60 shrink-0`, sticky under the header, its height the viewport minus the header (`h-[calc(100dvh-var(--crew-header-h))]`) with its own scroll. The content column is `flex-1 min-w-0`.
6. **Header.** One fixed height token `--crew-header-h`, used by the header itself, the wide nav offset and the scroll-margin of every section anchor (so a nav jump never lands a heading under the header).

## 9. Copy

Source: a read-only copy audit of the round-2 boards against `PRODUCT.md`, `DESIGN.md`, the live crew components and `lib/messages/catalog.ts` (2026-10-26). Where the audit's suggestion conflicts with what the data can honestly say, the data wins and the row says why.

### 9.1 One name per thing (both surfaces)

| Thing | Name used everywhere | Replaces | Note |
|---|---|---|---|
| The selected day's card | (no visible title; region label "Your day, Sun Jun 14") | "Your day" | Region label only, for screen readers. |
| A show day | "Show day 1" (day row: "Show day 1"; pass eyebrow: "Show day 1 of 2") | "Show 1", "Show day 1 of 2" mixed | |
| The set day | "Load in" | "Set", "Travel, set" | Day row label for a combined travel/set day: "Travel in, load in". |
| Per-day first time on a show day | "Show" | mock's "Your call" | Audit suggested "Your call"; overridden. The only per-day time is the parser's first-call anchor `ScheduleDay.showStart` (`lib/parser/types.ts`, `ScheduleDay`), which the live page labels "Show" (`lib/crew/resolveKeyTimes.ts`, `KeyTimeAnchors.shows`). A labeled crew call time has no source (phase 1 spec watchpoint 2). |
| Hotel section | "Hotels" (admin label; a tour can have several) | "Tonight", "Your hotel" | Quick fact tile: "Hotel". Pass cell: "Hotel tonight". |
| Venue address, map, dock, parking, facilities | "Venue" | "Venue and getting there", "Getting there" | "Getting there" means flights and ground transport on the live page; not reused for venue directions. |
| Ground transport and the viewer's flight | "Transport" | "Getting there" | Group label "Logistics", the admin group (§5.1). The audit suggested "Travel"; overridden so both surfaces carry one group name. |
| Crew roster | "Crew" | "Crew and contacts" | Contacts are their own section, "Contacts", as in the admin popup. |
| Lead-only money section | "Billing & docs" | "Budget" | Admin label (§5.1). |
| Wardrobe | "Dress code" | "Wardrobe" | Live page term. |
| Primary contact quick fact | "Who to call" | "Need something" | Same contact as today's "Need something" (`selectPrimaryContact`); the client contact is never shown to crew (phase 1 spec §4.2). |
| Run of show card | "Run of show" | "Today's run" | Link: "Full schedule", not "Full agenda". |
| Home list of sections | "All sections" | "Everything else" | |
| Copy toast | "Copied" | "Password copied" | Live term. |
| Report row | "Something looks wrong?" + "Report this" | "Not what you need?" + "Report" | Live term. Search owns its row; listed so both projects match. |

### 9.2 Wording fixes

- Times render as the sheet wrote them, through the existing `normalizeMeridiem` (`lib/crew/normalizeMeridiem.ts`). No new formatting. A strike time on the pass always carries its day: "Mon 12:30 PM".
- Countdown: "Show starts in 25 min", "Show starts in 1 hr 20 min". Never "Call in", which reads as "phone in".
- Last run-of-show line on a non-final show day: whatever the sheet's entry title says. The mock's invented "Show ends" is dropped.
- Pass cell "Lead" becomes "Your lead".
- Transport times: "leaves Tue 2:00 PM", not "out Tue 2:00 PM".
- Quick facts label every copyable value ("Password", "Confirmation") so a bare code never sits alone.
- The nav shows no counts. Numbers beside nav labels read as alerts.
- Role lines read "TD" exactly as the sheet writes the role. No expansion is invented.
- "Next" in the run of show is typed in sentence case and uppercased by CSS (`uppercase` + tracking).
- "Wi-Fi" in visible text, aria-labels and placeholders alike.

### 9.3 State copy the mockups lacked (all crew-visible)

| State | Copy |
|---|---|
| Not scheduled on the selected day | "You're not scheduled this day." plus "Your next day: Mon Jun 15." when one exists. |
| Show time already passed today | "Show started at 7:45 AM." |
| Viewer's last day is over | "Your days are done." (live state `viewer_after_last_day`) |
| Days not confirmed | "Your days aren't confirmed yet." (live state `viewer_unconfirmed`) |
| Dates not finalized | "Dates aren't finalized." (live state `unknown`) |
| Copy to clipboard failed | "Couldn't copy. Press and hold the text to copy it." |
| No quick facts have data | The quick-facts block is omitted. No empty-state copy. |

Offline ("You're offline. Info from 6:05 AM.") and search empty results ("No matches. Try dock, hotel, or a name.") belong to their projects; listed here only so the wording matches.

### 9.4 Accessible names

- Day buttons: "Sun Jun 14, show day 1" (plus `aria-pressed`).
- Copy buttons: "Copy Wi-Fi details", "Copy hotel confirmation number".
- Sheet close: "Close" + the section name ("Close crew").
- Theme switch: "Switch to dark mode" / "Switch to light mode" (existing `ThemeToggle`, unchanged).
- Call and text buttons: "Call Dana Ortiz", "Text Dana Ortiz".

## 10. Flag lifecycle

| Flag | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| Open section (`s`) | URL query | sheet open/close and nav click (§5.2, §5.3); auth and picker redirects carry it (§5.2) | `page.tsx` server read; client `popstate` | compact: which sheet is open; wide: scroll target |
| Selected day | client state only | day row tap (§4.2) | pass, run of show | which day the pass and run show; resets on load (L5) |
| Theme override | `localStorage` `fxav-theme` (`useAppliedTheme.ts:31`) | header `ThemeToggle`, `AvatarMenu` checkbox | no-flash script (`app/layout.tsx:52`), `useAppliedTheme` | `data-theme` on `<html>`; the pass ignores it (R7) |
| Sheet history marker `crewSheet` | `history.state` | sheet open via `pushState` (§5.2) | sheet close | close uses `history.back()` when present, `replaceState` otherwise |

No env flags, no database columns, no server actions.

## 11. Guard conditions

| Input | Absent or null | Empty | Malformed |
|---|---|---|---|
| `s` param | home (compact) / top (wide) | same | unknown or non-entitled id, after legacy aliasing: same |
| Day set (§4.2) | row hidden | row hidden | duplicate dates collapse (`aggregateDays` dedupes) |
| Selected day's `ScheduleDay` | run card omitted; pass shows phase label only | run card omitted | entries failing `isDisplayableEntry` are skipped (existing) |
| `showStart` | no big time, no countdown | same | unparseable: renders as written, no countdown (L1) |
| Key-time anchors | that time omitted | same | `TBD`/`N/A`/`TBA` treated as absent (existing `isAbsentTime`) |
| Fact grid cell value | cell omitted | cell omitted | — |
| All fact grid cells | divider and grid omitted | same | — |
| Viewer role | eyebrow right side omitted | same | — |
| Quick fact source | that fact skipped, next in order tried | same | sentinel values hidden (`shouldHideGenericOptional`) |
| All quick facts | block omitted | same | — |
| `navigator.clipboard` | failure toast, text selectable | — | rejection: failure toast |
| Hotel reservations | `hotel` fact and "Hotel tonight" omitted | same | no reservation covers the night: omitted, never `[0]` |
| Section peek | peek line omitted | same | — |
| Viewer's sections | "All sections" card and wide nav omitted; the Today block still renders | same | — |
| `matchMedia` unavailable | compact behavior | — | — |

## 12. Testing

Every test names the defect it catches. Expected values come from fixtures, never hardcoded.

**Unit (Vitest, pure modules).**
- `selectQuickFacts`: keeps order, skips empty and gated sources, stops at 4; catches a gated `parking` leaking to an unassigned viewer and a client contact ever appearing.
- `reservationForNight`: boundary nights (check-in night included, check-out night excluded), two overlapping reservations ordered by `ordinal`, no match returns null; catches the `[0]` fallback.
- Pass model (lib/crew/passModel.ts (new), the pure part of §4.3): each day phase × restriction kind; suppressed viewers get no dates anywhere in the returned object (serialize and search for every ISO date of the show, the #970 lesson); catches the §2.2 leak.
- Countdown parse: parseable, unparseable, past, beyond 3 hours; catches a guessed time.
- `crewSectionsFor`: each gate on and off; catches a gated section listed.
- Legacy `s` aliasing: every old id; catches a broken old link.
- Registry parity: every shared registry label equals the label `step3ReviewSections.tsx` renders; catches drift between the surfaces.

**Component (jsdom where layout is not asserted).** Day row (default selection per §4.2, `aria-pressed`, hidden when suppressed), quick facts (copy success toast, failure toast plus selectable text), "All sections" rows are real links, sheet (open focus, close focus return, Esc, `inert` on the page).

**Real browser (Playwright).**
- Compact: open from the list, close button, scrim, Esc, Back, swipe; deep link `?s=hotels`; legacy `?s=travel`; refresh with the sheet open; realtime refresh with the sheet open (§7 compound).
- Wide: nav click scrolls and focuses the heading; scroll-spy follows; `?s=` deep link scrolls.
- Resize across 1024px with the sheet open and mid-scroll (§7 compound rows).
- Every §8 invariant via `getBoundingClientRect()`, ±0.5px.
- The pass's computed background equals the dark surface token in both themes.

**Migrations, not deletions.** Existing tests that pin removed structure (`CrewSubNav`, the bottom bar, `data-active-section`, the hero testid and its 176px canonical baseline) are retargeted to the new elements, and their failure modes carried over, before the old components are deleted. The structural meta-tests that pin file and line locations (`tests/styles/forcedColorsCensus.ts`, `_metaControlOutlineFill`, `_metaControlOutlineResidue`, `subtleInteractiveExemptions.ts`, `tapTargetCensus.ts`, `alertProducerScope.registry.ts`, `_metaRenderFaultMarking`) are updated in the commit that moves the code they pin. Help screenshots `crew-preview-{today,gear,schedule}-mobile-{light,dark}` regenerate through the pinned-image `screenshots-regen` workflow, never from a dev host.

**PR B and PR C invariant.** The admin popup's DOM does not change: the 50 zero-threshold PNGs under `tests/e2e/section-header-visual.spec.ts-snapshots/` and every admin review test stay unmodified and green. A PR B or PR C diff that touches one of them is a defect, not a re-baseline.

## 13. Acceptance criteria

- **AC-1.** Below 1024px the crew page shows, in order: header, day row (when allowed), pass, run of show (when entries exist), quick facts (when any resolve), show notes (when any source has a note), "All sections".
- **AC-2.** Tapping an "All sections" row opens that section in a bottom sheet and sets `?s=`; every close path removes it; browser Back closes the sheet before leaving the page.
- **AC-3.** At 1024px and up the page shows the left nav, the Today block, then every section stacked; the nav tracks the section in view.
- **AC-4.** Every old `?s=` value still opens the matching section or home.
- **AC-5.** The theme switch is visible in the header for every viewer and persists across reloads; the pass stays dark in light mode.
- **AC-6.** No viewer ever receives, in HTML or the RSC payload, a date, hotel, transport field, flight or financial value that the live page withholds from them today.
- **AC-7.** Quick facts never show an empty tile, never show the client contact, and the hotel fact never names a hotel that does not cover the night.
- **AC-8.** Copy succeeds with a toast, or fails with a toast and selectable text.
- **AC-9.** The admin popup renders the shared section bodies (PR B, PR C) with its DOM unchanged.
- **AC-10.** The section labels and groups the crew page shows equal the admin popup's.
- **AC-11.** Every §8 dimensional invariant holds in a real browser.
- **AC-12.** Every §7 transition, including the compound rows, behaves as listed; reduced motion makes all of them instant.
- **AC-13.** All copy matches §9; no em dash, no raw error code.
- **AC-14.** The impeccable critique and audit pass on the diff with P0 and P1 findings fixed or deferred in `DEFERRED.md`.

## 14. Rollout

Three pull requests on this branch, merged in order. Each runs the full pipeline gates: impeccable critique and audit, cross-model diff review, real CI green, merge.

- **PR A, crew page redesign.** Everything in §3 to §5 and §7 to §11 on top of today's crew section bodies, mapped onto the new navigation with the registry ids and the legacy alias map. `CrewSubNav` and `RightNowHero` are retired after their tests migrate. `DESIGN.md` amendments (§3.3). The shared registry module (§5.1) lands here, because the navigation reads it.
- **PR B, shared bodies, part 1.** components/show-panels/ (new) with the bodies for `venue`, `crew`, `contacts`, `schedule`, `agenda`, `hotels`, `transport`, `billing` (§6.3). The admin popup renders them with its DOM unchanged; the crew page renders them with crew props.
- **PR C, shared bodies, part 2.** `event`, `rooms`, `packlist`: the crew page adopts the admin structure for these three (§6.2).
