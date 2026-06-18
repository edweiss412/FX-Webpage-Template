# Crew show-page redesign — Phase 1 (six-section sub-nav) — Design Spec

Phase 1 of the crew-facing show-page redesign. Reorganizes the single cramped tile scroll into a six-section sub-nav (Today · Schedule · Venue · Travel · Crew · Gear, plus a conditional Budget tab), faithful to the Claude Design mock, built **over the existing data/gating/state-machine infrastructure** (Approach B). Phase 2 (AGENDA-title parser + new-field surfacing) is a separate spec; this document draws the boundary at §11.

Scope note: this redesigns the crew show experience rendered by the **two** routes that today both mount `ShowBody` — the crew route `app/show/[slug]/[shareToken]/page.tsx` (`:129`, `:166`) and the admin **preview-as** route `app/admin/show/[slug]/preview/[crewId]/page.tsx` (`:233`). Both move to `CrewShell`. The admin *operational* show page `app/admin/show/[slug]/page.tsx` is untouched.

---

## 1. Summary

Today the crew page renders a hero `RightNowCard`, a date-driven TODAY band, and a flat 14-tile grid (`app/show/[slug]/[shareToken]/_ShowBody.tsx:434-449`, `:90-96`). On a phone this is one long cramped scroll. Phase 1 replaces `ShowBody` with a `CrewShell` that routes a **URL-addressable** sub-nav (`?s=<section>`) into six focused section views plus a conditional Budget tab. The sections are **new presentational compositions** that consume the **unchanged** `ShowForViewer` projection, `selectRightNowState` machine, visibility predicates, and `shouldHideGenericOptional` empty-state discipline. The Right-Now hero is re-skinned to the mock across all **12** existing states, and its time anchors (plus a new Today "Key times" strip and the Schedule "Daily times") are **re-sourced from `rooms.{set_time,show_time,strike_time}`** — the only reliably-populated clock fields — fixing blanks the live hero already renders. The one structured-data addition is a small dates-parser extension capturing the load-in time the parser currently discards, stored in the existing `dates` jsonb (no table migration).

---

## 2. Resolved decisions (owner Q&A, 2026-06-15)

- **D-1 IA.** Six sections — Today · Schedule · Venue · Travel · Crew · Gear — confirmed. **Today keeps the mock's intentional duplication** (its Tonight/Where/Need-something cards are field-subsets of Lodging/Venue/Crew).
- **D-2 Homes.** **Opening Reel folds into Gear.** **Show-status pill moves into the header.**
- **D-3 Approach B.** New section + presentational components over reused projection / gating / state-machine / empty-state logic. Not whole-tile reuse (fails the recomposition), not a reskin (half-measure).
- **D-4 Navigation.** **URL-addressable** via a `?s=<section>` search param (deep-link, refresh, mobile back-button all work; active section SSRs). Invalid/absent → `today`.
- **D-5 Gear visibility.** **Show all A/V/L scope to everyone**, but **emphasize the viewer's own discipline** (sort first + accent treatment). The `scopeTiles` role predicates flip from *gate* to *emphasis* signal.
- **D-6 Desktop nav.** **Top tabs only** (mock's side-rail dropped, same bucket as the mock's accent/density dev tweaks). Mobile = bottom tab-bar. Mode boundary = `min-[720px]` (project has no `md` breakpoint; §4.7).
- **D-7 Financials.** **Kept lead-gated**, surfaced via a **conditional Budget tab** that renders only when `financialsVisible(viewerFlags, isAdmin)` is true.
- **D-8 Time anchors.** Labels **Set · Show · Strike**, sourced from `rooms.{set_time,show_time,strike_time}` (GS room primary; free-text labels, not parsed clocks). **Doors dropped** (no source). Hotel shows **dates only** (no time-of-day). **`buildRightNowContext` extended to read `rooms`** instead of the always-empty `event_details` time keys.
- **D-9 Load-in source.** **Extend the dates parser to capture the DATES TIME column** (currently discarded), stored in the `dates` jsonb; **fall back to `rooms.set_time`** when the TIME column is absent/empty.
- **D-10 Mock-only stats dropped** (no source in any of 7 real sheets): labeled Crew call, Doors, hotel room-type, hotel check-in/out time-of-day. Accent/density theming dropped (never real — only `data-theme` dark/light exists).

Audit + source-data verification record: memory `project-crew-page-redesign`; v2-template candidate fields parked at `BACKLOG.md` BL-CREW-SHEET-TEMPLATE-V2.

---

## 3. Current state (verified citations, 2026-06-17 @ base `a2884c3f`)

> This section cites **existing** code only. New Phase 1 artifacts — `CrewShell`, `CrewSubNav`, `RightNowHero`, the `components/crew/` primitives, `resolveActiveSection`, the `dates.loadIn` field, and `buildRightNowContext`'s rooms-sourcing — are design (§4), not current code.

**Route / body.** `resolveShowPageAccess` (`app/show/[slug]/[shareToken]/page.tsx:39`) returns an 11-kind union; the **admin** branch (`page.tsx:115-137`) and **resolved/crew** branch (`:139-174`) both render `ShowBody` (`_ShowBody.tsx:90-96`). Crew passes `identityChip` (roster lookup, `page.tsx:171`); admin passes `null`. `ShowBody` renders Header → `ShowRealtimeBridge` (`_ShowBody.tsx:469`) → `RightNowCard` → TODAY band (`selectTodayTiles`/`filterVisibleTodayTiles` at `:154`) → flat grid (`flatGridOrder`, 14 tiles, `:434-449`) → Footer.

**State machine.** `selectRightNowState(today, dates, viewerDateRestriction, options?)` (`lib/time/rightNow.ts:196-201`) → `RightNowState` (`:57-77`) with **12 kinds**: `viewer_unconfirmed`, `viewer_after_last_day`, `viewer_off_day`, `viewer_off_day_pre`, `pre_travel`, `travel_in_day`, `set_day`, `show_day_n {n,total,isLast}`, `travel_out_day`, `post_show`, `unknown`, `dateless`. `transitionTreatment(from,to)` (`lib/time/rightNowTransitions.ts:594-606`) → `"crossfade-body" | "morph-to-last-good" | "instant" | "unreachable"`; 66 unordered pairs (`:564-566`). `nowDate()` (`lib/time/now.ts:23-74`) honors `X-Screenshot-Frozen-Now` under test auth.

**Right-Now context.** `buildRightNowContext({show: Pick<ShowRow,'dates'|'title'|'venue'|'event_details'>, dateRestriction, hotelReservations, contacts})` (`components/right-now/buildRightNowContext.ts:63-103`) → `RightNowContext` (`:23-48`). It reads `callTime`/`loadInTime`/`strikeTime`/`roomName` from `event_details.{call_time,load_in_time,strike_time,first_show_room}` (`:73-82`) and `hotelCheckInTime`/`Out` from `check_in`/`check_out` **dates** (`:94-95`). **It does NOT accept `rooms`** (the `contacts` param is accepted but unused). Call site `_ShowBody.tsx:122-127`; **`rooms` is fetched but never passed** to it (`_ShowBody.tsx:258-261`). `RightNowCard` (`'use client'`, `RightNowCard.tsx:121`) takes `{context}` (`:337-339`), animates body swaps via `AnimatePresence mode="wait" initial={false}` (`:644`) with framer `duration: 0.22` / `ease [0.25,1,0.5,1]` collapsed to 0 under reduced motion (`:532-557`).

**Verified empty (the blank-hero finding).** No real sheet emits `event_details.{call_time,load_in_time,strike_time,first_show_room}` — confirmed across 7 sheets — so those four render `null` today. The reliably-populated clock fields are `rooms.{set_time,show_time,strike_time}` (free-text, `RoomRow` `lib/parser/types.ts:129-147`, projected `getShowForViewer.ts:386-388`).

**Visibility.** `audioScopeVisible(flags)` (`lib/visibility/scopeTiles.ts:84-86`), `videoScopeVisible(flags)` (`:95-97`), `lightingScopeVisible(flags)` (`:112-114`), `financialsVisible(flags,isAdmin)` (`:136-138`), `transportTileVisible(opts)` (`:168-186`); `isPackListVisibleToday(opts)` (`lib/visibility/packList.ts:122-140`). `shouldHideGenericOptional(value)` (`lib/visibility/emptyState.ts:75-78`) hides `{"", "TBD", "N/A", "TBA"}` (`GENERIC_OPTIONAL_HIDE`, `:52`). `DateRestriction` kinds `explicit|unknown_asterisk|none` (`lib/parser/types.ts:10-13`).

**Projection / types.** `getShowForViewer(showId, viewer)` (`lib/data/getShowForViewer.ts:199-200`) → `ShowForViewer` (`:94-197`): `show`, `crewMembers[]` (each with `roleFlags`, `dateRestriction`, `stageRestriction`), `hotelReservations`, `rooms`, `transportation`, `contacts`, `pullSheet`, `diagrams`, `openingReelHasVideo`, `lastSyncedAt`, `lastSyncStatus`, `tileErrors`, `financials?`, `viewerName`, `viewerVersionToken`. `Viewer` is identity-only (`:80-83`, `crew|admin|admin_preview`, no role field). `ShowRow` (`lib/parser/types.ts:82-113`); `dates {travelIn,set,showDays[],travelOut}` (`:94-99`); `RoleFlag` 19 values (`:36-61`); `RoomKind = gs|breakout|additional` (`:129`); `ContactKind = venue|in_house_av` (`:173`); `FinancialsRow` (`getShowForViewer.ts:67-72`).

**Layout / tokens.** Header (`components/layout/Header.tsx:50-102`, identity right-slot `:86-98`); Footer (`components/layout/Footer.tsx:96-167`, ThemeToggle `:163`); StaleFooter (`components/shared/StaleFooter.tsx:75-109`); IdentityChip (`components/auth/IdentityChip.tsx:30-70`); ThemeToggle sets `data-theme` (`components/layout/ThemeToggle.tsx:114`). Tokens (all EXACT in `app/globals.css` `@theme`): `--spacing-right-now-min-h` (`:170`, 176px), `--spacing-section-gap` (`:151`, 32px), `--spacing-tile-gap` (`:150`), `--spacing-tap-min` (`:141`, 44px), `--spacing-page-pad-mobile/desktop` (`:171/:172`), `--duration-fast/normal/slow` (`:182-184`), `--ease-out-quart/expo` (`:186-187`), `--radius-sm/md` (`:175-176`), `--breakpoint-sm/lg/xl` (`:197-199`; **no `md`**), `--tracking-eyebrow/-strong` (`:131-132`), accent tokens (`:48-52`). `[data-theme="dark"]` (`:301`); reduced-motion duration collapse (`:341-347`). **No `data-accent`/`data-density`** anywhere (grep-confirmed).

**Parser dates.** `parseDates(markdown, version, _agg?)` (`lib/parser/blocks/dates.ts:48-72`) → `parseV2V4Dates` (`:157-238`, reads label `row[1]` + date `row[3]`, **discards `row[4]` TIME/AGENDA**) or `parseV1Dates` (`:104-153`, `extractAllDates` on `row[1]`, time discarded). `shows.dates` is **jsonb** (`supabase/migrations/20260501000000_initial_public_schema.sql:12`) — schemaless, **no table migration to add a load-in field**; reader decodes via `decodeJsonbColumn` (`getShowForViewer.ts:250-280`).

**Tests / meta.** `_metaSentinelHidingContract.test.ts` walks `components/tiles/` via `listTileFiles()` (`:235-239`), asserts each tile reading a generic-optional field imports+calls `shouldHideGenericOptional` (`:245-287`; EXEMPTIONS empty `:225-228`). `selectTodayTiles.test.ts:27-91` pins phase→tile. `resolve-show-page-access-exhaustiveness.test.ts:93-235` (pure type contract). **`tests/e2e/crew-page.spec.ts:167-233 & 403-499`** already asserts real-browser `getBoundingClientRect()` today-band equal-height (mutates seeded state, mobile-safari single-writer `:397`). `help-screenshots.manifest.ts` (type defs `:10-47`, `MANIFEST` array `:48-87`, 4 entries, **no crew-page entry**; MOBILE 390×844, DESKTOP 1280×800); `capture-launch-args.ts:1-29` (`CAPTURE_LAUNCH_ARGS`); `.github/workflows/screenshots-drift.yml:1-51` (Playwright `v1.59.1-jammy`).

---

## 4. Design

### 4.1 Shell + routing — `_CrewShell.tsx`

`ShowBody` is replaced by `CrewShell` (same file slot, `app/show/[slug]/[shareToken]/_CrewShell.tsx`); `page.tsx` admin + resolved branches both render it (unchanged call shape, plus the active section). The active section is read **server-side** from `searchParams.s`:

- `page.tsx` today awaits `searchParams: Promise<{ gate?: string }>` (`:71`, `:74`). Phase 1 widens it to `Promise<{ gate?: string; s?: string }>`, awaits `s`, and passes `activeSection={s}` to `CrewShell`, which validates against the section-id set and falls back to `today` for absent/invalid values (`resolveActiveSection(raw): SectionId`). The admin **preview-as** route (`app/admin/show/[slug]/preview/[crewId]/page.tsx:233`) likewise swaps `ShowBody`→`CrewShell`, reading its own `?s=` from `searchParams` (default `today`).
- Section ids: `today | schedule | venue | travel | crew | gear` and (conditional) `budget`.
- **Fail-closed on malformed projection (ported from `_ShowBody.tsx:113-122`).** `CrewShell` calls `resolveViewerContext(viewer, data)` and catches `MalformedProjectionError` (`lib/data/viewerContext.ts:123`, thrown when `crewMembers` is not an array) → renders `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` and **no** section content. Falling back to `none` restrictions would render Schedule / Pack List / Right Now **unrestricted** (a trust-boundary regression — a ratified prior-milestone fail-closed contract). The catch lives in `CrewShell` (the Server Component during render), not the page functions (the call sites have already returned their element).
- **Footer report-prop contract (ported verbatim from `_ShowBody.tsx:509-535`).** `CrewShell` passes the Footer the same per-viewer-kind report props: `reportSurfaceOverride = viewer.kind === 'admin_preview' ? 'admin' : 'crew'`; `reportSurfaceIdOverride = `admin-preview-footer-${slug}-${crewMemberId}`` **only** for `admin_preview`; `reportAutocapture` carrying the `crewPreview` payload **only** for `admin_preview`. Porting verbatim (not re-deriving) keeps preview-as bug reports attributed to the previewed crew, not a generic crew surface.
- `CrewShell` renders, inside a `data-testid="crew-shell"` wrapper: `Header` (with status pill + identity chip) → `CrewSubNav` → `ShowRealtimeBridge` (unchanged) → `<TileErrorAlertBridge>` (§4.13 — always rendered, section-independent observability) → the active `*Section` → `Footer`. Today additionally leads its section with `RightNowHero`.
- All sections are **Server Components**; the only client islands are `CrewSubNav` (active-state + router push), `RightNowHero`'s minute-ticker (carried from `RightNowCard`), `ShowRealtimeBridge`, and `ThemeToggle`.

**Navigation mechanics.** `CrewSubNav` is `'use client'`. Tab activation calls `router.push(`?s=${id}`, { scroll: false })` (App Router shallow URL update; the server re-renders the active section). `usePathname`/`useSearchParams` drive the active highlight. Mobile back-button traverses the `?s=` history entries; deep-link/refresh server-render the addressed section.

### 4.2 Section views

Each `*Section` is a Server Component under `components/crew/sections/` consuming `ShowForViewer` + the viewer's `roleFlags`/restrictions (already on `crewMembers[]` / resolvable for the viewer). Composition per the approved IA map:

| Section | Blocks | Data source |
| --- | --- | --- |
| **Today** | `RightNowHero`; `KeyTimesStrip`; Tonight (hotel name + shuttle); Where (venue + badge-in); Need-something (primary contact); Show notes | `RightNowContext`+rooms; `hotelReservations`; `venue`; `contacts`/`client_contact`; venue/show notes via `shouldHideGenericOptional` |
| **Schedule** | Day phase cards (travel/set/show/strike, today pinned, viewer-date-restricted); Daily times (`KeyTimesStrip` — Set/Show/Strike, omitted if no anchors); Heads-up note (optional) | `dates` + `ShowRow.schedule_phases` (`Record<ISO, WorkPhase[]>`, `lib/parser/types.ts:105`) + viewer `dateRestriction`; rooms times; Heads-up from a show-level note, hidden-if-empty via `shouldHideGenericOptional` |
| **Venue** | Address+room; loading dock; parking (**gated by `transportTileVisible`** — it's a transportation-row field, §4.13a); Wi-Fi (Phase 2 parses; Phase 1 shows raw `event_details.internet` if present); notes; map link; diagrams | `venue`; `transportation.parking` + viewer name/isAdmin; `event_details.internet`; `diagrams` |
| **Travel** | Getting there (ground transport **gated by `transportTileVisible`**; flights are Phase 2); Where you're staying (hotel name/address/conf#/**dates**) | `transportation` (ground) + viewer name/isAdmin; `hotelReservations`. Flights deferred — `flight_info` is parsed but **not in the `ShowForViewer` projection** (§8) |
| **Crew** | Show crew (roster, role, lead tag, "you", tap-to-call/email); Key contacts | `crewMembers`; `contacts` + `client_contact` |
| **Gear** | A/V/L scope (emphasis §4.5); Pack list (**gated by `isPackListVisibleToday`**); Opening Reel (existing `OpeningReelTile` visibility) | `rooms.{audio,video,lighting}`; `pullSheet` + viewer `stageRestriction` + `today`; `openingReelHasVideo` + `shouldHideOpeningReel` (`lib/visibility/emptyState.ts`) |
| **Budget** (conditional) | PO / proposal / invoice / notes | `financials` (renders only when `financialsVisible` true) |

Lead-gating preserved: `financialsVisible(viewerFlags, isAdmin)` gates both the Budget **tab** (§4.1) and section. Date-restriction gates Schedule rows. Fetch-error gating (`tileErrors`) preserved: admin sees a degraded block, crew sees omission (§5).

**Section-level empty states.** Every section (not just Gear) shows one section-level `EmptyState` when *all* its content blocks are empty/hidden (e.g. Venue with no address, dock, parking, wifi, notes, or diagrams). **Travel "Getting there":** ground-transport rows render **only when `transportTileVisible({ transportation, viewerName, isAdmin })` is true** (admin, the assigned driver, or crew named on a transport leg — preserved from the current `TransportTile` trust boundary; driver PII / vehicle / plate / parking / assignments are never shown to unassigned crew). **Flights are deferred to Phase 2** — `flight_info` is not in the Phase-1 projection, so Phase 1 renders **no** flight rows and makes no false "haven't been added" claim. If transport is gated-out or absent (and no flights), the Getting-there card is omitted / empty-stated. The hotel block is independent (its own required→`EmptyState`).

### 4.3 Right-Now hero across all 12 states — `RightNowHero`

`RightNowHero` re-skins the existing `RightNowCard` output into the mock's hero shape — five slots: **eyebrow** (+ live-dot when "now"), **lead**, **detail**, **progress** (segments), **stats** (≤3 key-values, one accented). It consumes the SAME `selectRightNowState` machine and a `RightNowContext` (extended per §4.4). All **12 kinds** render (mock designed 5); mapping:

| Kind | Eyebrow | Lead | Progress | Treatment |
| --- | --- | --- | --- | --- |
| `show_day_n {n,total,isLast}` | "Today" +dot | "Today: Show day n of N" | N segments | live |
| `travel_in_day` | "Today" | "Today: Travel in" | — | live |
| `set_day` | "Today" | "Today: Set / load-in" | — | live |
| `travel_out_day` | "Today" | "Travel out today" | — | live |
| `pre_travel {daysAway}` | "Up next" | "N days until travel in" | — | normal |
| `viewer_off_day {nextAssignedDay}` | "Today" | "Not scheduled today" | — | normal |
| `viewer_off_day_pre {firstAssignedDay,daysAway}` | "Up next" | "Not scheduled yet" | — | normal |
| `viewer_after_last_day {travelOut}` | "Wrapped for you" | "Your days are done" | — | normal |
| `post_show {wrappedAt}` | "Show complete" | "That's a wrap" | — | normal |
| `viewer_unconfirmed` | "Heads up" | "Your days aren't confirmed yet" | — | degraded tint |
| `unknown` | "Show details" | "Dates aren't finalized" | — | degraded tint |
| `dateless` | "Show details" | minimal fallback copy | — | degraded tint |

- **Stats content (D-8):** Phase-1-available sources only. `show_day_n` → Show (accent) + Strike (when `isLast`), from `rooms`; `set_day` → Set/load-in (resolved per §4.4); `travel_in_day`/`travel_out_day` → hotel **name + dates** (`hotelReservations`, dates only — never a clock time); `pre_travel` → days-away + travel-in date (`dates`); degraded states → no stats. **No `flight` or `next-call` stats** — flights are Phase 2 and labeled call/doors have no source (§7.1–7.2). Empty stats → strip omitted entirely (§4.8).
- **Degraded states** (`dateless`/`unknown`/`viewer_unconfirmed`) get the existing stale-tint visual; no stats.
- **Container invariant:** fixed `min-h-(--spacing-right-now-min-h)` (176px) during the `AnimatePresence` crossfade so body swaps don't resize the card (carried from `RightNowCard`).
- **Transitions:** reuse `transitionTreatment` + the 66-pair table wholesale (§4.10).

### 4.4 Time anchors — rooms-sourced + dates-parser load-in

Two changes, both small and bounded:

1. **`buildRightNowContext` reads `rooms`.** New signature: `{ show, dateRestriction, hotelReservations, rooms }` — **drops the unused `contacts` param** (dead-param cleanup, gotcha §3) and **keeps `hotelReservations`** (travel-day hotel stats). Set/Show/Strike derive from the **GS room** (`kind==='gs'`, else first room) `set_time`/`show_time`/`strike_time` (free-text). The old `event_details.{call_time,load_in_time,strike_time,first_show_room}` reads are **dropped entirely** (always null for real shows, §7.1) — not kept as a fallback. **Set-anchor resolution order** (applied in `buildRightNowContext` and the shared `resolveKeyTimes(show, rooms)` helper that `KeyTimesStrip` + Schedule also call — never in the parser): (1) `dates.loadIn` if non-empty (change 2); (2) else GS `set_time`; (3) else omit the Set row. When `rooms` is null/empty, all three anchors are null and the strip is omitted (§4.8). **Deterministic room selection** — the rooms query has **no `ORDER BY`** (`getShowForViewer.ts:376`), so "first room" is not stable. `resolveKeyTimes` sorts rooms by `name` (ascending), picks the first `kind==='gs'`; if no GS room, the first room by name; multiple GS rooms → the name-first one. This makes the anchors (and screenshot baselines) deterministic regardless of DB return order. The **sole call site** is `_CrewShell` (was `_ShowBody.tsx:122`; both ShowBody consumers now route through the shell — §3 scope note).
2. **Dates parser captures the load-in TIME column.** `parseV2V4Dates` (`dates.ts:157-238`) currently discards `row[4]` (TIME/AGENDA). Capture it from the TIME column of the **set/load-in** row — covering **both** the plain `set` and the combined `travel_set` (`TRAVEL / SET`) classifications (`dates.ts:28`, `:35`, `:196`), since both establish the set/load-in day — into a new optional `dates.loadIn: string | null` (free-text, e.g. "11:00 AM"); if both a `travel_set` and a separate `set` row carry a TIME (rare), the explicit `set` row wins. Stored in the existing `shows.dates` **jsonb** (no table migration; §6). `parseV1Dates` best-effort (time often absent in v1; null is fine). `ShowRow.dates` type gains `loadIn?: string | null`. `getShowForViewer` passes it through (jsonb decode already generic).

**`KeyTimesStrip`** (Today) and Schedule "Daily times" both render the same resolved anchors: **Set** (`dates.loadIn` ?? GS `set_time`), **Show** (GS `show_time`), **Strike** (GS `strike_time`) — labels per D-8, free-text values, `tabular-nums`. Zero anchors → strip omitted (not blank). Multi-day shows carry one show-wide Set/Show/Strike (sheets store one value, not per-day); matinee/final-day variance stays a best-effort "Heads up" note (often empty → hidden).

### 4.5 Gear — emphasis (show-all, highlight viewer's discipline)

All three scope cards render to everyone. The viewer's discipline (derived from the SAME `roleFlags` that drove `audioScopeVisible`/`videoScopeVisible`/`lightingScopeVisible` — reused as an **emphasis** predicate, not a gate) is:

- **Ordered first** (viewer's discipline card(s) ahead of the rest, otherwise Audio→Video→Lighting).
- **Accented**: a "Your scope" eyebrow + an accent left-edge / accent-tint header on the viewer's card(s), within the ≤10% accent-coverage rule. Non-viewer cards are full-content, neutral.

Guards: no scope flag → no emphasis, default order; multiple flags → all emphasized, flag order; a scope with **zero items is omitted** (including the viewer's own — never an empty "Your scope" shell). The pack list is **gated by the existing `isPackListVisibleToday({ show, restriction: stageRestriction, today })`** (preserved — the mock's always-visible pack list is **not** adopted, to avoid an unratified change to the stage/phase withholding contract); omitted when the predicate is false. Opening Reel reuses the existing `OpeningReelTile` visibility (`openingReelHasVideo` + `shouldHideOpeningReel`), not a new rule. All-empty (no visible scope + no visible pack list + no reel) → one section-level `EmptyState`.

The current `components/tiles/{Audio,Video,Lighting}ScopeTile.tsx` (which early-return `null` on these predicates as a *gate*) are **deleted in the same PR** (§10); the predicates survive only as the emphasis signal here — so the gate→emphasis flip leaves no stale gate code path.

### 4.6 New presentational primitives

Under `components/crew/primitives/`, each a small pure unit (props in, markup out; independently tested):

| Primitive | Props | Purpose |
| --- | --- | --- |
| `SectionCard` | `{icon?, title?, action?, children}` | mock tile/card vocabulary |
| `KeyValueRows` | `{rows: {k, v, sub?, icon?}[]}` | label→value stacks |
| `PersonRow` | `{person: {name, role, phone?, email?, you?, lead?, primary?}}` | crew/contact + tap-to-call/email |
| `DayCard` | `{day, phase, today, meta?}` | schedule day phase card |
| `KeyTimesStrip` | `{anchors: {set?, show?, strike?}}` | Today/Schedule times |
| `RightNowHero` | `{context, state}` | hero body (§4.3) |
| `EmptyState` | (existing atom, reused) | required-field empty |

### 4.7 Mode boundaries (which element renders where)

| Element | Mobile `<720px` | Desktop `≥720px` |
| --- | --- | --- |
| `CrewSubNav` top tabs | ✗ (`hidden min-[720px]:flex`) | ✓ |
| `CrewSubNav` bottom tab-bar (fixed, safe-area inset) | ✓ (`min-[720px]:hidden`) | ✗ |
| Section content bottom padding clearing the bottom bar | ✓ (`pb-...` on the scroll region) | n/a |
| `RightNowHero` | ✓ (Today only) | ✓ (Today only) |
| Header status pill + identity chip | ✓ | ✓ |
| Budget tab | ✓ iff `financialsVisible` | ✓ iff `financialsVisible` |
| Section primitives (`SectionCard`, `KeyValueRows`, `KeyTimesStrip`, `DayCard`, `PersonRow`) | ✓ (identical layout) | ✓ (identical layout) |

Both nav renders exist in the DOM at all widths (CSS-only switching, the established dual-render pattern; no JS width detection). `720px` is the project's mobile/desktop seam (no `md` token; arbitrary `min-[720px]`).

### 4.8 Guard conditions

| Input | null / absent | empty | malformed |
| --- | --- | --- | --- |
| `searchParams.s` | → `today` | → `today` | unknown value → `today` |
| `RightNowContext.stats` | strip omitted | strip omitted | non-finite numeric in a stat → that stat omitted |
| `KeyTimesStrip.anchors` | strip omitted | partial → present rows only | — |
| `dates.loadIn` | fall back to GS `set_time`; both null → Set row omitted | — | — |
| `rooms` (no GS room) | use first room; no rooms → no Set/Show/Strike anywhere | — | — |
| `KeyValueRows.rows[i].v` | row omitted | row omitted | — |
| `PersonRow.phone`/`email` | that action button omitted; both absent → no action column | — | `tel:`/`mailto:` strips non-dialable chars (existing) |
| generic-optional text (notes, parking, dock, internet, etc.) | hidden via `shouldHideGenericOptional` | hidden (incl. `TBD/N/A/TBA`) | — |
| `financials` | Budget tab + section absent (gated) | — | — |
| viewer `roleFlags` (no scope flag) | Gear: no emphasis, default order | — | — |
| `SectionCard.{icon,title,action}` | that prop omitted from render | — | — |
| `PersonRow.person.{name,role}` | name absent → row omitted; role absent → name alone | — | — |
| `DayCard.{day,phase}` | malformed/absent → that day row omitted; `meta` null → phase line alone | — | — |
| `RightNowHero.state` | unknown/unmatched kind → render as `dateless` (degraded, no stats) | — | — |

Stat omission is **two-level**: each stat whose value is null/empty/non-finite is hidden individually; if **all** stats are hidden, the strip is omitted (a single rule — the empty list collapses the strip).

### 4.9 Dimensional invariants

Tailwind v4 has no implicit `align-items: stretch` — every equal-height relationship is explicit (`items-stretch` parent + `h-full` child) and **Playwright-asserted** (jsdom insufficient). Extends `tests/e2e/crew-page.spec.ts`:

1. **Today quick-cards row** (Tonight / Where / Need-something): equal heights == row height (`items-stretch` + `h-full`), ±0.5px, across the band sweep.
2. **Crew two columns** (Show crew | Key contacts): equal column heights at ≥720px (`items-stretch` + `h-full`); **<720px they stack single-column**, height unconstrained (no equal-height constraint).
3. **Gear scope cards**: equal heights within their row when ≥2 render.
4. **RightNowHero**: `min-h` == 176px (`--spacing-right-now-min-h`) held constant through a state crossfade (assert height stable before/after a forced state change, ±0.5px).
5. **Sub-nav**: bottom tab-bar full-viewport-width, bottom-anchored, each tab `flex-1` equal width + full-bar height (`self-stretch`); respects `env(safe-area-inset-bottom)`. Top tabs ≥44px tap height.
6. **KeyTimesStrip** rows align (label left / value right, `tabular-nums` value column).
7. **Single-column sections** — Schedule day cards, Venue blocks, and Travel blocks render in a **single column at all widths** (vertical stack, height unconstrained); no equal-height invariant applies. Any future multi-column variant must add its own invariant here.

### 4.10 Transition inventory

| Transition | Treatment |
| --- | --- |
| section ↔ section (any of 7×6/2 pairs) | **one uniform rule**: crossfade + 4px translateY, `--duration-normal` (220ms) `--ease-out-quart`; reduced-motion → instant (token-driven) |
| RightNow hero 12-state body swaps | **reuse** `transitionTreatment` + the 66-pair table (`rightNowTransitions.ts`) wholesale; existing `AnimatePresence mode="wait" initial={false}` |
| tab active ↔ inactive | accent underline (desktop) / accent fill (mobile), `--duration-fast`; instant under reduced-motion |
| Budget tab appears ↔ absent | instant — changes only on data (server render); no animation |
| KeyTimesStrip present ↔ omitted | instant — server render |
| Gear emphasis (viewer's card highlight) | instant — server render (no client toggle) |
| theme toggle during nav (compound) | independent: `data-theme` swap is instant CSS-var; section crossfade unaffected |
| hero state-change mid section-swap (compound) | only Today renders the hero; leaving Today unmounts it (no concurrent hero+section animation); re-entering Today mounts fresh with `initial={false}` first paint |
| any × reduced-motion | all motion via duration tokens → collapses to 0ms (`globals.css:341-347`) |

`initial={false}` on first paint everywhere (no animating-from-hidden SSR; the project's known framer trap — first paint at rest, animate only post-mount nav).

### 4.11 Screenshots manifest + help

- Add `MANIFEST` entries (`scripts/help-screenshots.manifest.ts`): `crew-today-mobile` (route `/show/<seeded>/<token>?s=today`, MOBILE 390×844, `captureSelector` `[data-testid=crew-shell]`), plus `crew-gear-mobile` and `crew-schedule-mobile` (the highest-deviation sections). Fixture + `frozenClockInstant` chosen to land a `show_day_n` state. Baselines generated via the **pinned-docker amd64** procedure (byte-comparison gate discipline) — never a dev host.
- `CrewSubNav` and section captures consume `CAPTURE_LAUNCH_ARGS` (no per-config launchOptions — the PR #22 trap).
- No `/help` MDX change required (crew page is not in the admin help tree); manifest + drift CI only.

### 4.12 Flag lifecycle

| Flag | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| active section | URL `?s=` | `CrewSubNav` `router.push` | `CrewShell` server read of `searchParams.s` | which section renders |
| `dates.loadIn` | `shows.dates` jsonb key | dates parser (§4.4 change 2) via sync write | `getShowForViewer` → `KeyTimesStrip`/hero | Set anchor value (else GS `set_time`) |
| `financialsVisible` | derived from `roleFlags`+`isAdmin` | n/a (computed) | Budget tab + section gate | lead-only Budget surface |
| viewer-discipline emphasis | derived from `roleFlags` | n/a (computed) | Gear ordering + accent | highlights viewer's scope |

No env-gated features; no new DB boolean columns. `data-theme` (dark/light) is the only theming attribute (unchanged).

### 4.13 Section error containment

Deleting the 14 content tiles must **not** lose the existing per-tile containment + observability. The shared infra is **reused, not deleted**: `WrappedTile` (`components/shared/WrappedTile.tsx`) = `TileErrorBoundary` (client render boundary) wrapping `TileServerFallback` (`components/shared/TileServerFallback.tsx:63-99`), which on a load/render throw logs, **upserts an `admin_alerts` row code `TILE_SERVER_RENDER_FAILED`** (best-effort, Supabase-call-boundary discipline), and renders a fallback. `tileId`/`showId`/`sheetName` feed `admin_alerts.context`.

- **Per-block wrapping.** Every section block running a data load/transform that can throw is wrapped in `WrappedTile` (or a thin `WrappedSection` alias) with a stable `tileId` (`crew:<section>:<block>`), `showId`, `sheetName`. Preserves render-throw containment, load-throw catch, the `admin_alerts` upsert, and the fallback element — identical to today. No new alert code (reuses `TILE_SERVER_RENDER_FAILED`).
- **`tileErrors` observability is section-independent (the alert bridge).** `getShowForViewer` (`:335-505`) only *populates* `tileErrors[key]`. Today the persistent `admin_alerts` row is guaranteed by the **always-rendered** `notes-tile` catch-all (`_ShowBody.tsx:408-419`), which re-throws on `hotel`/`rooms`/`contacts` **ungated** (+ `transportation` gated) through `TileServerFallback`. Because `CrewShell` renders only the **active** section, that guarantee would be lost — a `hotel`/`rooms`/`contacts` failure whose block sits in an unopened section would never alert. So `CrewShell` mounts a **section-independent `<TileErrorAlertBridge>`** (always rendered; renders nothing) that performs a **single** `TILE_SERVER_RENDER_FAILED` upsert carrying `context.failedKeys` = the list of gated-visible failing keys (+ `sheetName`; `tileId`=`crew:alert-bridge`). Which keys count, per the effective current contract:
  - `hotel`, `rooms`, `contacts` → **ungated** (always counted — matches the `notes-tile` catch-all)
  - `transportation` → iff `isAdmin || transportTileVisible(...)` (`:309`/`:416`)
  - `financials` → iff `financialsVisible(flags, isAdmin)` (`:373`)
  **One** upsert, not per-key: `admin_alerts` coalesces on `(coalesce(show_id::text,''), code) WHERE resolved_at IS NULL` (`admin_alerts_one_unresolved_idx`, `supabase/migrations/20260501001000_internal_and_admin.sql:279-280`) and **replaces context on conflict**, so separate per-key upserts would collapse into a single last-writer-wins row that loses the other domains. The aggregated `failedKeys` payload keeps every failed domain in the one durable row. Best-effort, Supabase-call-boundary discipline; the **sole** source of projection-`tileErrors` alerts (no double-upsert with the visual fallback below).
- **`tileErrors` visual fallback is per active section (presentation only).** When the **rendered** section's block depends on an errored key and the block's own visibility gate is satisfied, admin sees an inline degraded state and crew sees omission — but it emits **no** alert (the bridge owns that). Per-block visual gates port `_ShowBody`: `hotel`→`isAdmin` (`:189`); `contacts`→ungated (`:224`); `rooms`→any Gear/KeyTimesStrip viewer (scope shown to all, §4.5; broadened from the A/V/L-only `:255-292`); `transportation`→`isAdmin||transportTileVisible` (`:309`); `financials`→`financialsVisible` (`:373`). Where the gate is false, the block silently omits (genuine absence).
- **Error ≠ absent (key invariant).** A `tileErrors[key]` error ALWAYS records the admin signal via the **section-independent bridge** — **distinct** from genuinely-absent data, which is silent omission (§4.8). A `rooms` / `hotel` / `contacts` fetch failure is observable even if the crew member only ever opens an unrelated section.
- **Gated blocks keep their gate even on error.** The `transportation` degraded block still respects `transportTileVisible` (admins always pass it, so admin-degraded is unaffected; gated-out crew see neither data nor degraded UI). The `financials` degraded block stays behind `financialsVisible`. A degraded state never widens a visibility boundary.

**§4.13a — Any transportation-derived field is gated in every section.** `transportTileVisible({ transportation, viewerName, isAdmin })` gates **every** render of a transportation-row field, regardless of section: the Travel "Getting there" block (§4.2) **and** the Venue **parking** block (`transportation.parking`, which today's `VenueTile` does not render — the redesign adds it *behind the same gate*, never as a new public surface). No transportation field (parking, driver name/phone/email, vehicle, license plate, assignments) renders to unassigned crew anywhere.

---

## 5. Error handling summary

| Failure | Surface | Behavior |
| --- | --- | --- |
| `getShowForViewer` `tileErrors[x]` (admin) | the relevant section block | inline degraded block (existing admin pattern); rest of section renders |
| same (crew) | section block | block omitted; crew never sees raw errors (invariant 5/9) |
| `resolveShowPageAccess` non-render kind | page | unchanged (existing terminal branches; `CrewShell` only renders on `admin`/`resolved`) |
| invalid `?s=` | shell | falls back to `today` (no error) |
| realtime bridge fault | none | unchanged (`ShowRealtimeBridge` already fail-quiet) |
| rooms/dates **absent** | Today/Schedule | Set/Show/Strike + KeyTimesStrip omitted; hero stats omitted; no thrown error (silent) |
| `tileErrors[key]` **error** (rooms/contacts/hotel/transportation/financials) | mapped block (§4.13) | admin → inline degraded block; crew → omission — **always distinguishable from absent** |
| per-block render/load **throw** | the wrapped block | `WrappedTile`/`TileServerFallback` (§4.13): admin fallback + `admin_alerts` `TILE_SERVER_RENDER_FAILED` upsert (best-effort); crew omission; never crashes the section |

No raw error codes anywhere (invariant 5). No new §12.4 catalog rows (reuses the existing `TILE_SERVER_RENDER_FAILED`) → no `gen:spec-codes`/`catalog.ts` lockstep.

---

## 6. DB / migration matrices

**No table migration.** The only data addition is `dates.loadIn` written into the existing `shows.dates` **jsonb** column (`migrations/20260501000000_initial_public_schema.sql:12`) — jsonb is schemaless, so no DDL, no CHECK/enum change, no RLS/REVOKE change. Tier×domain, CHECK/enum migration, and apply-twice matrices are **N/A — declared**.

Discipline that DOES apply (because the parser write path changes):
- **`pnpm gen:schema-manifest`** is unaffected (no public column added) — but run it to confirm no drift.
- **`validation-schema-parity` gate** unaffected (no new column/table).
- The parser change is exercised by TDD parser tests (§9) and the round-trip is covered because `getShowForViewer` already decodes `dates` generically. No surgical validation-project apply needed (no migration file).

Forward note (Phase 2): Wi-Fi SSID/PW split and AGENDA-title capture DO add parser surface and may add jsonb fields; that's Phase 2's matrix, not this one.

---

## 7. Watchpoints / do-not-relitigate (for review focus text)

1. **`event_details.{call_time,load_in_time,strike_time,first_show_room}` are always empty for real shows** (verified, 7 sheets). Re-sourcing the hero from `rooms` is a **fix**, not a regression. Do not propose keeping the `event_details` path as primary.
2. **Doors / labeled Crew-call have no source** and are intentionally dropped (D-10). Do not ask to re-add them; they're Phase-2 v2-template candidates (`BL-CREW-SHEET-TEMPLATE-V2`).
3. **Hotel check-in/out are DATES** (`check_in`/`check_out`); never append a clock time. The `hotelCheckInTime` field name is legacy/misleading.
4. **Gear shows all scope to everyone** (D-5) — a ratified behavior change from the current role-gate to role-emphasis. Do not flag "audio tech can now see lighting scope" as a leak.
5. **Approach B reuses logic, replaces presentation.** The 14 `components/tiles/*` presentation components are superseded by the six sections; their **data helpers** (`lib/`) are reused. Removing the old tiles is intended, not a scope cut.
6. **URL `?s=` is the section state** (D-4); do not propose client-only state or per-section route segments.
7. **Accent/density are not features** — only `data-theme` exists. Dropping the mock's accent/density tweaks is correct (D-10).
8. **`dates.loadIn` goes in the jsonb** — no table migration is the intended design (§6), not an oversight.
9. **One design for crew + admin-preview**; the admin operational page (`app/admin/show/[slug]`) is out of scope.
10. **Sentinel meta-test extension is pre-flight.** `_metaSentinelHidingContract.test.ts:235-239` (`listTileFiles()`) must be extended to walk `components/crew/sections/` + `components/crew/primitives/` in the **same PR** that adds those components — else CI stays green while the sentinel-hiding contract goes silently unenforced for the new sections (they read venue/notes/contact/room fields). §9 declares it.
11. **Preview-as route is in scope.** `app/admin/show/[slug]/preview/[crewId]/page.tsx:233` is the *second* `ShowBody` consumer; it moves to `CrewShell` too (§1, §3). Only `app/admin/show/[slug]/page.tsx` (the operational dashboard show page) is untouched.
12. **Old scope/grid tiles are deleted in the same PR** as the gate→emphasis flip (§4.5, §10). The gate code path (the tiles' early-return-`null`) is removed, not left dangling — so the flip is safe.
13. **Shared tile error infra is reused, not deleted.** `WrappedTile` / `TileServerFallback` / `TileErrorBoundary` (`components/shared/`) survive — the new sections wrap their data blocks in them (§4.13), preserving the `admin_alerts` `TILE_SERVER_RENDER_FAILED` upsert + fallback. Only the 14 *content* tiles under `components/tiles/` are deleted (§10). Do not read the deletion as losing per-block containment/observability.
14. **Transport visibility gate preserved — every section.** `transportTileVisible` gates **every** transportation-derived field in **every** section: the Travel "Getting there" block AND the Venue **parking** block (`transportation.parking`, §4.2/§4.13a — today's `VenueTile` renders no parking; the redesign adds it behind the same gate). Driver PII / vehicle / plate / parking / assignments are shown only to admin, the assigned driver, or named crew. The Gear A/V/L gate→emphasis flip (D-5) does **not** extend to transport — that is a privacy gate, not a scope-relevance gate.
15. **Pack-list stage/phase gate preserved.** Gear's pack list keeps `isPackListVisibleToday` (not made always-on). The mock's always-visible pack list is intentionally not adopted; flipping it would be a separate ratified product change, out of Phase-1 scope.
16. **Full visibility-gate inventory preserved (comprehensive sweep).** Every existing gate carries forward: `financialsVisible` (Budget, §4.2/D-7), `transportTileVisible` (Travel transport, §4.2/wp-14), `isPackListVisibleToday` (Gear pack list, §4.5/wp-15), `date_restriction` (Schedule rows + RightNow state, §4.2–4.3), `shouldHideGenericOptional` (sentinels, §4.8), `shouldHideOpeningReel` (Gear reel, §4.5). **Only** the A/V/L scope predicates flip gate→emphasis (D-5, ratified). Hotel / Contacts / Crew were never role-gated (field-level sentinel hiding only) and stay all-viewer.
17. **`CrewShell` ports `_ShowBody`'s cross-cutting contracts verbatim — not re-derived.** Contracts in `_ShowBody.tsx` today that must be copied before `_ShowBody` is deleted (§10): (a) the **alert contract** — the always-rendered `notes-tile` catch-all (`:408-419`, ungated hotel/rooms/contacts + gated transportation) becomes the section-independent `<TileErrorAlertBridge>` (§4.13), plus the FinancialsTile financials gate (`:373`); (b) the per-section **visual** fallback gates (`:189`/`:224`/`:255-292`/`:309`/`:373` — §4.13); (c) the Footer report props per viewer kind (`:509-535` — §4.1); (d) every visibility gate (wp-16); (e) the fail-closed `resolveViewerContext` / `MalformedProjectionError` → `TerminalFailure` guard (`:113-122` — §4.1). Paraphrasing any of these is where a contract silently drops — reviewers verify the ports are exact; tests 16/17/18/19/20/21 pin each.

---

## 8. Out of scope (Phase 2 or later)

- **AGENDA-tab run-of-show parsing** (rich timeline). Phase 1 ships the anchor-times strip only; Phase 2 adds the optional AGENDA-title parser as enrichment.
- **Wi-Fi SSID/PW structured parse.** Phase 1 already shows the raw `event_details.internet` string in Venue (§4.2) — *raw display is in scope*; Phase 2 only adds the SSID/PW split.
- **Room-within-venue name** structured capture (Phase 2).
- **Per-crew flight surfacing.** `flight_info` is parsed (`lib/parser/types.ts:71`) but **not in the `ShowForViewer` projection**; Phase 2 adds the projection + the Travel flight block + a non-null flight test. Phase 1 renders no flight UI (only ground transport + hotel).
- v2 downloadable sheet template (`BL-CREW-SHEET-TEMPLATE-V2`).
- Admin operational show page redesign.
- Per-day call times (sheets store one show-wide value).

---

## 9. Testing

Unit / component (jsdom where layout isn't asserted; every test states its failure mode; expected values derived from fixtures, not hardcoded):

1. **`resolveActiveSection`** — `undefined`/`""`/`"venue"`/`"bogus"`/`"budget"` (non-lead) → `today` for invalid + non-entitled; valid → that id. _Catches: invalid `?s=` rendering a broken/empty shell or leaking Budget._
2. **Section→content mapping** — each `*Section` renders its declared blocks from a fixture; Today shows hero+KeyTimes+3 cards+notes. Anti-tautology: assert against the data source, and clone-and-strip sibling nodes before label scans. _Catches: a block silently dropped or duplicated._
3. **`buildRightNowContext` rooms-sourcing** (TDD) — fixture with GS `set_time/show_time/strike_time` set → context Set/Show/Strike come from rooms; with `event_details.{load_in_time,strike_time}` ALSO set to *different* values → context still shows the rooms values (the `event_details` time path is dropped, not a fallback); no GS room → first room; **`rooms: []` → all three null and `KeyTimesStrip` omitted**. _Catches: regression to the always-empty `event_details` path; missing empty-rooms guard._
4. **Dates-parser load-in** (TDD) — v2/v4 fixtures: a plain **SET** row with a TIME column ("11:00 AM LOAD IN") → `dates.loadIn === "11:00 AM"`; a combined **`TRAVEL / SET`** row with a TIME column → `dates.loadIn` captured (the `travel_set` classification, `dates.ts:196`); a **SHOW** or plain **TRAVEL** row's TIME column does **not** populate `dates.loadIn` (only set-bearing rows, via the label classifier `dates.ts:32-44`); absent TIME column → `dates.loadIn === null`; v1 fixture → null tolerated. Then resolution: **both** `dates.loadIn` and legacy `event_details.load_in_time` set to different values → resolved Set anchor uses `dates.loadIn`; `dates.loadIn` null but GS `set_time` present → uses GS `set_time`. Expected derived from the fixture cell, not hardcoded. _Catches: row[4] discarded; combined TRAVEL/SET row dropped; SHOW/TRAVEL row misclassified as load-in; fallback/priority not wired._
5. **Hero 12-state mapping** — for each kind, the hero renders the mapped eyebrow/lead/progress/treatment; degraded kinds carry the stale tint and NO stats; `show_day_n` shows N progress segments derived from `total`; **travel-day states render hotel name/dates only — never `flight` or `next-call` stats** (Phase-1 source boundary). _Catches: a state missing/mis-skinned; fabricated stats on degraded states; out-of-scope flight/call stats on travel days._
6. **Stat-strip guards** — empty/all-null stats → no strip node; non-finite numeric → that stat omitted. _Catches: blank stat chips._
7. **Gear emphasis** — viewer with A-flag → Audio card first + carries `[data-emphasis=you]`; no-flag viewer → default order, no emphasis; empty scope omitted (incl. viewer's own); all-empty → section EmptyState. Expected ordering derived from the flag fixture. _Catches: emphasis becoming a gate; empty "Your scope" shell._
8. **Budget gating** — `financialsVisible` true → Budget tab present + section renders financials; false → tab absent + `?s=budget` falls back to `today`. _Catches: lead-only data leaking to non-leads or a dead tab._
9. **Empty-state discipline** — venue/parking/dock/internet/notes sentinels (`""`,`TBD`,`N/A`,`TBA`) hidden; required-field-missing (venue.name) → `EmptyState`. _Catches: sentinel leak; blank required block._
10. **PersonRow guards** — phone-only / email-only / neither / both; `tel:`/`mailto:` href sanitization. _Catches: empty action buttons; bad hrefs._
11. **selectTodayTiles parity** — the Today section's promoted-content selection still respects `dateRestriction`/visibility (the `selectTodayTiles`/`filterVisibleTodayTiles` logic is reused or its replacement pins the same matrix). _Catches: losing the date-driven Today curation._

Real-browser (Playwright — extends `tests/e2e/crew-page.spec.ts`):

12. **Layout dimensions** (§4.9 invariants verbatim): Today quick-cards equal-height==row; Crew columns equal at ≥720px; Gear cards equal; hero `min-h`==176px stable through a forced state crossfade; bottom tab-bar full-width/bottom-anchored/`flex-1` equal + full-height + safe-area; top tabs ≥44px. _Catches: Tailwind-v4 stretch/collapse bugs jsdom can't see._
13. **Nav addressability** — deep-link `?s=venue` SSRs Venue; tab tap updates URL + swaps section without full reload; mobile back-button returns to prior section (not off-page); refresh holds the section. _Catches: client-only state; broken back-button._
14. **Transition audit** (§4.10): every `AnimatePresence`/ternary/conditional has `exit`/`initial`/`animate` or is deliberately instant; compound (theme toggle during nav; re-enter Today). _Catches: animating-from-hidden SSR; orphaned exit._
15. **Preview-as parity** — the admin preview-as route (`app/admin/show/[slug]/preview/[crewId]`) renders `CrewShell` (same `data-testid=crew-shell`, same sections) for a seeded crew identity; `?s=venue` resolves there too. _Catches: preview-as left on the old flat-grid `ShowBody`._
16. **Section error containment** (§4.13) — three layers:
    - **Alert bridge (section-independent, coalescing-aware).** Mount `CrewShell` as a **normal crew** viewer on an **unrelated** section (e.g. `?s=crew`) while `tileErrors` carries `hotel`+`rooms`+`contacts` → a **single** `TILE_SERVER_RENDER_FAILED` upsert whose `context.failedKeys` contains **all three** keys (assert the upsert payload, not N separate mocked calls), even though no rendered section mounts those blocks. `transportation` included in `failedKeys` iff `isAdmin||transportVisible`; `financials` iff `financialsVisible`; clean `tileErrors` → no upsert. _Catches: the section model dropping the always-on `notes-tile` alert; AND the `(show_id, code)` coalescing collapsing multi-domain failures into a single last-writer-wins row (other domains silently lost)._
    - **Visual fallback (active section).** With the relevant section open + the block's gate satisfied: admin → inline degraded state, crew → omission; **no second upsert** (the bridge owns alerting). Error path distinguishable from no-data path (assert both). `rooms` fallback fires for any Gear/KeyTimesStrip viewer (scope shown to all).
    - **Render throw.** A throw injected into a wrapped block → `TileErrorBoundary` fallback + its own `TILE_SERVER_RENDER_FAILED` upsert (the render-boundary layer, distinct from projection `tileErrors`).
17. **Transport visibility gate** (Travel **and** Venue) — `transportTileVisible` matrix: admin → visible; assigned driver (`viewerName` matches the leg) → visible; crew named on a transport leg → visible; **unassigned crew → the Travel ground-transport block AND the Venue parking block are both omitted** (no driver name/phone, vehicle, plate, parking, or assignments in the DOM of either section). Also: a `transportation` tile-error for unassigned crew shows neither data nor degraded UI. _Catches: leaking driver PII / assignments / parking to every crew member, in either section — a trust-boundary regression from dropping the gate (§4.13a)._
18. **Pack-list stage/phase gate** (Gear) — `isPackListVisibleToday` matrix in the Gear section: viewer `stageRestriction` not overlapping the day's pack-list phase → pack list omitted; a non-pack-list-phase `today` → omitted; allowed phase + overlapping stage → pack list shown. Expected from fixture stage/phase, not hardcoded. _Catches: pull-sheet details leaking on intentionally-withheld days/stages once the pack list moved into the persistent Gear tab._
19. **Footer report metadata (preview-as)** — `admin_preview` viewer → Footer receives `reportSurfaceOverride='admin'`, `reportSurfaceIdOverride='admin-preview-footer-<slug>-<crewId>'`, and `reportAutocapture.crewPreview` populated; a normal crew viewer → `reportSurfaceOverride='crew'`, no override id, no `crewPreview`. _Catches: preview-as bug reports mis-filed as generic crew-surface reports, regressing role-filtering triage._
20. **`resolveKeyTimes` determinism** — fixtures with (a) multiple `gs` rooms supplied in varying array order → the name-sorted-first GS room's times are chosen, identically across orderings; (b) no `gs` room → the name-sorted-first room; (c) a GS room with blank times → blank anchors (strip omitted). _Catches: anchor times varying with DB return order (the rooms query has no `ORDER BY`); flaky screenshot baselines._
21. **Fail-closed on malformed projection** — a `ShowForViewer` with `crewMembers` not an array, for a **crew** AND an **admin_preview** viewer → `CrewShell` renders `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED">` and **no** section content (no Schedule / Pack List / Right Now rendered unrestricted). _Catches: a malformed projection crashing the Next boundary, or regressing to unrestricted per-crew rendering — the ratified fail-closed contract (`_ShowBody.tsx:113-122`)._

Meta-test / structural-registry inventory (declared per plan rule; same-commit as the surface they pin):

- **EXTEND `_metaSentinelHidingContract.test.ts`** — its `listTileFiles()` walk gains `components/crew/` (sections + primitives) so any new component reading a generic-optional field must import+call `shouldHideGenericOptional`. (Mandatory; the new sections read venue/contact/room/notes fields.)
- **EXTEND `tests/e2e/crew-page.spec.ts`** — the redesigned layout invariants (§4.9) replace the today-band assertions (the band is subsumed by Today).
- **Not touched (declared):** advisory-lock, alert-catalog, DML-lockdown, infra-contract registries — no DB writes, no new alert codes, no locks, no new Supabase call boundaries (the only data change is a pure-function parser extension).

Gates: impeccable v3 dual-gate (critique + audit, external attestation) on the UI surface (invariant 8) before close-out; cross-model adversarial review; real-CI green (including `screenshots-drift` once baselines land).

---

## 10. Implementation shape (for writing-plans)

Single milestone on `feat/crew-page-redesign`, ~4 phases:
1. **Parser + context** — dates `loadIn` capture (TDD) + `buildRightNowContext` rooms-sourcing (TDD) + type/projection passthrough. No UI yet.
2. **Shell + nav + primitives** — `CrewShell` (crew route **and** preview-as route), `?s=` routing, `CrewSubNav`, the shared primitives + `RightNowHero`; `_metaSentinelHidingContract` extended to walk `components/crew/`.
3. **Sections** — the six sections + Budget; Gear emphasis; empty states; Today/Schedule wired to the new anchors.
4. **Layout/transition/screenshots + close-out** — Playwright dimensions + nav + transition-audit; manifest entries + baselines (pinned docker); **delete superseded `components/tiles/*` presentation components + their imports, `_ShowBody.tsx`, and `selectTodayTiles`** once `CrewShell` is the sole renderer (the `lib/` data helpers **and** the `components/shared/` tile error infra stay — §4.13); impeccable dual-gate; adversarial review; real-CI; merge.

UI throughout → Opus implements; Codex per-phase + whole-milestone adversarial review; impeccable v3 critique+audit external attestation before close-out.

---

## 11. Phase boundary / deferred

Phase 1 ships the IA + anchor-times on reliably-present data. **Phase 2** (separate spec) adds: AGENDA-title parser block (rich run-of-show enrichment), Wi-Fi SSID/PW structured parse, room-within-venue capture, and per-crew flight surfacing — each upgrading a Phase-1 section/empty-state in place. The v2 downloadable sheet template remains backlog (`BL-CREW-SHEET-TEMPLATE-V2`).
