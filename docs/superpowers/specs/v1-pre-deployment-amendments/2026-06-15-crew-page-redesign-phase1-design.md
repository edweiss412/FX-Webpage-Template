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

- `page.tsx` today awaits `searchParams: Promise<{ gate?: string }>` (`:71`, `:74`). Phase 1 widens it to `Promise<{ gate?: string; s?: string }>`, awaits `s`, and passes `activeSection={s}` to `CrewShell`, which validates against the section-id set and falls back to `today` for absent/invalid values via **`resolveActiveSection(raw, { budgetVisible }): SectionId`** — a non-entitled `?s=budget` (when `budgetVisible` is false) also falls back to `today`. The **same `financialsVisible(viewerFlags, isAdmin)`** predicate drives all three Budget surfaces: the tab in `CrewSubNav`, the direct-URL resolver, and the section render — never a divergent gate. The admin **preview-as** route (`app/admin/show/[slug]/preview/[crewId]/page.tsx:233`) likewise swaps `ShowBody`→`CrewShell`, reading its own `?s=` from `searchParams` (default `today`).
- Section ids: `today | schedule | venue | travel | crew | gear` and (conditional) `budget`.
- **Fail-closed on malformed projection (ported from `_ShowBody.tsx:113-122`).** `CrewShell` calls `resolveViewerContext(viewer, data)` and catches `MalformedProjectionError` (`lib/data/viewerContext.ts:123`, thrown when `crewMembers` is not an array) → renders `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` and **no** section content. Falling back to `none` restrictions would render Schedule / Pack List / Right Now **unrestricted** (a trust-boundary regression — a ratified prior-milestone fail-closed contract). The catch lives in `CrewShell` (the Server Component during render), not the page functions (the call sites have already returned their element).
- **Footer report-prop contract (ported verbatim from `_ShowBody.tsx:509-535`).** `CrewShell` passes the Footer the same per-viewer-kind report props: `reportSurfaceOverride = viewer.kind === 'admin_preview' ? 'admin' : 'crew'`; `reportSurfaceIdOverride = `admin-preview-footer-${slug}-${crewMemberId}`` **only** for `admin_preview`; `reportAutocapture` carrying the `crewPreview` payload **only** for `admin_preview`. Porting verbatim (not re-deriving) keeps preview-as bug reports attributed to the previewed crew, not a generic crew surface.
- `CrewShell` renders, inside a `data-testid="crew-shell"` wrapper: `Header` (with status pill + identity chip) → `CrewSubNav` → `ShowRealtimeBridge` (unchanged) → `<TileErrorAlertBridge>` (§4.13 — always rendered, section-independent observability) → the active `*Section` → `Footer`. Today additionally leads its section with `RightNowHero`.
- All sections are **Server Components**; the client islands are `CrewSubNav` (active-state + router push), **`CrewSectionTransition`** (the section crossfade — §4.10: it wraps the active **server-rendered** section as `children`, keyed by the resolved section id, animating via framer `AnimatePresence`; RSC section content flows in as `children`, so the sections themselves stay Server Components), `RightNowHero`'s minute-ticker (carried from `RightNowCard`), `ShowRealtimeBridge`, and `ThemeToggle`.

**Navigation mechanics.** `CrewSubNav` is `'use client'`. Tab activation calls `router.push(`?s=${id}`, { scroll: false })` (App Router shallow URL update; the server re-renders the active section). `usePathname`/`useSearchParams` drive the active highlight. Mobile back-button traverses the `?s=` history entries; deep-link/refresh server-render the addressed section.

**Deep-link survives auth/picker (D-4 completeness).** A shared-link visitor usually lands on the crew route **before** auth/picker. So the page-level redirects that return to `/show/[slug]/[shareToken]` — `needs_picker_bootstrap`, sign-in/`returnTo`, `gate=skip`, stale-identity cleanup, and the picker `selectIdentityFormAction` selection — **preserve the validated `s` param** (+ existing `gate`), rebuilt from the current search params, so a deep-link to a section survives the round-trip. Only the allow-listed `s` (validated against the section-id set) and `gate` are carried, nothing else. This adds a query param to the existing redirect builders — **not** an auth-flow rewrite (the access guards stay unchanged, §4.14).

### 4.2 Section views

Each `*Section` is a Server Component under `components/crew/sections/` consuming `ShowForViewer` + the viewer's `roleFlags`/restrictions (already on `crewMembers[]` / resolvable for the viewer). Composition per the approved IA map:

| Section | Blocks | Data source |
| --- | --- | --- |
| **Today** | `RightNowHero`; `KeyTimesStrip`; Tonight (hotel name + shuttle); Where (venue + badge-in); Need-something (primary `contacts[]` entry via deterministic `selectPrimaryContact` — **not** `client_contact`); **Dress code**; Show notes | `RightNowContext`+rooms; `hotelReservations`; `venue`; `contacts` (venue/in_house_av); `event_details` dress-code (keys `dress_code`/`dress`/`attire`, per `ShowStatusTile.tsx:69`); venue/show notes — all via `shouldHideGenericOptional` |
| **Schedule** | Day phase cards (travel/set/show/strike, today pinned, viewer-date-restricted); Daily times (`KeyTimesStrip` — Set/Show/Strike, omitted if no anchors); Heads-up note (optional) | `dates` + `ShowRow.schedule_phases` (`Record<ISO, WorkPhase[]>`, `lib/parser/types.ts:105`) + viewer `dateRestriction`; rooms times; Heads-up from a show-level note, hidden-if-empty via `shouldHideGenericOptional` |
| **Venue** | Address+room; loading dock; parking (**gated by `transportTileVisible`**, §4.13a); Wi-Fi (raw `event_details.internet` in Phase 1; Phase 2 parses); **COI status** (`data-testid="coi-status"`, AC-4.1); **power**; notes; map link; diagrams | `venue`; `transportation.parking` + viewer name/isAdmin; `event_details.internet`; `coi_status`; `event_details.power`; `diagrams` |
| **Travel** | Getting there (ground transport **gated by `transportTileVisible`**; flights are Phase 2); Where you're staying (hotel name/address/conf#/**dates**) | `transportation` (ground) + viewer name/isAdmin; `hotelReservations`. Flights deferred — `flight_info` is parsed but **not in the `ShowForViewer` projection** (§8) |
| **Crew** | Show crew (roster, role, lead tag, "you", tap-to-call/email); Key contacts | `crewMembers`; `contacts` (venue/in_house_av) — **not** `client_contact` (§4.2 note) |
| **Gear** | A/V/L scope (emphasis §4.5); Pack list (**gated by `isPackListVisibleToday`**); **Keynote requirements**; Opening Reel (existing `OpeningReelTile` visibility) | `rooms.{audio,video,lighting}`; `pullSheet` + viewer `stageRestriction` + `today`; `event_details.keynote_requirements`; `openingReelHasVideo` + `shouldHideOpeningReel` (`lib/visibility/emptyState.ts`) |
| **Budget** (conditional) | PO / proposal / invoice / notes | `financials` (renders only when `financialsVisible` true) |

Lead-gating preserved: `financialsVisible(viewerFlags, isAdmin)` gates both the Budget **tab** (§4.1) and section. Date-restriction gates Schedule rows. Fetch-error gating (`tileErrors`) preserved: admin sees a degraded block, crew sees omission (§5).

**Schedule honors the `DateRestriction` privacy contract (ported from `ScheduleTile`).** `unknown_asterisk` → render **only** the unconfirmed placeholder and **zero** day cards (the viewer must not be able to infer which show days exist — a trust boundary, not presentation); `explicit` → only the **intersection** (the viewer's assigned days); `none` → all dates. The same `dateRestriction` drives the Right-Now hero's `viewer_unconfirmed` state (§4.3).

**Today "Need something" contact selection is deterministic.** `selectPrimaryContact(contacts)` (the `contacts` query has no `ORDER BY` and `ContactRow` has no ordinal) **prefers a contact with a non-sentinel `phone`/`email`** (actionable), tie-broken by `kind` then `name` (sorted) — so the prominent support contact is stable, actionable, and not DB-order-dependent; none actionable → hidden.

**`client_contact` is NOT rendered in Phase 1.** It is parsed (`lib/parser/types.ts`) + projected but **never shown on the crew page today** (grep-verified: no `components/`/`app/show` reference). Today "Need something" and Crew "Key contacts" use the operational `contacts[]` (venue / in_house_av) **only**. Surfacing the client rep's phone/email to all crew would be a **new PII surface** needing a ratified decision — deferred (§8).

**Full field ports (no orphaned fields).** A field-coverage audit of all 14 tiles confirms each section ports the **complete** field set of the tile(s) it subsumes, not a visual subset: **Travel** ground transport = the full `TransportTile` shape (driver name/phone/email, vehicle, license plate, color, parking, schedule legs with `assigned_names`, notes — all gated, §4.13a); the hotel block includes hotel `notes`. **Venue** diagrams = the full `DiagramsTile` (embedded images + linked-folder items + `agenda_links` PDFs). **Gear** pack list = the full `PackListTile` item shape (`caseLabel`, `qty`, `item`, `cat`, `subCat`, `rawSnippet` fallback). **Today "Show notes"** ports the `NotesTile` aggregator (`NotesTile.tsx:130-168`): the five labeled note sources — venue / hotel:`{name}` / room:`{name}` / transport / contact:`{name}` — sentinel-hidden, with transport notes gated by `transportTileVisible`. Per-section note fields (e.g. Venue notes) are preserved as today. List caps, truncation, and the opening-reel URL strip are pinned in §4.15.

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

1. **`buildRightNowContext` reads `rooms`.** New signature: `{ show, dateRestriction, hotelReservations, rooms }` — **drops the unused `contacts` param** (dead-param cleanup, gotcha §3) and **keeps `hotelReservations`** (travel-day hotel stats). Set/Show/Strike derive from the **GS room** (`kind==='gs'`, else first room) `set_time`/`show_time`/`strike_time` (free-text). The old `event_details.{call_time,load_in_time,strike_time,first_show_room}` reads are **dropped entirely** (always null for real shows, §7.1) — not kept as a fallback. **Set-anchor resolution order** (applied in `buildRightNowContext` and the shared `resolveKeyTimes(show, rooms)` helper that `KeyTimesStrip` + Schedule also call — never in the parser): (1) `dates.loadIn` if non-empty (change 2); (2) else GS `set_time`; (3) else omit the Set row. **`Set = dates.loadIn` is independent of `rooms`** (it lives on `shows.dates`): when `rooms` is null/empty/errored but `dates.loadIn` is present, the **Set** anchor still renders — only Show/Strike, and the Set→room-`set_time` *fallback*, depend on room selection. The strip is omitted only when **all three** anchors resolve null (no `dates.loadIn` AND no usable rooms) (§4.8). **Deterministic room selection** — the rooms query has **no `ORDER BY`** (`getShowForViewer.ts:376`), so "first room" is not stable. `resolveKeyTimes` sorts rooms by `name` (ascending), picks the first `kind==='gs'`; if no GS room, the first room by name; multiple GS rooms → the name-first one. This makes the anchors (and screenshot baselines) deterministic regardless of DB return order. The **sole call site** is `_CrewShell` (was `_ShowBody.tsx:122`; both ShowBody consumers now route through the shell — §3 scope note).
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
| `PersonRow` | `{person: {name?, role?, fallbackLabel?, phone?, email?, you?, lead?, primary?}}` | crew/contact + tap-to-call/email; `name` absent → render `fallbackLabel` (contact `kind`/role), per §4.8 |
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
| `rooms` null/empty/errored | Show/Strike omitted; **Set still renders from `dates.loadIn` if present** (else omitted); no GS room → first room for Show/Strike | — | — |
| `KeyValueRows.rows[i].v` | row omitted | row omitted | — |
| `PersonRow.phone`/`email` | that action button omitted; both absent → no action column | — | `tel:`/`mailto:` strips non-dialable chars (existing) |
| generic-optional text (notes, parking, dock, internet, etc.) | hidden via `shouldHideGenericOptional` | hidden (incl. `TBD/N/A/TBA`) | — |
| `financials` | Budget tab + section absent (gated) | — | — |
| viewer `roleFlags` (no scope flag) | Gear: no emphasis, default order | — | — |
| Schedule `dateRestriction` | `unknown_asterisk` → unconfirmed placeholder only, **zero** day cards (no date leak); `explicit` → intersection only; `none` → all | — | — |
| `SectionCard.{icon,title,action}` | that prop omitted from render | — | — |
| `PersonRow.person.{name,role}` | name absent **but phone/email present** → render with a **fallback label** (the contact `kind`/role, matching `ContactsTile`'s preserve-nameless-contact behavior); role absent → name alone; name AND kind/role AND phone AND email all absent → row omitted | — | — |
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
| section ↔ section (any of 7×6/2 pairs) | **one uniform rule**, implemented by the **`CrewSectionTransition`** client wrapper (§4.1, keyed by `?s=`, `initial={false}` first paint): crossfade + 4px translateY, `--duration-normal` (220ms) `--ease-out-quart`; reduced-motion → instant (token-driven) |
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
- **`tileErrors` observability is section-independent (the alert bridge).** `getShowForViewer` (`:335-505`) only *populates* `tileErrors[key]`. Today the persistent `admin_alerts` row is guaranteed by the **always-rendered** `notes-tile` catch-all (`_ShowBody.tsx:408-419`), which re-throws on `hotel`/`rooms`/`contacts` **ungated** (+ `transportation` gated) through `TileServerFallback`. Because `CrewShell` renders only the **active** section, that guarantee would be lost — a `hotel`/`rooms`/`contacts` failure whose block sits in an unopened section would never alert. So `CrewShell` mounts a **section-independent `<TileErrorAlertBridge>`** (always rendered; renders nothing) that performs a **single** upsert of a **distinct, NEW** admin-alert code **`TILE_PROJECTION_FETCH_FAILED`** (projection/data-fetch failures — semantically separate from a tile *render* throw, which keeps `TILE_SERVER_RENDER_FAILED`) via the shared `upsertAdminAlert(...)`, context `{ sheet_name (=show.title), tileId (=crew:alert-bridge), message (a summary, e.g. "N crew-page data sources failed to load"), failedKeys (sorted key names — drives the signature), errorsByKey (\`{ [key]: tileErrors[key] }\`, the **per-domain** error string for every included key — so a multi-domain failure loses no detail), signature }` with `signature = { viewerVersionToken, failedKeys (sorted) }`. The bridge is the **sole** producer of this new code (§9 registers it in `_metaAdminAlertCatalog`); `admin_alerts.code` is unconstrained `text`, so **no migration** — only the §12.4 three-lockstep (§5). Which keys count, per the effective current contract:
  - `hotel`, `rooms`, `contacts` → **ungated** (always counted — matches the `notes-tile` catch-all)
  - `transportation` → iff `isAdmin || transportTileVisible(...)` (`:309`/`:416`)
  - `financials` → iff `financialsVisible(flags, isAdmin)` (`:373`)
  **A distinct code is the robust fix** for three problems a *shared* `TILE_SERVER_RENDER_FAILED` created: (1) **coexistence** — projection-fetch vs render-throw failures now occupy **separate** `(show_id, code)` unresolved rows (`admin_alerts_one_unresolved_idx`), so neither clobbers the other's `context`; (2) **aggregation** — one bridge upsert with `failedKeys` keeps every failed domain (its row coalesces only with itself); (3) **idempotency** (below). Best-effort, Supabase-call-boundary discipline; the **sole** source of projection-`tileErrors` alerts (no double-upsert with the visual fallback below).
  - **Idempotent per failure signature (atomic, in SQL).** Section navigation re-renders `CrewShell` (server `router.push`), so a naive upsert would bump `occurrence_count` once per tab tap, and a Server-Component read-then-skip would **race** under concurrent renders. So the dedup is **atomic inside `upsert_admin_alert`** (§6 migration): on conflict, `last_seen_at` and `context` **always refresh** (admins always see the latest failure detail / `message`), but **only the `occurrence_count` increment is gated** on the signature — `occurrence_count = public.admin_alerts.occurrence_count + (CASE WHEN excluded.context ? 'signature' AND public.admin_alerts.context->'signature' = excluded.context->'signature' THEN 0 ELSE 1 END)` (the conflict target is referenced by table name `public.admin_alerts`; `excluded` is the proposed row — there is **no** `signature` column, only `context jsonb`). The bridge passes `signature = { viewerVersionToken, sorted failedKeys }` inside `context`: an unchanged signature → no count inflation across navs, yet a changed `message` for the same keys/version (e.g. timeout → permission) **still updates the stored context**. **Backward-compatible** — no-`signature` producers increment + replace context exactly as today (§9).
  - **The bridge is fail-quiet (never crashes the page).** `upsertAdminAlert` **throws** on RPC failure (as `TileServerFallback` already guards). The bridge wraps its call in `try/catch`, logs, and renders `null` on any alerting fault — an observability outage NEVER becomes a crew-page render failure (the bridge mounts on **every** section). Test: the RPC rejects → the section still renders, no raw error UI.
- **`tileErrors` visual fallback is per active section (presentation only).** When the **rendered** section's block depends on an errored key and the block's own visibility gate is satisfied, admin sees an inline degraded state and crew sees omission — but it emits **no** alert (the bridge owns that). Per-block visual gates port `_ShowBody`: `hotel`→`isAdmin` (`:189`); `contacts`→ungated (`:224`); `rooms`→any Gear/KeyTimesStrip viewer (scope shown to all, §4.5; broadened from the A/V/L-only `:255-292`); `transportation`→`isAdmin||transportTileVisible` (`:309`); `financials`→`financialsVisible` (`:373`). Where the gate is false, the block silently omits (genuine absence).
- **Error ≠ absent (key invariant).** A `tileErrors[key]` error ALWAYS records the admin signal via the **section-independent bridge** — **distinct** from genuinely-absent data, which is silent omission (§4.8). A `rooms` / `hotel` / `contacts` fetch failure is observable even if the crew member only ever opens an unrelated section.
- **Projection-fetch and render-throw alerts are separate codes.** The bridge writes `TILE_PROJECTION_FETCH_FAILED`; per-block `TileServerFallback` writes `TILE_SERVER_RENDER_FAILED`. They occupy different `(show_id, code)` unresolved rows — co-occurring failures both persist with full context, neither clobbers the other, and the bridge's signature-dedup is reliable.
- **Gated blocks keep their gate even on error.** The `transportation` degraded block still respects `transportTileVisible` (admins always pass it, so admin-degraded is unaffected; gated-out crew see neither data nor degraded UI). The `financials` degraded block stays behind `financialsVisible`. A degraded state never widens a visibility boundary.

**§4.13a — Any transportation-derived field is gated in every section.** `transportTileVisible({ transportation, viewerName, isAdmin })` gates **every** render of a transportation-row field, regardless of section: the Travel "Getting there" block (§4.2) **and** the Venue **parking** block (`transportation.parking`, which today's `VenueTile` does not render — the redesign adds it *behind the same gate*, never as a new public surface). No transportation field (parking, driver name/phone/email, vehicle, license plate, assignments) renders to unassigned crew anywhere.

### 4.14 Ported `_ShowBody` contracts (comprehensive checklist)

A full read of `_ShowBody.tsx` + the two page consumers enumerated ~47 cross-cutting contracts (the same-vector comprehensive re-analysis mandated after R1/R4/R5/R6). `CrewShell` replaces only the **body**; the page-level access guards are **unchanged**. Everything below is ported (wp-17 demands verbatim). The contracts not already pinned in §4.1–4.13:

**Page-level — UNCHANGED (`CrewShell` does NOT re-implement; only `searchParams.s` is added):** `resolveShowPageAccess` 11-kind dispatch (`page.tsx:39`); the crew-route `getShowForViewer` try/catch → `<TerminalFailure retryHref={\`/show/${slug}/${shareToken}\`}>` (`page.tsx:118-127`, `:145-154`); the **preview-as** route's `crewLookup` not_found/infra_error + `showLookup` published-and-not-archived guards (`app/admin/show/[slug]/preview/[crewId]/page.tsx:134`, `:160`, `:168`); the `gateSkip` atomicity guard (`?gate=skip` honored only when `reason==='first_contact'`, `page.tsx:182`). Swapping `ShowBody`→`CrewShell` leaves all of these intact.

**CrewShell-ported (beyond §4.1/§4.13):**
- **Request-scoped clock.** `today` is computed via `nowDate()` (`_ShowBody.tsx:133` — honors `X-Screenshot-Frozen-Now`) and threaded into `selectRightNowState` + every date-driven section — never `new Date()` inline (else screenshot baselines drift).
- **Realtime.** `<ShowRealtimeBridge showId slug renderVersion={data.viewerVersionToken} />` (`:469`) — `renderVersion` MUST be `viewerVersionToken` so stale renders re-subscribe.
- **Body `TerminalFailure` carries no `retryHref`** (`:110-112`) — the body lacks `shareToken`; the malformed-projection arm (§4.1) renders `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />` with no retry link, matching today.
- **Footer sync.** `lastSyncedAt` + `lastSyncStatus` flow to `Footer` (`:538-539`) unchanged.
- **`sheetName` = `data.show.title`** on every wrapped block + the alert bridge (the §12.4 `<sheet-name>` interpolation).

All other enumerated contracts (visibility gates, per-key re-throw gates, identity/viewerName threading, footer report props, dimensional + test anchors) are pinned in §4.1–4.13, §4.7–4.10, and wp-14/16/17.

### 4.15 List caps, truncation & the opening-reel URL strip

**Cap / truncation matrix (ported verbatim — bounded mobile render).** Every unbounded list keeps its existing inline cap + overflow disclosure; the migration moves these into the new sections and retargets `tests/components/tiles/CardinalityCapBoundary.test.tsx` (the cap-1/cap/cap+1 boundary matrix) to them:

| List (new home) | Cap | Overflow affordance | Truncation |
| --- | --- | --- | --- |
| Crew roster (Crew) | 8 (`CREW_INLINE_CAP`, `CrewTile.tsx:58`) | `data-tile-show-more`, "+N more" | — |
| Key contacts (Crew) | 6 (`CONTACTS_INLINE_CAP`, `ContactsTile.tsx:54`) | `data-testid="contacts-overflow-stub"`, "+N more contacts on the source sheet" | — |
| Show notes (Today, `NotesTile` aggregation) | 8 sources (`SOURCE_CAP`, `NotesTile.tsx:58`) | `data-testid="notes-overflow-stub"` | per-item **280 chars** (`TRUNCATE_AT`, `:57`) → `<details>`/`<summary>`, `data-testid="notes-item-truncated"` |
| Pack-list cases (Gear) | 12 (`CASE_CAP`, `PackListTile.tsx:67`) | `data-tile-show-more` | — |

Overflow counts derive from `length − cap` (never hardcoded); the affordance appears at `> cap`, not `>= cap`.

**Opening-reel URL strip (security/UX contract, `lib/visibility/openingReelText.ts`).** Gear's Opening Reel block routes `event_details.opening_reel` through `stripOpeningReelText` (`:56`) before render — the crew DOM **MUST NEVER contain `https://`, `drive.google.com`, or `docs.google.com`** for any opening-reel cell (`:18-19`). Text-only status renders; the video plays via the proxied `OpeningReelVideo` player (kept per §10/wp-20).

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

No raw error codes in crew UI (invariant 5). **One new §12.4 admin-alert code — `TILE_PROJECTION_FETCH_FAILED`** (the bridge, §4.13) — lands the **four-part lockstep** in one commit (master-spec §12.4 prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` + `pnpm gen:spec-codes` + a `lib/messages/catalog.ts` row with an admin-facing `helpfulContext` / `<sheet-name>` copy + the **`AdminAlertCode` union at `lib/adminAlerts/upsertAdminAlert.ts:3`** — without which the typed `upsertAdminAlert({ code })` call won't compile), passes the `x1-catalog-parity` gate, and adds a `_metaAdminAlertCatalog` producer row (§9). **No DB migration** — `admin_alerts.code` is unconstrained `text`.

---

## 6. DB / migration matrices

**One function migration, no table DDL.**
- (a) `dates.loadIn` → existing `shows.dates` **jsonb** (`migrations/20260501000000_initial_public_schema.sql:12`) — schemaless, no DDL/CHECK/enum/RLS change.
- (b) **`upsert_admin_alert` gains atomic signature-aware dedup** (§4.13): a new migration `create or replace`s the function (current body at `migrations/20260505000000_upsert_admin_alert.sql`) so the on-conflict **`occurrence_count` increment is gated** on a matching `excluded.context->'signature'` (skipped when equal), while `last_seen_at` and `context` **always** refresh — **backward-compatible** (no-`signature` producers increment + replace context exactly as today). Exact `do update` clause: `set last_seen_at = now(), context = excluded.context, occurrence_count = public.admin_alerts.occurrence_count + (case when excluded.context ? 'signature' and public.admin_alerts.context->'signature' = excluded.context->'signature' then 0 else 1 end)` (jsonb `?` existence + `->` access; no schema column added). `create or replace` is apply-twice idempotent; the existing `revoke ... / grant execute to service_role` is preserved verbatim. The migration reaches the **validation project** surgically and `pnpm gen:schema-manifest` is re-run; functions aren't in the column/table manifest so the `validation-schema-parity` gate is unaffected, but the function is applied to validation per the migration-reaches-validation discipline. Tier×domain + CHECK/enum migration matrices **N/A** (no table/column/CHECK/enum).
- (c) the new admin-alert **code** `TILE_PROJECTION_FETCH_FAILED` is catalog-level (§5), not a DB change (`admin_alerts.code` is unconstrained `text`).

**Validation-apply matrix — two distinct surfaces, do not conflate:**
- **Function migration** (`upsert_admin_alert` dedup, §6b) — **MUST** be applied locally **and surgically to the validation project** (`supabase db query --linked "<SQL>"` or `psql "$TEST_DATABASE_URL" -f supabase/migrations/<file>.sql` + `notify pgrst, 'reload schema'`) per the migration-reaches-validation discipline. `pnpm gen:schema-manifest` is re-run, but **functions are not in the column/table manifest, so `validation-schema-parity` will NOT catch function drift** — the surgical validation apply is the only guard; **do not skip it** (else validation/prod keep the old non-deduped RPC while tests/docs assume signature-aware dedup → silent per-nav `occurrence_count` inflation).
- **Parser / jsonb change** (`dates.loadIn`, §6a) — **no migration file**, therefore **no** surgical validation apply; exercised by TDD parser tests (§9), round-trip covered because `getShowForViewer` decodes `dates` generically. `validation-schema-parity` unaffected (no new column/table).

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
16. **Full visibility-gate inventory preserved (comprehensive sweep).** Every existing gate carries forward: `financialsVisible` (Budget, §4.2/D-7), `transportTileVisible` (Travel transport, §4.2/wp-14), `isPackListVisibleToday` (Gear pack list, §4.5/wp-15), `date_restriction` (Schedule rows + RightNow state, §4.2–4.3 — incl. the `unknown_asterisk` privacy contract: placeholder only, zero day cards), `shouldHideGenericOptional` (sentinels, §4.8), `shouldHideOpeningReel` (Gear reel, §4.5). **Only** the A/V/L scope predicates flip gate→emphasis (D-5, ratified). Hotel / Contacts / Crew were never role-gated (field-level sentinel hiding only) and stay all-viewer.
17. **`CrewShell` ports `_ShowBody`'s cross-cutting contracts verbatim — not re-derived.** Contracts in `_ShowBody.tsx` today that must be copied before `_ShowBody` is deleted (§10): (a) the **alert contract** — the always-rendered `notes-tile` catch-all (`:408-419`, ungated hotel/rooms/contacts + gated transportation) becomes the section-independent `<TileErrorAlertBridge>` (§4.13), plus the FinancialsTile financials gate (`:373`); (b) the per-section **visual** fallback gates (`:189`/`:224`/`:255-292`/`:309`/`:373` — §4.13); (c) the Footer report props per viewer kind (`:509-535` — §4.1); (d) every visibility gate (wp-16); (e) the fail-closed `resolveViewerContext` / `MalformedProjectionError` → `TerminalFailure` guard (`:113-122` — §4.1); (f) the **comprehensive ported-contract checklist** (§4.14: request-scoped `nowDate()` clock, realtime `renderVersion`, page-level access guards unchanged, body-`TerminalFailure`-has-no-retryHref, footer sync, `sheetName`). Paraphrasing any of these is where a contract silently drops — reviewers verify the ports are exact; tests 16/17/18/19/20/21/22/23 pin each. §4.14 is the canonical inventory: the implementation audits the new code against it before `_ShowBody` is deleted.
18. **`ShowStatusTile` fields are redistributed, not dropped; the old date-driven Today promotion is replaced.** Every `ShowStatusTile` field gets a home before the tile is deleted (§10): status pill → Header (D-2); `coi_status` → Venue (**keep `data-testid="coi-status"` — AC-4.1**); `power` → Venue; `internet` → Venue Wi-Fi; venue `notes` → Venue; dress code → Today; `keynote_requirements` → Gear — all sentinel-hidden. Separately, the mock's **fixed** Today (hero + curated cards) intentionally **supersedes** the old date-driven `selectTodayTiles`/`filterVisibleTodayTiles` TODAY-band promotion (schedule/transport/pack-list), which is deleted (§10); date-awareness remains in the hero. Ratified product changes, not regressions.
19. **No field dropped — full tile-field ports (field-coverage audit).** Every field the 14 tiles render has a section home (§4.2 "Full field ports"): Today notes = the `NotesTile` 5-source aggregation; Travel = the full `TransportTile` field set; Venue diagrams = full `DiagramsTile` incl `agenda_links`; Gear = full `PackListTile` item shape. The implementation ports each tile's **complete** field set, not a visual subset; test 25 asserts no source note silently disappears.
20. **Tile deletion is a file-by-file migration, not a blanket `rm`.** `components/tiles/OpeningReelVideo.tsx` (media) is reused by Gear and must be kept/moved; the `lib/` `load*` data helpers + `components/shared/` error infra stay; the tile test suite is migrated (deleted-View tests → new section tests; reused-module tests retargeted) **before** the obsolete `*Tile.tsx` View shells are deleted (§10). Reviewers: no build break, no orphaned tests, no dropped Opening Reel media.
21. **List caps, truncation & opening-reel URL-strip ported (§4.15).** The inline caps (Crew 8 / Contacts 6 / Notes 8-source + 280-char / Pack-list 12) + overflow stubs + the `stripOpeningReelText` Drive/Docs-URL strip move into the new sections; `CardinalityCapBoundary.test.tsx` is retargeted. "Complete field ports" (§4.2) does **not** mean "render every row unbounded" — the caps + the URL strip are part of the contract.
23. **`dates.loadIn` is rooms-independent.** The Set anchor renders from `dates.loadIn` even when `rooms` is empty/errored; only Show/Strike (and Set's *fallback* to room `set_time`) depend on rooms. The strip is fully omitted only when all three anchors are null. Do not couple `dates.loadIn` to room availability.
22. **STRUCTURAL CLOSE — the migrated tile test suite is the catch-all for tile-level contracts.** The crew tiles carry years of hardened micro-contracts (Codex-round comments throughout `components/tiles/`). Rather than re-enumerate each in this spec, the binding requirement is §10(b): **every existing tile test is retargeted to the new components and must pass before any `*Tile.tsx` is deleted.** Any tile-level contract not covered by a test is, by definition, not a relied-upon contract. Reviewers: a tile-level finding is in-scope only if it names a contract whose existing test would NOT carry over under §10(b); otherwise it is already structurally preserved.
24. **`?s=` deep-link preserved through auth/picker redirects** (§4.1). **The bridge uses a distinct code `TILE_PROJECTION_FETCH_FAILED`** (§4.13), separate from render-throw `TILE_SERVER_RENDER_FAILED` — separate `(show_id, code)` rows resolve coexistence (no context clobber) + aggregation (`failedKeys`); idempotency is an **atomic** signature dedup inside `upsert_admin_alert` (§6, backward-compatible) — section re-renders never inflate `occurrence_count`, race-safe. The new admin-alert code = §12.4 three-lockstep (catalog, no DB change); the RPC dedup IS a backward-compatible **function migration** (§6).

---

## 8. Out of scope (Phase 2 or later)

- **AGENDA-tab run-of-show parsing** (rich timeline). Phase 1 ships the anchor-times strip only; Phase 2 adds the optional AGENDA-title parser as enrichment.
- **Wi-Fi SSID/PW structured parse.** Phase 1 already shows the raw `event_details.internet` string in Venue (§4.2) — *raw display is in scope*; Phase 2 only adds the SSID/PW split.
- **Room-within-venue name** structured capture (Phase 2).
- **Per-crew flight surfacing.** `flight_info` is parsed (`lib/parser/types.ts:71`) but **not in the `ShowForViewer` projection**; Phase 2 adds the projection + the Travel flight block + a non-null flight test. Phase 1 renders no flight UI (only ground transport + hotel).
- v2 downloadable sheet template (`BL-CREW-SHEET-TEMPLATE-V2`).
- Admin operational show page redesign.
- Per-day call times (sheets store one show-wide value).
- **Client-contact (`client_contact`) crew visibility** — parsed + projected but never rendered today; exposing the client rep's phone/email to all crew is a NEW PII decision, **not** introduced in Phase 1 (a ratified call if wanted later).

**Ratified Phase-1 product changes (not regressions, wp-18):** the old date-driven TODAY-band tile promotion (`selectTodayTiles`/`filterVisibleTodayTiles`) is **replaced** by the mock's fixed Today (date-awareness stays in the hero); `ShowStatusTile` is deleted with its fields **redistributed** to Header/Venue/Today/Gear (COI keeps `data-testid="coi-status"`, AC-4.1), not dropped.

---

## 9. Testing

Unit / component (jsdom where layout isn't asserted; every test states its failure mode; expected values derived from fixtures, not hardcoded):

1. **`resolveActiveSection`** — `undefined`/`""`/`"venue"`/`"bogus"`/`"budget"` (non-lead) → `today` for invalid + non-entitled; valid → that id. _Catches: invalid `?s=` rendering a broken/empty shell or leaking Budget._
2. **Section→content mapping** — each `*Section` renders its declared blocks from a fixture; Today shows hero+KeyTimes+3 cards+notes. Anti-tautology: assert against the data source, and clone-and-strip sibling nodes before label scans. _Catches: a block silently dropped or duplicated._
3. **`buildRightNowContext` rooms-sourcing** (TDD) — fixture with GS `set_time/show_time/strike_time` set → context Set/Show/Strike come from rooms; with `event_details.{load_in_time,strike_time}` ALSO set to *different* values → context still shows the rooms values (the `event_details` time path is dropped, not a fallback); no GS room → first room; **`rooms: []` with no `dates.loadIn` → all three null, strip omitted; `rooms: []` WITH `dates.loadIn` present → Set renders (from `dates.loadIn`), Show/Strike omitted (strip NOT fully omitted)**. _Catches: regression to the always-empty `event_details` path; missing empty-rooms guard; a known load-in time hidden whenever rooms are absent/errored._
4. **Dates-parser load-in** (TDD) — v2/v4 fixtures: a plain **SET** row with a TIME column ("11:00 AM LOAD IN") → `dates.loadIn === "11:00 AM"`; a combined **`TRAVEL / SET`** row with a TIME column → `dates.loadIn` captured (the `travel_set` classification, `dates.ts:196`); a **SHOW** or plain **TRAVEL** row's TIME column does **not** populate `dates.loadIn` (only set-bearing rows, via the label classifier `dates.ts:32-44`); absent TIME column → `dates.loadIn === null`; v1 fixture → null tolerated. Then resolution: **both** `dates.loadIn` and legacy `event_details.load_in_time` set to different values → resolved Set anchor uses `dates.loadIn`; `dates.loadIn` null but GS `set_time` present → uses GS `set_time`. Expected derived from the fixture cell, not hardcoded. _Catches: row[4] discarded; combined TRAVEL/SET row dropped; SHOW/TRAVEL row misclassified as load-in; fallback/priority not wired._
5. **Hero 12-state mapping** — for each kind, the hero renders the mapped eyebrow/lead/progress/treatment; degraded kinds carry the stale tint and NO stats; `show_day_n` shows N progress segments derived from `total`; **travel-day states render hotel name/dates only — never `flight` or `next-call` stats** (Phase-1 source boundary). _Catches: a state missing/mis-skinned; fabricated stats on degraded states; out-of-scope flight/call stats on travel days._
6. **Stat-strip guards** — empty/all-null stats → no strip node; non-finite numeric → that stat omitted. _Catches: blank stat chips._
7. **Gear emphasis** — viewer with A-flag → Audio card first + carries `[data-emphasis=you]`; no-flag viewer → default order, no emphasis; empty scope omitted (incl. viewer's own); all-empty → section EmptyState. Expected ordering derived from the flag fixture. _Catches: emphasis becoming a gate; empty "Your scope" shell._
8. **Budget gating (single predicate)** — `financialsVisible(viewerFlags, isAdmin)` true → Budget tab present + section renders financials; false → tab absent AND `resolveActiveSection('budget', { budgetVisible: false })` → `today` (a non-lead direct-linking `?s=budget` cannot reach it). All three surfaces share the one predicate. _Catches: lead-only data leaking to non-leads via direct URL; a dead tab; a divergent gate._
9. **Empty-state discipline** — venue/parking/dock/internet/notes sentinels (`""`,`TBD`,`N/A`,`TBA`) hidden; required-field-missing (venue.name) → `EmptyState`. _Catches: sentinel leak; blank required block._
10. **PersonRow guards** — phone-only / email-only / neither / both; `tel:`/`mailto:` href sanitization; **a nameless contact (blank name) with phone/email → the row still renders with the `kind`/role fallback label + tap actions** (preserves `ContactsTile`'s operational-contact behavior); fully-empty → omitted. _Catches: empty action buttons; bad hrefs; dropping nameless-but-actionable contact rows during the tile→section port._
11. **Today curation + date-awareness** — Today renders its **fixed** curated blocks (hero, key-times, Tonight, Where, Need-something, dress code, notes); date-awareness lives in the **hero** (12-state machine) + key-times, **not** the old `selectTodayTiles` tile-promotion (intentionally superseded — wp-18, §8). Assert the hero state drives Today across show/travel/off states, and the curated blocks render per their guards. _Catches: Today losing date-awareness; or accidentally retaining the deleted `selectTodayTiles` band._

Real-browser (Playwright — extends `tests/e2e/crew-page.spec.ts`):

12. **Layout dimensions** (§4.9 invariants verbatim): Today quick-cards equal-height==row; Crew columns equal at ≥720px; Gear cards equal; hero `min-h`==176px stable through a forced state crossfade; bottom tab-bar full-width/bottom-anchored/`flex-1` equal + full-height + safe-area; top tabs ≥44px. _Catches: Tailwind-v4 stretch/collapse bugs jsdom can't see._
13. **Nav addressability** — deep-link `?s=venue` SSRs Venue; tab tap updates URL + swaps section without full reload; mobile back-button returns to prior section (not off-page); refresh holds the section. _Catches: client-only state; broken back-button._
14. **Transition audit** (§4.10): every `AnimatePresence`/ternary/conditional has `exit`/`initial`/`animate` or is deliberately instant; the **`CrewSectionTransition`** section crossfade (`initial={false}`, keyed by `?s=`, server-section `children`, reduced-motion-safe) animates on nav; compound (theme toggle during nav; re-enter Today). _Catches: animating-from-hidden SSR; orphaned exit; a section swap that ships instant while the inventory expects a crossfade (or vice-versa)._
15. **Preview-as parity** — the admin preview-as route (`app/admin/show/[slug]/preview/[crewId]`) renders `CrewShell` (same `data-testid=crew-shell`, same sections) for a seeded crew identity; `?s=venue` resolves there too. _Catches: preview-as left on the old flat-grid `ShowBody`._
16. **Section error containment** (§4.13) — three layers:
    - **Alert bridge (section-independent, coalescing-aware).** Mount `CrewShell` as a **normal crew** viewer on an **unrelated** section (e.g. `?s=crew`) while `tileErrors` carries `hotel`+`rooms`+`contacts` → a **single** `TILE_PROJECTION_FETCH_FAILED` upsert whose `context.failedKeys` contains **all three** keys AND `context.errorsByKey` carries each domain's distinct error string (assert the upsert payload, not N separate mocked calls; no per-domain detail lost), even though no rendered section mounts those blocks. `transportation` included in `failedKeys` iff `isAdmin||transportVisible`; `financials` iff `financialsVisible`; clean `tileErrors` → no upsert. Also assert the upsert's context carries `sheet_name`/`tileId`/`message` + `failedKeys` + `signature` (the catalog producer contract, §9). **Idempotency (atomic):** with `tileErrors` unchanged (same `viewerVersionToken`), multiple `?s=` navigations → no `occurrence_count` increment beyond the first (the RPC no-ops on a matching `signature`); a `failedKeys`/version change increments. **Concurrency:** two same-`signature` upserts against a real DB → `occurrence_count` increments at most once. **Backward-compat:** an upsert with no `signature` key increments on every call (existing producers unchanged). **Context refresh:** same `viewerVersionToken` + same `failedKeys` but a changed error `message` → `occurrence_count` unchanged, yet the row's `context` updates to the new message. **Fail-quiet:** the RPC/`upsertAdminAlert` rejects → the section still renders, no raw error UI, bridge renders `null`. _Catches: the section model dropping the always-on `notes-tile` alert; the `(show_id, code)` coalescing collapsing multi-domain failures into a single last-writer-wins row; a second producer shipping without the required `admin_alerts.context` keys; per-tab-visit occurrence_count inflation from re-renders._
    - **Visual fallback (active section).** With the relevant section open + the block's gate satisfied: admin → inline degraded state, crew → omission; **no second upsert** (the bridge owns alerting). Error path distinguishable from no-data path (assert both). `rooms` fallback fires for any Gear/KeyTimesStrip viewer (scope shown to all).
    - **Render throw.** A throw injected into a wrapped block → `TileErrorBoundary` fallback + its own `TILE_SERVER_RENDER_FAILED` upsert (the render-boundary layer, distinct from projection `tileErrors`).
17. **Transport visibility gate** (Travel **and** Venue) — `transportTileVisible` matrix: admin → visible; assigned driver (`viewerName` matches the leg) → visible; crew named on a transport leg → visible; **unassigned crew → the Travel ground-transport block AND the Venue parking block are both omitted** (no driver name/phone, vehicle, plate, parking, or assignments in the DOM of either section). Also: a `transportation` tile-error for unassigned crew shows neither data nor degraded UI. _Catches: leaking driver PII / assignments / parking to every crew member, in either section — a trust-boundary regression from dropping the gate (§4.13a)._
18. **Pack-list stage/phase gate** (Gear) — `isPackListVisibleToday` matrix in the Gear section: viewer `stageRestriction` not overlapping the day's pack-list phase → pack list omitted; a non-pack-list-phase `today` → omitted; allowed phase + overlapping stage → pack list shown. Expected from fixture stage/phase, not hardcoded. _Catches: pull-sheet details leaking on intentionally-withheld days/stages once the pack list moved into the persistent Gear tab._
19. **Footer report metadata (preview-as)** — `admin_preview` viewer → Footer receives `reportSurfaceOverride='admin'`, `reportSurfaceIdOverride='admin-preview-footer-<slug>-<crewId>'`, and `reportAutocapture.crewPreview` populated; a normal crew viewer → `reportSurfaceOverride='crew'`, no override id, no `crewPreview`. _Catches: preview-as bug reports mis-filed as generic crew-surface reports, regressing role-filtering triage._
20. **`resolveKeyTimes` determinism** — fixtures with (a) multiple `gs` rooms supplied in varying array order → the name-sorted-first GS room's times are chosen, identically across orderings; (b) no `gs` room → the name-sorted-first room; (c) a GS room with blank times → blank anchors (strip omitted). _Catches: anchor times varying with DB return order (the rooms query has no `ORDER BY`); flaky screenshot baselines._
21. **Fail-closed on malformed projection** — a `ShowForViewer` with `crewMembers` not an array, for a **crew** AND an **admin_preview** viewer → `CrewShell` renders `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED">` and **no** section content (no Schedule / Pack List / Right Now rendered unrestricted). _Catches: a malformed projection crashing the Next boundary, or regressing to unrestricted per-crew rendering — the ratified fail-closed contract (`_ShowBody.tsx:113-122`)._
22. **Request-scoped clock** (§4.14) — with `X-Screenshot-Frozen-Now` set under test auth, `CrewShell`'s Today / Right-Now render at the frozen instant, not wall-clock; the page calls `nowDate()`. _Catches: `CrewShell` using `new Date()` inline → screenshot-baseline drift + non-deterministic state selection._
23. **Realtime render-version** (§4.14) — `ShowRealtimeBridge` receives `renderVersion === data.viewerVersionToken`. _Catches: stale renders not re-subscribing after a roster/version change._
24. **Show-status field coverage** (wp-18) — each former `ShowStatusTile` field renders in its new home, sentinel-hidden: `coi_status` → Venue with `data-testid="coi-status"` (AC-4.1), `power` → Venue, dress code → Today, `keynote_requirements` → Gear, `internet`/venue-notes → Venue; sentinel value (`""`/`TBD`/`N/A`/`TBA`) → field hidden. _Catches: deleting `ShowStatusTile` silently dropping COI / dress / power / keynote from the crew page._
25. **Notes aggregation coverage** (wp-19) — Today's Show-notes block renders all five `NotesTile` sources (venue / hotel / room / transport / contact) with their labels, sentinel-hidden, transport notes gated by `transportTileVisible`; a fixture with a distinct note in each source proves all five surface. _Catches: dropping hotel / room / transport / contact notes when the aggregator tile is deleted._
26. **Opening-reel URL strip** (§4.15) — `event_details.opening_reel` carrying a Drive/Docs URL (e.g. `"YES - https://drive.google.com/file/d/abc/view"`) → the Gear opening-reel cell renders text-only; the crew DOM contains **no** `https://`, `drive.google.com`, or `docs.google.com` substring. _Catches: leaking raw Drive URLs when porting off `OpeningReelTile`._
27. **List caps + truncation** (§4.15) — for each capped list (Crew 8, Contacts 6, Notes 8-source + 280-char, Pack-list 12) the cap-1/cap/cap+1 boundary: ≤cap → no overflow affordance; >cap → exactly `cap` inline + the overflow stub with the correct `data-testid`/copy and count `= length − cap`; Notes items >280 chars carry `data-testid="notes-item-truncated"` with a `<details>` body. Migrate/extend `CardinalityCapBoundary.test.tsx`; expected from fixture dimensions. _Catches: unbounded mobile scrolls + lost overflow/truncation affordances after the tile views are deleted._
28. **Section deep-link through picker** — a not-yet-identified visitor opens `/show/<slug>/<token>?s=venue` → after the picker `selectIdentityFormAction` (and sign-in / `gate=skip` where applicable) they land on **Venue** (`?s=venue` preserved), not Today; an invalid `s` still falls back to Today. _Catches: the picker/auth redirects dropping `s` for shared-link users — the primary deep-link entry path._
29. **Two distinct alert codes, no clobber** (§4.13) — a projection `tileErrors` (bridge → `TILE_PROJECTION_FETCH_FAILED`) AND a wrapped-block render throw (`TileServerFallback` → `TILE_SERVER_RENDER_FAILED`) in one render → **two** distinct unresolved rows, each retaining its full context (the bridge's `failedKeys`/`signature` AND the thrown `tileId` both survive). Then **repeated `?s=` navigation** with unchanged data → the bridge row's `occurrence_count` does **not** inflate (atomic signature dedup in `upsert_admin_alert`, §6). _Catches: a shared code clobbering one context; per-nav occurrence inflation in the mixed scenario._
30. **`client_contact` not rendered** — a fixture with a populated `client_contact` (client rep phone/email) → it appears **nowhere** in the Today or Crew DOM (only `contacts[]` venue/in_house_av render). _Catches: a new client-PII exposure slipping in via the Today "Need something" / Crew "Key contacts" blocks._
31. **Primary-contact selection determinism** — `selectPrimaryContact` over `contacts` in varying array order, with the first entry unactionable (no phone/email) and a later one actionable → the **actionable** contact is chosen, identically across orderings; all-unactionable → the card is hidden. _Catches: a nondeterministic or blank-phone "Need something" card; flaky screenshots._
32. **Schedule DateRestriction branches (privacy)** — `unknown_asterisk` viewer → the Schedule renders the unconfirmed placeholder and **zero** `schedule-day` rows / date text (cannot infer show days); `explicit` → only the viewer's assigned days (the intersection); `none` → all dates. _Catches: treating `unknown_asterisk` like `none` and leaking the show's dates to unconfirmed crew — a trust-boundary regression from `ScheduleTile`._

Meta-test / structural-registry inventory (declared per plan rule; same-commit as the surface they pin):

- **EXTEND `_metaSentinelHidingContract.test.ts`** — its `listTileFiles()` walk gains `components/crew/` (sections + primitives) so any new component reading a generic-optional field must import+call `shouldHideGenericOptional`. (Mandatory; the new sections read venue/contact/room/notes fields.)
- **EXTEND `tests/e2e/crew-page.spec.ts`** — the redesigned layout invariants (§4.9) replace the today-band assertions (the band is subsumed by Today).
- **EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts` + the §12.4 catalog** — register the **new** code `TILE_PROJECTION_FETCH_FAILED` (catalog completeness + the bridge as its **sole** producer, validating context keys `sheet_name`/`tileId`/`message`/`failedKeys`/`errorsByKey`/`signature` — `errorsByKey` carries the per-domain error string for every failed key, so a multi-domain failure loses no detail) **and extend `_metaAdminAlertCatalog` to assert every *registered* code is admitted by the `AdminAlertCode` union** (the meta-test currently only checks union ⊆ registry, not registry ⊆ union — so a registered code missing from the union would slip through). The §5 **four-part lockstep** (master-spec prose + `gen:spec-codes` + `catalog.ts` + the `AdminAlertCode` union) lands in the same commit; `x1-catalog-parity` enforces three of the four, the extended meta-test the fourth. The bridge **writes** via the existing `upsertAdminAlert` helper → the now signature-aware `upsert_admin_alert` RPC (§6 migration); idempotency is **atomic in SQL**, so there is **no** read-then-write boundary. The RPC migration reaches the validation project + `gen:schema-manifest` per the migration discipline (§6), and the existing `tests/admin/upsertAdminAlert.test.ts` must stay green (backward-compat: a no-`signature` upsert still increments) alongside a new same-`signature` no-op test.
- **Not touched (declared):** advisory-lock + DML-lockdown registries — **no new locks** (admin_alerts is not an advisory-lock surface) and **no table DDL** (`dates.loadIn` → existing `dates` jsonb; the new alert code is catalog-level text). The one DB change is the backward-compatible `upsert_admin_alert` **function** migration (§6) — a `create or replace` preserving the existing `revoke`/`grant`, not a table/RLS/lock change.

Gates: impeccable v3 dual-gate (critique + audit, external attestation) on the UI surface (invariant 8) before close-out; cross-model adversarial review; real-CI green (including `screenshots-drift` once baselines land).

---

## 10. Implementation shape (for writing-plans)

Single milestone on `feat/crew-page-redesign`, ~4 phases:
1. **Parser + context** — dates `loadIn` capture (TDD) + `buildRightNowContext` rooms-sourcing (TDD) + type/projection passthrough. No UI yet.
2. **Shell + nav + primitives** — `CrewShell` (crew route **and** preview-as route), `?s=` routing, `CrewSubNav`, the shared primitives + `RightNowHero`; `_metaSentinelHidingContract` extended to walk `components/crew/`.
3. **Sections** — the six sections + Budget; Gear emphasis; empty states; Today/Schedule wired to the new anchors.
4. **Layout/transition/screenshots + close-out** — Playwright dimensions + nav + transition-audit; manifest entries + baselines (pinned docker); **tile migration (file-by-file, not a blanket delete — wp-20):** (a) KEEP/reuse the non-View modules — `components/tiles/OpeningReelVideo.tsx` (media player, reused by Gear's reel block), the `lib/` `load*` data helpers, and the `components/shared/` error infra; (b) **retarget the EXISTING tile test suite to the new section/primitive components and keep it green** — this is the **structural guarantee** that every tile-level contract a test pins (caps/overflow, Notes truncation, opening-reel URL-strip, sentinel-hiding, AC-pinned `data-testid`s, date/tabular formatting, a11y) is preserved or fails CI; a contract without a test is not relied upon; (c) **only then** delete the obsolete `*Tile.tsx` View shells, `_ShowBody.tsx`, and `selectTodayTiles` once nothing imports them; impeccable dual-gate; adversarial review; real-CI; merge.

UI throughout → Opus implements; Codex per-phase + whole-milestone adversarial review; impeccable v3 critique+audit external attestation before close-out.

---

## 11. Phase boundary / deferred

Phase 1 ships the IA + anchor-times on reliably-present data. **Phase 2** (separate spec) adds: AGENDA-title parser block (rich run-of-show enrichment), Wi-Fi SSID/PW structured parse, room-within-venue capture, and per-crew flight surfacing — each upgrading a Phase-1 section/empty-state in place. The v2 downloadable sheet template remains backlog (`BL-CREW-SHEET-TEMPLATE-V2`).
