# Crew show search: target-site inventory

Read-only research for the implementation plan of `docs/superpowers/specs/2026-10-26-crew-show-search-design.md`.
Worktree `/Users/ericweiss/FX-worktrees/crew-show-search`, HEAD `68d8c1619` (spec round-1 repairs: content-addressed ids, INV-1 clause 5 coverage, region `none`). No component file changed between `e6a311e9a` and `68d8c1619`; every line number below is live at HEAD.

## 0. Conventions

Path abbreviations (all under the worktree):

| Abbrev | File |
|---|---|
| TS | `components/crew/sections/TodaySection.tsx` |
| SS | `components/crew/sections/ScheduleSection.tsx` |
| VS | `components/crew/sections/VenueSection.tsx` |
| TR | `components/crew/sections/TravelSection.tsx` |
| CS | `components/crew/sections/CrewSection.tsx` |
| GS | `components/crew/sections/GearSection.tsx` |
| BS | `components/crew/sections/BudgetSection.tsx` |
| KVR | `components/crew/primitives/KeyValueRows.tsx` |
| FR | `components/crew/primitives/FactRows.tsx` |
| PR | `components/crew/primitives/PersonRow.tsx` |
| SC | `components/crew/primitives/SectionCard.tsx` |
| KTS | `components/crew/primitives/KeyTimesStrip.tsx` |
| ROS | `components/crew/primitives/RunOfShowList.tsx` |
| SDT | `components/crew/primitives/ShowDayTimelineList.tsx` |
| DC | `components/crew/primitives/DayCard.tsx` |
| ASB | `components/crew/AgendaScheduleBlock.tsx` |
| DCL | `components/crew/DressCodeLines.tsx` |
| DB | `components/crew/DiagramsBlock.tsx` |
| GAL | `components/diagrams/Gallery.tsx` |
| SEC | `components/atoms/Section.tsx` |

"Hidden" = every condition under which the line is not in the DOM. "Disclosure" = the line sits inside a `<details>` (native, server-rendered, in the DOM while closed) or behind client state (not in the DOM until the client acts). `sentinel` = `shouldHideGenericOptional` (`lib/visibility/emptyState.ts:79`, trims + uppercases, hides null, `''`, `TBD`, `N/A`, `TBA`).

Ids are now content-addressed (spec §3, `<sectionId>:<region>:<fnv1a(group␟label␟value)>` with `~n` for duplicates in RENDER order). So "rowKey" below is the source identity the builder iterates by, and "order" is what the builder must reproduce so `~n` suffixes land on the same element. Index stability still matters for the builder's iteration order, not for the id.

### 0.1 Primitive anchor sites (where the attribute goes)

| Primitive | Element to carry `data-search-target` | textContent covers | Existing hide predicate | React key today |
|---|---|---|---|---|
| KeyValueRows | row `<div>` KVR:91 | `k` (dt KVR:99-101), `v` (span KVR:119-123), `sub` (KVR:125-127) | `shouldHideGenericOptional(row.v)` KVR:67 | `${row.k}-${i}` KVR:92 (index of PRESENT rows) |
| FactRows | row `<div>` FR:95 | label (FR:116), value (FR:128 or FR:140), sub (FR:142-149), CopyFactValue log text (FR:129) | `shouldHideGenericOptional(row.v)` FR:70 | `testId ?? ${k}-${i}` FR:96 |
| PersonRow | `<li data-testid="person-row">` PR:153 | heading (PR:170-172), chips You/Lead/Primary/partial (PR:173-187), role (PR:190-192), notes (PR:225); Avatar is `aria-hidden` | whole-row `return null` PR:143-145; notes PR:150; heading PR:128-129 | caller's wrapper |
| KeyTimesStrip | `AnchorRow` root `<div>` KTS:101 | label (KTS:107-109, `<time>` for show days KTS:99), value (KTS:112) | all-absent → `null` KTS:125-128 | `show-${date}` KTS:158 |
| RunOfShowEntry | `<li data-testid="agenda-entry">` ROS:57 | time label (ROS:63-69), title (ROS:105, or summary ROS:93-101 + full ROS:102), room/AV (ROS:109-121) | caller passes displayable entries only | `a${i}` / `s${i}` ROS:157/160 |
| AgendaSessionRow (module-local) | `<li data-testid="timeline-agenda-session">` SDT:20 | time (SDT:22-24), "Agenda" eyebrow (SDT:25-30), title (SDT:31-35), room (SDT:37) | title `""` drops the title cell SDT:31 | `a${i}` SDT:77 |
| DayCard | root `<div data-testid="day-card">` DC:66 (needs a new prop; DayCard does not forward attributes, see SS:387-393) | dow (DC:83), dnum (DC:86), label (DC:106), meta (DC:108-112), "Today" pill (DC:115-119) | none | caller |
| SectionCard | none. Title `<h2 data-slot="section-card-title">` SC:57-62 is the `group` and is excluded by clause 5 | | | |

Bypass markup (no primitive): AnchorRow is module-local in KTS; TravelRow (TR:96-164), hotel blocks (TR:636-690), flight segments (TR:740-807), COI/venue notes (VS:404, VS:421), pack list (GS:375, GS:425), keynote (GS:540), notes (TS:563), agenda (ASB), dress (DCL), gallery (GAL), Section atom heading (SEC:223/226).

---

## 1. Today (`today`)

Whole body inside ONE `WrappedSection tileId="crew:today:notes"` TS:183-736: any throw in the render callback renders `TileErrorFallback` and zero targets. `resolveViewerContext` (TS:179) is outside it and throws to the route.

### 1.1 Rows

| # | Card (`data-card-id`) | Target element | Group / Label / Value (source) | Hidden when | Text / a11y; disclosure | Source identity, order | Builder derivation |
|---|---|---|---|---|---|---|---|
| T1 | `today-tonight` TS:392 | KVR:91 (rows TS:297-305, rendered TS:422, `columns={2}`) | "Tonight" (TS:397) / "Hotel" / `firstHotel.hotel_name ?? ""` TS:299, TS:301 | no reservation: `firstHotel = data.hotelReservations[0]` TS:277, card gate TS:388; sentinel KVR:67 | text; none | single reservation = ARRAY index 0, not ordinal-sorted (Travel sorts by ordinal, TR:387-389) | inline. Extract `todayTonightRows(firstHotel, hideDates)` from TS:296-305 |
| T2 | same | KVR:91 | "Tonight" / "Check in" / `firstHotel.check_in ?? ""` TS:302: the RAW ISO string, not formatted (Travel formats it, TR:669) | `hideDates = suppressesDates(dateRestriction)` TS:296, TS:298-299; sentinel | text | after Hotel | same extraction |
| T3 | same | KVR:91 | "Tonight" / "Check out" / `firstHotel.check_out ?? ""` TS:303 | same as T2 | text | after Check in | same |
| T4 | `today-where` TS:432 | KVR:91 (rows TS:321-333, rendered TS:448) | "Where" (TS:437) / "Venue" / `venueDisplayName ?? venue.name ?? ""` TS:323, via `venueDisplay(venue)` TS:320 (`lib/venue/venueLocation.ts:307`) | `!venue` TS:321, card gate TS:428; sentinel | text | fixed field order Venue, City, Address, Loading dock | inline. Extract `venueWhereRows(venue, { includeDock })`, shared with VS:135-141 |
| T5 | same | KVR:91 | "Where" / "City" / `venueCity` TS:324 | `venueCity` falsy TS:324 | text | | same |
| T6 | same | KVR:91 | "Where" / "Address" / `streetFromAddress(venue.address, venueCity) ?? ""` TS:325 (`venueLocation.ts:283`) | sentinel / empty | text | | same |
| T7 | same | KVR:91 | "Where" / "Loading dock" / `venue.loadingDock` TS:329-331 (untrimmed) | read-site sentinel TS:329 | text | | same. Venue renders dock in Facilities instead, trimmed (VS:227-229) |
| T8 | `today-contact` TS:458 | PR:153 (person TS:475-490) | "Need something" (TS:463) / null / heading = `name` when non-blank (PR:128-129) else fallback `kind === "in_house_av" ? "In-house AV" : "Venue contact"` TS:478-481; "Primary" chip PR:179-181 | `selectPrimaryContact(data.contacts)` null TS:335, TS:454 (needs a non-sentinel phone OR email, `lib/crew/selectPrimaryContact.ts:13-15`); PersonRow returns null when no name AND phone has no digits AND email sentinel (PR:136-145): the card then renders an EMPTY list under its title | heading text; phone/email are `aria-label` only (PR:196-222), never text; no role, no notes passed | single | `selectPrimaryContact` exists. Extract `personRowDisplay(person)` from PR:126-150 (heading, render-or-null) and use it in PersonRow and the builder |
| T9 | `today-key-times` TS:519 in Modes B/left-only; NONE (region `none`) in Mode A (bare strip TS:656) | KTS:101 | "Key times" (TS:522) in B, none in A / "Set" (KTS:151) / `anchors.set` | `resolveKeyTimes(...)` TS:262-268 returns `{}` under `suppressesDates` (`lib/crew/resolveKeyTimes.ts:109`); front-end stage gate (`resolveKeyTimes.ts:114-116, :128`); no loadIn and no GS room `set_time` (`:129-135`); card gate `anchorsPresent` TS:506-509 | text | KTS order: set, shows, overflow, strike (KTS:149-231) | `resolveKeyTimes` exists. Today's show filter is INLINE TS:269-275, equivalent to `todayShowAnchors` (`lib/crew/agendaDisplay.ts:167`) which it does not call. Extract `todayKeyTimeAnchors(resolved, todayIso)` |
| T10 | same as T9 | KTS:101 | as T9 / `s.label` ("Show" for single-show-day shows, else "Day N · Wed 10/8", `resolveKeyTimes.ts:74-77`) / `s.time` | not today's show day (TS:272-274); no resolvable time (`resolveKeyTimes.ts:150-189`) | text; `<time dateTime>` wraps label | at most ONE row (today only), so the KTS overflow `<details>` is unreachable here | same |
| T11 | same as T9 | KTS:101 | as T9 / "Strike" (KTS:228) / `anchors.strike` | back-end stage gate (`resolveKeyTimes.ts:117-119, :140`); GS room `strike_time` absent | text | | same |
| T12 | `today-dress` TS:538 | DCL:49 row `<div>` (dt phase DCL:53, dd attire DCL:54) | "Dress code" (TS:540) / `phase` / `attire` from `parseDressCodeLines(value)` (`lib/crew/dressCodeLines.ts:25`) | `shouldHideGenericOptional(dress_code)` TS:347-349; parse null (fewer than 2 lines, or any line not `Phase: attire`) → T13 instead | text | `lines` order, React key `idx` DCL:50 | `parseDressCodeLines` exists |
| T13 | same | DCL:43 `<p>` | "Dress code" / null / raw `value` (`whitespace-pre-line`, may contain `\n`) | parse returned lines → T12 instead | text | single | none needed; builder must whitespace-normalize |
| T14 | `today-notes` TS:557 (in `OUT_OF_SCOPE_CARDS`; no CardHeaderActions) | `<li>` TS:563 (contains `<details>` TS:569) | "Show notes" (TS:558) / `entry.label`: "Venue", "Hotel: {name}" or "Hotel", "Room: {name}" or "Room", "Transport", "Contact: {name}" or "Contact" (TS:116, :123, :130, :136, :144) / FULL `entry.text` (trimmed, `notesText` TS:99-103) | sentinel (`notesText`); transport note only when `transportTileVisible(...)` TS:229-236, TS:133; cap `SOURCE_CAP = 8` TS:76, TS:355: notes 9+ are NOT in the DOM (stub TS:605-613) | text. ALWAYS inside a `<details>` (TS:569, closed). Untruncated: full text is in the summary (TS:586-593), visible. Truncated (`length > TRUNCATE_AT = 280`, TS:75, `truncate` TS:151-154): summary shows the cut text + "…", full text only in the closed body TS:595-599 | sources in order venue, every `hotelReservations` (ARRAY order), every `rooms` (array order), transport, EVERY contact (not Crew-capped). React key `${source}-${idx}` TS:564 is the GLOBAL index | `aggregateNotes` TS:111-148, `truncate`, `nonEmpty`, `notesText` are module-local. Export `aggregateNotes` (add a per-source key: `venue`, `hotel-${ordinal}`, `room-${id}`, `transport`, `contact-${i}`), export `TRUNCATE_AT`, `SOURCE_CAP` |
| T15 | `today-run-of-show` TS:671 (Mode A only) | ROS:57 via `RunOfShowList` TS:698 | "Run of show" (TS:676) / time label `range · trt` (ROS:53-54) or null when no time / title `stripAgendaUrls(entry.title)` ROS:34; context room, AV | not Mode A: `modeA = isShowDay && eligible && (todays.length > 0 || agendaToday.length > 0)` TS:247; `todays = suppressesDates ? [] : scheduleEntriesForViewer(runOfShow[todayIso].entries, { transportVisible })` TS:237-239 (drops URL-only titles and the load-out when transport is hidden); used only when `agendaToday.length === 0` TS:692-698; cap `RUN_OF_SHOW_DISPLAY_CAP = 20` over the AGENDA group only (ROS:151) | text; title longer than `TITLE_TRUNCATE_AT = 80` collapses into a `<details>` ROS:82 (summary = first 80 chars + "…", full title ROS:102) | RENDER ORDER IS NOT SHEET ORDER: agenda group first, then synthetic strike/load-out (ROS:148-161) | `scheduleEntriesForViewer`, `displayableEntries`, `resolveOptionalField`, `stripAgendaUrls` exist. Extract `runOfShowRows(entries)` (ROS:148-152) and `runOfShowEntryDisplay(entry)` (ROS:34-54) |
| T16 | same | ROS:57 via `ShowDayTimelineList` SDT:75 (TS:693) | as T15 | Mode A AND `agendaToday.length > 0` (TS:242-246, `lib/crew/agendaDayForToday.ts:52`); cap loop SDT:55-69 caps NON-synthetic items at 20 in CHRONOLOGICAL merged order, a different rule from ROS | as T15 | order from `buildShowDayTimeline(todays, agendaToday)` (`lib/crew/showDayTimeline.ts:17`): sorted by minutes, crew wins dedup | `buildShowDayTimeline` exists. Extract `capTimelineItems(items)` from SDT:55-69 |
| T17 | same | SDT:20 | "Run of show" / `session.time` SDT:22-24 / title `stripAgendaUrls(session.title)` SDT:18 (URL-stripped HERE, raw in Schedule ASB:163); room `resolveOptionalField(session.room)` SDT:15 | as T16; title `""` → time-only row | text | merged timeline order | AgendaSessionRow derivations SDT:15-18 inline; extract with `capTimelineItems` |

Excluded or static in Today: `RightNowHero` TS:644 (client, clock; spec wraps it in `data-search-skip`); "Booked" pill TS:405-411 (inside the card action slot, not a button: needs `data-search-skip`); notes overflow stub TS:605-613 (skip); "Full agenda" `SectionChipLink` TS:679-681 (a `next/link` `<Link>`, SectionChipLink.tsx:48, not a button: skip); `SectionTileError` TS:646-648 (admin only, skip).

### 1.2 Today render modes (data-driven, instant)

| Mode | Condition | Key times | Run of show | Quick cards |
|---|---|---|---|---|
| A | `modeA` TS:247 | bare `KeyTimesStrip` TS:656, NO card, default stack layout | card `today-run-of-show`, `RunOfShowList` (TS:698) or `ShowDayTimelineList` (TS:693) | right column of `today-mode-a-grid` TS:657-705 |
| B grid | `!modeA && hasLeft && hasRight` TS:639-640, TS:709 | card `today-key-times`, `layout="row"` TS:715 | none | right column TS:719 |
| right only | `!modeA && !hasLeft && hasRight` TS:721 | none (no anchors) | none | `max-w-md` TS:722 |
| left only | otherwise TS:724-731 | card `today-key-times`, stack layout TS:728 | none | none |

Region of T9-T11 flips between `today-key-times` and `none` by mode. The builder must compute `modeA` with the SAME expression; extract `resolveTodayMode(data, ctx, today)` returning `{ todayIso, isShowDay, eligible, transportVisible, todays, agendaToday, modeA }` from TS:219-247.

---

## 2. Schedule (`schedule`)

Early return: `suppressesDates(dateRestriction)` SS:223-234 renders ONLY "Your days haven't been confirmed yet…" (SS:226-231). Zero entries; the agenda area is not rendered either. The day cards and Crew Schedule card are inside `WrappedSection tileId="crew:schedule:days"` SS:239-460; the agenda area SS:191-218 is OUTSIDE it. A day-derivation fault (SS:180-184) rethrows inside the boundary (SS:248) → fallback, while the agenda still renders.

| # | Card | Target element | Group / Label / Value | Hidden when | Text / a11y; disclosure | Identity, order | Builder derivation |
|---|---|---|---|---|---|---|---|
| S1 | `schedule-days` SS:286 (a column `<div>`, NOT a SectionCard: no title renders) | DayCard root DC:66 (not the wrapper SS:395-400, which also holds the run-of-show list) | group: NO card title exists; the only rendered words are the day's own. label: `day.label` ("Show Day N" or the phase, `aggregateDays` `lib/crew/agendaDisplay.ts:114-135`) DC:106. value: meta (SS:352-384): "Setup {t}" (Set day, no entries), `formatScheduleWindow(sd.window)`, bare `showStart` (fragment day), "Ends {t}" (end-only), each through `guardMeta` = `resolveOptionalField` + `normalizeMeridiem` SS:333-336; meta is UNDEFINED for titled days | suppressesDates; restriction filter SS:173-179; WrappedSection fallback | text. Date renders only as `dow` "WED" (DC:83) + `dnum` "8" (DC:86) from `dayBadgeParts` (`lib/format/date.ts:54`): NO month text. "Today" pill DC:115-119 when `day.date === todayIsoInShowTimezone(show, today)` SS:250, SS:320 (clock) | `day.date`, ascending (React key SS:396) | Extract `scheduleVisibleDays(dates, restriction)` from SS:161-185 and `dayCardMeta(day, sd, dayEntries, showStartRow, dates)` from SS:333-384 into `lib/crew/agendaDisplay.ts` |
| S2 | `schedule-days` | ROS:57 via SS:414 | group/context: day label / time label / title | `dayEntries = scheduleEntriesForViewer(sd?.entries, { transportVisible })` SS:342 (load-out gated by `transportTileVisible` SS:110-117); cap ROS:151 | text; long title `<details>` ROS:82 | per day, agenda group then synthetic (ROS:148-161) | as T15 |
| S3 | `schedule-days` | ROS:57 via SS:416 | label: start time / value: "Show Start" | only when `showStartDisplayEntry(sd, day.phase)` non-null (`agendaDisplay.ts:84-96`, SS:351) AND `dayEntries.length === 0` | text | one per day | `showStartDisplayEntry` exists |
| S4 | `schedule-call-times` SS:437 | KTS:101 (SS:451) | "Crew Schedule" (SS:440) / "Set" / `anchors.set` | `hasTimesCard` SS:272, SS:436; resolveKeyTimes gates (see T9) | text | KTS order | `resolveKeyTimes` (SS:119-125) |
| S5 | same | KTS:101 | "Crew Schedule" / `s.label` / `s.time`, every visible show day with a resolvable time | when `shows.length > SHOWS_CAP (8)` (KTS:72), rows 8+ render INSIDE a closed `<details>` KTS:184-221 (in the DOM, no `data-anchor`); they are NOT dropped | text; rows past 7 are in a `<details>` | `show-${date}` | Extract `partitionShowAnchors(shows)` from KTS:119-123; export `SHOWS_CAP` |
| S6 | same | KTS:101 | "Crew Schedule" / "Strike" / `anchors.strike` | see T11 | text | | as T11 |
| S7 | none (region `none`; `section[data-testid="agenda-area"]` SS:192) | ASB:107 `<summary>` (or ASB:96 `<details>`) | group: "Agenda" h2 SS:197-199 (NOT a section-card-title slot) / null / `day.dayLabel` ASB:116; context `day.date` ASB:118, "Your day" ASB:137-142, doc label | no link with a `fileId` SS:144, SS:191; per link `link.fileId && link.extracted` SS:202; `normalizeAgendaExtraction` null, low confidence or no days ASB:69-72 | text. Day is a `<details>` open unless restriction is explicit and the day is not the viewer's (ASB:77-78, ASB:99): folded days are IN the DOM | `${link.fileId}` × `di` (React key `${dayLabel}-${di}` ASB:97) | Extract `structuredAgenda(extraction)` (the gate ASB:69-72) |
| S8 | none | ASB:152 `<li data-testid="agenda-session">` | "Agenda" / `session.time` ASB:157-159 / `session.title` ASB:163 (RAW: not URL-stripped, not sentinel-guarded), else `session.room` ASB:164-169; drift note `driftNote(session.drift)` ASB:173-180 (`lib/agenda/agendaPaint.ts:24`) | as S7; title and room both null → the `<p>` is absent, only time renders | text; inside the day `<details>` (open or folded) | `di`, `si` | inline composition ASB:161-170; extract `agendaSessionLine(session)` |
| S9 | none | ASB:185 `<li data-testid="agenda-track">` | "Agenda" / `track.label` ASB:190 / `track.title` ASB:191, `track.room` ASB:192-194 | as S7 | text; inside day `<details>` | `di`, `si`, `ti` | inline |
| S10 (decision) | none | ASB:88 `<p data-testid="agenda-schedule-label">` | doc label `agendaDisplayLabel(link.label)` SS:206 | only when more than one `fileId` link (SS:148, SS:206) | text | | `agendaDisplayLabel` exists. Needs a target or `data-search-skip` (clause 5) |

Static in Schedule needing a disposition under clause 5: "Agenda" h2 SS:197-199 (target or skip); `AgendaEmbed` "View agenda" (button, excluded); "N sessions" count ASB:129-135 (inside S7's summary if the target is the summary); EmptyState SS:316 (skip); ROS overflow stub ROS:163-171 (skip); KTS overflow summary "+N more days" / "Show fewer days" KTS:206-207 (a `<summary>`, not a button: skip) and `<dt className="sr-only">More show days</dt>` KTS:182 (sr-only text, not aria-hidden: skip).

---

## 3. Venue (`venue`)

No section-level WrappedSection; only the diagrams block is wrapped (`crew:venue:diagrams` VS:436-463). `resolveViewerContext` VS:121.

| # | Card | Target element | Group / Label / Value | Hidden when | Text / a11y; disclosure | Identity, order | Builder derivation |
|---|---|---|---|---|---|---|---|
| V1 | `venue-where` VS:336 | KVR:91 (VS:353) | "Where" (VS:339) / "Venue" / `venueDisplayName ?? venue.name ?? ""` VS:137 | `!venue`; sentinel; `hasWhereRows` VS:144 gates the list, `hasWhere` VS:297 gates the card (card can render with only the Maps link) | text | Venue, City, Address | Extract `venueWhereRows(venue)` (VS:134-141), shared with T4-T6 |
| V2 | same | KVR:91 | "Where" / "City" / `venueCity` VS:138 | falsy | text | | same |
| V3 | same | KVR:91 | "Where" / "Address" / `streetFromAddress(...)` VS:139 | sentinel/empty | text | | same |
| V4 | `venue-facilities` VS:369 | FR:95 (rows VS:237-291, rendered VS:383) | "Facilities" (VS:372) / "Loading dock" / trimmed `venue.loadingDock` VS:227-229 | sentinel | text | fixed push order: dock, parking, room, Wi-Fi rows or raw row, power | Extract `venueFactRows(data, { transportVisible })` from VS:160-291 |
| V5 | same | FR:95 | "Facilities" / "Parking" / trimmed `transportation.parking` VS:160-162 | `transportTileVisible(...)` false VS:152-159; sentinel | text | | same |
| V6 | same | FR:95 (`testId venue-room`) | "Facilities" / "Room" / GS room name VS:202-213 | `data.tileErrors.rooms` (NOT admin-gated here, VS:201) hides it for every viewer; no `kind === "gs"` room; sentinel VS:209; synthesized "General Session" suppressed VS:92, VS:211 | text | | same |
| V7 | same | FR:95 (`venue-wifi-ssid`) | "Facilities" / "Wi-Fi network" / `wifi.ssid` VS:255-260 | internet sentinel VS:166; `parseWifiValue(internet)` null (`lib/crew/wifiDisplay.ts:114`); any split field sentinel → raw row V10 (VS:183-188) | text; copy kind `network` (search-side; the page has no copy control on this row) | | same |
| V8 | same | FR:95 (`venue-wifi-password`) | "Facilities" / "Wi-Fi password" / `wifi.password` VS:261-275 | as V7, plus `wifi.password` null | text; page renders a copy control `CopyFactValue` (client) FR:127-130; copy kind `password` | | same |
| V9 | same | FR:95 (`venue-wifi-notes`) | "Facilities" / "Internet notes" / `wifi.notes` VS:276-283 | as V7, plus `wifi.notes` null | text | | same |
| V10 | same | FR:95 (no testId, key `${k}-${i}` FR:96) | "Facilities" / "Crew Wi-Fi" / raw trimmed internet VS:284-288 | split succeeded (mutually exclusive with V7-V9) | text | | same |
| V11 | same | FR:95 | "Facilities" / "Power" / trimmed `event_details.power` VS:189-190, VS:289-291 | sentinel | text | | same |
| V12 | `venue-status` VS:389 | wrapper `<div>` VS:404 (label `<p>` "COI" VS:409-411 + value span VS:412-417). Putting the target on the span alone would fail clause 3, the label is in a sibling | "Venue status" (VS:392) / "COI" / trimmed `coi_status` VS:216-217 | sentinel | text | | trivial; extract `venueStatusLines(data)` with V13 |
| V13 | same | wrapper `<div>` VS:421 (label VS:422-424, value VS:425) | "Venue status" / "Venue notes" / trimmed `venue.notes` VS:220-221 | sentinel | text | | same. Repeats as Today note "Venue" (T14) |
| V14 | `venue-diagrams` VS:435 (in `OUT_OF_SCOPE_CARDS`) | `<h2>` SEC:223 or SEC:226 (the shared `Section` atom used by tiles, NOT SectionCard, so no `section-card-title` slot) | "Diagrams" / null / "Diagrams" (DB:127); label equals group, so stored null | `hasDiagrams` VS:306-308 / `shouldHideDiagrams` DB:125 (`emptyState.ts:105`); WrappedSection fallback | text | single | constant |
| V15 | `venue-diagrams` | thumbnail `<button>` GAL:813 (accessible name `Open ${nameOf(item, i)}` GAL:877; image `alt` GAL:902) | "Diagrams" / null / real diagram name `entry.alt` | name is a fallback: DB decides it, `entry.alt && entry.alt.length > 0 ? entry.alt : \`Diagram ${ordinal}\`` DB:88 (embedded), DB:103 (linked); the Gallery receives the fallback already baked into `alt` and cannot tell (its own `nameOf` fallback GAL:406-407 is dead for crew); position `>= INITIAL_VISIBLE (12)` GAL:79, slice GAL:557-558 is taken over ALL items, unavailable ones included, before availability; WrappedSection fallback | accessible name only. `available: false` (null `snapshotPath` or disallowed MIME, DB:93, DB:107) renders a placeholder whose name is sr-only TEXT `${name}, image unavailable` GAL:1067 (not alt, not a button). A runtime load failure (client state `failedKeys`) REPLACES the button with a retry `<button>` GAL:1030 (`aria-label` "{name} could not be loaded. Tap to retry." GAL:1051); a retry in flight overlays GAL:968-972 | `item.id` = `embedded:${objectId}` DB:82 / `linked:${driveFileId}` DB:100; embedded first then linked (DB:113-116) | Extract `diagramGalleryItems(diagrams)` + `diagramRealName(entry)` from DB:77-116; export `INITIAL_VISIBLE`. Thread the id as a `GalleryItem` field (Gallery is a client component) |

Client state in V15: "Show all N diagrams" (GAL:1075-1093) mounts thumbnails 13+. Those have no entry, so they must NOT carry the attribute (INV-1 clause 2), and their `alt` must sit in a skip region (clause 5 counts every non-empty `alt`). Fallback-name thumbnails ("Diagram N") need `data-search-skip` (spec §2.5).

Static: "Open in Maps" `<a>` + `NewTabHint` sr-only "(opens in a new tab)" VS:355-363 (skip, per spec); EmptyState VS:471-475; `SectionTileError` VS:469.

---

## 4. Travel (`travel`)

Whole body inside `WrappedSection tileId="crew:travel:transport"` TR:249-870. `hideDates = suppressesDates(ctx.dateRestriction)` TR:245.

| # | Card | Target element | Group / Label / Value | Hidden when | Text / a11y; disclosure | Identity, order | Builder derivation |
|---|---|---|---|---|---|---|---|
| F1 | `travel-flight` TR:706 | segment `<div data-testid="travel-flight-seg">` TR:740 | "Your flight" (TR:709) / `dateLabel` (`formatFlightDate(seg.date)` or `seg.dateRaw`, `""` under hideDates, TR:734-738) or null / carrier · route line TR:777-785: carrier `seg.flightNo ?? seg.airline` (null under hideDates, TR:198), route `${origin} → ${dest}` TR:199-200; context dep–arr TR:786-790, chip "Today"/"Next" TR:761-768 | `showFlight` false TR:431; `showStructured` false → F3 instead (`flightRowFields` TR:173-204) | text | index into `sortSegmentsByDate(...)` (TR:419) then the hideDates filter (TR:428-430). Sort keys depend on `showYear`, which falls back to TODAY's year when the show has no dates (TR:409-417) | `flightRowFields` (TR:173) and the card prep (TR:404-436) are module-local/inline. Export `flightRowFields`; extract `flightCardRows(viewerFlightInfo, show, today, hideDates)` |
| F2 | same | `<p>` TR:792-797 | "Your flight" / "Conf" / `seg.conf` | `conf` null, or hideDates (TR:201) | text | per segment | same. Copy? The spec's single "flight confirmation" is ambiguous between F2 and F4 |
| F3 | same | `<span data-testid="travel-flight-leg">` TR:800-805 (or the segment div TR:740) | "Your flight" / null / `seg.raw` | structured segment; hideDates drops every raw row (TR:428-430) | text | per segment | same |
| F4 | same | `<p>` TR:814-819 | "Your flight" / "Confirmation" / `flightItinerary.confirmation` | hideDates or null (TR:813) | text; copy kind `confirmation` | single, after segments | `parseFlightItinerary` (`lib/crew/flightDisplay.ts:160`) |
| F5 | `travel-getting-there` TR:491 | TravelRow root `<div data-testid="travelrow">` TR:112 (TR:510-519) | "Getting there" (TR:494) / "Driver" / `driverPrimary` = first surviving of [driver_name, driver_phone, driver_email] TR:357-360; meta = the rest joined " · " TR:514-518 | `transportTileVisible` false TR:259-267 (whole block); every field sentinel TR:272-283 | text. Phone and email render as VISIBLE TEXT (primary when the name is missing, else meta), so they are indexed (spec §2.5 now says so) | fixed: driver, load out, vehicle, legs, notes | Extract `gettingThereRows(transportation, hideDates)` from TR:272-380 |
| F6 | same | TR:112 (TR:523-532) | "Getting there" / "Load out" / first of [loadout_name, loadout_phone, loadout_email] TR:363-368 | as F5 | text; phones/emails as text | | same |
| F7 | same | TR:112 (TR:536-542) | "Getting there" / "Vehicle" / first of [vehicle, license_plate, color, parking] TR:372-377; middle fields meta, LAST field `conf` line (parking when present and not alone) | as F5 | text | | same. Parking also renders in Venue Facilities (V5) |
| F8 | same | TR:112 (TR:577-591) | "Getting there" / `leg.stage` (or "" when stage is the primary, TR:558-559; the eyebrow `<p>` is `empty:hidden` TR:134) / primary: `formatIsoDate(leg.date, "weekday-short")` in `<time>` TR:582-585, else `leg.time`, else `leg.stage` TR:587; meta time + "With {names}" TR:562-575 | as F5; hideDates removes the date TR:330; each field sentinel TR:325-331; a leg with nothing left is dropped TR:341-343 | text | legs in schedule order AFTER the flatMap filter (TR:324-345); React key uses that post-filter index TR:578 | same (`gettingThereLegs`) |
| F9 | same | `<p>` TR:597-599 | "Getting there" / null / `transportation.notes` (untrimmed) TR:312-315 | sentinel; F5 gate | text | after the rows | same. Repeats as Today note "Transport" |
| F10 | `travel-hotels` TR:606 | `<p data-testid="travel-hotel-name">` TR:644 | "Hotels" (TR:609) / null / `res.hotel_name` | falsy only: NO sentinel guard (TR:643), so "TBD" renders here while Today's Tonight hides it (KVR:67) | text | reservations sorted by `ordinal`, then hideDates drops reservations with only dates (`reservationHasNonDateContent` TR:213-220, TR:387-389); React key `res.ordinal` TR:637 | Export `reservationHasNonDateContent`; extract `hotelBlocks(reservations, hideDates)` |
| F11 | same | `<p>` TR:653 | "Hotels" / null / `hotel_address`; context hotel name | sentinel TR:622-624 | text | | same |
| F12 | same | `<div>` TR:663 (dt "Check in" TR:664-666, dd `<time>` TR:667-671) | "Hotels" / "Check in" / `formatIsoDate(res.check_in, "short")` ("Oct 7") | hideDates TR:660; `check_in === null` (NOT sentinel-guarded: "TBD" renders as "TBD" because `formatIsoDate` returns unparseable input verbatim, `lib/format/date.ts:27`) | text | | same |
| F13 | same | `<div>` TR:675 | "Hotels" / "Check out" / `formatIsoDate(res.check_out, "short")` | as F12 | text | | same |
| F14 | same | KVR:91 (stayRows TR:630-633, TR:689) | "Hotels" / "Confirmation" / `confirmation_no` (raw) | sentinel TR:625-627. Renders under hideDates too | text; copy kind `confirmation` | | same |
| F15 | same | KVR:91 | "Hotels" / "Notes" / `res.notes` | sentinel TR:628 | text | | same. Repeats as Today note "Hotel: {name}" |

Static: EmptyState TR:826-842 (two copies by `suppressionEmptiedSection`), `SectionTileError` TR:700-701.

---

## 5. Crew (`crew`)

Whole body inside `WrappedSection tileId="crew:crew:roster"` CS:120-286.

| # | Card | Target element | Group / Label / Value | Hidden when | Text / a11y; disclosure | Identity, order | Builder derivation |
|---|---|---|---|---|---|---|---|
| C1 | `crew-roster` CS:167 | PR:153 (person CS:196-206). NOT the wrapper `<div data-testid="crew-person-row">` CS:195, which renders even when PersonRow returns null | "Show crew" (CS:171) / null / heading = `member.name` (passed UNGUARDED CS:198 despite the header comment CS:29-31; PR:128 only checks non-blank, so "TBD" renders); context role (sentinel-guarded CS:186-188, PR:190-192), "You" (CS:202), "Lead" (CS:203), partial label `partialAttendanceLabel(member.dateRestriction, { humanize: true })` CS:191-193 ("Partial (dates TBD)" for unknown_asterisk, `lib/crew/partialAttendance.ts:16`) | cap `CREW_INLINE_CAP = 8` CS:73, CS:128: members 9+ are NOT in the DOM (stub CS:210-220); PersonRow null when no name, no role and no actionable phone/email PR:143-145 | text; phone/email aria-label only | `member.id`, `data.crewMembers` order | Extract `rosterPersons(data, viewer)` from CS:183-207; `personRowDisplay` (see T8) |
| C2 | `crew-contacts` CS:231 | PR:153 (CS:254-262) | "Key contacts" (CS:235) / null / heading = name (sentinel-guarded CS:248-251) else `contactFallbackLabel(kind)` CS:82-91 (module-local; "Venue contact" / "In-house AV"; its "Contact" default is unreachable, `ContactKind` is two values, `lib/parser/types.ts:314`) | cap `CONTACTS_INLINE_CAP = 6` CS:79, CS:134; PersonRow null when no name and no actionable phone/email (a fallback label is not identity, PR:142) | text | `${kind}-${idx}` CS:253, `data.contacts` order | Export `contactFallbackLabel`; extract `contactPersons(data)` |
| C3 (decision) | same | `<p>` PR:225 inside C2's `<li>` (nested target), or fold into C2 | "Key contacts" / null / `contact.notes` | sentinel PR:150 | text | | `personRowDisplay`. Repeats as Today note "Contact: {name}" |

Static: overflow stubs CS:210-220, CS:266-276 (skip); EmptyState CS:148-152 (skip).

---

## 6. Gear (`gear`)

Whole body inside `WrappedSection tileId="crew:gear:scope"` GS:169-574.

| # | Card | Target element | Group / Label / Value | Hidden when | Text / a11y; disclosure | Identity, order | Builder derivation |
|---|---|---|---|---|---|---|---|
| G1 | `gear-scope-{audio,video,lighting,scenic,other}` GS:303 | KVR:91 (GS:351) | `d.heading`: "Audio", "Video", "Lighting", "Scenic", "Other gear" (GS:105-133) / `roomLabel(r)` (`lib/visibility/roomLabel.ts:26`, fallbacks "General Session", "Breakout", "Additional") / `d.value(r)` UNTRIMMED (GS:182); context "Your scope" (GS:327-331) | sentinel GS:181; a discipline with zero rows is omitted GS:184 | text | rooms in `data.rooms` order (NOT `compareRooms`); CARD order is per viewer: owned disciplines first (GS:190-193, `viewerDisciplines` GS:145-151) | Extract `gearScopeCards(rooms, viewerFlags)` from GS:97-193 (DISCIPLINES included) |
| G2 | `gear-pack-list` GS:359 | case `<li data-testid="gear-pack-list-case">` GS:375 (or its `<summary>` GS:381) | "Pack list" (GS:362) / null / `c.caseLabel \|\| \`Case ${idx + 1}\`` GS:397 (fallback invented label, same question as "Diagram N"); context "{n} item(s)" GS:408 | `packVisible` GS:197-204: `pullSheet` null/empty or `isPackListVisibleToday({ show, restriction: ctx.stageRestriction, today })` false (`lib/visibility/packList.ts:122`, CLOCK); cap `CASE_CAP = 12` declared inside the callback GS:205-206 (cases 13+ not in the DOM, stub GS:446-455) | text (summary visible) | case index in `pullSheet` order | Extract `packListCases(data, ctx, today)`; export `CASE_CAP` (CardinalityCapBoundary.test.tsx:329 mirrors it) |
| G3 | same | item `<li>` GS:425 | "Pack list" / null / `${qty} × ${item.item}${taxonomy ? \` (${cat / subCat})\` : ""}` composed INLINE GS:417-423; secondary `item.rawSnippet` GS:430-437; context case label | as G2; `cat`/`subCat` sentinel GS:417-420; `item.item` not guarded; items are NOT capped | text; ALWAYS inside a closed `<details>` GS:380 (no `open`) | `case idx` × `itemIdx` | Extract `packListItemLabel(item)` |
| G4 | `gear-tech-specs` GS:461 | KVR:91 (GS:477, `columns={2}`) | "Tech specs" (GS:464) / `EVENT_DETAILS_LABELS[key]` / `String(ed[key] ?? "").trim()` GS:233-236 | sentinel; only `CREW_TECH_SPEC_KEYS` (`lib/crew/eventDetailsSpecs.ts:36-52`) render; card gate `hasTechSpecs` GS:237 | text | key order of `CREW_TECH_SPEC_KEYS` | Extract `techSpecRows(eventDetails)` |
| G5 | `gear-room-details` GS:483 | KVR:91 (GS:512) | "Room details" (GS:486) / `f.label` (`lib/crew/roomDetailFields.ts:20-27`) / `String(r[f.key] ?? "").trim()` GS:251; context room label h3 GS:508 | sentinel; a room with no present field is dropped GS:254; cap `ROOM_DETAIL_CAP = 12` inside the callback GS:243, GS:256 (rooms 13+ not in the DOM, GS:515-519) | text | rooms sorted by `compareRooms` GS:245 (`lib/crew/resolveKeyTimes.ts:38`), `b.id` key GS:500 | Extract `roomDetailBlocks(rooms)`; export `ROOM_DETAIL_CAP` |
| G5b (decision) | same | `<h3>` GS:508 | room label | as G5 | text | | needs a target, or be inside one, or skip (clause 5) |
| G6 | `gear-keynote` GS:526 | `<p>` GS:540 | "Keynote requirements" (GS:529) / null / trimmed `keynote_requirements` GS:210-211 | sentinel | text | | trivial |
| G7 | `gear-opening-reel` GS:546 | KVR:91 (GS:562-564) | "Opening reel" (GS:549) / "Status" / `stripOpeningReelText(rawReel)` GS:217 (`lib/visibility/openingReelText.ts:63`) | `shouldHideOpeningReel` GS:217; `hasReelText` GS:225 | text | | existing helpers |

Static: `OpeningReelVideo` (client) GS:566 and its failure copy "Opening reel can't be played right now." (`components/tiles/OpeningReelVideo.tsx:34-40`, client state: skip); "Your scope" GS:327-331 (in the action slot, not a button: skip or context inside a target); pack overflow GS:446-455 and "…and N more rooms" GS:516-518 (skip); EmptyState GS:279-283; `SectionTileError` GS:277.

---

## 7. Budget (`budget`)

Rendered only when `budgetVisible = financialsVisible(ctx.viewerFlags, ctx.isAdmin)` (`app/show/[slug]/[shareToken]/_CrewShell.tsx:243, :449-451`). Whole body in `WrappedSection tileId="crew:budget:rows"` BS:71-124.

| # | Card | Target | Group / Label / Value | Hidden when | Identity | Derivation |
|---|---|---|---|---|---|---|
| B1-B4 | `budget-main` BS:106 | KVR:91 (BS:119) | "Budget" (BS:108) / "PO", "Proposal", "Invoice", "Invoice notes" (BS:88-91) / `shown(financials.x)` BS:37-39 | not entitled; `financialsFetchFailed` BS:64-65, BS:77-79 (error block instead); all blank → EmptyState BS:95-103; sentinel | fixed order | Extract `budgetRows(financials)` from BS:86-93 |

---

## 8. Client components rendered inside sections (they also render under RTL/jsdom)

| Component | Where | Notes for the parity suite |
|---|---|---|
| `RightNowHero` | TS:644 | live clock `useState(() => new Date())` RightNowHero.tsx:339; wrap in `data-search-skip` |
| `SectionChipLink` | TS:679 | `next/link` `<Link>` (SectionChipLink.tsx:48): an `<a>`, not a button, so clause 5 needs skip |
| `CardReportTrigger` | every card via `CardHeaderActions` (server) | a button (excluded). Its sibling `SourceLink` (server) is an `<a>` with visible "In sheet" text (SourceLink.tsx:104) inside every card header; clause 5 will fail on it unless `CardHeaderActions` or `SourceLink` carries `data-search-skip` |
| `CopyFactValue` | FR:129 (Wi-Fi password row) | button + `AnnounceLogRegion` (`components/admin/announceLog.tsx:124`, sr-only `role="log"`, "Copied." entries after a tap) inside the row target |
| `Gallery` + `GalleryLightbox` | DB → GAL | targets live inside a client component; `next/image` in jsdom; jsdom has no `inert` (GAL comments); `AnnounceLogRegion` "Diagram updates" entries after failures (skip) |
| `AgendaEmbed` (+ `AgendaPdfViewer`) | SS:200 | "View agenda · {badge}" buttons (excluded) |
| `OpeningReelVideo` | GS:566 | `<video>`; failure placeholder text under client state |
| Outside the sections | `CrewSections`, `CrewSubNav`, `CrewSectionTransition` | `CrewSections` mounts only the active body (CrewSections.tsx:103-104) |

---

## 9. Lines computed from `today` / the clock

`today` is CrewShell's request-scoped `await nowDate()` (`_CrewShell.tsx:251`). The builder must receive the same `Date`.

| Line | Dependency |
|---|---|
| Today mode A/B (T9-T11 region, T15-T17 presence) | `todayIsoInShowTimezone(show, today)` TS:220 (`lib/visibility/packList.ts:102`, venue timezone), `isShowDay`, `eligible`, `todays`, `agendaToday` TS:221-247 |
| T10 today's show anchor | filter on `todayIso` TS:272-274 |
| S1 "Today" pill | SS:250, SS:320 |
| F1 "Today"/"Next" chip and emphasis | `pickUpcomingIndex(flightSegments, flightTodayIso)` TR:434-436 |
| F1-F3 segment order and date labels | `showYear` falls back to today's year TR:409-417 → `parseFlightItinerary` → `sortSegmentsByDate` |
| G2/G3 pack list presence | `isPackListVisibleToday({ today })` GS:200-204 |
| `RightNowHero` | client clock (excluded) |

---

## 10. Sections or sites that render in more than one mode

- Today: Mode A / Mode B grid / right-only / left-only (§1.2). Mode A itself has two sub-modes, `RunOfShowList` vs `ShowDayTimelineList` (TS:692-699), with different caps and order.
- Schedule: `suppressesDates` unconfirmed-only branch (SS:223-234) vs normal; agenda area present or absent (SS:191); Crew Schedule card present or absent (SS:436); grid vs stack is layout only (SS:276-281).
- Venue: Wi-Fi split rows (V7-V9) vs raw "Crew Wi-Fi" (V10); split vs stacked layout (VS:480-502, layout only); diagrams render-throw fallback.
- Travel: `hideDates` changes the row SET (carrier, conf, itinerary confirmation, leg dates, raw flight rows, dates-only hotels, Next chip) and the empty-state copy; split vs stacked is layout only.
- Gear: scope card ORDER per viewer (G1); pack list on or off by clock.
- Budget: rows, fetch-error block, or EmptyState.
- DressCodeLines: `<dl>` rows (T12) vs one paragraph (T13).
- KeyTimesStrip: `layout` stack vs row (layout only); overflow `<details>` when shows > 8 (Schedule only in practice).
- RunOfShowEntry: plain title vs `<details>` for titles over 80 chars.
- Today notes: truncated vs not.
- AgendaScheduleBlock: day `<details>` open vs folded (server `open` prop, then user toggles); "Your day" marker only when it distinguishes (ASB:82-83).
- Gallery: collapsed 12 vs expanded (client); per-thumbnail available / unavailable placeholder / runtime-failed retry / retrying overlay (client).
- Every WrappedSection: normal vs `TileErrorFallback` (zero targets).

---

## 11. Spec facts checked against the code

Confirmed: `SHOWS_CAP` folds instead of dropping (KTS:184-221), now stated correctly in spec §2.2. Today Mode A strip has no card, now region `none` in spec §3. Driver/load-out phones and emails are text, now in spec §2.5.

Still worth fixing in the spec or the plan:

1. Gear has five scope disciplines, not three: Scenic and Other gear (GS:124-135, `gear-scope-scenic`, `gear-scope-other` in `CARD_REGION_MAP`). Spec §4 lists audio/video/lighting.
2. The spec §3 duplicate-id example ("two rooms whose scope both read TBD") cannot occur: TBD is sentinel-hidden (GS:181), so neither row renders. A real duplicate: two rooms with the same `roomLabel` and identical scope text.
3. `schedule-days` has no card title (SS:283-422, no SectionCard). Clause 4 requires `group` to appear in the card's text, so `group` for day cards and Schedule run-of-show rows must be a rendered string (the day label) or the spec must allow a null group there.
4. The DayCard renders no month (DC:83/86). A context of "Oct 8" fails clause 4; only `dow`, `dnum`, label and meta are rendered.
5. Two flight confirmation sites: per-segment "Conf" (TR:792-797) and itinerary "Confirmation" (TR:814-819). Spec §3 `copy` names one "flight confirmation".
6. `ShowDayTimelineList` and its module-local `AgendaSessionRow` (SDT:20) are a Today render site not named in spec §2.5's bypass list.
7. hideDates also removes ground-leg dates (TR:330), raw flight rows (TR:428-430) and the Next chip (TR:434); spec §2.2 lists only carrier, flight confirmation and hotel dates.
8. Gallery placeholders (`available: false`) carry the name as sr-only TEXT (GAL:1067), not `alt`; a fallback-named placeholder text node also needs skip.
9. Header comment CS:29-31 claims the crew name is sentinel-guarded; CS:198 passes it raw.

---

## 12. Extractions the plan needs (component and builder both call these)

| Suggested export | Module | From |
|---|---|---|
| `TRUNCATE_AT`, `SOURCE_CAP`, `aggregateNotes` (with per-source key), `truncateNote` | `TodaySection.tsx` or `lib/crew/todayNotes.ts` | TS:75-76, TS:89-154 |
| `resolveTodayMode` | `lib/crew/todayMode.ts` | TS:219-247 |
| `todayTonightRows`, `todayKeyTimeAnchors` | `TodaySection.tsx` | TS:269-275, TS:296-305 |
| `venueWhereRows(venue, { includeDock })` | `lib/venue/venueLocation.ts` or `lib/crew/venueRows.ts` | TS:320-333, VS:134-141 |
| `venueFactRows`, `venueStatusLines` | `VenueSection.tsx` / `lib/crew/venueRows.ts` | VS:160-291, VS:216-221 |
| `diagramGalleryItems`, `diagramRealName`; `INITIAL_VISIBLE` | `DiagramsBlock.tsx`; `Gallery.tsx` | DB:77-116; GAL:79 |
| `SHOWS_CAP`, `partitionShowAnchors` | `KeyTimesStrip.tsx` | KTS:72-74, KTS:119-123 |
| `runOfShowRows`, `runOfShowEntryDisplay` | `RunOfShowList.tsx` or `lib/crew/agendaDisplay.ts` | ROS:148-152, ROS:34-54 |
| `capTimelineItems`, agenda-row display | `ShowDayTimelineList.tsx` | SDT:55-69, SDT:15-18 |
| `scheduleVisibleDays`, `dayCardMeta` | `lib/crew/agendaDisplay.ts` | SS:161-185, SS:333-384 |
| `structuredAgenda`, `agendaSessionLine` | `AgendaScheduleBlock.tsx` | ASB:69-72, ASB:161-170 |
| `flightRowFields` (export), `flightCardRows`, `reservationHasNonDateContent` (export), `hotelBlocks`, `gettingThereRows` | `TravelSection.tsx` or `lib/crew/travelRows.ts` | TR:173-220, TR:272-436, TR:620-633 |
| `personRowDisplay` | `PersonRow.tsx` | PR:126-150 |
| `contactFallbackLabel` (export), `rosterPersons`, `contactPersons` | `CrewSection.tsx` | CS:82-91, CS:183-262 |
| `gearScopeCards`, `CASE_CAP`, `packListCases`, `packListItemLabel`, `techSpecRows`, `ROOM_DETAIL_CAP`, `roomDetailBlocks` | `GearSection.tsx` / `lib/crew/gearRows.ts` | GS:97-257, GS:417-423 |
| `budgetRows` | `BudgetSection.tsx` | BS:37-39, BS:86-93 |

Existing helpers the builders can call as-is: `resolveViewerContext`, `transportTileVisible`, `financialsVisible`, `suppressesDates`, `todayIsoInShowTimezone`, `aggregateDays`, `visibleShowDays`, `scheduleEntriesForViewer`, `displayableEntries`, `showStartDisplayEntry`, `formatScheduleWindow`, `resolveOptionalField`, `RUN_OF_SHOW_DISPLAY_CAP`, `TITLE_TRUNCATE_AT`, `todayShowAnchors`, `resolveKeyTimes`, `compareRooms`, `normalizeMeridiem`, `stripAgendaUrls`, `agendaSessionsForToday`, `buildShowDayTimeline`, `normalizeAgendaExtraction`, `driftNote`, `agendaDisplayLabel`, `visibleAgendaDaysForViewer`, `dayBadgeParts`, `selectPrimaryContact`, `venueDisplay`, `streetFromAddress`, `parseWifiValue`, `shouldHideGenericOptional`, `shouldHideDiagrams`, `shouldHideOpeningReel`, `stripOpeningReelText`, `isPackListVisibleToday`, `roomLabel`, `ROOM_DETAIL_FIELDS`, `CREW_TECH_SPEC_KEYS`, `EVENT_DETAILS_LABELS`, `partialAttendanceLabel`, `parseFlightItinerary`, `sortSegmentsByDate`, `pickUpcomingIndex`, `formatFlightDate`, `formatIsoDate`, `parseDressCodeLines`, `CREW_INLINE_CAP`, `CONTACTS_INLINE_CAP`.

---

## 13. Clause 5 non-target text that needs a disposition

Excluded already: buttons, `[data-slot="section-card-title"]` (SC:57-62), `aria-hidden` subtrees (SectionCard icons SC:48-54, FactRows icons, TravelRow icons TR:117-123, Avatar `components/atoms/Avatar.tsx:75`, chevrons, PersonRow glyphs, pack case numbers GS:392).

Needs `data-search-skip` or a target:

| Text | Site |
|---|---|
| "In sheet" (`<a>`) | SourceLink.tsx:104, in every card header |
| "Booked" | TS:405-411 |
| "Full agenda" (`<a>`) | TS:679-681 |
| RightNowHero | TS:644 |
| Notes / crew / contacts / pack / rooms overflow stubs | TS:605-613, CS:210-220, CS:266-276, GS:446-455, GS:516-518 |
| Run-of-show and timeline overflow stubs | ROS:163-171, SDT:82-89 |
| "+N more days", "Show fewer days", sr-only "More show days" | KTS:182, KTS:206-207 |
| "Agenda" h2, agenda doc label | SS:197-199, ASB:88-93 |
| "Your scope" | GS:327-331 |
| Room-detail room heading | GS:508 |
| "Open in Maps" + "(opens in a new tab)" | VS:355-363 |
| Unconfirmed-schedule message, every EmptyState, every SectionTileError, every TileErrorFallback | SS:226-231, SS:316, VS:471-475, TR:826-842, CS:148-152, GS:279-283, BS:97-103 |
| Gallery placeholder sr-only name, fallback "Diagram N" alt, thumbnails 13+ after "Show all", gallery and copy announce logs | GAL:1067, GAL:902, GAL:1075-1093, `announceLog.tsx:134` |
| Opening reel failure copy | `OpeningReelVideo.tsx:34-40` |

---

## 14. Summary: target sites per section

"Line kinds" = distinct indexed lines in §1-§7 (alternates counted separately; decisions excluded). "JSX sites" = distinct elements that gain the attribute.

| Section | Line kinds | JSX sites | Undecided sites |
|---|---|---|---|
| Today | 17 (T1-T17) | 8: KVR:91, PR:153, KTS:101, DCL:49, DCL:43, TS:563, ROS:57, SDT:20 | none |
| Schedule | 9 (S1-S9) | 6: DC:66, ROS:57, KTS:101, ASB:107, ASB:152, ASB:185 | S10 doc label, "Agenda" h2 |
| Venue | 15 (V1-V15) | 6: KVR:91, FR:95, VS:404, VS:421, SEC:223/226, GAL:813 | placeholder thumbnails |
| Travel | 15 (F1-F15) | 11: TR:740, TR:792, TR:800, TR:814, TR:112, TR:597, TR:644, TR:653, TR:663, TR:675, KVR:91 | which confirmation gets `copy` |
| Crew | 2 (C1-C2) | 1: PR:153 | C3 contact notes as its own target (PR:225) |
| Gear | 7 (G1-G7) | 4 + shared: KVR:91, GS:375, GS:425, GS:540 | G5b room heading GS:508; "Case N" fallback |
| Budget | 4 (B1-B4) | 1: KVR:91 | none |
| **Total** | **69** | 37 section-level uses of 30 distinct elements | |

---

## 15. Risks: where the builder and the component could drift

1. **Mode recomputation.** Today's mode (TS:219-247) decides presence of T15-T17 and the region of T9-T11. A builder that re-derives it with a near-copy (for example `todayShowAnchors` instead of the inline filter TS:272-274, or a different `eligible`) produces ids in the wrong region. Extract `resolveTodayMode` and call it from both.
2. **Render order vs data order.** `~n` duplicate suffixes follow RENDER order, so the builder must iterate exactly as the DOM does: ROS reorders synthetic entries after the agenda group (ROS:148-161); the timeline sorts by minutes (`showDayTimeline.ts`); Gear scope cards reorder by viewer (GS:190-193) while rows keep `data.rooms` order; room details sort by `compareRooms` (GS:245); Travel hotels sort by ordinal (TR:387-389) but Today uses array index 0 (TS:277); Today notes follow source order (TS:111-148).
3. **Two different hide rules for the same field.** Hotel name: truthy-only in Travel (TR:643), sentinel-hidden in Today (KVR:67). Check-in: formatted in Travel (TR:669, not sentinel-guarded), raw ISO in Today (TS:302, sentinel-guarded). Agenda titles: raw in Schedule (ASB:163), URL-stripped in Today (SDT:18). Crew names: unguarded (CS:198); contact names guarded (CS:248-251). Spec §3 says builders use "the same hiding predicate the row primitives apply". That holds for primitive rows only; bypass rows each have their own rule, and a builder that applies `shouldHideGenericOptional` uniformly drops lines that render (clause 5 failure) or keeps lines that don't (clause 1 failure).
4. **WrappedSection fallback.** Seven boundaries (TS:183, SS:239, VS:436, TR:249, CS:120, GS:169, BS:71). When the render callback throws, the DOM has zero targets for that block. The builder must run the same derivations inside an equivalent try and contribute nothing on a throw, or the index describes lines the page replaced with a fallback. Schedule's agenda is OUTSIDE its boundary and survives a day-derivation fault.
5. **Client state the server cannot see.** Gallery "Show all", runtime image failure, retry overlay (GAL:557-560, GAL:1030, GAL:968). The target must survive the button swap (put the attribute on an element that persists, or on every branch) and must not appear on thumbnails 13+. The fallback-name decision lives in DB:88/103, not in the Gallery, so the Gallery cannot decide it locally.
6. **Clock.** Pack list visibility (GS:200), flight Next/Today chip and, through `showYear`, segment order (TR:409-436), Today mode (TS:220-247), DayCard "Today" pill (SS:320). Builder and sections must get the same `today` instance, and parity fixtures must pin it.
7. **Values that are not trimmed or contain newlines.** Scope values (GS:182), transport notes (TR:312-315), Today loading dock (TS:331), hotel confirmation (TR:625-627), dress paragraph with `\n` (DCL:43), truncated notes rendered `whitespace-pre-wrap` (TS:596). Clause 3 compares whitespace-normalized `textContent`; the id hash is over normalized text. One shared normalizer for index, id and test.
8. **Sentinel meta-test coverage.** `tests/components/tiles/_metaSentinelHidingContract.test.ts` walks only `.tsx` under `components/crew/sections` and `components/crew/primitives` (`CREW_DIRS`, :101-104). Row computations moved into `lib/crew/*.ts` or `lib/search/**` leave that guard. Either keep extractions in the component modules or extend `CREW_DIRS`.
9. **Regex-read caps.** `tests/components/tiles/CardinalityCapBoundary.test.tsx:231-232` reads `const SOURCE_CAP`/`const TRUNCATE_AT` from `TodaySection.tsx` by regex, and :329 mirrors `CASE_CAP`. Exporting in place keeps the regex matching; moving them to another file breaks it (spec §2.4 already plans the import change for `CASE_CAP`, but not for `SOURCE_CAP`/`TRUNCATE_AT`).
10. **PersonRow null return.** CS:195 and CS:253 wrap PersonRow in a `<div>` that renders even when PersonRow returns null (PR:143-145), and Today's Need-something card renders an empty list in the same case (T8). The target must live inside PersonRow, and the builder must use PersonRow's own render predicate (`personRowDisplay`), not `selectPrimaryContact` alone.
11. **Clause 4 group text.** `schedule-days` has no title, and the Diagrams title lives in the `Section` atom without the `section-card-title` slot. The Diagrams `<h2>` is also used by tiles, so adding an attribute there touches a shared atom.
12. **Clause 5 on shared chrome.** "In sheet" (SourceLink.tsx:104) appears in nearly every card and is an `<a>`. Without a skip on `CardHeaderActions`/`SourceLink`, every section fails clause 5 on the first run.
13. **Cap semantics differ between twins.** `RunOfShowList` caps the agenda group only, synthetic entries exempt and moved last (ROS:148-152); `ShowDayTimelineList` caps non-synthetic items in chronological position (SDT:55-69). One shared `capRunOfShow` helper would be wrong for one of them.
14. **Today repeats.** Venue notes, hotel notes, room notes, transport notes and contact notes (T14) repeat lines from V13, F15, F9, C3, so result-time dedup (spec §5.5) depends on the normalized value matching exactly. Today note labels ("Hotel: {name}") differ from the source cards' labels ("Notes" under "Hotels"), so dedup has to key on value, not on group and label.
