# Schedule SET / Strike / Load-Out inference — design spec

**Date:** 2026-06-27
**Slug:** `schedule-strike-loadout-inference`
**Status:** draft → cross-model review
**Author:** Opus (autonomous-ship pipeline)

---

## 1. Summary / Goal

The per-day **Schedule** (run-of-show) currently renders **SHOW DAY rows only**. It omits:

- the **SET** day (even when the SET row's TIME cell carries a load-in / setup agenda), and
- any **Strike** / **Load-Out** moment (no FXAV sheet has an explicit STRIKE row in the DATES block — confirmed 0/7 live shows, §3).

This feature derives and renders three new schedule elements **from data the parser already extracts**:

1. **SET day** — its own schedule day, tokenized from the SET row's TIME/AGENDA cell (so a load-in, and a future "morning set + afternoon session", both render).
2. **Strike** entries — one per room, from each room's already-parsed `strike_time`, placed on the day matching **that room's** strike date (breakout rooms often strike on an earlier day than the General Session).
3. **Load-Out** entry — from the transportation **"Pick Up Venue"** stage (the van leaving the venue with the gear), placed on its date.

These render in **both** the admin Step-3 review breakdown and the crew Schedule / Today sections. No new parsing is required — all three sources are already extracted (`rooms[].strike_time`, `transportation.schedule[]`, the DATES SET row). The change is a **derivation + render** layered onto the existing run-of-show JSONB, plus one data-quality warning.

### Non-goals (out of scope)

- No change to the coarse **`schedule_phases`** work-phase map (`deriveSchedulePhases`, `lib/parser/index.ts:282-317`) which independently marks the last show day `Strike` and travel-out `Load Out` at **day granularity** for the pack-list. This feature adds **time-level / per-room** detail to the *schedule view* and is complementary; the two are intentionally separate surfaces (§11 Disagreement preempt D1).
- No change to the existing **"Daily call times"** `KeyTimesStrip` (`resolveKeyTimes`, `lib/crew/resolveKeyTimes.ts`), which already surfaces a single GS-room `strike` summary anchor and a `set` anchor. Summary-strip ↔ per-day-detail overlap is intentional (§9.5, §11 D2).
- No new DB columns (run-of-show is JSONB; `rooms.strike_time` already persisted). No advisory-lock surface. No RPC. No migration.
- No `buildRightNowContext` / Right-Now change.

---

## 2. Current behavior (live-code citations)

| Concern | Where | Current behavior |
|---|---|---|
| Run-of-show parser | `lib/parser/blocks/scheduleTimes.ts:122` `parseScheduleTimes` | Reads SHOW DAY TIME cells only; `readShowDayTimeCells` filters `/^SHOW\s+DAY\b/i` (`scheduleTimes.ts:107`). |
| Tokenizer | `scheduleTimes.ts:21` `CLOCK_RE` + `:55` `tokenize` | Permissive: bare-hour `4pm`, `5;30pm`, AM/PM casing. |
| DATES SET row | `lib/parser/blocks/dates.ts:218-224` (`case "set"`) | Extracts only `loadIn`/`setupTime` clocks (`extractClockTimes`, `dates.ts:267`); the SET row's full agenda + note text are dropped. |
| Room strike time | `lib/parser/blocks/rooms.ts:594,778` (`label === "strike time"`) → `RoomRow.strike_time` (`types.ts:154`) | Parsed + persisted; raw free-text (e.g. `"10/9 @ 4:30pm"`, `"5/15 - 1PM"`, `"TBD"`). |
| Transport "Pick Up Venue" | `lib/parser/blocks/transport.ts:99` (`V2_SCHEDULE_LABELS`) + `:75` (`/pick\s*up/i` stage) → `TransportScheduleEntry` (`types.ts:171`) | Parsed into `transportation.schedule[]` with `date` (ISO) + `time` (free text). Already rendered in the crew **Travel** section as a "leg". |
| Parser orchestration | `lib/parser/index.ts:379,382,387,388` | `parseDates` → `parseScheduleTimes` → `parseRooms` → `parseTransportation`. |
| Run-of-show merge | `lib/parser/index.ts:428-447` builds `mergedRunOfShow` from `datesDays` + grid days; returned at `:493`. | The single carrier — both surfaces consume it. |
| Persistence | `shows_internal.run_of_show` JSONB; decoded by `lib/data/decodeRunOfShow.ts`; read in `lib/data/getShowForViewer.ts`. | `AgendaEntry` optional fields allowlisted at `decodeRunOfShow.ts:7` (`["finish","trt","room","av"]`). |
| Data model | `AgendaEntry` (`types.ts:335-342`) = `{start, finish?, trt?, title, room?, av?}`; `ScheduleDay` (`types.ts:344-348`); `RunOfShow` (`types.ts:349`). | — |
| Crew render | `components/crew/sections/ScheduleSection.tsx` | Builds `aggregateDays` (`:165`, phases Travel In/Set/Show/Travel Out from `lib/crew/agendaDisplay.ts:66`); per visible day renders `RunOfShowList` when `displayableEntries(sd?.entries).length > 0` (`:286`). SET-day meta = `"Setup {setupTime}"` (`:258`). |
| Crew Today | `components/crew/sections/TodaySection.tsx:39,197` | Same `RunOfShowList`; gated to today iff `aggregateDays(...).some(d.date===todayIso)`. |
| Crew run-of-show list | `components/crew/primitives/RunOfShowList.tsx:97` | Renders `displayableEntries`, capped at `RUN_OF_SHOW_DISPLAY_CAP = 20` (`agendaDisplay.ts:16`). |
| Daily call times | `lib/crew/resolveKeyTimes.ts:114-117` | Surfaces a single (GS-preferred) room `strike` anchor + a `set` anchor into `KeyTimesStrip`. Helpers reused here: `isAbsentTime` (`:21`), `formatMD` (`:39`). |
| Admin render | `components/admin/wizard/Step3SheetCard.tsx:232` `ScheduleBreakdown` | Iterates `Object.keys(ros)` (= run-of-show keys), caps days at `SCHEDULE_DAYS_CAP = 14` (`:57`); each `ScheduleDayRow` (`:182`) renders `entries.slice(0, SCHEDULE_ENTRIES_CAP)` (`SCHEDULE_ENTRIES_CAP = 6`, `:58`) with a "Show all M times" toggle; day header = `humanizeDate(iso)` (`:198`). Day grid is `grid-cols-[auto_1fr] items-baseline` (documented Tailwind-v4 invariant, `:169-176`). |

**Net:** the SET day, strike, and load-out never enter `run_of_show`, so neither surface shows them in the per-day schedule. (The crew "Daily call times" strip shows a single GS strike + set summary; admin shows nothing.)

---

## 3. Cross-show grounding (live MCP survey, 2026-06-27)

All 7 distinct live shows in `fxav-test-shows` were surveyed via the gsheets MCP. **0/7 have an explicit STRIKE or LOAD OUT *row label* in the DATES block** ("Strike"/"Load Out" appear only inside CREW role text). Signals available for inference:

| Show (template) | Pick Up Venue (load-out) | GS room Strike Time | Last show day | Notes |
|---|---|---|---|---|
| East Coast (v1) | — (no transport schedule) | `5/15 - 1PM` | 5/15 | v1 Driver block only; travel-out value literally `"SAME DAY AS STRIKE"`. |
| Consultants '25 | `10/9 @ 8pm` | `10/9 @ 4:30pm` | 10/9 | Lunch-room strike `10/8` (earlier day). SET = combined `TRAVEL / SET`. |
| RPAS '26 (v4) | `3/25/26 @ 3:30 PM` | `3/25 @ 12:30pm` | 3/25 | Breakout strikes `3/24` (earlier day). |
| Redefining FI '25 | `5/14 @ 6:00 PM` | `5/14 @ 5:00 PM` | 5/14 | All 3 rooms strike `5/14 @ 5:00 PM` (identical → collapse). |
| Fixed Income '25 | `10/21/25 @ 7:00 PM` | `10/21 @ 4:15 PM` | 10/21 | — |
| FinTech '26 (v4) | `5/6/26 @ 6:00 PM` | `5/5 @ 2:50 PM` ⚠️ | 5/6 | GS strike date is a likely **typo** (the 2:50 PM time matches the 5/6 conclude). Per RD5 it renders **faithfully on 5/5**; 5/5 **is** SHOW DAY 2 (a scheduled day) → shows on admin **and** crew, **no warning**. Load-Out renders on 5/6. |
| RIA Central '25 (v4) | `6/26 @ 2:00 PM` | `6/26 @ 12:15pm` | 6/26 | Travel-out value `"TRAVEL SAME DAY AS STRIKE"`. |

**Derived facts that drive the design:**

- **Pick Up Venue present 6/7** (absent only on v1, which has no transport schedule). It is the load-out/venue-departure anchor.
- **GS room Strike Time present 7/7** (incl. v1). Breakout strikes can fall on an **earlier** day than GS (RPAS, Consultants, RIA) — so strikes must be placed by **each room's own date**, not all on the last day.
- **Strike/load-out is same-day as the last show day** in 6/7 (and on the last show day for v1) — so synthetic entries land on existing schedule days in every surveyed case (relevant to the §10 mode boundary).
- **Identical (date,time) rooms collapse** (Redefining: 3 rooms @ 5/14 5:00 PM).

Fixtures (committed mirrors, may drift from live — verify in plan): `fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md`, `fixtures/shows/raw/2025-10-fixed-income-trading-summit.md`, and siblings. Fixture filenames + block presence are verified per-fixture in the plan's pre-draft pass.

---

## 4. Resolved decisions (user-confirmed)

| # | Decision | Value |
|---|---|---|
| RD1 | Bookends to add | **SET + Strike + Load-Out.** SET day rendered as a full schedule day (multi-entry capable). |
| RD2 | Event taxonomy | **Two distinct kinds:** per-room `strike_time` → `"Strike"`; transport Pick Up Venue → `"Load Out"`. |
| RD3 | Strike labeling | **Per-room, collapse identical** (one entry per (date,time) group): single room → `"Strike — <Room>"`; group = **every strike-intent room** (all parseable, same date+time) → `"Strike — all rooms"`; **partial** group (some rooms; others strike at another time/day **or have a TBD/unknown strike**) → name them `"Strike — <A>, <B>"` (≤3) else `"Strike — N rooms"` — never the unsafe "all rooms" (teardown-safety, R3+R4). |
| RD4 | Surfaces | **Admin Step-3 review AND crew Schedule/Today.** |
| RD5 | Data quality | **Faithful + flag suspicious:** render strikes on the exact date the sheet lists (no typo auto-correction); skip entries with no parseable date / `TBD`. A strike whose date **is** one of the show's scheduled days (travel/set/show/travel-out) renders on **both** admin and crew; a strike on any **other** date is **admin-review-only** on crew and emits `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` (§8) so the operator relocates it. (FinTech's `5/5` is SHOW DAY 2 → renders on both surfaces, no warning.) |
| RD6 | Architecture | **Derive in the parser merge step** (single source of truth → both surfaces); extend the JSONB decoder; existing shows re-stage on next sync (normal here, see `feedback_parser_rename_restages_via_mi7b`). |

---

## 5. Data model changes

### 5.1 `AgendaEntry.kind`

Add one optional field to `AgendaEntry` (`lib/parser/types.ts:335-342`):

```ts
export type AgendaEntryKind = "agenda" | "strike" | "loadout";
export type AgendaEntry = {
  start: string;
  finish?: string;
  trt?: string;
  title: string;
  room?: string;
  av?: string;
  kind?: AgendaEntryKind; // absent ⇒ "agenda" (real run-of-show item)
};
```

- **Storage:** rides in the existing `shows_internal.run_of_show` JSONB. No migration.
- **Write path:** set by `parseScheduleTimes` (SET-day entries keep `kind` absent = agenda) and by `deriveScheduleBookends` (`"strike"` / `"loadout"`). The producers only ever write the 3 enum values (or omit), so the runtime always matches the `AgendaEntryKind` type at the write boundary.
- **Read path — `kind` is VALIDATED against the enum, not blindly string-copied (closes R4 medium).** `kind` is **NOT** added to the generic `OPTIONAL_FIELDS` list (`decodeRunOfShow.ts:7`), because that list does a blind "any string passes" copy (`:40-50`) which would let `"banana"` through and break the `kind?: AgendaEntryKind` type contract. Instead `decodeEntries` (`:13`) handles `kind` explicitly with an allow-list: `if (entry.kind === "strike" || entry.kind === "loadout") decoded.kind = entry.kind;` — any other value (absent, `"agenda"`, a non-string, or an unknown string like `"banana"`) yields **no `kind` field** on the decoded entry (≡ agenda). So the decoded runtime value is **always** a valid `AgendaEntryKind` or absent — the type is honest, no casts needed, and corrupt data coerces to agenda. A non-enum `kind` does **not** mark the blob corrupt (consistent with the lenient `room`/`av` field philosophy — drop the bad field, keep the entry).
- **Renderers** therefore only ever see `kind ∈ {undefined, "strike", "loadout"}`; `undefined` ⇒ agenda styling/cap behavior. No renderer-side "unknown kind" branch is needed.
- **Effect on output:** drives the §9.3 visual treatment + the §9.4 cap-exemption partition + the §9.6 load-out gate. (Flag lifecycle table, §12.)

### 5.2 No `ScheduleDay` shape change

`ScheduleDay` (`types.ts:344-348`) is unchanged. The SET day is an ordinary `ScheduleDay` keyed by `dates.set`; it is recognized as the SET day **by ISO match** (crew already does this via `aggregateDays` phase `"Set"`), not by a new field.

---

## 6. Derivation — SET day (in `parseScheduleTimes`)

Extend `readShowDayTimeCells` (`scheduleTimes.ts:87`) to additionally emit the **SET row**:

- Match a DATES data row whose label (col1, `clean`+`trim`) matches `/^SET\b/i` **or** `/TRAVEL\s*\/\s*SET/i` (the combined row — Consultants; `classifyLabel`, `dates.ts:35`). Note the trailing-space `"SET "` case is handled by `trim`.
- Require the 5-col shape (`row.length >= 5`) — same gate as show days (`scheduleTimes.ts:104`). v1 2-col SET rows have no TIME column → no SET ScheduleDay (faithful; v1 has no SET-time agenda).
- Key by `normalizeDate(col3)` (equals `dates.set`). Tokenize col4 with the **same** `tokenize` + titled-list logic show days use. Result: a `ScheduleDay` with entries for each clock found ("11:00 AM Load In"; "9:00PM Load In" + "10:00PM Setup").
- Entries keep `kind` absent (they are real agenda items).

**Guards (SET row):**
- Empty / bare-sentinel TIME cell → no SET ScheduleDay.
- **Contentful-but-no-clock SET cell → no SET ScheduleDay and NO warning (closes R6 medium).** The SET-row tokenization is **best-effort and warning-free**: it emits entries only when the tokenizer finds clocks; otherwise it produces nothing. It must **NOT** reuse `SCHEDULE_TIME_UNPARSED` — that warning's message hard-codes `"SHOW DAY … TIME cell"` (`agendaWarnings.ts`) and its source-cell resolver (`extractShowDayTimeAnchors`, `lib/drive/showDayTimeAnchors.ts`) only scans SHOW DAY rows, so reusing it would surface the wrong subject with no working deep link. **No regression:** today the SET row produces no schedule entries at all and no warning; the existing `dates.loadIn`/`setupTime` extraction (`dates.ts:218-224`) is untouched, so an unparsed SET cell degrades to exactly today's behavior. (The SET tokenizer therefore calls a no-warning variant, or passes a flag suppressing the `scheduleTimeUnparsed` push for SET rows.)
- The merge at `index.ts:432` (`{ ...datesDays }`) carries the SET ScheduleDay into `mergedRunOfShow` for free.

**Mode boundary (SET-day meta):** in `ScheduleSection.tsx`, the `isSetDay` branch currently always sets `meta = "Setup {setupTime}"` (`:253-259`). Change: set that meta **only when the SET day has no displayable run-of-show entries** (`displayableEntries(sd?.entries).length === 0`). When entries exist, they carry the times (incl. a "Setup" entry parsed from the same cell) and the standalone `"Setup …"` meta is suppressed to avoid double-printing. (No change to admin — admin has no per-day meta.)

---

## 7. Derivation — Strike + Load-Out (`deriveScheduleBookends`)

New pure function in `lib/parser/blocks/scheduleBookends.ts` with the **explicit** signature:

```ts
function deriveScheduleBookends(
  runOfShow: Record<string, ScheduleDay> | undefined,
  dates: ShowRow["dates"],
  transportation: TransportationRow | null,
  rooms: RoomRow[],
  contextYear: string | null,   // = inferShowYear(markdown), resolved by the caller
): { runOfShow: Record<string, ScheduleDay> | undefined; warnings: ParseWarning[] }
```

`contextYear` is a **required parameter** (not derived inside the function) — the year context that yearless room strike dates (e.g. `"10/9 @ 4:30pm"`) need to resolve. Called in `index.ts` **after** the existing merge (after `:447`, before `:480`): the caller computes `const bookendYear = inferShowYear(markdown)` (`markdown` is in scope in `parseSheet`, `index.ts:321`) and passes `mergedRunOfShow` (or `undefined`), `dates`, `transportation`, `rooms`, `bookendYear`. Its warnings are pushed to `agg.warnings` exactly as `scheduleTimesResult.warnings` is (`index.ts:383`). The returned `runOfShow` replaces `mergedRunOfShow` before the `index.ts:493` return.

### 7.1 Algorithm

```
input: rosIn (Record<iso, ScheduleDay> | undefined), dates, transportation, rooms, contextYear (string|null)
ros = deepClone(rosIn ?? {})   // new object; per-day entries arrays also copied — never mutate the caller's object
warnings = []

// the show's scheduled-day set — EXACTLY the dates crew can render a card for
// (mirrors aggregateDays: travelIn/set/showDays/travelOut). Used for the
// off-schedule warning so "we warn" ⟺ "crew can't show it" (RD5 + §10).
scheduleDateSet = new Set([dates.travelIn, dates.set, ...dates.showDays, dates.travelOut].filter(Boolean))

// ── STRIKE (per-room) ──────────────────────────────────────────────
// STRIKE-INTENT count = rooms whose strike_time is NON-EMPTY (presence != null),
// i.e. the operator entered *something* — a parseable time OR a TBD/unparseable one.
// "all rooms" is permitted ONLY when one (date,time) group contains EXACTLY this many
// rooms — i.e. every strike-intent room is parseable AND coincides. A room with a TBD
// or unparseable strike is counted here but produces NO group entry, so it BLOCKS
// "all rooms" (we know it strikes but not when → must not imply it strikes now). This
// closes R4 high (TBD room) on top of R3 high (partial-time group). (presence()/
// isAbsentTime per §7.1 shared-helpers note.)
strikeIntentCount = count(room in rooms where presence(room.strike_time) != null)

// A synthetic entry requires BOTH a parseable date AND a non-empty time. A
// date-with-sentinel-time ("5/14 @ TBD") or a bare date ("5/14") yields time:null
// → NO entry (unknown timing must never become an actionable milestone — R5 high).
// Such a room is still counted in strikeIntentCount (above), so it BLOCKS "all rooms".
groups = Map<`${iso}|${time}`, { iso, time, rooms: string[] }>
for room of rooms:
  {iso, time} = parseRoomTimeCell(room.strike_time, contextYear)   // §7.2
  if iso == null OR time == null: continue   // no parseable date OR no real time → no entry (still counted in strikeIntentCount)
  name = presence(room.name) ?? roomKindFallback(room.kind)   // roomKindFallback: local map gs→"General Session", breakout→"Breakout", additional→"Room"
  key = `${iso}|${time}`                      // time is now guaranteed non-null
  groups[key] ||= {iso, time, rooms: [] }
  if name not in groups[key].rooms: groups[key].rooms.push(name)   // dedupe by name within a group
for g of groups (sorted by iso asc, then time asc, then rooms join):
  // "all rooms" is SAFE only when this single (date,time) group == every strike-INTENT
  // room (all parseable WITH a time, all coincident). Any partial group — fewer rooms, OR a
  // sibling room with a TBD/unknown/timeless strike (counted in strikeIntentCount but not in
  // any group) — names/counts instead. Prevents a premature-teardown read (R3+R4+R5 high).
  if g.rooms.length == 1:                                 title = `Strike — ${g.rooms[0]}`
  elif g.rooms.length == strikeIntentCount:               title = "Strike — all rooms"   // every strike-intent room, parseable+timed, same date+time
  elif g.rooms.length <= STRIKE_ROOM_NAME_CAP:            title = `Strike — ${g.rooms.sorted().join(", ")}`   // partial: name them
  else:                                                   title = `Strike — ${g.rooms.length} rooms`           // partial, too many to list
  appendEntry(ros, g.iso, { start: g.time, title, kind: "strike" })   // g.time non-null; ALWAYS appended (admin shows it)
  if !scheduleDateSet.has(g.iso):
    warnings.push(strikeDateOffSchedule(g.iso))     // §8 — fires ⟺ crew can't render this date

// ── LOAD OUT (transport Pick Up Venue) ─────────────────────────────
// The parser is viewer-agnostic: it emits the loadout entry whenever Pick Up Venue
// has a date AND a real (non-sentinel) time. Crew per-viewer transport gating happens
// at RENDER (§9.6), keyed on kind === "loadout". A timeless/TBD Pick Up Venue → no entry
// (same require-a-time rule as strikes; the Travel section still shows the leg separately).
puv = transportation?.schedule.find(s => /pick\s*up\s*venue/i.test(s.stage.trim()))
puvClock = puv ? extractFirstClock(puv.time ?? "") : null    // real clock only (rejects "AM"/"TBD"/non-clock)
if puv && puv.date != null && puvClock != null:    // transport parser already normalized date → ISO
  appendEntry(ros, puv.date, { start: puvClock, title: "Load Out", kind: "loadout" })

return { runOfShow: Object.keys(ros).length ? ros : rosIn, warnings }
```

- `appendEntry(ros, iso, entry)`: if `ros[iso]` absent, create `{ entries: [entry], showStart: null, window: null }`; else **append** to `ros[iso].entries` (synthetic entries go **after** existing agenda entries — they are end-of-day events; no global re-sort, preserving sheet order for agenda). Strike entries are emitted before the load-out for the same day (group iteration runs before the load-out step), and multiple strikes sort by time ascending.
- **`STRIKE_ROOM_NAME_CAP`** = 3 (a local constant in `scheduleBookends.ts`): a partial-strike group names its rooms when ≤ 3, else collapses to `"Strike — N rooms"`. `g.rooms` dedupes by room name within the group (the reconcile pass already merges same-name rooms, `rooms.ts:37`, so duplicates are rare). **`"all rooms"` is emitted ONLY when `g.rooms.length === strikeIntentCount`** — i.e. a single (date,time) group contains every room that has a non-empty `strike_time` AND all of them parsed. If any strike-intent room is TBD/unparseable (counted in `strikeIntentCount` but absent from every group) or strikes at a different time/day, no group reaches `strikeIntentCount` → never "all rooms" (R3 + R4 high; teardown-safety). When `strikeIntentCount === 1`, the lone parseable room hits the `length == 1` branch (named), never "all rooms".
- `contextYear` is the **parameter** passed by the caller (`= inferShowYear(markdown)`, `_helpers.ts:123`, in scope in `parseSheet`). The function does NOT recompute it. When `contextYear` is `null` and a strike cell is yearless, that strike is **skipped** (no parseable date — §7.2). Room strike dates are often yearless (`"10/9 @ 4:30pm"`), so the parameter is load-bearing; §14 includes a yearless-strike integration test proving entries are NOT dropped when `contextYear` is supplied.
- **Shared helpers:** `presence` (`_helpers.ts:71`) is used for `strikeIntentCount` (any non-empty `strike_time` = intent). `extractFirstClock` (the new shared export from `scheduleTimes.ts`, §7.2) is used for BOTH strike-time and load-out-time validation — a value qualifies only if it contains a real clock, so `presence`-but-non-clock strings (`"TBD"`, `"AM"`, `"morning"`) count as **intent** (block "all rooms") but never become an entry time. `scheduleBookends` does **not** depend on `resolveKeyTimes.isAbsentTime` (clock-positive matching subsumes sentinel-negative matching here).
- The returned object is a **new** object; `rosIn` is never mutated (guard against the persisted-blob being aliased). When `rosIn` was `undefined` and no synthetic entries were added, return `rosIn` (preserve the "no run-of-show" sentinel so `index.ts:493` still omits the key).

### 7.2 `parseRoomTimeCell(raw, contextYear)` → `{date: iso|null, time: string|null}`

Room `strike_time` / `set_time` / `show_time` are free-text with **two** separators observed in the corpus: `"M/D @ TIME"` (most), `"M/D - TIME"` (v1 East Coast `"5/15 - 1PM"`), and date-only / `M/D/YY`. `transport.ts:parseV2DateTime` (`:603`) handles only `"@"`, so a dedicated helper is needed:

- If `presence(raw) == null` (null / empty / whitespace) → `{date:null, time:null}`.
- Extract leading date: `/^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/`. If no leading `M/D` → `{date:null, time:null}`. This is what makes a **bare `"TBD"` / `"N/A"`** (no leading date) return `date:null` → the caller's `if iso == null: continue` skips it (no separate `isAbsentTime(raw)` pre-guard needed, and the room still counts toward `strikeIntentCount`).
- Resolve year: explicit in the cell → use it; else a 4-digit year elsewhere in the cell; else `contextYear`; else `null` (→ `date:null`). Route through `normalizeDate` (rejects calendar-invalid dates, mirrors `dates.ts:280-292`).
- Extract time: from the substring after the date, extract the **first valid clock token** using the **same permissive clock semantics as the SHOW-DAY tokenizer** (`scheduleTimes.ts:21` `CLOCK_RE` + its "must have minutes OR an AM/PM suffix" filter, `:60-61`). A token qualifies as a clock only if it has `:MM` **or** an `AM/PM` suffix — so `"4:30pm"`, `"1PM"`, `"6:00 PM"`, `"8 PM"` qualify, but `"AM"` (no digits), `"morning"`, `"TBD"`, and a bare `"8"` (no minutes, no AM/PM) do **not**. No clock found → `time: null` (→ no entry, §7.1). The matched clock is preserved verbatim (we don't reformat crew-facing times). **Shared helper:** the plan exports a single `extractFirstClock(text): string | null` from `scheduleTimes.ts` (or `_helpers.ts`) reused by both the SHOW-DAY tokenizer and `parseRoomTimeCell`, pinned by a test, so the two clock definitions can't drift. This also closes the "non-clock tail" hole (R6 high) for both strike and load-out.

**Guard cases:** bare `"TBD"`/`"N/A"`/`""` → `{date:null,time:null}`. `"5/15 - 1PM"` → `{date:"<yr>-05-15", time:"1PM"}`. `"10/9 @ 4:30pm"` → `{date, time:"4:30pm"}`. `"3/25/26 @ 12:30pm"` → explicit year. A bare date `"5/14"` **or** a date-with-sentinel-time `"5/14 @ TBD"` → `{date:"<yr>-05-14", time:null}`. **The derivation (§7.1) requires BOTH a date and a non-null time to emit an entry** — so every `time:null` result above produces **no** synthetic entry (and no empty-start row), while the room still counts toward `strikeIntentCount` (computed from `presence(strike_time)`, independent of this parse), blocking "all rooms". Net: no synthetic strike/load-out entry is ever timeless (closes R5 high).

---

## 8. Data-quality warning — `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE`

Modeled **exactly** on the sibling `SCHEDULE_TIME_UNPARSED` (defined in `lib/parser/blocks/agendaWarnings.ts`; the established 3-part §12.4 lockstep + family mapping). New helper in `agendaWarnings.ts`:

```ts
export function strikeDateOffSchedule(iso: string): ParseWarning {
  return {
    severity: "warn",
    code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
    message: `A room strike date (${iso}) is not one of the show's scheduled days; it shows in the admin review but not on crew schedules until corrected`,
    blockRef: { kind: "rooms", iso },
  };
}
```

**Trigger (refined from R1's "outside the show window" to resolve the R2 crew/admin coherence finding):** the warning fires when the strike's date is **not in `scheduleDateSet`** — i.e. not one of `travelIn` / `set` / `showDays[]` / `travelOut` (the same set `aggregateDays` builds, `agendaDisplay.ts:66`). This is **exactly** the set of dates the crew schedule can render a card for (§10), so the warning fires **if and only if** the strike would be admin-only / crew-invisible. This both (a) flags genuinely suspicious dates (a strike on no real show day — the original RD5 intent) and (b) makes the warning the operator's actionable signal that the entry won't reach crew until the date is corrected. (Out-of-`[travelIn..travelOut]` dates are a strict subset of off-schedule dates, so this is a faithful superset of R1's intent, not a narrowing.)

- **Prefix `SCHEDULE`** → auto-maps to the `crew-schedule` family in `app/help/errors/_families.ts` (its `prefixes` include `SCHEDULE`). No families edit; `tests/help/errors-grouping.test.tsx` orphan check stays green.
- **§12.4 catalog lockstep** (one commit, enforced by `x1-catalog-parity` = `tests/messages/codes.test.ts`):
  1. master spec §12.4 prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (add a row);
  2. `pnpm gen:spec-codes` → regenerate `lib/messages/__generated__/spec-codes.ts`;
  3. matching row in `lib/messages/catalog.ts` (with `helpHref: "/help/errors#..."`).
  4. `pnpm gen:internal-code-enums` (the code literal enters the internal-warning enum, same as `SCHEDULE_TIME_UNPARSED`).
- **Severity `warn`, and it MUST reach the operator-actionable surface (closes R7 high).** `operatorActionableWarnings` (`dataGaps.ts:151`) drops any code not in `OPERATOR_ACTIONABLE_ANCHORED` (`:122`) before `PerShowActionableWarnings` (`components/admin/PerShowActionableWarnings.tsx`) renders it — so a warning that isn't in that set is **effectively silent**, defeating its entire purpose. Therefore:
  1. **Add `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` to `OPERATOR_ACTIONABLE_ANCHORED`** (`dataGaps.ts:122`). That set IS `CELL_ANCHORED_CODES` (the same object imported by `lib/drive/showDayTimeAnchors.ts`), so render-gate and anchor-population-gate stay in lockstep automatically (the `OPERATOR_ACTIONABLE_ANCHORED ≡ CELL_ANCHORED_CODES` structural pin holds for free).
  2. **Region anchor:** add a dispatch branch to `attachSourceCellAnchors` (`showDayTimeAnchors.ts:119`) resolving this code to `region[blockRef.kind]` — `blockRef.kind === "rooms"`, and `"rooms"` **is** a valid `RegionId` (`buildSheetDeepLink.ts:27`, `REGION_ANCHOR_SPEC.rooms` at `:76`) — exactly the `FIELD_UNREADABLE`-style region resolution (`showDayTimeAnchors.ts:137-141`). The operator gets an "Open in Sheet ↗" link to the ROOMS region.
  3. `PerShowActionableWarnings` renders the catalog **title + helpfulContext** via `messageFor` (`lib/messages/lookup.ts`) — **never the raw code** (invariant 5). The §12.4 row (above) supplies that copy.
- It is **not** added to `DATA_GAP_CODES` (`summarizeDataGaps` hardcodes only the 3 DQ classes, `dataGaps.ts:65-67`, so adding it there would not count anyway) — the operator-actionable path is the correct home.

**Faithful-render contract (RD5), made admin/crew-explicit (closes R2 high finding):**
- The synthetic strike entry is **always appended** to `run_of_show` on its listed date — so the **admin Step-3 review always shows it** (admin iterates `run_of_show` keys, §10).
- **Crew** renders it **iff** its date is a scheduled day (`scheduleDateSet`) — the normal case (all 7 surveyed strikes are on show days). A strike on an off-schedule date is **admin-only on crew** and emits this warning; the operator corrects the date so it lands on a real day, after which crew shows it. There is **no** silent crew omission of a warned entry that the operator wasn't told about — the warning *is* the signal, and its message names the consequence ("…not on crew schedules until corrected").
- FinTech's GS strike `5/5` **is** SHOW DAY 2 → it is in `scheduleDateSet` → renders on **both admin and crew on 5/5**, **no warning** (the 2:50 PM/5-6 typo is rendered faithfully as entered, not auto-corrected — D3).
- Load-Out (transport): a Pick Up Venue date off `scheduleDateSet` is **admin-only on crew, silently** (no warning) — transport dates are authoritative and rarely wrong, and RD5 scoped the warning to *strike* dates (D4). Documented in §10.

---

## 9. Rendering

### 9.1 Crew Schedule (`ScheduleSection.tsx`)

No structural change to day iteration. Synthetic entries on `aggregateDays` dates light up via the existing per-day gate (`:286-287`), now routed through `scheduleEntriesForViewer` (§9.6). Three edits:
- SET-day meta suppression when entries exist (§6).
- Compute `transportVisible` (§9.6) and replace the per-day `displayableEntries(sd?.entries)` calls (mode gate `:286` + the `RunOfShowList entries=` `:287`) with `scheduleEntriesForViewer(sd?.entries, { transportVisible })` so a gated-out load-out neither opens a container nor renders.
- No change to the `dateRestriction` privacy logic — strike/agenda entries inherit their day's visibility (a viewer restricted away from a day never sees its entries); load-out additionally honors the transport gate (§9.6).

### 9.2 Crew Today (`TodaySection.tsx`) & admin Step-3 (`Step3SheetCard.tsx`)

- **Today:** synthetic entries on today's card render via the same `RunOfShowList` (gated `isShowDay`, `:197`), routed through `scheduleEntriesForViewer(todays, { transportVisible })` — `transportVisible` is **already computed** at `TodaySection.tsx:281`, so the load-out gate (§9.6) reuses it (no new gate plumbing on Today).
- **Admin Step-3 `ScheduleBreakdown`:** iterates `Object.keys(ros)`; the SET day key + synthetic entries appear automatically, each under its `humanizeDate` header (e.g. "May 3"). **Day-cap exemption (closes R7 medium):** `ScheduleBreakdown` caps at `SCHEDULE_DAYS_CAP = 14` (`Step3SheetCard.tsx:234`) with a "…and N more days" note. A malformed/long sheet could push an **off-schedule synthetic day past the cap**, hiding the exact admin-only entry the operator must inspect. Fix: a day whose entries contain a `kind:"strike"`/`"loadout"` entry is **always rendered** — `shownDays` = (first `SCHEDULE_DAYS_CAP` days) ∪ (every synthetic-bearing day); the "…and N more days" note counts only the dropped **non-synthetic** days. Real shows have ≤6 days so the exemption is a malformed-sheet safety net, not a common path.

### 9.3 Visual treatment of `kind`

`RunOfShowEntry` (`RunOfShowList.tsx:26`) and the admin `ScheduleDayRow` (`Step3SheetCard.tsx:182`) render strike/load-out entries with a **subtle distinct marker** so they read as production milestones, not sessions:

- A small uppercase eyebrow badge before/with the title (reuse the existing `av`-badge styling pattern, `RunOfShowList.tsx:73-78`: `rounded-sm bg-surface-sunken px-1.5 py-0.5 font-medium uppercase tracking-eyebrow`) reading `STRIKE` / `LOAD OUT`, OR the title text itself ("Strike — General Session" / "Load Out") with a muted/accent token. **Exact treatment is an impeccable-gated UI decision** (§13) — the spec fixes the *content* ("Strike — <Room>" / "Strike — all rooms" / "Load Out") and that the marker is visually distinct + accessible; the precise classes are settled during the invariant-8 critique/audit.
- `kind === undefined | "agenda"` → unchanged rendering.

### 9.4 Cap-exemption (synthetic entries always visible)

Synthetic entries are **few and load-bearing**; they must never hide behind a cap. Both list renderers partition displayable entries:

- **Agenda entries** (`kind` agenda/absent): capped as today — crew `RUN_OF_SHOW_DISPLAY_CAP = 20` (`agendaDisplay.ts:16`); admin `SCHEDULE_ENTRIES_CAP = 6` (`Step3SheetCard.tsx:58`, with the "Show all M times" toggle). The overflow count is computed on **agenda entries only**.
- **Synthetic entries** (`kind` strike/loadout): **always rendered**, after the (capped) agenda group, regardless of the cap or the collapsed/`showAll` state.

Rationale: admin caps agenda at 6, and FinTech SHOW DAY 2 has 11 agenda entries — without exemption a same-day load-out would be hidden behind "Show all" (defeating the feature). Crew's cap-20 is never hit by the corpus, but the partition is applied uniformly for consistency. The "+N more agenda items" stub text (`RunOfShowList.tsx:120`) keeps its current wording (counts agenda only).

### 9.5 Intentional summary ↔ detail overlap

The crew "Daily call times" `KeyTimesStrip` continues to show a single GS `strike` and `set` summary (`resolveKeyTimes.ts:106-117`). After this change the same Set/strike times also appear as per-day entries. This is an intentional summary-vs-detail relationship (like a header glance + the full run of show), not a bug. Admin Step-3 has no KeyTimesStrip, so no admin overlap. (§11 D2.)

### 9.6 Load-Out crew visibility gate (transport trust boundary — closes R3 medium)

`Load Out` is derived from `transportation.schedule` (Pick Up Venue), and the crew **Travel** section gates the *entire* transportation schedule behind `transportTileVisible({ transportation, viewerName, isAdmin })` (`lib/visibility/scopeTiles.ts:177`; used in `TravelSection.tsx:155`, `TodaySection.tsx:281`) so unassigned crew never see ground-transport detail. Putting load-out into the **date-gated** Schedule would otherwise expose that transport datum to any viewer who can see the day — a trust-boundary regression. **Decision (Codex option a — keep the existing gate):**

- **Strike** entries derive from `rooms[]`, which is **show-wide / ungated** (`ScheduleSection.tsx:96-100`: "data.rooms … scope shown to all → effectively ungated"). Strikes are NOT transport-gated — they render for every viewer who can see the day (same scope as the room data they come from).
- **Load-Out** entries (`kind === "loadout"`) are gated **exactly like the Travel section's Pick Up Venue leg**: crew renders the load-out entry **only when** `transportTileVisible(...)` is true (admin → always; assigned driver / schedule-tagged crew → yes; unassigned crew → **no**). The same Pick Up Venue time is thus gated identically in Travel and Schedule — no new exposure.

**Mechanism (single source, no Today/Schedule drift):** a shared helper in `lib/crew/agendaDisplay.ts`:

```ts
// drops loadout entries when the viewer may not see transport; agenda + strike always pass.
export function scheduleEntriesForViewer(
  entries: AgendaEntry[] | undefined,
  opts: { transportVisible: boolean },
): AgendaEntry[] {
  return displayableEntries(entries).filter((e) => e.kind !== "loadout" || opts.transportVisible);
}
```

Both `ScheduleSection` and `TodaySection` compute `transportVisible = transportTileVisible({ transportation: data.transportation, viewerName: data.viewerName, isAdmin })` (TodaySection already does, `:281`; ScheduleSection adds the import) and use `scheduleEntriesForViewer(sd?.entries, { transportVisible })` for **both** the per-day mode gate (`…length > 0`) **and** the `RunOfShowList entries={…}` it renders — so a day whose only synthetic entry is a gated-out load-out shows no run-of-show container for that viewer. **Admin** (`Step3SheetCard`) is unconditionally `isAdmin` → `transportVisible` true → renders all kinds (no change to admin). The crew cap-exemption (§9.4) operates on the **post-gate** entry set.

### 9.7 Crew read-model projection — widen the `runOfShow` key filter to the aggregate domain (closes R8 high)

**The crew data path drops the SET day today.** `getShowForViewer.ts:669-695` gates the decoded `runOfShow` to keys in `showDaySet = new Set(show.dates.showDays)` (∩ the active viewer's `DateRestriction`). The SET day is keyed by `dates.set` — **never** a member of `showDays` — so it is filtered out **before** `data.runOfShow` reaches the crew components, regardless of the §9.1 render changes. (A load-out/strike on `travelIn`/`travelOut` would be dropped too.) Without changing this projection, the SET feature is parsed, stored, shown in admin (Step-3 reads `parseResult.runOfShow` directly, not `getShowForViewer`), yet **silently invisible to crew** — the §1 primary goal.

**Change:** widen the allowed-key domain from `showDays` to the **aggregate date domain** — the SAME set `aggregateDays(show.dates)` produces (`travelIn`/`set`/`showDays`/`travelOut`, `agendaDisplay.ts:66`), so the data filter matches the component's day domain exactly:

- `activeRestriction.kind === "none"` (or admin) → `allowed = new Set(aggregateDays(show.dates).map(d => d.date))` (was `showDaySet`).
- `activeRestriction.kind === "explicit"` → `allowed = new Set(activeRestriction.days.filter(d => aggregateSet.has(d)))` (was `…filter(d => showDaySet.has(d))`). **Privacy preserved:** `activeRestriction.days` is already `∩ showDays` (`normalizeDateRestriction`), so an explicit-restricted viewer still sees **only** their show days — SET/travel keys are NOT exposed to explicit viewers (matching `ScheduleSection`'s explicit-branch day list, `:171-176`). Widening only affects the `none`/admin domain, which already renders SET/travel **cards** today.
- `activeRestriction.kind === "unknown_asterisk"` → `allowed = ∅` (unchanged — zero date leak).

This makes the read-model the authoritative implementation of the §10 boundary: an **off-aggregate** key (e.g. an off-schedule strike date) is still dropped for crew here (crew-invisible, §10), while admin's direct `parseResult.runOfShow` shows it (+ the §8 warning). The load-out transport gate (§9.6) still applies on top in the component. Reuse `aggregateDays` (don't re-derive the set) so parser `scheduleDateSet` (§7.1), component `aggregateDays`, and this projection are one domain.

---

## 10. Mode boundaries (explicit)

| Surface | Day source | Synthetic entry on an **aggregate** date (travelIn/set/showDays/travelOut) | Synthetic entry on a **non-aggregate** date |
|---|---|---|---|
| Admin Step-3 `ScheduleBreakdown` | `Object.keys(run_of_show)` | **Shown** (own day card) | **Shown** (its own date key card) |
| Crew `ScheduleSection` / `TodaySection` | `aggregateDays(dates)` ∩ `dateRestriction` | **Shown** under the matching day | **Not shown** (no aggregate day to attach to) |

**Consequence:** a strike/load-out on a date that is **not** travelIn/set/showDays/travelOut is visible on admin but **not** on the crew schedule. The mechanism is the §9.7 read-model projection: `getShowForViewer` keeps only aggregate-domain keys, so an off-aggregate key never reaches `data.runOfShow`. In all 7 surveyed shows every strike/load-out date **is** an aggregate day (strikes on show days; load-out on the last show day), so the corpus is fully covered on both surfaces. The boundary is documented rather than worked around because (a) an off-aggregate date has no `aggregateDays` card to attach an entry to and no `SchedulePhase` label, and (b) surfacing it would require both inventing a phase and bypassing the read-model filter — net new complexity for a data-error case the §8 warning already routes to operator correction. **Out of scope:** rendering crew schedule cards for non-aggregate synthetic dates.

**This boundary is NOT silent for strikes — it is the warning (§8).** The off-schedule condition (`!scheduleDateSet.has(iso)`) is identical to the crew-invisibility condition, so a strike that hits this boundary **always** emits `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE`, telling the operator the entry is admin-only until the date is corrected. The corpus never triggers it (all strikes on show days). **Load-out** on an off-schedule date is admin-only **silently** (no warning — transport dates are authoritative; RD5/D4 scoped the warning to strikes); this is the one intentionally-silent case and is called out here so the reviewer doesn't read it as an oversight.

**Second crew-visibility axis for load-out only (§9.6):** independent of the date axis above, a `kind:"loadout"` entry is also gated per-viewer by `transportTileVisible`. So even on an aggregate date, an **unassigned crew** viewer does not see the load-out entry (admin + assigned crew do). Strikes (room-sourced, ungated) and the SET day are unaffected by this axis.

---

## 11. Disagreement-loop preempts (for the reviewer)

- **D1 — `schedule_phases` is NOT this feature.** `deriveSchedulePhases` (`index.ts:282-317`) already adds `Strike` (last show day) + `Load Out` (travel-out) at **day granularity** for the pack-list (`WorkPhase`, `types.ts:132`). This feature adds **time-level / per-room** entries to `run_of_show` and deliberately does NOT alter `schedule_phases`. They are complementary surfaces; do not relitigate as duplication.
- **D2 — KeyTimesStrip overlap is intentional** (§9.5). `resolveKeyTimes` (`resolveKeyTimes.ts:114-117`) keeps its single GS strike summary; we do not remove it. Summary-strip + per-day detail is by design.
- **D3 — Faithful render of the FinTech 5/5 typo is the chosen behavior** (RD5). In-window → no warning, renders on 5/5. Do not add typo-correction heuristics.
- **D4 — Off-schedule strike warning is strike-only, operator-surfaced, and rooms-region-anchored; load-out off-schedule is intentionally silent** (§8, §10). It is in `OPERATOR_ACTIONABLE_ANCHORED` and renders on the per-show/staged actionable surface with catalog copy + an "Open in Sheet" link to the rooms region (R7 fix). RD5 scoped the warning to *strike* dates; a load-out on an off-schedule date is admin-only silently (transport dates authoritative). This strike-vs-load-out asymmetry is deliberate, not an oversight.
- **D5 — Non-aggregate-date crew invisibility is a documented boundary** (§10), and for strikes it is **surfaced by the §8 warning** (warn ⟺ crew-invisible), not silent. The corpus never triggers it. Do not re-flag as a silent omission — see §8 faithful-render contract + §10.
- **D6 — Re-staging existing shows is expected** (RD6). A parser-output change re-stages ingested shows once on next sync; this is the established mechanism, not a regression.
- **D7 — Load-out crew visibility is gated by `transportTileVisible`, by design** (§9.6, closes R3 medium). The Pick Up Venue time is transport data; it is gated identically in Schedule and Travel. Strikes (room-sourced) are show-wide because room data is ungated (`ScheduleSection.tsx:96-100`). This is the ratified policy — not a leak and not an inconsistency; do not relitigate strike-show-wide vs load-out-gated (they have different data sources with different existing scopes).
- **D8 — `"all rooms"` is emitted ONLY when a (date,time) group equals `strikeIntentCount`** (§7.1, closes R3+R4 high). Partial simultaneous strikes — fewer rooms, OR a sibling room with a TBD/unparseable strike — are named/counted, never "all rooms" (teardown-safety). A TBD-strike room counts toward `strikeIntentCount` but produces no group entry, so it blocks "all rooms". This refines RD3's label wording for safety while preserving its collapse-identical intent.
- **D9 — `AgendaEntry.kind` stays the `AgendaEntryKind` enum; the decoder allow-list keeps it honest** (§5.1, closes R4 medium). Unknown `kind` values coerce to absent/agenda in `decodeEntries` (not blind-copied via `OPTIONAL_FIELDS`, not corrupt-flagged). Do not relitigate as `kind?: string`.
- **D10 — Synthetic strike/load-out entries require a real CLOCK, not merely a non-sentinel string** (§7.1/§7.2, closes R5+R6 high). `extractFirstClock` (shared with the SHOW-DAY tokenizer) is the gate; date-only, `@ TBD`, `@ AM`, `@ morning`, bare-hour all → no entry (but count as strike-intent → block "all rooms"). No synthetic entry is ever timeless or non-clock.
- **D12 — Crew read-model projection is widened to the aggregate domain** (§9.7, closes R8 high). `getShowForViewer` previously dropped all non-`showDays` `runOfShow` keys, which would have made the SET day crew-invisible; it now keeps the `aggregateDays` domain (`travelIn/set/showDays/travelOut`). Explicit-restricted viewers are unaffected (their `restriction.days ⊆ showDays`); `unknown_asterisk` still leaks nothing. Off-aggregate keys are still dropped (the §10 boundary). Parser `scheduleDateSet`, component `aggregateDays`, and this projection are ONE domain (reuse `aggregateDays`, don't re-derive).
- **D11 — SET-row tokenization is warning-free** (§6, closes R6 medium). It does NOT reuse `SCHEDULE_TIME_UNPARSED` (wrong "SHOW DAY" copy + SHOW-DAY-only anchor resolver). An unparsed SET cell degrades to today's behavior (no entries, no warning; `dates.loadIn`/`setupTime` untouched). The only new warning is `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` (§8).

---

## 12. Flag lifecycle — `AgendaEntry.kind`

| Aspect | Detail |
|---|---|
| **Storage** | `shows_internal.run_of_show` JSONB (no migration; rides the existing object). |
| **Write path** | `deriveScheduleBookends` sets `"strike"`/`"loadout"`; `parseScheduleTimes` SET-day entries leave it absent (agenda). |
| **Read path** | `decodeRunOfShow.ts` (`OPTIONAL_FIELDS` + `"kind"`) → `getShowForViewer` → renderers. |
| **Effect on output** | §9.3 visual marker + §9.4 cap-exemption partition. Absent/unknown ⇒ plain agenda. |

No zombie: every column populated. No boolean toggle is introduced.

---

## 13. UI dimensional invariants & transition inventory

This touches UI files (`components/crew/**`, `components/admin/wizard/Step3SheetCard.tsx`) → **invariant-8** impeccable critique + audit on the diff (HIGH/CRITICAL fixed or DEFERRED) before cross-model review.

**Dimensional invariants (Tailwind v4 has no default `align-items: stretch`):**
- Admin `ScheduleDayRow` grid is `grid-cols-[auto_1fr] items-baseline` (`Step3SheetCard.tsx:169-176`). A synthetic title ("Strike — all rooms", "Load Out") flows in the existing `1fr` title track; its `start` (a real clock — synthetic entries are never timeless, §7.1) sits in the `auto` time track like any agenda row. **Invariant:** the `STRIKE`/`LOAD OUT` badge (if used) must not break the two-track alignment — it sits inside the title cell (the `1fr` track), not as a third column. Real-browser (Playwright) assertion in the plan: every `…-sched-time` / `…-sched-title` cell in a day containing a synthetic entry shares the same left edge as the agenda rows (±0.5px).
- Crew `RunOfShowEntry` is `flex flex-col` per row (`RunOfShowList.tsx:48`); the badge reuses the inline `av`-badge flex pattern — no fixed-dimension parent introduced.

**Transition inventory:** all affected components are **synchronous Server Components** (`ScheduleSection.tsx:35`, `TodaySection.tsx:30` — no `'use client'`, no animation). Admin `ScheduleDayRow` has one client toggle (`showAll`, `useState`, `:191`) which expands the agenda group; synthetic entries are cap-exempt so they do not participate in the expand/collapse. State pairs:

| State A | State B | Treatment |
|---|---|---|
| agenda collapsed (`showAll=false`) | agenda expanded (`showAll=true`) | instant — pre-existing toggle, no animation |
| synthetic entries present | synthetic entries absent | instant (server-rendered; no client transition) |
| `showAll` toggled **while** synthetic entries present (compound) | — | instant; synthetic group is rendered outside the toggled agenda slice, so toggling never adds/removes a synthetic row |

No `AnimatePresence` / framer-motion is added.

---

## 14. Testing plan (TDD per task; anti-tautology)

**Pure derivation (the bulk — no DOM):**
- `tests/parser/blocks/scheduleBookends.test.ts`:
  - **Collapse identical** (Redefining-shaped fixture: 3 rooms, same date+time) → exactly one `"Strike — all rooms"` entry, `kind:"strike"`, on that date. Failure mode caught: per-room duplication / missing collapse.
  - **Distinct days** (Consultants-shaped: GS 10/9 4:30pm + lunch room 10/8 2:15pm) → two strike entries on **different** day keys. Failure mode: dumping all strikes on the last day.
  - **Non-final-day strike** (RPAS-shaped: breakouts 3/24, GS 3/25) → strike entries on both 3/24 and 3/25. Failure mode: collapsing to last day only.
  - **Single room** → `"Strike — <Room>"` (room name from `RoomRow.name`).
  - **Partial simultaneous strike (R3 high pin)** (fixture: 4 rooms — 2 breakouts strike same date+time, GS + 1 other strike later) → the 2-breakout group reads `"Strike — <A>, <B>"` (named), **NOT** `"Strike — all rooms"`. Negative-regression: collapse the GS/other strike into the same group so all 4 coincide → label flips to `"Strike — all rooms"` (proves "all rooms" requires the full set). Also: a >3-room partial group → `"Strike — N rooms"`. Failure mode: mislabeling a partial group as all-rooms (premature-teardown risk).
  - **Load-Out** (FinTech-shaped: Pick Up Venue 5/6 6:00 PM) → one `"Load Out"` entry, `kind:"loadout"`, start `"6:00 PM"`, on 5/6.
  - **v1 no transport** (East Coast-shaped) → strike entries present, **no** load-out entry.
  - **Yearless strike + `contextYear` supplied** (Consultants-shaped: `"10/9 @ 4:30pm"`, `contextYear="2025"`) → entry present on `2025-10-09` (NOT dropped). Negative-regression: pass `contextYear=null` with the same yearless cell → entry skipped (proves the parameter is load-bearing, not decorative). Failure mode: the high-finding-1 case — yearless strikes silently dropped because the year context wasn't threaded.
  - **TBD / unparseable** strike_time → skipped (no entry, no crash).
  - **Timeless / non-clock strike → NO entry, blocks "all rooms" (R5+R6 high pins):** a room with `strike_time` `"5/14 @ TBD"` (sentinel time), bare `"5/14"` (no time), **`"5/14 @ AM"`**, or **`"5/14 @ morning"`** (non-clock tails) all produce **no** synthetic entry, yet still count in `strikeIntentCount`. Critical case: **every** strike-intent room has a date+non-clock time → **zero** strike entries (NOT a timeless `"Strike — all rooms"`). Negative-regression: make those cells carry a real clock (`"5/14 @ 5:00 PM"`) → they now emit and (if coincident) read `"Strike — all rooms"`. Also assert `extractFirstClock`: `"4:30pm"`/`"1PM"`/`"6:00 PM"`/`"8 PM"` → clock; `"AM"`/`"morning"`/`"TBD"`/`"8"` → null. Failure mode: non-clock free text rendered as an actionable teardown milestone.
  - **Off-schedule** strike date (synthetic fixture: strike date NOT in travelIn/set/showDays/travelOut, e.g. after travelOut) → `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` warning emitted **and** the entry still present in the returned `runOfShow` (faithful, admin-visible). Negative-regression: remove the `scheduleDateSet` check → assert the warning vanishes (pins it).
  - **Off-schedule ⇒ crew-invisible (the R2 coherence pin):** a *render* test — the off-schedule strike is in `ParsedSheet.runOfShow` (admin shows it) but the crew `ScheduleSection` renders **no** card/entry for that date (its date is not in `aggregateDays`). Pairs with the warning test to prove warn ⟺ crew-invisible.
  - **On-schedule typo** (FinTech 5/5, which IS SHOW DAY 2) → entry on 5/5, **no** warning, **rendered on crew** (5/5 ∈ aggregateDays). Pins RD5 + the FinTech §3 note.
  - **Append order / non-mutation:** synthetic entries appended after existing agenda entries; the input `runOfShow` object is not mutated (assert reference inequality / deep-clone).
  - **Expected values derived from fixture dimensions**, never hardcoded (e.g. room count, strike strings read from the fixture rows).
- `tests/parser/blocks/scheduleTimes.test.ts` (extend): SET row tokenized → SET-day `ScheduleDay` keyed by `dates.set` with the load-in entry; combined `TRAVEL / SET` row tokenizes both clocks; v1 2-col SET → no SET ScheduleDay.
- `tests/parser/parseSheet*.test.ts`: a full fixture yields SET day + strike + load-out in `ParsedSheet.runOfShow`, and the warning (when applicable) reaches `ParsedSheet.warnings` (proving the `index.ts` merge wiring, not just the unit).
- `tests/data/decodeRunOfShow.test.ts` (extend): an entry with `kind:"strike"` (and `"loadout"`) survives encode→decode with the kind intact; an **unknown** `kind` (`"banana"`, a number, etc.) decodes to an entry with **no `kind` field** (coerced to agenda — NOT passed through as a string), and does **not** mark the blob corrupt; a legacy entry without `kind` decodes unchanged. Negative-regression: feed `kind:"banana"` and assert `decoded.kind === undefined` (proves the allow-list, not a blind copy).

**Render (DOM; anti-tautology — clone & strip siblings, assert against the data source):**
- Crew `ScheduleSection` test: SET day card shows the load-in entry; strike entry shows on its day; load-out on the last day; SET-day "Setup" meta suppressed when entries exist (assert the `setupTime` string is NOT double-printed — clone the SET card, remove the `RunOfShowList`, assert the meta is gone). Derive the expected day count from the fixture's aggregate days.
- Cap-exemption test (admin): a day with > `SCHEDULE_ENTRIES_CAP` (6) agenda entries + a load-out → the load-out is visible **without** clicking "Show all". Failure mode: synthetic entry hidden behind the cap.
- **Crew read-model projection (R8 high pin):** `tests/data/getShowForViewer*RunOfShow*.test.ts` (extend) — a stored `runOfShow` with a **SET-day key** (`dates.set`) and a **strike on a show day** → a `none`/admin viewer's `data.runOfShow` contains **both** (SET key no longer dropped); an **off-aggregate** key (date ∉ travelIn/set/showDays/travelOut) is **dropped**; an **explicit**-restricted viewer gets only their show days (SET/travel NOT exposed); `unknown_asterisk` → `null`. Negative-regression: revert the filter to `showDaySet` → the SET key disappears from `none`-viewer data (proves the widening is load-bearing for the primary goal). Derive the expected key set from the fixture's `dates`, not hardcoded.
- **Off-schedule warning surfaces to the operator (R7 high pin):** an off-schedule strike → `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` passes `operatorActionableWarnings` (in `OPERATOR_ACTIONABLE_ANCHORED`) and renders on `PerShowActionableWarnings` with the **catalog title/helpfulContext** (via `messageFor`) — assert the rendered text is the catalog copy, **not** the raw code (invariant 5). Anchor: `attachSourceCellAnchors` resolves it to the `rooms` region `sourceCell` (assert a non-null region anchor). Negative-regression: remove the code from `OPERATOR_ACTIONABLE_ANCHORED` → it vanishes from the actionable list (proves the membership is load-bearing). Also extend the `OPERATOR_ACTIONABLE_ANCHORED ≡ CELL_ANCHORED_CODES` membership pin-test (`tests/parser/*`) to include the new code.
- **Admin day-cap exemption (R7 medium pin):** a fixture with > `SCHEDULE_DAYS_CAP` (14) run-of-show keys plus an off-schedule synthetic strike/load-out day **past** the 14th key → the synthetic-bearing day is still rendered in `ScheduleBreakdown` (not collapsed into "…and N more days"); the note counts only dropped non-synthetic days. Failure mode: the admin-only entry hidden behind the day cap.
- **Load-out transport gate (R3 medium pin):** `scheduleEntriesForViewer` drops a `kind:"loadout"` entry when `transportVisible=false` and keeps it when `true`; agenda + strike entries always pass. Render-level: an **unassigned** crew viewer (not driver, not schedule-tagged → `transportTileVisible` false) sees the strike entry but **NOT** the load-out entry on the crew Schedule; an **assigned** viewer and **admin** both see it. Negative-regression: force `transportVisible=true` for the unassigned viewer → the load-out reappears (proves the gate, not an unrelated omission). Assert on **both** `ScheduleSection` and `TodaySection` (Today/Schedule drift guard, mirrors the `agendaDisplay` single-source rule).
- Layout-dimensions test (real browser / Playwright, per AGENTS.md): in a day with a synthetic entry, `…-sched-time` / `…-sched-title` cells share the agenda rows' left edges (±0.5px). jsdom is insufficient.

**Meta-test inventory (§14b):** see plan. Candidate: none of the existing registries (`_metaInfraContract`, advisory-lock topology, sentinel-hiding, admin-alert catalog, no-inline-email) is directly extended — this feature adds no Supabase call boundary, no advisory lock, no admin alert, no email path. The relevant structural guard is the **`x1-catalog-parity`** gate (existing) which the new warning code must satisfy. Declared explicitly: "no new meta-test; extends the §12.4 catalog under the existing x1 gate."

---

## 15. Blast radius / files touched

| File | Change |
|---|---|
| `lib/parser/types.ts` | `AgendaEntry.kind?` + `AgendaEntryKind`. |
| `lib/parser/blocks/scheduleTimes.ts` | SET-row capture + warning-free tokenization in `readShowDayTimeCells`; export shared `extractFirstClock`. |
| `lib/parser/blocks/scheduleBookends.ts` | **new** — `deriveScheduleBookends` + `parseRoomTimeCell` (reuses `extractFirstClock`). |
| `lib/parser/blocks/agendaWarnings.ts` | `strikeDateOffSchedule` helper. |
| `lib/parser/dataGaps.ts` | add `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` to `OPERATOR_ACTIONABLE_ANCHORED` (= `CELL_ANCHORED_CODES`). |
| `lib/drive/showDayTimeAnchors.ts` | `attachSourceCellAnchors` dispatch: `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` → `region[blockRef.kind]` (rooms region). |
| `components/admin/wizard/Step3SheetCard.tsx` | (above) + `ScheduleBreakdown` day-cap exemption for synthetic-bearing days. |
| `lib/parser/index.ts` | compute `inferShowYear(markdown)`; call `deriveScheduleBookends(mergedRunOfShow, dates, transportation, rooms, contextYear)` after merge; replace `mergedRunOfShow` with its result; push its warnings. |
| `lib/data/decodeRunOfShow.ts` | validate `kind` via an enum allow-list in `decodeEntries` (accept `"strike"`/`"loadout"`, else drop → agenda); NOT added to the generic `OPTIONAL_FIELDS`. |
| `lib/data/getShowForViewer.ts` | widen the `runOfShow` key projection (`:669-695`) from `showDaySet` to the `aggregateDays(show.dates)` domain (§9.7); preserve explicit/unknown_asterisk semantics. |
| `lib/crew/agendaDisplay.ts` | **new** `scheduleEntriesForViewer` helper (load-out transport gate; §9.6). |
| `components/crew/sections/ScheduleSection.tsx` | SET-day meta suppression; import `transportTileVisible`; route per-day entries through `scheduleEntriesForViewer`. |
| `components/crew/sections/TodaySection.tsx` | route today entries through `scheduleEntriesForViewer` (reuses existing `transportVisible` `:281`). |
| `components/crew/primitives/RunOfShowList.tsx` | `kind` badge + cap-exemption partition. |
| `components/admin/wizard/Step3SheetCard.tsx` | `kind` badge + cap-exemption in `ScheduleDayRow` (admin = `isAdmin` → all kinds visible). |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | §12.4 catalog row (new warning). |
| `lib/messages/catalog.ts` + `lib/messages/__generated__/spec-codes.ts` + `__generated__/internal-code-enums.ts` | regen lockstep. |
| `tests/**` | per §14. |

**Touches:** UI ✅ (invariant-8 impeccable gate; Opus-owned) · run-of-show JSONB shape ✅ (decoder + re-stage) · §12.4 catalog ✅. **No** migration, **no** advisory lock, **no** RPC, **no** new DB column.

---

## 16. Self-consistency / numeric sweep

- Caps: crew `RUN_OF_SHOW_DISPLAY_CAP = 20`; admin `SCHEDULE_ENTRIES_CAP = 6`, `SCHEDULE_DAYS_CAP = 14` — cited from source, single-sourced (not redefined here).
- Shows surveyed: **7** (§3 table has 7 rows). Pick Up Venue present in **6/7**; GS strike in **7/7**; explicit DATES strike rows **0/7**.
- `AgendaEntry` field count: 6 existing (`start, finish, trt, title, room, av`) → 7 with `kind`. `decodeRunOfShow` `OPTIONAL_FIELDS` stays **4** (`finish, trt, room, av`) — `kind` is decoded by a dedicated enum allow-list in `decodeEntries`, NOT added to the generic string-copy list (§5.1).
- Warning code: exactly one new (`SCHEDULE_STRIKE_DATE_OFF_SCHEDULE`), fired when a strike date ∉ `scheduleDateSet` (= aggregateDays = travelIn/set/showDays/travelOut).
- Kinds: exactly 3 (`agenda` default, `strike`, `loadout`).
- `STRIKE_ROOM_NAME_CAP = 3` (partial-strike group names ≤3 rooms, else "N rooms"; "all rooms" only when group = every striking room).
- Load-out crew gate: `transportTileVisible` (`scopeTiles.ts:177`), applied via the new `scheduleEntriesForViewer` helper on both crew sections; admin (`isAdmin`) is unconditionally visible.
