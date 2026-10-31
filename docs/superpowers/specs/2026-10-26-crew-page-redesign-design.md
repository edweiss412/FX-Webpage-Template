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

- **Search.** The owner chose to ship search on the current crew page first (relayed by the search session, 2026-10-26). The redesign therefore carries it over: the header slot (§4.1) hosts whatever search has merged; every searchable line keeps search's `data-search-target` attribute wherever the line moves, and search's parity test (index line equals rendered target text) stays green; the section controller exports one entry point, `openSectionAndReveal(sectionId, targetId)`, which in compact mode opens that section's sheet (§5.2) and scrolls the target into view inside the sheet body, and in wide mode scrolls the page to the target (§5.3), then highlights it. Whichever branch merges second rebases; neither merges with the other's tests red.
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
- **Wide (1024px and up):** left nav plus one scrolling column: the Today block (day row, pass, run of show, quick facts) first, then every section stacked in nav order (§5.1, §5.3).

The admin popup keeps its own shell and rail. It changes only in that its section bodies are the shared panels (§6).

### 3.2 Mode boundaries

| Element | Compact | Wide | Admin popup |
|---|---|---|---|
| Header: show name, theme switch, search slot | ✓ | ✓ | ✗ (admin header) |
| Day row (§4.2) | ✓ | ✓, top of Today | ✗ |
| Pass (§4.3) | ✓ | ✓ | ✗ |
| Run of show card (§4.4) | ✓ | ✓ | ✗ (its Agenda section shows the full agenda) |
| Quick facts (§4.5) | ✓ | ✓, beside the run of show | ✗ |
| Show notes card (§6.2) | ✓, below quick facts | ✓, in the Today block. **Amendment 2026-10-30 (invariant-8 gate, critique F7; overridable):** when the viewer has no run of show, the Today block is a two-column grid: the quick facts beside the pass, and the show notes, the Dress code card and any admin fetch-failure block spanning both columns under them, so no column holds air beside the pass. With a run of show, unchanged. | ✗ |
| Dress code card (§6.2, PR A and PR B only) | ✓, beside show notes | ✓, in the Today block | ✗ |
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

- Eyebrow: client name and venue name, joined by " · ", each omitted when sentinel-hidden. Title (`h1`): the show title. The existing status pill and identity chip stay where `Header` renders them today. **Amendment 2026-10-30 (invariant-8 gate, audit P2-3 / critique F8; overridable):** from 1024px the status pill moves from the title's line to the date line, the title block takes twice the search slot's share of the row and the search caps at `max-w-sm`, and the `h1` carries the full title as `title`. Seeded titles (up to 47 characters) then fit whole at 1024px and 1280px; one-line truncation stays the fallback for a longer title.
- **Theme switch: always visible** in the crew header, for viewers with and without an identity. `components/layout/Header.tsx:141` mounts `ThemeToggle` only for identity-less viewers today; this project mounts it for every crew-page viewer, and the `AvatarMenu` checkbox (`components/auth/AvatarMenu.tsx:438-442`) stays. Today each control keeps its own React state from `useAppliedTheme` (`components/layout/useAppliedTheme.ts:71-89`, `components/layout/useAppliedTheme.ts:120-138`), so two mounted controls can disagree. This project moves the theme value into one module-level store that `useAppliedTheme` reads through `useSyncExternalStore`, notified by every `setTheme` call and by the `storage` event, so every mounted control shows the same value and a toggle never computes from a stale one.
- **Search slot:** hosts search's field and results when search has merged, and renders nothing otherwise (§1.2). Compact: a full-width row under the title. Wide: between the title and the identity chip.
- **Status slot** for the offline project: an empty element directly under the header (§1.2).

### 4.2 Day row

A row of the days this viewer may see, above the pass. It drives one piece of client state, the **selection**, which is either `live` or `day(iso)`.

- **`live`** (the default on every load): the pass shows the live right-now state (§4.3) and the run of show shows today (§4.4). In `live`, today's button is pressed when today is in the day set; otherwise no button is pressed.
- **`day(iso)`**: set by tapping any day button other than today's. The pass shows that day's static facts and the run of show shows that day. Tapping today's button returns to `live`.
- **"Now" button.** When today is not in the day set (before travel, after the show, or an explicitly restricted viewer's off day), the row starts with a "Now" button that is pressed in `live` and returns to `live` when tapped, so the live state is always one tap away without a reload. When today is in the set, today's button plays that role and no "Now" button renders.
- **Day set (single source).** `aggregateDays(show.dates)` (`lib/crew/agendaDisplay.ts:114`) filtered through the date restriction exactly as the Schedule section filters its day list (`components/crew/sections/ScheduleSection.tsx:173-177`, which lists only an explicit viewer's own days, and `visibleShowDays`, `lib/crew/agendaDisplay.ts:145`). The row never computes its own day list.
- **Hidden** when the viewer's dates are suppressed (`suppressesDates`, `lib/crew/dateSuppression.ts:70-72`; the phase 1 §4.2 contract that such a viewer must not be able to infer which show days exist), when the day set is empty, or when the live state is degraded (`dateless`, `unknown`, `viewer_unconfirmed`).
- **Selection is client state only.** Not written to the URL; a reload returns to `live` (documented limit L5).
- **Button content.** Weekday ("Sat") or "Today", the day of month ("13"), and a short phase label: "Travel in", "Load in", "Show day 1", "Travel out", or "Travel in, load in" for a combined day. Accessible name per §9.4. `aria-pressed` on the pressed button.
- **Cap.** Up to 4 buttons (days plus a "Now" button when present) sit in an equal-width grid. Five or more scroll horizontally with scroll snapping, every button at least 64px wide, and the pressed day (or, in `live` with no pressed day, the nearest upcoming day) is scrolled into view on mount. At the narrowest supported width (320px, a 288px content box after the page gutters, `lib/crew/pageContainer.ts:17`) four buttons and their three gaps fit; five would not. No hard cap: a 30-day tour scrolls.
- **Tap target.** Each day button is at least 44px tall and 64px wide (`min-h-tap-min`).

### 4.3 Pass

The dark card under the day row. It replaces `RightNowHero` (`components/crew/RightNowHero.tsx`) and keeps all of its machinery: `selectRightNowState`, the minute tick, the `visibilitychange` refresh, the `lastGood` morph and the 66-pair transition table (phase 1 §4.3, §4.16). The pass is a re-skin plus a day selector, not a new state machine.

- **`live`:** the body follows the live state for every one of the states listed in §2.2 (show day, travel in, set day, travel out, pre-travel countdown, not scheduled today, not scheduled yet, days done, show complete, not confirmed, unknown, dateless), re-skinned into the layout below. The copy is the existing copy, adjusted only where §9 says.
- **`day(iso)`:** the body shows that day's static facts: the day label, its anchor time, the fact grid. No countdown and no live dot.
- **Layout (top to bottom):**
  1. Eyebrow row: left, the day label ("Show day 1 of 2", "Load in", "Travel in", "Travel out", or the live state's eyebrow); right, "You, A1" from the viewer's roster role when non-empty.
  2. Status line (`live` on a show day only): "Show starts in 25 min" when the day's `showStart` converts through the existing `clockToMinutes` (`lib/time/clockToMinutes.ts`) and lies within the next 3 hours; "Show started at 7:45 AM" once it has passed. When `clockToMinutes` returns null, no status line (documented limit L1).
  3. Big time: the day's anchor. Show day: "Show" + its `showStart` (`KeyTimeAnchors.shows` for that date, `lib/crew/resolveKeyTimes.ts:18`). Load-in day: "Load in" + the Set anchor. The last show day adds "Strike" + the strike anchor at the right edge. Travel days have no big time: hotel check-in and check-out are dates, never times (phase 1 watchpoint 3).
  4. Progress segments: show days only, one per show day, as today.
  5. Perforated divider, then the fact grid: up to 6 cells in a 3-column grid. Candidates in order: "Room" (the deterministic GS room per `compareRooms`, `lib/crew/resolveKeyTimes.ts`), "Your lead", "Hotel tonight", "Dress code", "Strike" (only when it is not already the big time), "Load in" (only on travel-in days with a Set anchor). A cell with no value is omitted; zero cells omit the divider and the grid. Each value is one line with an ellipsis; the full value is one tap away in its section. **Amendment 2026-10-30 (impeccable gate, audit P1-1 / P2-1, critique F1; overridable):** measured at 320, 390 and the 1024 wide column, the 3-column grid cut labels ("HOTEL TON…"), the room ("SINCLAIR B…") and the strike time mid-digit ("4/22 @ 12:0…"), and the same one-line rule on the big time and the eyebrow lost the meridiem ("4/21 @ 7:30 …") and the role's trailing position code. So: the grid has 2 columns until the pass itself is at least `@lg` (32rem) wide, then 3 (a container query on the pass, `@container/pass`, never the viewport); labels never truncate, they wrap; time-valued cells ("Strike", "Load in") never truncate, they wrap in full; every other value clamps at 2 lines with an ellipsis, its full value one tap away as before. The big time never truncates either: it steps down a size with the pass's width (`text-2xl`, `@xs/pass:text-3xl`, `@sm/pass:text-4xl`) and wraps, balanced, past that; the edge Strike drops under it when the two do not share a line. The eyebrow's right side wraps under the day label when they do not share a line and clamps at 3 lines (the seed's longest role takes 3 at 320), still the role as the sheet writes it (§9.2). The pass grows past `--spacing-right-now-min-h` to fit, which stays its floor (§8 item 2). Flagged in the PR for Doug; reverting to one line is a class change in `components/crew/CrewPass.tsx`.
- **Personal cells** ("You, A1", "Hotel tonight", "Your lead") render only for viewers of kind `crew` and `admin_preview` (`lib/data/getShowForViewer.ts:99-101`). A plain `admin` viewer receives every crew member's reservations and has no roster row, so these cells are omitted for it.
- **"Your lead":** the first crew member carrying `LEAD` in the order the Crew section renders the roster; omitted when that person is the viewer.
- **"Hotel tonight":** `reservationForNight(reservations, iso)` (§4.5) for the selected day (`live`: today).
- **Suppressed dates never reach the pass.** For a viewer whose dates are suppressed, the server evaluates `selectRightNowState` once, with the real dates and the viewer's restriction. For a suppressed restriction its result depends only on whether the show's dates are complete (`dateless`, `unknown` or `viewer_unconfirmed`, `lib/time/rightNow.ts:205-228`) and never on the clock, so the server passes that state kind alone and the pass renders it without a client clock. The pass props carry no hotel dates, day dates or per-day anchors for such a viewer (closing the leak in §2.2); a test serializes the props and searches them for every ISO date of the show, and checks the rendered state equals the one computed with the dates (§12).
- **Degraded states** (`dateless`, `unknown`, `viewer_unconfirmed`): eyebrow and lead only, with the §9.3 copy. No times, no grid; the day row is hidden (§4.2).
- **Color.** Dark in both themes (R7): the pass subtree carries `data-theme="dark"`, which re-scopes the theme tokens because the dark token block's selector is not tied to the root (`app/globals.css:487`). The plan verifies the computed colors in a real browser in both themes. **Correction 2026-10-30 (Task 9):** the premise above is wrong for the tree as it stood: the dark token block re-binds tokens only on the root, so `data-theme="dark"` on a subtree alone left the pass white. Task 9 adds a `:root [data-theme="dark"]` rule that re-binds every runtime-backed theme token on such a subtree, guarded by a test that derives the token list from `@theme`.

### 4.4 Run of show

The selected day's run of show, below the pass (`live`: today).

- **Eligibility.** The card renders only for a day that is one of the viewer's own days, the same rule Today applies now (`eligible`, `components/crew/sections/TodaySection.tsx:222-224`: no restriction, or an explicit restriction listing that day; never for suppressed dates). In `day(iso)` this holds by construction, because the day row lists only the viewer's days (§4.2); in `live` it is checked against today. The agenda-session merge sits behind the same gate, so an explicitly restricted viewer never sees today's agenda on a day that is not theirs.
- **Entries.** The day's `ScheduleDay.entries` through `scheduleEntriesForViewer(entries, { transportVisible })` (`lib/crew/agendaDisplay.ts:66`), so a load-out entry stays hidden from viewers who cannot see transport, merged with that day's agenda sessions exactly as Today merges them now: `buildShowDayTimeline(entries, agendaSessionsForToday(agenda_links, showDays, iso))` (`lib/crew/showDayTimeline.ts:17`, `lib/crew/agendaDayForToday.ts:52`; current call at `components/crew/sections/TodaySection.tsx:242-247`, `components/crew/sections/TodaySection.tsx:693`). A bare show day with only a `showStart` gets the synthetic "Show Start" row from `showStartDisplayEntry` (`lib/crew/agendaDisplay.ts:84`), which receives the day's **raw** entries: a viewer-hidden load-out still counts as a raw entry and still suppresses the synthetic row, as its doc comment requires. Rendering reuses `ShowDayTimelineList` and `RunOfShowList` as Today does now.
- **Suppressed viewers** get no entries (the projection already returns none, `lib/data/getShowForViewer.ts:804-833`), so the card is omitted.
- **Cap.** 6 rows on the home screen. Beyond 6, a "Full schedule" link opens the Schedule section (sheet on compact, scroll on wide). The Schedule section keeps its own cap, `RUN_OF_SHOW_DISPLAY_CAP` (`lib/crew/agendaDisplay.ts:23`); titles truncate at `TITLE_TRUNCATE_AT` (`lib/crew/agendaDisplay.ts:25`), as today.
- **"Next" marker.** `live` only: on the first row whose start converts through `clockToMinutes` to a time at or after now. A null conversion never gets the marker (documented limit L1).
- **Card header actions** stay as Today's run-of-show card has them (§6.4).
- **Empty.** No displayable rows: the card is omitted.

### 4.5 Quick facts

Up to four small tiles under the run of show (compact) or beside it (wide). They answer the most-hunted facts without opening anything. They do not follow the day row: every fact is computed once, on the server.

- **Identifiers.** A closed, ordered union `QuickFactId = "wifi" | "hotel" | "dock" | "contact" | "parking" | "dressCode" | "address"`, exported from a new pure module lib/crew/quickFacts.ts (new) together with `DEFAULT_QUICK_FACT_ORDER: readonly QuickFactId[]` in exactly that order. Project 4 replaces the source of the order with a per-show setting. This project hardcodes the default.
- **Selection.** `selectQuickFacts(order, data, viewer)` walks the order and keeps the first 4 ids that resolve to a value for this viewer. Pure function, unit-tested, no React.
- **Sources (each reuses the field and gate the live page already uses, cited in §2):**

| Id | Label | Value | Action | Gate |
|---|---|---|---|---|
| `wifi` | "Wi-Fi" | the Venue section's own Wi-Fi display: network and password as two labeled lines when `lib/crew/wifiDisplay.ts` splits them, otherwise its notes text | Copy the password when present ("Copy Wi-Fi password"), otherwise copy the whole text ("Copy Wi-Fi details") | sentinel hiding (`shouldHideGenericOptional`) |
| `hotel` | "Hotel" | the viewer's reservation for tonight per `reservationForNight` (below), tonight being today's ISO date in the show timezone computed on the server (`nowDate()` + `todayIsoInShowTimezone`, as the Schedule pin does): hotel name, plus "Confirmation" and its `confirmation_no` when present | Copy the confirmation number | only for `crew` and `admin_preview` viewers (§4.3 personal cells); the projection returns only the viewer's own reservations to them (`lib/data/getShowForViewer.ts:784-787`) |
| `dock` | "Loading dock" | the venue loading dock text | none | sentinel hiding |
| `contact` | "Who to call" | `selectPrimaryContact(contacts)` (`lib/crew/selectPrimaryContact.ts:12-20`) name and kind label | Call and Text when `digitsOnly(phone)` is non-empty; Email when the email is non-sentinel; neither: the name alone | client contact never eligible (phase 1 §4.2) |
| `parking` | "Parking" | transport parking text | none | `transportTileVisible` (phase 1 §4.13a) |
| `dressCode` | "Dress code" | the dress code text Today shows | none | sentinel hiding |
| `address` | "Venue" | venue name and address | Directions link, only when the map URL passes `isParseableUrl` | sentinel hiding |

- **Wi-Fi reuses the Venue split.** `event_details.internet` is one free-text field; `lib/crew/wifiDisplay.ts` already splits it into network, password and notes for the Venue section. The tile calls the same function, so the tile and the Venue section can never disagree. When the split finds no password, the tile shows the text and copies all of it (documented limit L2).
- **`reservationForNight(reservations, isoDate)`.** New pure helper in lib/crew/quickFacts.ts (new): the reservation whose `check_in <= isoDate < check_out`, ties broken by `ordinal`. No match returns null and the tile (and the pass's "Hotel tonight" cell) is omitted. It never falls back to `reservations[0]`, which is what today's "Tonight" card does (`TodaySection`, cited in §2) and which can name the wrong hotel on a multi-hotel tour. When the viewer's dates are suppressed (`suppressesDates`), the helper is not called and both the tile and the cell are omitted.
- **Layout.** A 2-column grid. Three tiles: the third spans both columns. One tile spans both columns. Zero tiles: the block and its heading are omitted (§9.3).
- **Copy.** `navigator.clipboard.writeText`. Success shows the "Copied" toast for 2 seconds. Failure (no clipboard API, permission denied, insecure context) shows the §9.3 failure toast, and the value text stays selectable (`select-text`) so press-and-hold copying works. The toast is a polite live region.
- **Truncation.** Values wrap to at most 3 lines, then ellipsis. The full text is in the section the fact comes from.

### 4.6 "All sections" list (compact only)

A single card listing every section this viewer may open, in nav order (§5.1), one row each: icon, label, a one-line peek, a chevron. Tapping a row opens that section's sheet (§5.2).

- **Membership.** `crewSectionsFor(data, viewer)` (pure, lib/crew/crewSections.ts (new)); the wide nav reads the same function, so the two lists cannot differ. Its rules per PR are in §5.1.
- **Peek line.** A short, data-derived summary computed server-side by a pure `sectionPeek(id, data, viewer)` in lib/crew/sectionPeek.ts (new) (e.g. Venue: venue name; Crew: "6 people"; Pack list: "14 cases"). A peek reads only fields the section itself renders for this viewer, through the same gates: a ground-transport leg contributes to a peek only when `transportTileVisible` holds, hotel and day details never contribute for a date-suppressed viewer, and so on. A section whose peek resolves to nothing shows no peek line, never placeholder text.
- **Rows are links** built with the existing `buildSectionHref` (`lib/crew/sectionHref.ts:30-42`), which keeps an allow-listed `gate` alongside `s`, so a pre-hydration click, a JavaScript-off click, or "open in new tab" keeps both params. The server renders the sheet open for `?s=`.

## 5. Navigation and URL

### 5.1 Section ids per PR

- **PR A** keeps today's crew section ids and bodies: `schedule`, `venue`, `travel`, `crew`, `gear`, and `budget` (`lib/crew/resolveActiveSection.ts:1-2`), with today's labels (`components/crew/CrewSubNav.tsx:47-53`). `today` now means "home, no sheet". Membership is exactly today's tab set: the six base sections for everyone and `budget` only when `financialsVisible` (`app/show/[slug]/[shareToken]/_CrewShell.tsx:243`, `app/show/[slug]/[shareToken]/_CrewShell.tsx:449-454`). A section with no content still opens and shows its existing section-level empty state, as its tab does today. The wide nav lists "Today" then the five base sections (`schedule`, `venue`, `travel`, `crew`, `gear`) and, when entitled, `budget`, with no group headings.
- **PR B** introduces lib/showSections/registry.ts (new): `{ id, label, group, icon }` for `venue`, `event`, `crew`, `contacts`, `schedule`, `agenda`, `hotels`, `transport`, `rooms`, `packlist`, `billing`, in that order, in the six groups of `STEP3_SECTION_GROUPS` minus "Checks" ("The show", "People", "Schedule", "Logistics", "Gear", "Money"). Labels are the admin labels verbatim ("Rooms & scope", "Billing & docs", "Crew schedule", ...). `step3ReviewSections.tsx` reads its shared entries' `label`, `group` and `Icon` from this module; its admin-only entries (warnings, report) and its `render`, `railCount` and `hideDot` stay where they are. The crew page moves to the registry ids for the sections PR B moves (§6.3), and keeps `gear` until PR C.
- **PR C** moves `event`, `rooms` and `packlist`, retiring `gear`. From then on the nav shows the registry groups (AC-10).
- **Membership from PR B on** (for the ids each PR has moved; `gear` stays listed until PR C retires it): `billing` whenever `financialsVisible` holds; `transport` whenever the viewer is an admin, `transportTileVisible` holds, or the viewer has their own flight, with the ground-transport body itself rendered only when `transportTileVisible` holds (a flight-only viewer sees "Your flight" and nothing else, §6.2); `agenda` only when the viewer has agenda content and their dates are not suppressed; from PR C, `packlist` only when `isPackListVisibleToday`; every other moved registry section always, showing its empty state when empty.
- **Membership never depends on a fetch succeeding.** A domain whose fetch failed (`tileErrors`, phase 1 §4.13) keeps its section listed for every viewer its existing degraded-state gate admits, and the section shows that degraded state to exactly the viewers who see it today, through each section's existing gate, unchanged: Budget shows its failure to every viewer `financialsVisible` admits, leads and lead previews included (`components/crew/sections/BudgetSection.tsx:64-78`); Travel's transport failure follows its own gate (`components/crew/sections/TravelSection.tsx:392-402`). A failure is never rendered as absence, and no section's degraded-state audience is narrowed or widened.
- **Legacy ids.** From the PR that retires an id, old links keep working through an alias map applied everywhere `s` is resolved (`resolveActiveSection` and the redirect allow-list at `app/show/[slug]/[shareToken]/page.tsx:195`): `today` → home, `travel` → `hotels`, `budget` → `billing` (PR B); `gear` → `rooms` (PR C). `schedule`, `venue` and `crew` keep their ids. An unknown or non-entitled id resolves to home, as an invalid `s` resolves to `today` now. `?s=` and `?gate=` stay independent through every auth and picker redirect (phase 1 §4.1a).

### 5.2 Compact: the section sheet

- **URL.** `?s=<id>` means the sheet is open on `<id>`. The server renders it open on first load, so a deep link or a refresh lands with the sheet up.
- **History rules** (the client never calls the router; this is the no-router mechanism `CrewSections` uses today, `components/crew/CrewSections.tsx:75-95`):

| Event | History call | Sheet |
|---|---|---|
| Open from home (list row, in-page link, `openSectionAndReveal`) | `pushState(url with s, { ...history.state, crewSheet: true })` | opens |
| Open another section while one is open (in-sheet link, `openSectionAndReveal`) | `replaceState(url with the new s, history.state)` | stays up, body swaps (§7) |
| Close button, scrim tap, Esc, swipe past threshold, when `history.state.crewSheet` is set | `history.back()`; the `popstate` that follows closes the sheet | closes on `popstate` |
| Same closes when the marker is absent (deep link, or an entry the marker never reached) | `replaceState(url without s, state without crewSheet)` | closes |
| Browser Back or Forward (`popstate`) to an entry without `s` | none | closes |
| `popstate` to an entry whose `s` is an entitled id | none | opens on that id |
| `popstate` to an entry whose `s` is unknown or not entitled | `replaceState(url without s)` | closes |
| Realtime refresh removes the open section from membership | none | stays open on that section with its fresh content (its empty or degraded state); membership changes only update the list and the nav. The clamp `CrewSections` applies today (`components/crew/CrewSections.tsx:103-104`) applies only to a section that is not open. **Amendment 2026-10-27 (plan review round 8):** when the section leaves because the viewer lost the entitlement to see it (PR A: `budget` once `financialsVisible` turns false), the server builds no body for it (`app/show/[slug]/[shareToken]/_CrewShell.tsx:446-454`), so there is no fresh state to show: keeping the old body would show withheld values (AC-6) and an empty body is an anti-goal (§1). The sheet then closes to home through the close rows above. |

  A deep link has no home entry beneath it, so its Back leaves the page; that is the browser's history, not a defect (ratified by the spike below).
- **Drag to dismiss** uses the admin sheet's thresholds. `DRAG_DISMISS_THRESHOLD_PX` and `DRAG_SLOP_PX` move from `components/admin/review/ReviewModalShell.tsx:47-49` to a shared constants module both import; their values do not change.
- **Modal behavior.** Focus moves to the sheet title on open and back to the control that opened it on close; focus is trapped inside; the page behind is `inert`; body scroll is locked. `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title.
- **Nested dialogs.** Three existing dialogs can open from inside a sheet: the agenda PDF viewer (`components/agenda/AgendaEmbed.tsx:106-136`), the diagram lightbox (`components/diagrams/GalleryLightbox.tsx:664-726`) and the report modal (`components/shared/ReportModal.tsx:277`). While one is open it renders above the sheet in a higher z-index band, owns focus and restores it to its trigger inside the sheet, and the sheet ignores its own Esc, scrim, swipe and close handlers (it checks for another open `aria-modal="true"` dialog before acting).
- **Scroll lock is reference-counted, app-wide.** Every component that locks body scroll today saves and restores `document.body.style.overflow` on its own, so when two of them unmount in one commit, which a Next route change can force regardless of anything the sheet does (Next 16.3.0, node_modules/next/dist/client/components/app-router.js line 294, its own history handler), the restore order can leave the destination page locked (shown by probe in review rounds 2 and 5). A new module, lib/ui/scrollLock.ts (new), exports `acquireScrollLock(): () => void`: the first holder records the original value and locks; each release removes one holder; the original value is restored only when the last holder releases, in any order. The sheet uses it, and all four existing writers migrate to it in PR A: `components/agenda/AgendaEmbed.tsx:113-116`, `components/diagrams/GalleryLightbox.tsx:723-726`, `components/admin/review/ReviewModalShell.tsx:241-244`, `components/admin/FinalizeButton.tsx:815-818` (the full set from `rg -n "body\.style\.overflow" components app lib`, 4 files at base `370e1cc9c`). A structural test walks `app/`, `components/` and `lib/` and fails if any file other than the lock module writes `document.body.style.overflow`. With order-independent locks, the sheet closes immediately on every close path, including `popstate` and a breakpoint change, even with a nested dialog open; no close is deferred. A data refresh still never closes an open sheet (§5.2 table), so a nested dialog whose owner leaves the fresh content unmounts on its own. **Amendment 2026-10-30 (whole-diff review R4):** the one exception is the §5.2 amendment of 2026-10-27: when a refresh removes the open section because the viewer lost the entitlement to see it, the sheet closes to home (§5.2 table, §7 row "Realtime refresh removes the open section from membership"), immediately like every other close, and that close unmounts any nested dialog the section held.
- **Width.** Full width below 640px; from 640px up to the wide breakpoint, centred at the bottom with the existing panel max width (`DESIGN.md:684`).
- **Mechanism ratified by spike** (2026-10-26, Next 16.3.0, Chromium via Playwright, a throwaway route on `origin/main`): a raw `pushState` carrying `{ ...history.state, crewSheet: true }` keeps the marker and `useSearchParams` follows it; open, close, Back and Forward issue no fetch or document request; a close with the marker lands on the page without `s` and fires `popstate`; a fresh deep link has no marker, so close takes the `replaceState` path and a later Back leaves the page; a reload of an in-app-pushed entry keeps the marker (browsers preserve `history.state` on reload), and its close lands on the same page without `s`.

### 5.3 Wide: left nav and one column

- The nav is 240px wide, sticky under the header, listing "Today" then the sections from `crewSectionsFor` (§5.1). No counts, no status dots.
- Sections stack in nav order below the Today block, each with an anchor `id` and a `scroll-margin-top` of the header height (§8).
- **Nav click:** smooth-scroll to the section (instant under reduced motion), move focus to its heading (`tabindex="-1"`), and `replaceState` the `s` param. Wide mode never pushes history; the scroll-spy never writes the URL.
- **Scroll-spy:** the active nav item follows the section in view using the admin rule (`activeSectionFor`, `components/admin/review/ShowReviewSurface.tsx:97-115`), extracted into a shared pure function both surfaces call with the same offset; it is suppressed while a nav-click scroll runs, as the admin rail does (`components/admin/review/ShowReviewSurface.tsx:436-487`).
- **Back and Forward in wide mode** only meet entries created in compact mode: a `popstate` scrolls to the entry's `s` section (or the top when absent) without moving focus.
- **Deep link `?s=<id>`** on load scrolls to that section after hydration.
- **`openSectionAndReveal`** scrolls to the target with the same scroll margin, then highlights it.

## 6. Shared section panels

### 6.1 Where the shared bodies live

The admin bodies cannot be imported by the crew page as they are. `components/admin/wizard/step3ReviewSections.tsx` is a `"use client"` module (`components/admin/wizard/step3ReviewSections.tsx:1`) that imports admin server actions and admin API callers (e.g. `CrewRowActions`, `RescanSheetButton`, `VenueMapTile`, the data-quality warning controls; imports at `components/admin/wizard/step3ReviewSections.tsx:94-187`), and every body reads `Step3SectionChromeContext` through `BreakdownSection` (`components/admin/wizard/step3ReviewSections.tsx:1155-1188`). Importing it would ship admin code in the crew bundle.

So each shared body moves to a new neutral directory, components/show-panels/ (new):

- No module-level `"use client"`, no context reads, no imports from `components/admin/**`, `lib/admin/**`, or any server-only module. A structural test walks the directory and fails on any of these.
- Each body takes plain props: the section's data **already gated by the caller**, presentation props listed in §6.2, a `testIdPrefix`, and `ReactNode` slots for surface-specific extras.
- Interactive leaves (a "Show all" toggle, a copy button) are small `"use client"` components inside the same directory, under the same import ban.
- **Admin:** each `step3Sections` entry's `render` calls the shared body with the admin props, passing `testIdPrefix = wizard-step3-card-${dfid}-breakdown` and the admin-only pieces through slots. `BreakdownSection` and `ModalSectionChrome` stay in `step3ReviewSections.tsx` and wrap the shared body. The rendered DOM is unchanged (§12, PR B invariant).
- **Crew:** each section renders a crew panel card (the admin card's surface, border, radius, padding and shadow tokens, and its 28px icon chip with an `h3` label) around the shared body. Its header carries the section's existing per-card actions through a slot (§6.4). A parity test compares the crew card's classes with the admin card's.
- **Error containment.** `WrappedSection` catches only what throws while its own render callback runs (`components/crew/WrappedSection.tsx:92-110`); an element it returns renders later, outside the catch. So shared bodies are hook-free pure functions, and the crew side **calls** them (`Body(props)`) inside that callback, exactly as today's sections run their transforms there; an exception is then caught and recorded. Interactive client leaves render after the server pass, so each sits inside the existing client boundary (`TileErrorBoundary`, `components/shared/`). A test throws from a shared body and from a leaf and asserts both are contained and recorded.
- **Phone and email links.** A shared body never builds a `tel:` or `mailto:` href itself. It takes the builder as a prop, `telHref(phone): string | null`, and renders plain text when the builder returns null. Each surface passes exactly the builder it uses today: the admin passes each body's current normalizer (for transport, `ContactCell`'s digits-and-plus rule, `components/admin/wizard/step3ReviewSections.tsx:1480`, used for driver and load-out at `components/admin/wizard/step3ReviewSections.tsx:1556-1569`), so its rendered hrefs do not change; the crew page passes its `digitsOnly` guard (a link only when the digits are non-empty, phase 1 §4.16).
- **Sentinels.** The admin shows parsed values as parsed, including sentinels, muted; the crew page hides them (`shouldHideGenericOptional`, `lib/visibility/emptyState.ts:79`). Every shared body takes `sentinels: "show" | "hide"`.

### 6.2 Per-section decisions

Admin bodies and crew equivalents as compared at base `370e1cc9c`. "Crew keeps" lists the existing crew contracts the crew props must preserve; each is pinned by an existing test that migrates (§12).

| Section | Shared body (from) | Crew props and blocks | Admin props and slots | Crew keeps |
|---|---|---|---|---|
| `venue` | Where core of `VenueBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:1312`) | Maps link only when `isParseableUrl`; crew-only blocks below the body: Facilities (dock; parking behind `transportTileVisible`; Wi-Fi split with password copy; power), Status (COI with `data-testid="coi-status"`; venue notes) | `VenueMapTile` slot | COI stays visible to all crew here. Moving it to Billing would hide it from non-leads. |
| `event` | `EventDetailsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:2305`) | `keys`: the crew subset `CREW_TECH_SPEC_KEYS` (`lib/crew/eventDetailsSpecs.ts`) plus dress code and keynote; opening reel text through `stripOpeningReelText`, with the `OpeningReelVideo` player as a crew slot | all keys, Yes/No chips, attention from props | The reel URL strip (no `https://`, `drive.google.com`, `docs.google.com` in crew DOM). Wi-Fi and power stay in Venue. |
| `crew` | `CrewBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:1706`) | `cap` = `CREW_INLINE_CAP` with the crew overflow copy; "You", "Lead" and partial-attendance chips (humanized); call and text actions only when `digitsOnly(phone)` is non-empty | `cap` = admin `CREW_CAP` with its copy; `rowActions` slot (`CrewRowActions`); `underRow` slot (attention stack) | Overflow derives from `length - cap`. |
| `contacts` | `ContactsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:1232`) | `includeClient: false`; `cap` = `CONTACTS_INLINE_CAP`; `showNotes: true`; crew `telHref` | `includeClient: true`; no cap; `showNotes: false`; admin `telHref` | The client contact never reaches the crew DOM. |
| `schedule` | **not shared** | the crew keeps `DayCard` and `RunOfShowList` (`components/crew/primitives/RunOfShowList.tsx:35-119`) | the admin keeps `ScheduleDayRow` (`components/admin/wizard/step3ReviewSections.tsx:1911`) | The crew rows carry finish, duration, room, A/V notes, URL and sentinel cleanup and long-title disclosure that the admin row does not (a parser probe of the East Coast and Asset Management fixtures shows all four fields populated). Sharing the admin row would drop them; sharing the crew row would change the admin DOM. Documented limit L7. |
| `agenda` | `AgendaScheduleBlock`, already shared (`components/admin/wizard/step3ReviewSections.tsx:3755`) | wrapper unchanged (`AgendaEmbed` + viewer days) | wrappers unchanged | Hidden for suppressed viewers. |
| `hotels` | `HotelCard` (`components/admin/wizard/step3ReviewSections.tsx:2889`) | `showConfirmation: true`, `showNotes: true`, `showGuests: false`, `hideDates` when `suppressesDates`; ordered by `ordinal` | `showConfirmation: false`, `showNotes: false`, `showGuests: true`; `HOTELS_CAP` | Each surface keeps exactly the fields it shows today. The projection already limits crew to their own reservations. |
| `transport` | `TransportBody` (`components/admin/wizard/step3ReviewSections.tsx:1531`) | rendered **only when `transportTileVisible`** holds; `hideDates` when suppressed; `linkifyContacts: true` with crew `telHref` (tap to call the driver, the same number the assigned viewer sees today as text); crew-only block above it: "Your flight" | `linkifyContacts: true`, admin `telHref` | The section is listed for admins, when `transportTileVisible` holds, or when the viewer has a flight (§5.1); a flight-only viewer sees "Your flight" alone, and an admin whose transport fetch failed sees the degraded state. Driver, load-out contacts, vehicle, plate, parking, assignments and notes never reach a viewer the gate excludes (phase 1 watchpoint 14). |
| `rooms` | `RoomsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:2125`) | crew adopts the admin's room-first layout; `emphasize`: the viewer's disciplines get the "Your scope" label inside each room; `dropEmpty: true` (no "Not specified" rows); crew-only block below: Diagrams (the existing crew diagrams logic, embedded-first, MIME allowlist) | `ROOMS_CAP`; all five disciplines; diagrams sub-block as today | Every discipline stays visible to everyone; only emphasis differs (phase 1 D-5). Distinct discipline icons stay. |
| `packlist` | `PackListBreakdown` case list (`components/admin/wizard/step3ReviewSections.tsx:2529`) | `itemsCap: none`, `showRawSnippet: true`, `numbered: true` | items cap with toggle; archived-tab affordances as a slot | The caller renders it only when `isPackListVisibleToday`; the 12-case cap and overflow stay. |
| `billing` | key-value rows of `OpsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:1640`) | PO, Proposal, Invoice, Invoice notes | all five rows including COI | Rendered only when `financialsVisible` and the projection returned financials. |

**Crew-only content that has no admin section stays crew-only:**

- **Show notes** (the five-source aggregation of today's Today section, 8 sources, 280-character truncation) stay on the home screen as a card below quick facts (compact) and in the Today block (wide). Removing them from the first screen would push them one tap further away (anti-goal).
- **Dress code card.** Today renders the dress code in full (`components/crew/sections/TodaySection.tsx:537`), and `CREW_TECH_SPEC_KEYS` excludes it (`lib/crew/eventDetailsSpecs.ts:36`). In PR A and PR B the full Dress code card stays on the home screen, next to show notes, so the pass's truncated "Dress code" cell always has a full-text destination. PR C moves it into Event details and removes the home card in the same commit.
- **Diagrams** stay in Venue (`components/crew/sections/VenueSection.tsx:434`) through PR A and PR B; PR C moves them to Rooms in the same commit that gives Rooms its crew-only Diagrams block. No intermediate release lacks them.
- **"Your flight"** sits at the top of Transport.
- **COI** sits in Venue (row above).
- **Diagrams** sit in Rooms (row above).

### 6.3 Rollout of the shared bodies

The sections whose crew layout keeps its structure (`venue`, `crew`, `contacts`, `agenda`, `hotels`, `transport`, `billing`) move in PR B. The sections where the crew page adopts the admin's structure (`event`, `rooms`, `packlist`) move in PR C, because each reorganizes crew content and migrates the most crew tests. `schedule` stays per surface (§6.2).

### 6.4 Card header actions

Every crew card that has per-card header actions today keeps them, with its card id: the "In sheet" source link and the report button (`components/crew/primitives/CardHeaderActions.tsx:23`), mapped through `CARD_REGION_MAP` (`lib/sheet-links/buildSheetDeepLink.ts:177`) and pinned by `tests/components/crew/sourceLinkCoverage.test.tsx`. Where a section has several cards today (Venue: Where, Facilities, Status), each keeps its own actions. The run-of-show card keeps the actions Today's run-of-show card has. The new composite pieces (pass, quick facts) carry none: they summarize several sheet regions, so no single source link is honest. In PR B and PR C the crew panel card receives the actions through its header slot.

## 6A. Documented limits

Conservative behavior plus a visible fallback, not defects. A review finding that restates one of these without a probe showing silent wrong output files here, not as a round.

- **L1. Free-text times.** The countdown (§4.3) and the "Next" marker (§4.4) need a start time that parses as a clock time. Sheet times are free text ("7:45 AM", "10/20 @ TBD", "after lunch"). Anything that does not parse gets no countdown and no marker; the time still renders as written. Never a guessed time.
- **L2. Wi-Fi text that `wifiDisplay` cannot split** shows as one block and copies whole. The split heuristic itself is unchanged by this project.
- **L3. Hotel check-in and check-out are dates.** No clock times on travel days.
- **L4. No labeled crew call or doors time.** The per-day anchor is labeled "Show" (§9.1).
- **L5. Day selection resets on reload** (§4.2).
- **L6. The header search slot renders nothing** until search merges (§1.2).
- **L7. Schedule rows differ between surfaces.** The crew rows show fields the admin row does not (§6.2). Making the admin popup show them is an admin change outside this project.

## 7. Transition inventory

Every state change gets a treatment. Durations come from the existing tokens (`--duration-fast`, `--duration-normal`, `--ease-out-quart`, cited in §2); reduced motion collapses every row to instant through those tokens.

| From → To | Treatment |
|---|---|
| Sheet closed → open | Sheet slides up from the bottom edge, scrim fades in, `--duration-normal`, `--ease-out-quart`. |
| Sheet open → closed (close button, scrim tap, Esc, swipe down, browser Back) | Reverse of the above, same duration. Every close path runs the same exit. **Amendment 2026-10-30 (invariant-8 gate, critique F4; overridable), compound row: another section opened while this exit is still running** (a list row, an in-page link, `openSectionAndReveal`): the departing sheet is dropped at once, without the rest of its exit, and the new section's sheet opens with the closed → open slide. Its title and its body are the new section's from the first frame: reusing the departing frame showed the new title over the old body for as long as the body crossfade ran. An in-sheet switch (open on A → B) is unchanged: one open, the body crossfades. |
| Sheet open, dragging → released past the close threshold | Continues to closed with the exit animation. |
| Sheet open, dragging → released before the threshold | Springs back to open, `--duration-fast`. |
| Sheet open on section A → section B (an in-sheet link to another section) | Sheet stays up; body crossfades, `--duration-normal`; scroll position resets to top. |
| Day A selected → day B | Pass body and run-of-show card crossfade, `--duration-normal`; the pass keeps its height during the fade (§8). |
| Pass, today: live state X → live state Y | Existing 66-pair `transitionTreatment` table, unchanged. |
| Pass, today (live) → another day (static), and back | Crossfade, `--duration-normal`. |
| Day button (or "Now") unselected ↔ selected | Background and text color, `--duration-fast`. |
| "Now" button present ↔ absent (today enters or leaves the day set at midnight) | Instant; the row re-lays out with no animation. |
| Wide nav item inactive ↔ active | Accent bar moves to the active item, `--duration-fast` (matching the admin rail). |
| Copy toast hidden → shown → hidden | Fade and 4px rise in, `--duration-fast`; holds 2 s; fades out, `--duration-fast`. |
| Light ↔ dark theme | Instant (CSS variable swap). The pass does not change. |
| Quick fact, section card, run-of-show row present ↔ omitted | Instant. Only a server render changes these. |

**Compound transitions.**

| While | Then | Treatment |
|---|---|---|
| Sheet open | Realtime refresh re-renders the page (`ShowRealtimeBridge` → `router.refresh()`) | Sheet stays open on the same section; its body updates in place with no animation. The open section survives because the controller stays mounted (the freshness invariant cited in §2). |
| Sheet open | Viewport crosses into wide (rotation, window resize) | Sheet is dismissed without animation; the page shows the wide layout scrolled to that section; the URL keeps `?s=` and the entry keeps its marker. A nested dialog open inside it unmounts with it; the shared scroll lock leaves the page unlocked whatever the unmount order (§5.2). |
| Sheet mid-drag | Viewport crosses into wide | Drag is cancelled, then the row above applies. |
| Wide, scrolled to section A | Viewport crosses into compact | Home screen at the top; no sheet opens automatically; `replaceState(url without s, state without crewSheet)`. |
| Day `day(iso)` selected | Realtime refresh removes that day from the day set | Selection returns to `live`. |
| Sheet open | Realtime refresh removes the open section from membership | Sheet stays open showing the section's fresh empty or degraded state (§5.2); after a lost entitlement it closes to home instead, without animation (§5.2 amendment 2026-10-27). |
| Nested dialog open inside the sheet | Realtime refresh removes the dialog's owner | The nested dialog unmounts alone; the sheet stays open; scroll stays locked by the sheet. |
| Nested dialog open inside the sheet | Esc pressed | Only the nested dialog closes (§5.2). |
| Day crossfade running | Another day tapped | The second selection wins; the running fade is replaced, never queued. |
| Sheet open | Theme switched | Not reachable: the header is behind the scrim and inert while the sheet is open. |

## 8. Dimensional invariants

Tailwind v4 here does not stretch flex children by default; each relationship below names the class that guarantees it, and the plan asserts each with `getBoundingClientRect()` in a real browser.

1. **Day row.** Up to 4 buttons (days plus "Now"): a grid with one equal track per day (`grid` + `grid-cols-[repeat(N,minmax(0,1fr))]`), every button the full row height (`items-stretch` on the row, `h-full` on the button). Five or more: a flex row with `min-w-16` buttons and `snap-x`, buttons still `self-stretch`.
2. **Pass.** The card keeps a fixed minimum height across day crossfades and live-state swaps (the existing `--spacing-right-now-min-h`, carried from `RightNowHero`). The fact grid is `grid-cols-3`, every cell `min-w-0` so values truncate instead of widening the column. **Amendment 2026-10-30 (overridable, see the §4.3 item 5 amendment):** the fact grid is `grid-cols-2 @lg/pass:grid-cols-3`, every cell still `min-w-0` so a long value wraps or clamps at 2 lines instead of widening the column; the minimum height is a floor, and the card grows past it for a wrapped value.
3. **Quick facts.** `grid-cols-2` with `items-stretch`; every tile `h-full`, so tiles in one row share a height. A spanning tile is `col-span-2`.
4. **Section sheet (compact).** Fixed to the viewport bottom, `max-h-[90dvh]`, a flex column: the header row is `shrink-0`, the body is `flex-1 min-h-0 overflow-y-auto`. The sheet never grows past 90% of the dynamic viewport height, and its body scrolls inside it.
5. **Wide layout.** The nav is `w-60 shrink-0`, sticky under the header, its height the viewport minus the header (`h-[calc(100dvh-var(--crew-header-h))]`) with its own scroll. The content column is `flex-1 min-w-0`.
6. **Header.** One fixed height token `--crew-header-h`, used by the header itself, the wide nav offset and the scroll-margin of every section anchor (so a nav jump never lands a heading under the header). **Amendment 2026-10-30 (invariant-8 gate, audit P1-2 / P1-3, critique F3; overridable):** the header sticks at `--crew-sticky-top`, which is 0 on the crew route and the admin preview banner's measured height on the preview route (the banner publishes it as `--preview-banner-h`), so the banner never covers the header. The nav's sticky offset and height, every section's scroll margin, and the page's `scroll-padding-top` from 1024px read the header's bottom edge, `--crew-header-bottom` (that offset plus `--crew-header-h`), so neither a nav jump nor keyboard focus lands under the header or the banner.

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
| Not scheduled today (live state `viewer_off_day`) | "Not scheduled today." plus "Your next day: Mon Jun 15." when one exists (the existing state's next-assigned-day line). |
| Show time already passed today | "Show started at 7:45 AM." |
| Viewer's last day is over | "Your days are done." (live state `viewer_after_last_day`) |
| Days not confirmed | "Your days aren't confirmed yet." (live state `viewer_unconfirmed`) |
| Dates not finalized | "Dates aren't finalized." (live state `unknown`) |
| Copy to clipboard failed | "Couldn't copy. Press and hold the text to copy it." |
| No quick facts have data | The quick-facts block is omitted. No empty-state copy. |

Offline ("You're offline. Info from 6:05 AM.") and search empty results ("No matches. Try dock, hotel, or a name.") belong to their projects; listed here only so the wording matches.

### 9.4 Accessible names

- Day buttons: "Sun Jun 14, show day 1" (plus `aria-pressed`). The "Now" button: "Now, your live status".
- Copy buttons: "Copy Wi-Fi details", "Copy hotel confirmation number".
- Sheet close: "Close" + the section name ("Close crew").
- Theme switch: the existing `ThemeToggle`, unchanged: accessible name "Dark mode" with `aria-pressed` reporting whether dark is on (`components/layout/ThemeToggle.tsx:122-124`), the same toggle model as the avatar menu's checkbox.
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
| Selected day's `ScheduleDay` | the run card is built from the day's agenda sessions alone when there are any, else omitted; the pass still renders its anchors from the key times (e.g. a load-in anchor from `dates.loadIn` with no `ScheduleDay` for that date, as in `fixtures/shows/raw/2024-05-east-coast-family-office.md`), its fact grid and its phase label | same as absent | entries failing `isDisplayableEntry` are skipped (existing) |
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
- Compact: open from the list, close button, scrim, Esc, Back, swipe; deep link `?s=venue`; from PR B, legacy `?s=travel` opening `hotels`; refresh with the sheet open; realtime refresh with the sheet open (§7 compound).
- Wide: nav click scrolls and focuses the heading; scroll-spy follows; `?s=` deep link scrolls.
- Resize across 1024px with the sheet open and mid-scroll (§7 compound rows).
- Every §8 invariant via `getBoundingClientRect()`, ±0.5px.
- The pass's computed background equals the dark surface token in both themes.

**Migrations, not deletions.** Existing tests that pin removed structure (`CrewSubNav`, the bottom bar, `data-active-section`, the hero testid and its 176px canonical baseline in `tests/e2e/__baselines__/canonical-dimensions.json`) are retargeted to the new elements, keeping their failure modes, before the old components are deleted. Help screenshots `crew-preview-{today,gear,schedule}-mobile-{light,dark}` regenerate through the pinned-image `screenshots-regen` workflow, never from a dev host.

**Structural and location-pinned suites.** These pin file paths, line numbers, ownership maps or walked directories that the change moves, and are updated in the commit that moves the code they pin: `tests/styles/forcedColorsCensus.ts` (with `_metaForcedColors`), `_metaControlOutlineFill`, `_metaControlOutlineResidue`, `subtleInteractiveExemptions.ts`, `tapTargetCensus.ts`, `tests/adminAlerts/alertProducerScope.registry.ts`, `tests/help/_metaRenderFaultMarking.test.ts` (and `tests/help/_renderFaultScan.ts`), `tests/crew/_metaTileProducerTopology.test.ts` (its section ownership map), `tests/crew/agendaDisplay-single-source.test.ts`, `tests/crew/stageRestrictionThreading.test.ts`, `tests/crew/transitionAudit.test.ts`, `tests/styles/_metaBgAccentInventory.test.ts`, `tests/help/_metaServerTimeGuard.test.ts`, `tests/docs/_metaInteractionTimingInventory.test.ts`, `tests/styles/_metaEmDashCopy.test.ts`, `tests/components/admin/sheetIconLinkContainment.test.ts`, and for PR B and PR C the admin source pins `tests/components/admin/wizard/venueTransitionAudit.test.ts`, `tests/styles/controlOutlineDimensions.test.ts`, `tests/styles/controlOutlineTransitions.test.ts`, `tests/styles/tintedPlateOutline.test.ts`. Two walkers gain `components/show-panels/`: `tests/components/tiles/_metaSentinelHidingContract.test.ts` and `tests/components/tiles/_pureRenderCompliance.test.ts`. Also `tests/specLint/canonicalTokenIdentity.test.ts`, which reads `components/crew/RightNowHero.tsx` directly. This list is the at-authoring-time set, not a closure. The closure is derived, twice: (1) `rg -l "RightNowHero|CrewSubNav|components/crew/CrewSections|right-now-hero" tests` (42 files at base `370e1cc9c`) is re-run before each deletion and every hit is migrated or deleted with its failure mode carried over; (2) before every review dispatch the plan runs the full `tests/styles`, `tests/crew`, `tests/components`, `tests/help`, `tests/docs`, `tests/specLint` and `tests/adminAlerts` suites against the changed tree and repairs every red one.

**PR B and PR C invariant.** The admin popup's **rendered** DOM does not change. The 50 zero-threshold PNGs under `tests/e2e/section-header-visual.spec.ts-snapshots/` and every admin test that asserts rendered output stay unmodified and green; a diff touching one of them is a defect, not a re-baseline. Admin tests that pin source location or markup inside `step3ReviewSections.tsx` (listed above) are retargeted to the moved code, asserting the same thing.

**Further cases from the round-1 review.** A flight-only viewer's HTML and RSC payload contain none of the transport fields (§6.2). Each row of the §5.2 history table, including an in-sheet switch followed by close (lands on home, not the first section). Each nested dialog with the sheet open: Esc closes only the dialog; focus returns inside the sheet; scroll stays locked while either is open; closing both at once (Back to another route, a breakpoint change) leaves the destination page scrollable. lib/ui/scrollLock.ts (new) unit-tested for every release order of three holders; the structural writer test (§5.2) proven by planting a fifth writer. Two mounted theme controls stay in agreement after either toggles. A row link carries `gate` when present. A shared body and a client leaf that throw are both contained and recorded.

## 13. Acceptance criteria

- **AC-1.** Below 1024px the crew page shows, in order: header, day row (when allowed), pass, run of show (when entries exist), quick facts (when any resolve), show notes (when any source has a note), "All sections".
- **AC-2.** Tapping an "All sections" row opens that section in a bottom sheet and sets `?s=`; every close path removes it; browser Back closes a sheet opened in-app before it leaves the page; from a fresh deep link, Back leaves the page (§5.2).
- **AC-3.** At 1024px and up the page shows the left nav, the Today block, then every section stacked; the nav tracks the section in view.
- **AC-4.** Every old `?s=` value still opens the matching section or home.
- **AC-5.** The theme switch is visible in the header for every viewer and persists across reloads; the pass stays dark in light mode.
- **AC-6.** No viewer ever receives, in HTML or the RSC payload, a date, hotel, transport field, flight or financial value that the live page withholds from them today.
- **AC-7.** Quick facts never show an empty tile, never show the client contact, and the hotel fact never names a hotel that does not cover the night.
- **AC-8.** Copy succeeds with a toast, or fails with a toast and selectable text.
- **AC-9.** The admin popup renders the shared section bodies (PR B, PR C) with its DOM unchanged.
- **AC-10.** After PR C, the section ids, labels and groups the crew page shows equal the admin popup's (§5.1).
- **AC-11.** Every §8 dimensional invariant holds in a real browser.
- **AC-12.** Every §7 transition, including the compound rows, behaves as listed; reduced motion makes all of them instant.
- **AC-13.** All copy matches §9; no em dash, no raw error code.
- **AC-14.** The impeccable critique and audit pass on the diff with P0 and P1 findings fixed or deferred in `DEFERRED.md`.

## 14. Rollout

Three pull requests on this branch, merged in order. Each runs the full pipeline gates: impeccable critique and audit, cross-model diff review, real CI green, merge.

- **PR A, crew page redesign.** Everything in §3 to §5 and §7 to §11 on top of today's crew section bodies and today's section ids (§5.1), plus the shared theme store (§4.1). `CrewSubNav` and `RightNowHero` are retired after their tests migrate. `DESIGN.md` amendments (§3.3).
- **PR B, shared bodies, part 1.** The registry (§5.1) and components/show-panels/ (new) with the bodies for `venue`, `crew`, `contacts`, `agenda`, `hotels`, `transport`, `billing` (§6.3); the crew page moves to their registry ids with the PR B aliases. The admin popup renders them with its rendered DOM unchanged.
- **PR C, shared bodies, part 2.** `event`, `rooms`, `packlist`: the crew page adopts the admin structure for these three (§6.2); the home Dress code card moves into Event details and Diagrams move from Venue to Rooms, each in the commit that adds its new home; `gear` retires with its alias.
