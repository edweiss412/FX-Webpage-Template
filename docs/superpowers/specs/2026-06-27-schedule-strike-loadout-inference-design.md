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
| FinTech '26 (v4) | `5/6/26 @ 6:00 PM` | `5/5 @ 2:50 PM` ⚠️ | 5/6 | GS strike date is a **typo** (5/5; in-window). Renders on 5/6 SHOW DAY 3. |
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
| RD3 | Strike labeling | **Per-room, collapse identical:** single room → `"Strike — <Room>"`; ≥2 rooms at the same date+time → `"Strike — all rooms"`. |
| RD4 | Surfaces | **Admin Step-3 review AND crew Schedule/Today.** |
| RD5 | Data quality | **Faithful + flag suspicious:** render strikes on the exact date the sheet lists (FinTech's in-window 5/5 typo renders on 5/5, no flag); skip entries with no parseable date / `TBD`; emit a parse-warning when a strike date falls **outside** the show window `[travelIn∥set … travelOut]`. |
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
- **Write path:** set by `parseScheduleTimes` (SET-day entries keep `kind` absent = agenda) and by `deriveScheduleBookends` (`"strike"` / `"loadout"`).
- **Read path:** `decodeRunOfShow.ts` — add `"kind"` to `OPTIONAL_FIELDS` (`decodeRunOfShow.ts:7`). The decoder validates "every present optional field is a string" (`:40-50`); `kind` is a string so it passes. Renderers treat any value other than `"strike"`/`"loadout"` (incl. absent or an unknown string) as `"agenda"` (lenient — matches the decoder philosophy; an old blob with no `kind` is a normal agenda entry).
- **Effect on output:** drives the §9.3 visual treatment + the §9.4 cap-exemption partition. (Flag lifecycle table, §12.)

**Guard:** a corrupt non-enum `kind` string (e.g. `"banana"`) decodes through (string check passes) and renders as plain agenda — no crash, no special styling. The decoder does NOT reject it (consistent with `room`/`av` lenience).

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
- Empty / bare-sentinel TIME cell → no SET ScheduleDay (matches show-day behavior, `scheduleTimes.ts:132`).
- Contentful-but-no-clock SET cell → emits the existing `SCHEDULE_TIME_UNPARSED` warning (same path as show days, `scheduleTimes.ts:139,187`). **Decision:** acceptable — the SET row is now a first-class schedule day, so the same "couldn't read a time" signal applies. (Pre-existing show-day behavior; no new code.)
- The merge at `index.ts:432` (`{ ...datesDays }`) carries the SET ScheduleDay into `mergedRunOfShow` for free.

**Mode boundary (SET-day meta):** in `ScheduleSection.tsx`, the `isSetDay` branch currently always sets `meta = "Setup {setupTime}"` (`:253-259`). Change: set that meta **only when the SET day has no displayable run-of-show entries** (`displayableEntries(sd?.entries).length === 0`). When entries exist, they carry the times (incl. a "Setup" entry parsed from the same cell) and the standalone `"Setup …"` meta is suppressed to avoid double-printing. (No change to admin — admin has no per-day meta.)

---

## 7. Derivation — Strike + Load-Out (`deriveScheduleBookends`)

New pure function `deriveScheduleBookends(runOfShow, dates, transportation, rooms)` in `lib/parser/blocks/scheduleBookends.ts`, returning `{ runOfShow, warnings }`. Called in `index.ts` **after** the existing merge (after `:447`, before `:480`), taking `mergedRunOfShow` (or `{}` when undefined), `dates`, `transportation`, `rooms`; its warnings are pushed to `agg.warnings` exactly as `scheduleTimesResult.warnings` is (`index.ts:383`).

### 7.1 Algorithm

```
input: rosIn (Record<iso, ScheduleDay> | undefined), dates, transportation, rooms
ros = deepClone(rosIn ?? {})   // new object; per-day entries arrays also copied — never mutate the caller's object
warnings = []

// window for the out-of-window check (RD5)
windowStart = dates.travelIn ?? dates.set ?? min(dates.showDays)   // earliest known
windowEnd   = dates.travelOut ?? max(dates.showDays)               // latest known

// ── STRIKE (per-room) ──────────────────────────────────────────────
groups = Map<`${iso}|${time}`, { iso, time, rooms: string[] }>
for room of rooms:
  raw = room.strike_time
  if isAbsentTime(raw): continue            // null/empty/TBD/N/A/TBA
  {iso, time} = parseRoomTimeCell(raw, contextYear)   // §7.2
  if iso == null: continue                  // no parseable date → skip (RD5)
  key = `${iso}|${time ?? ""}`
  groups[key] ||= {iso, time, rooms: []}
  groups[key].rooms.push(presence(room.name) ?? roomKindFallback(room.kind))   // roomKindFallback: local map gs→"General Session", breakout→"Breakout", additional→"Room"
for g of groups (sorted by iso asc, then time asc, then rooms join):
  title = g.rooms.length >= 2 ? "Strike — all rooms" : `Strike — ${g.rooms[0]}`
  appendEntry(ros, g.iso, { start: g.time ?? "", title, kind: "strike" })
  if g.iso < windowStart || g.iso > windowEnd:
    warnings.push(strikeDateOutOfWindow(g.iso))     // §8

// ── LOAD OUT (transport Pick Up Venue) ─────────────────────────────
puv = transportation?.schedule.find(s => /pick\s*up\s*venue/i.test(s.stage.trim()))
if puv && puv.date != null:                 // transport parser already normalized date → ISO
  time = isAbsentTime(puv.time) ? "" : puv.time.trim()
  appendEntry(ros, puv.date, { start: time, title: "Load Out", kind: "loadout" })

return { runOfShow: Object.keys(ros).length ? ros : rosIn, warnings }
```

- `appendEntry(ros, iso, entry)`: if `ros[iso]` absent, create `{ entries: [entry], showStart: null, window: null }`; else **append** to `ros[iso].entries` (synthetic entries go **after** existing agenda entries — they are end-of-day events; no global re-sort, preserving sheet order for agenda). Strike entries are emitted before the load-out for the same day (group iteration runs before the load-out step), and multiple strikes sort by time ascending.
- `contextYear` = `inferShowYear(markdown)` (imported from `./_helpers`, see `transport.ts:30`) — passed into the derivation (or derived from `dates`). Room strike dates are often yearless (`"10/9 @ 4:30pm"`).
- **Shared helpers:** `presence` is exported from `lib/parser/blocks/_helpers.ts` (used corpus-wide). `isAbsentTime` is currently **module-private** in `resolveKeyTimes.ts:21` — the plan either (a) exports it for reuse, or (b) mirrors its exact regex `/\b(?:TBD|N\/A|TBA)\b/i` + empty/null check in `scheduleBookends.ts`. Pick one and pin it with a test so the two definitions can't drift.
- The returned object is a **new** object; `rosIn` is never mutated (guard against the persisted-blob being aliased). When `rosIn` was `undefined` and no synthetic entries were added, return `rosIn` (preserve the "no run-of-show" sentinel so `index.ts:493` still omits the key).

### 7.2 `parseRoomTimeCell(raw, contextYear)` → `{date: iso|null, time: string|null}`

Room `strike_time` / `set_time` / `show_time` are free-text with **two** separators observed in the corpus: `"M/D @ TIME"` (most), `"M/D - TIME"` (v1 East Coast `"5/15 - 1PM"`), and date-only / `M/D/YY`. `transport.ts:parseV2DateTime` (`:603`) handles only `"@"`, so a dedicated helper is needed:

- Extract leading date: `/^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/`. If no leading `M/D` → `{date:null, time:null}` (skip).
- Resolve year: explicit in the cell → use it; else a 4-digit year elsewhere in the cell; else `contextYear`; else `null` (→ skip). Route through `normalizeDate` (rejects calendar-invalid dates, mirrors `dates.ts:280-292`).
- Extract time: the substring after the date, stripped of a leading `@` / `-` / `–` separator and whitespace; sentinel-guarded via `isAbsentTime` (→ `time: null`). Preserve the operator's clock text verbatim (e.g. `"4:30pm"`, `"1PM"`) — we do not reformat crew-facing times.

**Guard cases:** `"TBD"` → `isAbsentTime` true → skipped before parse. `"5/15 - 1PM"` → `{date:"<yr>-05-15", time:"1PM"}`. `"10/9 @ 4:30pm"` → `{date, time:"4:30pm"}`. `"3/25/26 @ 12:30pm"` → explicit year. A bare date `"5/14"` → `{date, time:null}` (date-only strike renders with empty start).

---

## 8. Data-quality warning — `SCHEDULE_STRIKE_DATE_OUT_OF_WINDOW`

Modeled **exactly** on the sibling `SCHEDULE_TIME_UNPARSED` (defined in `lib/parser/blocks/agendaWarnings.ts`; the established 3-part §12.4 lockstep + family mapping). New helper in `agendaWarnings.ts`:

```ts
export function strikeDateOutOfWindow(iso: string): ParseWarning {
  return {
    severity: "warn",
    code: "SCHEDULE_STRIKE_DATE_OUT_OF_WINDOW",
    message: `A room strike date (${iso}) falls outside the show window; rendered as entered`,
    blockRef: { kind: "rooms", iso },
  };
}
```

- **Prefix `SCHEDULE`** → auto-maps to the `crew-schedule` family in `app/help/errors/_families.ts` (its `prefixes` include `SCHEDULE`). No families edit; `tests/help/errors-grouping.test.tsx` orphan check stays green.
- **§12.4 catalog lockstep** (one commit, enforced by `x1-catalog-parity` = `tests/messages/codes.test.ts`):
  1. master spec §12.4 prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (add a row);
  2. `pnpm gen:spec-codes` → regenerate `lib/messages/__generated__/spec-codes.ts`;
  3. matching row in `lib/messages/catalog.ts` (with `helpHref: "/help/errors#..."`).
  4. `pnpm gen:internal-code-enums` (the code literal enters the internal-warning enum, same as `SCHEDULE_TIME_UNPARSED`).
- **Severity `warn`** (operator-actionable). It is NOT added to `DATA_GAP_CODES` (`dataGaps.ts:37`) or `OPERATOR_ACTIONABLE_ANCHORED` (`:122`) — scope is the warning + catalog only; a source-cell deep link for it is **out of scope** (deferred; the strike cell lives in a per-room block with no existing anchor resolver — note in DEFERRED.md if raised).

**Faithful-render contract (RD5):** the entry is **always rendered** on its listed date regardless of the warning. The warning is informational. FinTech's GS strike `5/5` is *in*-window → renders on 5/5, **no** warning (matches the user's chosen option text precisely; "strike not on the last show day" is NOT the flag criterion — out-of-window is).

---

## 9. Rendering

### 9.1 Crew Schedule (`ScheduleSection.tsx`)

No structural change to day iteration. Synthetic entries on `aggregateDays` dates light up automatically via the existing `displayableEntries(sd?.entries).length > 0 → <RunOfShowList>` gate (`:286-287`). Two edits:
- SET-day meta suppression when entries exist (§6).
- (No edit to the privacy/`dateRestriction` logic — entries inherit their day's visibility; a viewer restricted away from a day never sees its strike/load-out.)

### 9.2 Crew Today (`TodaySection.tsx`) & admin Step-3 (`Step3SheetCard.tsx`)

- **Today:** unchanged logic; synthetic entries on today's card render via the same `RunOfShowList` (gated `isShowDay`, `:197`).
- **Admin Step-3 `ScheduleBreakdown`:** unchanged iteration (`Object.keys(ros)`); the SET day key + synthetic entries appear automatically. The SET day shows under its `humanizeDate` header (e.g. "May 3"). `SCHEDULE_DAYS_CAP = 14` already accommodates SET + show days (max surveyed = 6 days).

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

---

## 10. Mode boundaries (explicit)

| Surface | Day source | Synthetic entry on an **aggregate** date (travelIn/set/showDays/travelOut) | Synthetic entry on a **non-aggregate** date |
|---|---|---|---|
| Admin Step-3 `ScheduleBreakdown` | `Object.keys(run_of_show)` | **Shown** (own day card) | **Shown** (its own date key card) |
| Crew `ScheduleSection` / `TodaySection` | `aggregateDays(dates)` ∩ `dateRestriction` | **Shown** under the matching day | **Not shown** (no aggregate day to attach to) |

**Consequence:** a strike/load-out on a date that is **not** travelIn/set/showDays/travelOut is visible on admin but **not** on the crew schedule. In all 7 surveyed shows every strike/load-out date **is** an aggregate day (strikes on show days; load-out on the last show day), so the corpus is fully covered on both surfaces. The boundary is documented rather than worked around because (a) extending `aggregateDays` would touch the privacy-sensitive `visibleShowDays` drift guard (`ScheduleSection.tsx:170`, `agendaDisplay.ts:88`) and (b) a synthetic-only day would have no `SchedulePhase` label. **Out of scope:** rendering crew schedule cards for non-aggregate synthetic dates.

---

## 11. Disagreement-loop preempts (for the reviewer)

- **D1 — `schedule_phases` is NOT this feature.** `deriveSchedulePhases` (`index.ts:282-317`) already adds `Strike` (last show day) + `Load Out` (travel-out) at **day granularity** for the pack-list (`WorkPhase`, `types.ts:132`). This feature adds **time-level / per-room** entries to `run_of_show` and deliberately does NOT alter `schedule_phases`. They are complementary surfaces; do not relitigate as duplication.
- **D2 — KeyTimesStrip overlap is intentional** (§9.5). `resolveKeyTimes` (`resolveKeyTimes.ts:114-117`) keeps its single GS strike summary; we do not remove it. Summary-strip + per-day detail is by design.
- **D3 — Faithful render of the FinTech 5/5 typo is the chosen behavior** (RD5). In-window → no warning, renders on 5/5. Do not add typo-correction heuristics.
- **D4 — Out-of-window warning has no source-cell deep link** (§8). Strike cells have no existing anchor resolver; the deep link is out of scope (DEFERRED if raised).
- **D5 — Non-aggregate-date crew invisibility is a documented boundary** (§10), not a bug; the corpus never triggers it.
- **D6 — Re-staging existing shows is expected** (RD6). A parser-output change re-stages ingested shows once on next sync (`feedback_parser_rename_restages_via_mi7b`); this is the established mechanism, not a regression.

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
- Admin `ScheduleDayRow` grid is `grid-cols-[auto_1fr] items-baseline` (`Step3SheetCard.tsx:169-176`). A synthetic title ("Strike — all rooms", "Load Out") flows in the existing `1fr` title track; a synthetic entry with empty `start` leaves the `auto` time cell empty but the row still baseline-aligns. **Invariant:** the `STRIKE`/`LOAD OUT` badge (if used) must not break the two-track alignment — it sits inside the title cell (the `1fr` track), not as a third column. Real-browser (Playwright) assertion in the plan: every `…-sched-time` / `…-sched-title` cell in a day containing a synthetic entry shares the same left edge as the agenda rows (±0.5px).
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
  - **Load-Out** (FinTech-shaped: Pick Up Venue 5/6 6:00 PM) → one `"Load Out"` entry, `kind:"loadout"`, start `"6:00 PM"`, on 5/6.
  - **v1 no transport** (East Coast-shaped) → strike entries present, **no** load-out entry.
  - **TBD / unparseable** strike_time → skipped (no entry, no crash).
  - **Date-only** strike (no time) → entry with empty `start`.
  - **Out-of-window** strike date (synthetic fixture: strike date after travelOut) → `SCHEDULE_STRIKE_DATE_OUT_OF_WINDOW` warning emitted **and** entry still present (faithful). Negative-regression: remove the window check → assert the warning vanishes (proving the test pins it).
  - **In-window typo** (FinTech 5/5 vs last day 5/6) → entry on 5/5, **no** warning (pins RD5).
  - **Append order / non-mutation:** synthetic entries appended after existing agenda entries; the input `runOfShow` object is not mutated (assert reference inequality / deep-clone).
  - **Expected values derived from fixture dimensions**, never hardcoded (e.g. room count, strike strings read from the fixture rows).
- `tests/parser/blocks/scheduleTimes.test.ts` (extend): SET row tokenized → SET-day `ScheduleDay` keyed by `dates.set` with the load-in entry; combined `TRAVEL / SET` row tokenizes both clocks; v1 2-col SET → no SET ScheduleDay.
- `tests/parser/parseSheet*.test.ts`: a full fixture yields SET day + strike + load-out in `ParsedSheet.runOfShow`, and the warning (when applicable) reaches `ParsedSheet.warnings` (proving the `index.ts` merge wiring, not just the unit).
- `tests/data/decodeRunOfShow.test.ts` (extend): an entry with `kind:"strike"` survives encode→decode; an unknown `kind` string decodes as a (lenient) string and renders agenda; a legacy entry without `kind` decodes unchanged (negative-regression on the `OPTIONAL_FIELDS` addition).

**Render (DOM; anti-tautology — clone & strip siblings, assert against the data source):**
- Crew `ScheduleSection` test: SET day card shows the load-in entry; strike entry shows on its day; load-out on the last day; SET-day "Setup" meta suppressed when entries exist (assert the `setupTime` string is NOT double-printed — clone the SET card, remove the `RunOfShowList`, assert the meta is gone). Derive the expected day count from the fixture's aggregate days.
- Cap-exemption test (admin): a day with > `SCHEDULE_ENTRIES_CAP` (6) agenda entries + a load-out → the load-out is visible **without** clicking "Show all". Failure mode: synthetic entry hidden behind the cap.
- Layout-dimensions test (real browser / Playwright, per AGENTS.md): in a day with a synthetic entry, `…-sched-time` / `…-sched-title` cells share the agenda rows' left edges (±0.5px). jsdom is insufficient.

**Meta-test inventory (§14b):** see plan. Candidate: none of the existing registries (`_metaInfraContract`, advisory-lock topology, sentinel-hiding, admin-alert catalog, no-inline-email) is directly extended — this feature adds no Supabase call boundary, no advisory lock, no admin alert, no email path. The relevant structural guard is the **`x1-catalog-parity`** gate (existing) which the new warning code must satisfy. Declared explicitly: "no new meta-test; extends the §12.4 catalog under the existing x1 gate."

---

## 15. Blast radius / files touched

| File | Change |
|---|---|
| `lib/parser/types.ts` | `AgendaEntry.kind?` + `AgendaEntryKind`. |
| `lib/parser/blocks/scheduleTimes.ts` | SET-row capture + tokenization in `readShowDayTimeCells`. |
| `lib/parser/blocks/scheduleBookends.ts` | **new** — `deriveScheduleBookends` + `parseRoomTimeCell`. |
| `lib/parser/blocks/agendaWarnings.ts` | `strikeDateOutOfWindow` helper. |
| `lib/parser/index.ts` | call `deriveScheduleBookends` after merge; push its warnings. |
| `lib/data/decodeRunOfShow.ts` | add `"kind"` to `OPTIONAL_FIELDS`. |
| `components/crew/sections/ScheduleSection.tsx` | SET-day meta suppression. |
| `components/crew/primitives/RunOfShowList.tsx` | `kind` badge + cap-exemption partition. |
| `components/admin/wizard/Step3SheetCard.tsx` | `kind` badge + cap-exemption in `ScheduleDayRow`. |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | §12.4 catalog row (new warning). |
| `lib/messages/catalog.ts` + `lib/messages/__generated__/spec-codes.ts` + `__generated__/internal-code-enums.ts` | regen lockstep. |
| `tests/**` | per §14. |

**Touches:** UI ✅ (invariant-8 impeccable gate; Opus-owned) · run-of-show JSONB shape ✅ (decoder + re-stage) · §12.4 catalog ✅. **No** migration, **no** advisory lock, **no** RPC, **no** new DB column.

---

## 16. Self-consistency / numeric sweep

- Caps: crew `RUN_OF_SHOW_DISPLAY_CAP = 20`; admin `SCHEDULE_ENTRIES_CAP = 6`, `SCHEDULE_DAYS_CAP = 14` — cited from source, single-sourced (not redefined here).
- Shows surveyed: **7** (§3 table has 7 rows). Pick Up Venue present in **6/7**; GS strike in **7/7**; explicit DATES strike rows **0/7**.
- `AgendaEntry` field count: 6 existing (`start, finish, trt, title, room, av`) → 7 with `kind`. `decodeRunOfShow` `OPTIONAL_FIELDS`: 4 → 5.
- Warning code: exactly one new (`SCHEDULE_STRIKE_DATE_OUT_OF_WINDOW`).
- Kinds: exactly 3 (`agenda` default, `strike`, `loadout`).
