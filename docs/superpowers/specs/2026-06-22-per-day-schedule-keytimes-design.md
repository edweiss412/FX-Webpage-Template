# Per-Day Schedule & Key-Times Fix — Design Spec

**Date:** 2026-06-22
**Status:** Draft (pre spec-self-review)
**Author:** Opus orchestrator session
**Scope:** Crew-page Schedule + Today "Key times", and the DATES-block parser. Fixes three audit gaps where per-show-day schedule data present in the source sheet is dropped or mis-displayed.

---

## 1. Problem (audit findings)

On the crew page for "AVIII / Consultants Roundtable" (and every other v4 show), useful schedule data that exists in the Google Sheet never reaches the page. Three concrete gaps, all confirmed **live via gsheets MCP across 7 distinct shows** (East Coast v1, Consultants, RPAS 2026, Redefining Fixed Income, Fixed Income Trading, FinTech 2026, RIA 2025) and all 10 committed fixtures:

1. **Set key-time loses its date.** Key Times renders `Set = "9:00PM"` (a bare clock) beside `Show`/`Strike` which carry dates (`"10/8 @ 8:45am"`, `"10/9 @ 4:30pm"`). Root: `Set` is sourced from `dates.loadIn`, which `extractClockTime` strips to the first `HH:MM` only (`lib/parser/blocks/dates.ts:263-272`); `resolveKeyTimes` renders it verbatim (`lib/crew/resolveKeyTimes.ts:54-56`). The set DATE (`dates.set`) is already parsed but never joined.
2. **Show-day TIME column dropped wholesale.** Each SHOW DAY row's TIME column holds a full per-day run-of-show (e.g. Consultants Day 1: "7:15am Registration … 5:35pm Meeting Concludes"). `parseDates`' `show_day` case reads only the DATE (col 3) and never touches `row[4]` (`dates.ts:223-229`). The separate AGENDA-grid parser (`lib/parser/blocks/agenda.ts:351-393`) IS read, but for v4 shows that grid is time-rich/title-empty, and `buildEntry` returns null on an empty title (`agenda.ts:294-295`) → `runOfShow[date] = []` → no per-day list renders (`components/crew/sections/ScheduleSection.tsx:213-218`).
3. **No per-show-day Show time anywhere.** Key Times collapses Show into one anchor (`KeyTimeAnchors.show: string`, `resolveKeyTimes.ts:7`), and the Schedule day list renders `DayCard` with no time (`ScheduleSection.tsx:208`; `DayCard.meta` is wired but unused, `components/crew/primitives/DayCard.tsx:45-46,104-108`). A 2- or 3-show-day show cannot express "Day 2 starts at X."

### 1.1 Two data flavors (drives the design)

Show-day TIME cells come in two shapes (both verified live):
- **Titled agenda** (Consultants, RPAS, FinTech): `"7:15am - Registration  8:00am - Leaders Breakfast …"` → a list of `{time, title}`.
- **Bare window** (RIA `"7:30am - 5:50pm"`, Asset-Mgmt `"8:00 AM - 5:30 PM"`): start–end span with no event titles.

The markdown export **flattens intra-cell newlines to spaces**, so the live cell `"7:15am - Registration\n8:00am - …"` reaches the parser as one space-joined string. Parsing therefore tokenizes by **clock-time boundaries**, not newlines.

### 1.2 Screenshot anomaly (non-blocking)

The reporting screenshot shows `Show 10/9 @ 8:45am`; live + fixtures show GS `Show = 10/8 @ 8:45am`, `Strike = 10/9 @ 4:30pm` (`fixtures/shows/raw/2025-10-consultants-roundtable.md:103-105`). The audit's original "Show 10/9" conflated Show with Strike's date. The fix targets live/fixture truth; the screenshot was an edited/transcribed sheet state. Not in scope to reconcile.

---

## 2. Resolved decisions (owner-ratified 2026-06-22)

| # | Decision | Choice |
|---|---|---|
| D1 | Carrier for the captured per-day agenda | Feed `runOfShow` (admin-only `shows_internal`, date-gated) — reuse the existing per-day render + privacy gate + caps. |
| D2 | Merge precedence (AGENDA grid vs DATES col4) | AGENDA grid wins per-day **where it has ≥1 titled entry**; DATES col4 fills days the grid leaves empty. No per-template branching. |
| D3 | Set anchor | Compose `dates.set` + `loadIn` → `"10/7 @ 9:00PM"`, sentinel-guarded. |
| D4 | Day-2 Show surface | Reshape `KeyTimeAnchors`/`KeyTimesStrip` to carry **per-day Show anchors** (Day-1 vs Day-2 distinct). |
| D5 | Bare-window days | **Anchor + window meta**: per-day Show anchor = first clock; render the full window (`"7:30am–5:50pm"`) as the `DayCard` meta line; no run-of-show list (nothing titled). No fabricated entries. |
| D6 | Today scope | **Today-focused**: Today's Key Times surfaces only the anchor(s) for today's date; the full per-day breakdown lives in the Schedule section. |
| D7 | 2nd/setup time | **Capture it**: preserve the second clock `extractClockTime` currently drops (e.g. "10:00PM SETUP", "Room Access 8:30 PM"). |
| D8 | Per-day Show anchor semantics | **First-call** (the day's first clock), not the GS/main-session line — robust across all observed formats; answers "when does day N start." |

---

## 3. Data model

### 3.1 `ScheduleDay` — reshaped `run_of_show` value

`shows_internal.run_of_show` is schemaless `jsonb`, so the value type is reshaped with **no schema migration**:

```ts
// was: Record<isoDate, AgendaEntry[]>
type ScheduleDay = {
  entries: AgendaEntry[];                          // titled run-of-show (may be [])
  showStart: string | null;                        // per-day first-call anchor (first clock)
  window: { start: string; end: string } | null;   // bare-window days only
};
type RunOfShow = Record<string, ScheduleDay>;       // keyed by ISO 'YYYY-MM-DD'
```

`AgendaEntry` is unchanged (`lib/parser/types.ts:320-327`: required `start` + `title`; optional `finish`/`trt`/`room`/`av`).

The `ShowRow.runOfShow?` and `ShowForViewer.runOfShow?` types (`types.ts:348,374`) change from `Record<string, AgendaEntry[]>` to `Record<string, ScheduleDay>`.

### 3.2 Backward compatibility (legacy decode)

Existing rows hold the old `Record<isoDate, AgendaEntry[]>` shape until re-sync. `decodeRunOfShow` (`lib/data/decodeRunOfShow.ts:32-95`) MUST accept **both**:
- New object shape → validate `entries[]` (existing per-entry title/start gates at `:74-82`), `showStart` (string|null, sentinel-guarded), `window` (`{start,end}` both strings sentinel-guarded, else null).
- **Legacy array shape** → wrap as `{entries: <decoded array>, showStart: null, window: null}`. The per-day Show anchor is still derived correctly at resolve time because `resolveKeyTimes` falls back to `entries[0].start` (§5.1) — so legacy **titled** days keep an accurate per-day anchor during the deploy→re-sync window, satisfying the "stays correct" claim (closes adversarial R2 finding 3). A legacy-array regression test (§8) pins this.
- Corrupt/partial → existing `corrupt` flag path (`:41`).

**Interim correctness is PARTIAL, not total (R4 finding 8 — honest scoping):** legacy **titled-grid** rows (which already have stored `entries`) keep an accurate per-day Show anchor pre-re-sync via the `entries[0].start` fallback. But the **DATES-column-only / bare-window shows this spec recovers** (the v4 shows — Consultants, RPAS, RIA, …) have **no pre-existing per-day data in storage** (the DATES TIME column was never parsed before), so until the forced re-sync (§7) persists the new parser output, those pages stay **DEGRADED** — room `show_time` fallback or omission, NOT the recovered per-day times. Therefore re-sync success is a **release gate** for the affected shows (§7), the interim is documented as degraded (not "correct"), and a stale null/legacy `run_of_show` row is NOT considered fixed until the new parser output is persisted.

### 3.3 `KeyTimeAnchors` reshape

```ts
// lib/crew/resolveKeyTimes.ts
type ShowAnchor = { date: string; label: string; time: string };   // date = ISO
export type KeyTimeAnchors = {
  set?: string;
  shows?: ShowAnchor[];   // was: show?: string  — ordered ASC by date
  strike?: string;
};
```

- Single show day → `shows` has exactly 1 element (renders like today: label `"Show"`, value the time). No multi-day regression.
- Multiple show days → 1 element per **visible** show day; `label` = `"Day N"` plus weekday/date (e.g. `"Day 1 · Wed 10/8"`). Final label copy fixed in the plan; both stack/row layouts use the same string.

---

## 4. Parser

### 4.1 New module `lib/parser/blocks/scheduleTimes.ts`

A pure function invoked from `lib/parser/index.ts` after `parseDates` + `parseAgenda`, producing `Record<isoDate, ScheduleDay>` from the DATES block's per-show-day TIME column (and the bare-window / titled split). Keyed by the same normalized ISO dates `parseDates` produces for `showDays`.

**Tokenizer (clock-boundary, not line-based):**
1. Find all clock tokens in the cell. Must tolerate observed variants: `7:15am`, `8:00 AM`, `4pm` (no colon), `5;30pm` (semicolon typo), `12:50pm`, leading/trailing space, and `GS:`/label prefixes. Normalize casing to uppercase AM/PM, collapse internal whitespace (mirrors `extractClockTime`'s normalization at `dates.ts:268-271`).
2. For each token, the **title** = text from after the token up to the next token, with a leading separator (`-`, `–`, `:`, whitespace) stripped.
3. **Window detection:** exactly 2 tokens, both with empty titles, with only a separator between them → `window = {start: token1, end: token2}`, `entries = []`. (Handles `"7:30am - 5:50pm"`, `"8:00 AM - 5:30 PM"`.)
4. Otherwise → titled list: each token whose stripped title is **non-empty and non-sentinel** (`shouldHideGenericOptional`, `lib/visibility/emptyState.ts`) becomes an `AgendaEntry {start, title}`. Tokens with empty/sentinel titles are dropped from `entries` but still count toward `showStart` (subject to the leading-start rule below).
5. **`showStart` = the first clock ONLY when it is a LEADING START** — i.e. nothing precedes it in the cell except an optional short label token ending in `:` (e.g. `"GS:"`) and whitespace. A clock that is **preceded by an ellipsis/placeholder (`...`, `TBD`/`TBA`/`N/A`) or a leading separator with no start before it** is an END / unknown-start marker and is **NOT** promoted to `showStart`. In that case `showStart = null`, `window = null`, and the parser emits **`SCHEDULE_TIME_UNPARSED`** (§9); `resolveKeyTimes` then falls back to the room `show_time` for that day's anchor (or omits it). No clock at all → `showStart = null`.
6. **Terminal-event guard (closes adversarial R5 finding 9).** The `showStart` candidate is **NOT** promoted if its associated title matches a terminal-event pattern — `/\b(conclude|concludes|concluded|ends?|ended|adjourn|wrap|dismiss|load\s*out|strike|depart)\b/i` (deliberately excludes `clos*` to avoid false-positives on `"Closing Lunch"`). A day whose only/first titled token is terminal (e.g. `"4:15pm - Meeting Concludes"`, Fixed Income Trading SHOW DAY 2, `fixtures/shows/raw/2025-10-fixed-income-trading-summit.md:23`) **keeps the entry** (it is a valid run-of-show item) but yields `showStart = null` → anchor via room `show_time` fallback. No `SCHEDULE_TIME_UNPARSED` fires when a valid entry exists. In multi-token days the first token is chronologically a start, so this guard only changes single-/leading-terminal cases.

**Edge cases (guard conditions):**
- Empty/whitespace col4 → `{entries:[], showStart:null, window:null}` (no key emitted, or emitted-empty — see §5.5 anchor-floor).
- Single **terminal** titled token (`"4:15pm - Meeting Concludes"`) → `entries:[{start:"4:15pm", title:"Meeting Concludes"}]`, **`showStart:null`** (terminal-event guard, step 6), `window:null`; anchor falls back to room `show_time`.
- Single **non-terminal** titled token (`"8:45am - General Session"`) → `entries:[{start:"8:45am", title:"General Session"}]`, `showStart:"8:45am"`, `window:null`.
- Leading-start fragment (`"GS: 8:00 AM -"`, Redefining-FI SHOW DAY 1) → label `"GS:"` stripped, `"8:00 AM"` is a leading start, trailing `-` with no end → `showStart:"8:00 AM"`, `window:null`, `entries:[]`. DayCard meta shows the single showStart time (§5.3).
- **End-only / unknown-start fragment (`"GS: ... - 6:00 PM"`, Redefining-FI SHOW DAY 2, `fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md:208`)** → the `...` placeholder precedes the only clock, so `6:00 PM` is an END, not a start → `showStart:null`, `window:null`, `entries:[]`, **`SCHEDULE_TIME_UNPARSED` emitted**. The day still renders in the schedule list (from `dates.showDays`) with the room-`show_time` anchor fallback (or none); it is NOT persisted as a ScheduleDay (no usable time — see §7 predicate). This is the high-cost-misdisplay case the leading-start rule prevents.
- `>` 5 day-rows or `>` per-day entry cap: §6 caps.

### 4.2 Set-row second-time capture (D7)

`extractClockTime` (`dates.ts:263-272`) → add `extractClockTimes(raw): string[]` returning **all** clock tokens in document order. `parseDates` set/travel_set cases (`dates.ts:207-221`) keep `loadIn = times[0]` (unchanged precedence: explicit `set` overrides `travel_set`) and add `dates.setupTime = times[1] ?? null` (free-text, e.g. `"10:00PM"` / `"8:30 PM"`). `dates.loadIn` semantics + precedence + rooms-independence are **unchanged** (`resolveKeyTimes.ts:54-59`; ratified Phase-1 change-1).

`ShowRow.dates` gains `setupTime?: string | null` (rides existing `shows.dates` jsonb, no migration; `dates` column has no CHECK, `supabase/migrations/20260501000000_initial_public_schema.sql:12`).

### 4.3 Merge happens IN THE PARSER — single carrier (closes adversarial R2/R3 finding 6)

The D2 merge MUST run in the parser (`lib/parser/index.ts`, right after `parseAgenda` + the new `parseScheduleTimes`), **not** in `applyParseResult`. Only **one** `runOfShow` field crosses the parse bridge — `parseAgenda` → `agendaResult.runOfShow` spread at `lib/parser/index.ts:425` → `lib/sync/enrichWithDrivePins.ts:287` → `lib/sync/applyParseResult.ts:145`. If both the AGENDA-grid result and the DATES-column result reached apply as one collapsed field, apply could not tell which source an entry came from, so the merge would be a guess. Therefore:

- `parseAgenda` continues to produce its grid `Record<iso, AgendaEntry[]>`; `parseScheduleTimes` produces `Record<iso, ScheduleDay>` from DATES col4.
- **`index.ts` merges them into ONE `runOfShow: Record<iso, ScheduleDay>`** (D2: grid wins per day when it has ≥1 titled entry — lifted to `{entries: gridEntries, showStart: gridEntries[0].start, window: null}`; else the DATES-column `ScheduleDay`). This single, already-merged, source-unambiguous value is what crosses `ParsedSheet`/`ParseResult` (`lib/parser/types.ts:348,374`, retyped to `Record<iso, ScheduleDay>`) → `enrichWithDrivePins` → apply.
- `applyParseResult` receives the already-merged value and does ONLY persistence: the confirmed predicate + full-replace + `AGENDA_DAY_EMPTIED` (§7). It performs NO source merge.

---

## 5. Display

### 5.1 `resolveKeyTimes` — new signature + precedence

`resolveKeyTimes(show, rooms)` → `resolveKeyTimes(show, rooms, runOfShow, dateRestriction)`. The resolver now owns ALL key-time gating in one place (single source), computing the visible show-day set internally via a shared `agendaDisplay` helper (`showDays ∩ DateRestriction`; the SAME intersection `ScheduleSection.tsx:121-128` uses for its day list — extracted to `agendaDisplay` so the two can't drift, enforced by `agendaDisplay-single-source.test.ts`):

- **`unknown_asterisk` → return `{}` (entire strip suppressed: no set/shows/strike, zero date text).** This FIXES a pre-existing leak that the current code has and that the audit change would otherwise widen: today `resolveKeyTimes(show, rooms)` is called unconditionally (`TodaySection.tsx:214`) and the strip renders in Mode B for `unknown_asterisk`, leaking the room-sourced Show/Strike **dates** (`"10/8 @ 8:45am"`, `"10/9 @ 4:30pm"`) — a violation of the ratified `unknown_asterisk`-leaks-zero-dates invariant. Returning `{}` aligns the strip with `ScheduleSection`'s `unknown_asterisk` early return (R4 finding 7).
- **`explicit` / `none` → `set` + `strike` are SHOW-WIDE anchors** (rendered for assigned crew; ratified Phase-1, see §13.8), and `shows` is gated to the **visible** show days only (R3 finding 5).

- **`set`** (D3): if `dates.loadIn` non-sentinel → compose with `dates.set`: `${formatMD(dates.set)} @ ${loadIn}` (e.g. `"10/7 @ 9:00PM"`). If `dates.set` absent → bare `loadIn` (today's behavior). Else GS room `set_time` (unchanged fallback). Compose ONLY when the clock portion is non-sentinel (a `"10/7 @ TBD"` still resolves absent via `isAbsentTime`, `resolveKeyTimes.ts:16-21`).
- **`shows`** (D4/D8): for each day in **`visibleShowDays`** (NOT the raw calendar), push `{date, label, time}` where the per-day **anchor resolution precedence** is `time = runOfShow[date].showStart ?? runOfShow[date].window?.start ?? runOfShow[date].entries[0]?.start`. The `entries[0].start` fallback is load-bearing: it gives **legacy-wrapped** rows (entries-only, `showStart:null` per §3.2) and any titled day a correct per-day anchor (closes R2 finding 3). If a **visible** day is absent from `runOfShow` (no per-day data) but the GS room carries a `show_time`, fall back to the room anchor (preserves single-day shows with no DATES col4); if neither, omit that day's anchor. Because the iteration domain is `visibleShowDays`, a gated-out day can NEVER reach the room fallback — closing the R3 finding-5 leak where a Day-1-only viewer would otherwise see Day 2 via the room `show_time`. Sort ASC by date. Empty → omit `shows`.
- **`strike`**: unchanged (selected GS room `strike_time`, sentinel-guarded).
- **All-absent → `{}`** (strip omitted; `resolveKeyTimes.ts:53-56`).

**Consumers updated** for `show?: string` → `shows?: ShowAnchor[]`:
- `components/crew/primitives/KeyTimesStrip.tsx` (renderer, §5.2)
- `components/crew/sections/TodaySection.tsx` (call + render; today-filter §5.4)
- `components/right-now/buildRightNowContext.ts:78-81` — **explicit RightNow per-day contract (closes R2 finding 4).** Today `callTime = anchors.show` (single string, `:80`) and the call is 2-arg `resolveKeyTimes(show, rooms)` (`:78`); with `anchors.shows` now a **dated array**, a single `callTime` cannot pick the right day. The builder passes the new 3rd + 4th args (gated `runOfShow`, `dateRestriction` — it already receives `dateRestriction` in its opts) to `resolveKeyTimes`, so for `unknown_asterisk` all anchors are `{}` → `loadInTime`/`callTime`/`strikeTime` all null (no RightNow date leak, consistent with §5.6 gate 3). It **carries the dated per-day Show anchors into `RightNowContext`** (new field `showAnchors: Array<{date, time}>`). Because the live "now" is known **client-side** — `RightNowHero` already computes the show-tz `todayIso` (`components/crew/RightNowHero.tsx:215`) — `RightNowHero` selects the anchor whose `date === todayIso` for the call-time display; when "now" is not a show day, it falls back to the existing nearest/relevant behavior. `loadInTime` (`anchors.set`, `:79`) and `strikeTime` (`anchors.strike`, `:81`) are unchanged single anchors; confirm the composed-Set "Load-in:" copy still reads acceptably. (`RightNowHero` is a UI file → Opus + impeccable gate.)
- `components/crew/sections/ScheduleSection.tsx` (call + "Daily call times" card)
- `app/admin/dev/source-link-dim/page.tsx` (type-shape consumer)

### 5.2 `KeyTimesStrip`

Renders `set`, then **N** `shows[]` rows, then `strike`. Per-row inv6 contract preserved (first `<span>` = label, last `<span>` = value; `KeyTimesStrip.tsx:73-81`).
- **`"stack"`** (Schedule narrow / mobile): vertical, `Set` / `Show · Wed 10/8` / `Show · Thu 10/9` / `Strike`.
- **`"row"`** (Today wide / Mode A banner): equal-width flex children, hairline-divided.

### 5.3 `DayCard` meta (D5)

`ScheduleSection` passes `DayCard.meta`:
- Bare-window day → meta = `"7:30am–5:50pm"` (the window).
- Fragment day (showStart only, no window, no entries) → meta = the single showStart time.
- Titled day → no meta; the existing `RunOfShowList` renders below (entries).
- Non-show-day (travel/set) → no meta (unless set day shows load-in; out of scope — set day already covered by Key Times).

### 5.4 `ScheduleSection` / `TodaySection`

- **Schedule** "Daily call times" card → `KeyTimesStrip` with **all** visible show days' anchors. Day list: each `DayCard` gains meta (window) and/or `RunOfShowList` (entries), both inheriting the date-restriction gate. One-sided-collapse logic (`ScheduleSection.tsx` `rightHasContent`) unchanged.
- **Today** (D6): filters `anchors.shows` to today's ISO date (`todayIsoInShowTimezone`); if today is not a show day, `shows` is empty and only `set`/`strike` (today-relevant) render. `unknown_asterisk` Mode A still forces zero leak (`TodaySection` Mode A early return).

### 5.5 Dimensional Invariants (Tailwind v4 — `.flex` ≠ `align-items: stretch`)

| Parent → child | Relationship | Guaranteeing class/style |
|---|---|---|
| `KeyTimesStrip` row-layout container → each anchor cell | equal width across N cells | `min-[720px]:flex-1` on each cell |
| row-layout container → hairline dividers | full-height rules between cells | `min-[720px]:divide-x min-[720px]:divide-border`, `first:pl-0/last:pr-0` |
| `DayCard` row → `self-stretch` vline | vline fills the taller (meta-bearing) row height | `self-stretch` on the vline span (`DayCard.tsx:87`) — must still fill when meta adds height |
| `DayCard` → date badge | fixed 50px column regardless of meta | `w-12.5 shrink-0` (`DayCard.tsx:72`) |
| Schedule split-wide grid → columns | natural height (not stretch) | `min-[720px]:items-start` (DESIGN.md 2026-06-21 amendment) |

All verified by a **real-browser** `getBoundingClientRect` assertion (`tests/e2e/crew-layout-dimensions.spec.ts`); jsdom is insufficient. Baselines regenerated via the **amd64 docker `screenshots-regen` workflow_dispatch**, never local arm64 (byte-comparison gate).

### 5.6 Privacy / date-restriction

Three gates:
1. **`runOfShow` data** (`showStart`/`window`/`entries`) lives inside `run_of_show`, which `getShowForViewer` reads service-role and **intersects with the viewer's `DateRestriction` (`showDays ∩ allowed`) at read time** (`lib/data/getShowForViewer.ts:524-588`). `resolveKeyTimes` receives the post-intersection projection.
2. **The per-day Show anchors + room `show_time` fallback** (§5.1) are gated by `resolveKeyTimes` iterating the **visible show days (`showDays ∩ DateRestriction`), never the raw calendar** — so a gated-out day can NOT re-leak via the room fallback (R3 finding 5). Gate 1 alone is insufficient *because* the fallback reads room data, not `runOfShow`; gate 2 closes that path.
3. **`unknown_asterisk` → the ENTIRE strip is suppressed** (`resolveKeyTimes` returns `{}`): no `set`, no `shows`, no `strike`, zero date text (R4 finding 7). This both honors the ratified zero-leak invariant and **fixes the pre-existing leak** where the Today strip rendered room-sourced Show/Strike dates to `***` viewers (`TodaySection.tsx:214` called the resolver unconditionally).

**Set/Strike scope (ratified Phase-1, §13.8):** for `explicit`/`none` viewers, `set` (load-in) and `strike` are **show-wide** anchors rendered for assigned crew — they are intentionally NOT per-show-day-gated (crew perform load-in/strike regardless of which show days they cover; restricted crew's `DateRestriction.days` already include their set/strike days, e.g. "Calvin Saller (10/7 and 10/9 ONLY)"). Only the NEW per-day **Show** breakdown is date-gated. Every free-text field routes through `shouldHideGenericOptional`/`resolveOptionalField` (`lib/crew/agendaDisplay.ts:26-31,43-45`).

### 5.7 Transition Inventory

Every affected surface is a **synchronous Server Component** — `KeyTimesStrip`, `DayCard`, `ScheduleSection`, `TodaySection` carry no `'use client'`, no `framer-motion`, no `AnimatePresence`. The strip is fixed per server render; differences across viewers/days/show-counts are distinct renders, not in-page animated transitions. The only motion on the crew page is the page-level route transition (M12.11), which is unchanged.

| State pair | Treatment |
|---|---|
| KeyTimesStrip: zero anchors ↔ set/strike-only ↔ single-show ↔ multi-show (1↔N rows) | instant — SSR render fork, no animation |
| DayCard: meta present ↔ absent (window vs none) | instant — SSR render fork |
| ScheduleSection: per-day `RunOfShowList` present ↔ absent | instant — SSR render fork (existing behavior, unchanged) |
| Today Key Times: today-filtered (`shows` 0/1) ↔ Schedule full (`shows` N) | instant — distinct renders, not a runtime transition |

No new ternary render or conditional block gains an `AnimatePresence`/`exit`; all are deliberately instant. Compound transitions (e.g. show-count change while `unknown_asterisk`) are N/A — `unknown_asterisk` short-circuits before any anchor renders.

---

## 6. Cap / truncation behavior

- **Show anchor rows:** max **5** in `KeyTimesStrip`; beyond that render first 4 + a `"+N more"` row (realistic max is 3 — FinTech — but `showDays` is unbounded so the boundary is stated). Schedule "Daily call times" applies the same cap.
- **Run-of-show entries per day:** existing 200-entry / 32 KB storage caps + `capDay` preserved (`agenda.ts:310-348`); display cap `RUN_OF_SHOW_DISPLAY_CAP = 20` per day unchanged (`agendaDisplay.ts:16`).
- **`window` strings:** title-style truncation not applied (short by construction); sentinel-guarded only.

---

## 7. Persistence, merge & re-sync

- **Merge runs in the PARSER, not apply (§4.3, closes R3 finding 6).** `lib/parser/index.ts` emits a single already-merged `runOfShow: Record<iso, ScheduleDay>` (D2: grid wins per day with ≥1 titled entry, else DATES-column `ScheduleDay`). `applyParseResult` performs NO source merge — it only persists.
- **NEW confirmed-day predicate (closes adversarial R1 finding 1) in `applyParseResult.ts:145-156`:** the current apply persists only days where `entries.length > 0` (`:153-155`), which would silently DROP every bare-window / showStart-only day (RIA, Asset-Mgmt) — exactly the data this spec recovers. The predicate MUST become: **persist a `ScheduleDay` when `entries.length > 0 OR showStart != null OR window != null`** (a day with none of the three is "empty" and dropped). The `Object.fromEntries(...).filter(...)` at `:153-155` changes to this predicate; `runOfShowToStore = null` only when ZERO days qualify.
- **`AGENDA_DAY_EMPTIED` reconciliation (`applyParseResult.ts:160-167`):** the "emptied" warning currently fires when a previously-stored day is now present-as-`[]`. With `ScheduleDay`, "emptied" means a prior-stored day is now **fully empty** (`entries.length === 0 AND showStart == null AND window == null`). A day that lost its titled entries but retained a `showStart`/`window` is NOT emptied (it still has a usable time). The prior-comparison reads `prior?.[iso]` as a `ScheduleDay` (legacy-array prior wrapped per §3.2).
- **Confirmed-only full-replace (D-2) + 200-entry/32 KB caps preserved** (`capDay`, `agenda.ts:317`); the reshape changes WHICH days qualify, not the full-replace/no-stale-data contract.
- **Write path** (`lib/sync/runScheduledCronSync.ts:1370-1394`, `upsertShowsInternal`): writes the reshaped value to the same `run_of_show` jsonb column — **no SQL change**. `shows.dates` write (`:1029`) carries the new `setupTime` field for free (jsonb).
- **No migration** → no `validation-schema-parity` delta. **No advisory-lock change** — rides the single existing JS-wrapper holder (`lib/sync/lockedShowTx.ts:59/61`); no new/nested holder (advisory-lock topology unchanged).
- **Forced re-sync is a RELEASE GATE (R4 finding 8), not fire-and-forget:** parser changes affect only future parses, and the recovered DATES-column shows have no pre-existing stored per-day data (§3.2), so they stay degraded until re-synced. The deployment step re-syncs the 7 live shows (+ VB/DRILL copies) via the existing retry/`requires_resync` path AND **verifies each affected show's `shows_internal.run_of_show` is repopulated with the new `ScheduleDay` shape** before the rollout is considered complete; a show whose re-sync fails stays explicitly flagged degraded (it is NOT silently "fixed"). `decodeRunOfShow` legacy-array tolerance (§3.2) prevents a hard break during the window but does not itself recover the new data.

---

## 8. Tests & meta-tests

**Anti-tautology / negative-regression mandatory** (assert against the data source, not the rendering container; derive expectations from fixture dimensions; stash-the-fix to prove the test fails).

- **Parser:** new `tests/parser/blocks/scheduleTimes.test.ts` — tokenizer, window-vs-list detection, every observed variant (`4pm`, `5;30pm`, `GS:` prefix, AM/PM casing), both flavors, empty/sentinel, single-token, `showStart` derivation. **Leading-start vs end-only (R1 finding 2):** `"GS: 8:00 AM -"` → `showStart:"8:00 AM"`; `"GS: ... - 6:00 PM"` (Redefining-FI SHOW DAY 2) → `showStart:null` + `SCHEDULE_TIME_UNPARSED`, asserting the trailing `6:00 PM` is NOT promoted to a start. **Terminal-event guard (R5 finding 9):** `"4:15pm - Meeting Concludes"` (Fixed Income Trading SHOW DAY 2 fixture) → entry kept, `showStart:null`, NO `SCHEDULE_TIME_UNPARSED`; and `"8:45am - General Session"` → `showStart:"8:45am"` (non-terminal single token still promotes). Negative-regression: stash the terminal guard → the meeting-concludes time must wrongly become `showStart`, proving the test pins it. Revise `tests/parser/blocks/dates.test.ts` loadIn suite (the suite that currently asserts SHOW DAY TIME fills nothing — must flip to assert capture + `setupTime`). `tests/parser/parseAgenda.test.ts` — encode the D2 merge precedence (it currently pins parseAgenda as the sole runOfShow source and uses consultants as an all-`[]` fixture).
- **Data:** `tests/data/decodeRunOfShow.test.ts` — new `ScheduleDay` shape **+ legacy-array negative-regression** (old data still decodes). `tests/data/getShowForViewerRunOfShow.test.ts` — date-intersection holds on the new shape; `showStart`/`window` gated. **Legacy-row anchor regression (R2 finding 3):** a legacy-array day (entries-only, `showStart:null` after wrap) yields a correct per-day Show anchor from `entries[0].start` through `resolveKeyTimes` — proving the deploy→re-sync window stays correct. **Rollback / version-skew (R5 finding 10, §14):** (a) the CURRENT (old) decoder shape — `decodeRunOfShow.ts:56-59` — applied to a `ScheduleDay` object yields `corrupt:true` + day-skip and **does NOT throw** (pins the graceful rollback blast-radius: degraded-to-pre-fix, not a crash); (b) the downgrade converter round-trips a `ScheduleDay` map → legacy `Record<iso, AgendaEntry[]>` (entries only, drops showStart/window) so a pre-rollback downgrade restores old-decoder-valid data.
- **Sync/apply (R1 finding 1):** `tests/sync/applyParseResult*.test.ts` (or the existing apply-core suite) — a **bare-window day** (RIA `7:30am–5:50pm`, `entries:[]` + `window`) and a **showStart-only day** (`entries:[]` + `showStart`) BOTH **survive storage** (asserts the new persist predicate, not `entries.length>0`); a **fully-empty day** (no entries/showStart/window) is dropped; `AGENDA_DAY_EMPTIED` fires only when a prior-stored day becomes fully empty, NOT when it retains a `showStart`/`window`. Negative-regression: stash the predicate change → the bare-window day must vanish from storage, proving the test pins it.
- **Parser merge bridge (R3 finding 6):** `tests/parser/parseSheet*.test.ts` — a fixture with BOTH a populated AGENDA grid day AND a DATES-column day proves D2 in the parser: grid-titled day keeps grid entries (not clobbered by DATES col4), DATES-only day is recovered, and the single merged `runOfShow: Record<iso, ScheduleDay>` survives `parseSheet` → `enrichWithDrivePins` (`:287`) → `applyParseResult` (`:145`) without source ambiguity. Assert against the merged parser output (data source), not a rendered container.
- **Display:** `tests/crew/resolveKeyTimes.test.ts` — per-day `shows[]`, Set compose, sentinel guards, `loadIn` precedence + rooms-independence preserved, single-day back-compat, all-absent → `{}`. `KeyTimesStrip` — N-row render, inv6 first/last span, both layouts, the 5-row cap. `ScheduleSection.{anchorFloor,agenda,caps,fieldGuards}` extended; **anchor-floor negative-regression** (no times → zero Phase-2 markup) must still hold with the updated wrapper-child shape. `TodaySection.modeA` no-leak + today-filter. `buildRightNowContext` `shows[]` adaptation **+ RightNow Day-2 selection regression (R2 finding 4):** a 2-show-day fixture with distinct Day-1/Day-2 anchors, "now" = Day 2 → the RightNow call-time shows **Day 2's** anchor, not Day 1's / an arbitrary first element (assert via `RightNowHero` selecting by show-tz `todayIso`, derived from the fixture, not hardcoded).
- **Privacy — date-restricted viewer (R3 finding 5):** an **explicit Day-1-only** viewer on a **multi-day** show **with a GS room `show_time` present** → `resolveKeyTimes`/`ScheduleSection`/`TodaySection`/`buildRightNowContext` emit **NO Day-2 Show anchor** (and no Day-2 label/date) via the room fallback. Assert `shows` contains only Day 1; stash the visible-day gate → Day 2 must reappear, proving the test pins the leak fix. The SAME explicit viewer **still sees show-wide `set`/`strike`** (ratified Phase-1, §13.8) — assert they render.
- **Privacy — `unknown_asterisk` whole-strip suppression (R4 finding 7):** a `***` viewer → `resolveKeyTimes` returns `{}` and the Today + Schedule strips render **NO `set`, `shows`, OR `strike`** and **no date/time text** (assert the absence of all anchor labels AND of the room-sourced Show/Strike date strings). Negative-regression: stash the `unknown_asterisk → {}` branch → the strike date string must reappear, proving the test pins the pre-existing-leak fix. Covers Today (`TodaySection.tsx:214` call site) and `buildRightNowContext` (loadIn/call/strike all null for `***`).
- **Real-browser:** `tests/e2e/crew-layout-dimensions.spec.ts` — DayCard-meta height + `self-stretch` vline, KeyTimesStrip equal-width row cells, 50px badge, `items-start`, 1.6fr/1fr.

**Meta-tests (declared per project rule):**
- `tests/components/tiles/_metaSentinelHidingContract.test.ts` — register the new free-text fields (`window.start`, `window.end`, `showStart`, anchor `time`) so each is wired through `shouldHideGenericOptional`, or add the row + reason.
- `tests/crew/agendaDisplay-single-source.test.ts` — any new shared per-day helper (e.g. a window-formatter, today-filter) lives in `lib/crew/agendaDisplay.ts` (Today + Schedule import the same predicate; no local copy).
- **Advisory-lock topology:** `tests/auth/advisoryLockRpcDeadlock.test.ts` — **no change** (no new lock holder); declared explicitly.
- **PostgREST DML lockdown:** no new RPC-gated table; no change.

---

## 9. Spec amendments & catalog

- **Phase-1 design (`docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md`):** amend the two ratified claims that the live sheets disprove — the §4.4-area "Multi-day shows carry one show-wide Set/Show/Strike (sheets store one value, not per-day)" and the out-of-scope list item "Per-day call times (sheets store one show-wide value)." Replace with: per-day Show/agenda IS captured from the DATES TIME column (cite live-MCP recon + `fixtures/shows/raw/2025-10-consultants-roundtable.md:62-67`), superseding the premise. Per invariant 7, this is an explicit ratified amendment, not a silent fix.
- **§12.4 catalog (3-part lockstep — REQUIRED, not conditional):** add parse-warning `SCHEDULE_TIME_UNPARSED`, emitted when a SHOW DAY TIME cell **has content but yields no `showStart`, no `window`, and no `entries`** — the end-only/unknown-start case (`"GS: ... - 6:00 PM"`, R1 finding 2) makes this warning load-bearing, so it ships. Requires, in one commit (`x1-catalog-parity`): (a) master-spec §12.4 prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, (b) `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`, (c) the matching `lib/messages/catalog.ts` row. Follows the established §12.4 lockstep + internal-code-enums regen (`pnpm gen:internal-code-enums` if the warning enters the internal warning enum).

---

## 10. Flag lifecycle

No new boolean config flags or toggles introduced. (`dates.setupTime` and the per-day structure are data fields, not flags; each has a parser write path → jsonb storage → `getShowForViewer` read → display consumer, all enumerated above.)

---

## 11. Out of scope

- GS/main-session-start anchor semantics (D8 chose first-call; not revisited).
- v1 2-col DATES TIME parsing (v1 has no TIME column; its schedule rides the AGENDA grid, which already works — D2 merge keeps it correct).
- Reconciling the §1.2 screenshot anomaly (edited sheet state).
- Per-crew flight surfacing, client-contact visibility, v2 sheet template (pre-existing backlog, unrelated).
- Any change to room `set_time`/`show_time`/`strike_time` parsing (rooms block untouched).

---

## 12. Files touched (map)

| Layer | File(s) |
|---|---|
| Parser | `lib/parser/blocks/scheduleTimes.ts` (new), `lib/parser/blocks/dates.ts` (extractClockTimes + setupTime), `lib/parser/index.ts` (wire + **D2 merge** into single `runOfShow: Record<iso, ScheduleDay>`, §4.3), `lib/parser/types.ts` (ScheduleDay, dates.setupTime, `ParsedSheet`/`ParseResult.runOfShow` retype) |
| Persistence | `lib/sync/applyParseResult.ts` (persist predicate + `AGENDA_DAY_EMPTIED` reconcile — NO source merge), `lib/sync/enrichWithDrivePins.ts` (`ScheduleDay` passthrough typing), `lib/sync/runScheduledCronSync.ts` (passthrough, no SQL change), downgrade converter `ScheduleDay → AgendaEntry[]` for rollback (§14, new helper + script) |
| Projection | `lib/data/decodeRunOfShow.ts` (ScheduleDay + legacy tolerance), `lib/data/getShowForViewer.ts` (type + intersection on new shape) |
| Key times | `lib/crew/resolveKeyTimes.ts` (KeyTimeAnchors reshape + signature + Set compose), `lib/crew/agendaDisplay.ts` (shared helpers) |
| UI | `components/crew/primitives/KeyTimesStrip.tsx`, `components/crew/primitives/DayCard.tsx` (meta wired), `components/crew/sections/ScheduleSection.tsx`, `components/crew/sections/TodaySection.tsx`, `components/right-now/buildRightNowContext.ts` (+ `showAnchors`), `components/crew/RightNowHero.tsx` (Day-2 anchor selection), `app/admin/dev/source-link-dim/page.tsx` |
| Tests | per §8 |
| Docs | this spec + Phase-1 amendment (§9) |

UI files (`components/**`, `app/**` non-api) → Opus + impeccable v3 dual-gate (critique + audit) before milestone close (invariant 8).

### 12.1 N/A matrices (declared explicitly per project rule)

- **Tier × domain completeness matrix:** N/A — this change touches no surcharge tiers/domains and no DB tier columns; it is parser + jsonb-value-shape + display only.
- **CHECK / enum migration matrix:** N/A — no CHECK constraint or enum is added or altered (`shows.dates` and `shows_internal.run_of_show` are schemaless `jsonb` with no CHECK; `initial_public_schema.sql:12`). Backward compatibility is handled in code (`decodeRunOfShow` legacy tolerance, §3.2), not via a DB migration.
- **Advisory-lock topology:** N/A change — no new/nested holder (§7).

---

## 13. Watchpoints — do NOT relitigate (pre-load the reviewer)

Cite these to the adversarial reviewer; each is a ratified contract, not an oversight:

1. **Confirmed-only full-replace run-of-show (D-2).** Non-confirmed/empty shapes coarsen to the anchor strip; no preserve-last-known-good. Reopening this reopens the R17/R21/R22 stale-data class. The reshape preserves it (`applyParseResult.ts:136-169`).
2. **`run_of_show` home is admin-only `shows_internal`, NOT crew-readable `shows` (D-3 + DML lockdown `20260619000000`).** Per-day-gated data does not move to `shows`. The reshape keeps it in place.
3. **`loadIn` precedence + rooms-independence (Phase-1 change-1, wp-23).** `dates.loadIn` wins over room `set_time`; the Set anchor renders even with null rooms. The D3 compose preserves both (`resolveKeyTimes.ts:54-59`).
4. **Split-wide grids use `items-start` (natural height), deliberate** (DESIGN.md 2026-06-21 owner amendment) — not a missing `items-stretch`.
5. **Per-day Show anchor = first-call (D8), intentionally NOT the GS/main-session time.** The displayed Day-1 number shifting from `8:45am` (room GS) to `7:15am` (first call) is by design; GS-line text-matching was rejected as fragile.
6. **No migration is correct, not an omission.** The jsonb value reshape needs no DDL; backward compat is the `decodeRunOfShow` legacy-array path (§3.2) + forced re-sync (§7), so `validation-schema-parity` has no delta.
7. **Timing contracts live in the redesign Phase-1/Phase-2 specs, not master-spec §4.4** (which is the LEAD/COI privacy split). Code comments citing "§4.4" point at the redesign specs.
8. **Set/Strike are SHOW-WIDE anchors for assigned (`explicit`/`none`) crew — ratified Phase-1, NOT per-day-gated.** The ratified Phase-1 design renders show-wide Set/Show/Strike to assigned crew (`docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md:138`); restricted crew's `DateRestriction.days` already include their set/strike days. This spec gates only (a) `unknown_asterisk` → the **whole** strip suppressed (closing the pre-existing `***` room-date leak), and (b) the NEW per-day **Show** breakdown → visible show days. It deliberately does NOT add per-day date-gating to Set/Strike for explicit viewers — that would change ratified behavior. Do not relitigate gating Set/Strike per visible day for explicit viewers (R4 finding 7 was resolved by suppressing the strip for `***` only).

---

## 14. Rollback & version-skew (closes adversarial R5 finding 10)

The `run_of_show` value reshape (§3.1) is **forward-compatible** (new code reads legacy `AgendaEntry[]` AND new `ScheduleDay`, §3.2) but **not backward-compatible** (the CURRENT decoder rejects non-array day values — `lib/data/decodeRunOfShow.ts:56-59`). After the forced re-sync writes `ScheduleDay` objects, a rollback to old code must be safe:

- **Graceful blast radius (verified, not assumed):** the old decoder treats a `ScheduleDay` object as `corrupt:true` + **day-skip — it does NOT throw** (`:57-59`). So a rollback degrades each re-synced show to **pre-fix behavior** (the Schedule day list still renders from `dates.showDays`; Key Times uses the room anchors; no per-day agenda) plus a transient `run_of_show` corrupt/`tileError` admin signal. No crash, no hard data loss (`run_of_show` is regenerated on every sync). A §8 test pins this corrupt-skip-not-throw contract on the old decoder shape.
- **Preferred sequencing (expand/contract):** ship the tolerant decoder (reads both shapes) so it is live **before** any `ScheduleDay` is written, so a rollback lands on a tolerant reader. In this repo's single-deploy model the tolerant decoder ships in the same PR as the writer; the graceful-degrade contract above bounds the one-deploy rollback risk.
- **Tested downgrade path:** provide a one-shot converter `ScheduleDay map → legacy Record<iso, AgendaEntry[]>` (entries only; drops `showStart`/`window`) — run it (or simply re-run the OLD sync, which regenerates legacy arrays per show) to clear corrupt signals before/with a deliberate rollback. §8 round-trips this converter.
- **Release gate (§7) + this section together:** forward rollout is gated on re-sync repopulation; backward rollout is gated on the graceful-degrade contract (emergency) or the downgrade converter (clean).
