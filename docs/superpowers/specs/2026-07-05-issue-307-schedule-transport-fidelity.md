# Spec: Bug #307 — schedule & transport parse-fidelity fixes

**Date:** 2026-07-05
**Slug:** `issue-307-schedule-transport-fidelity`
**Source:** GitHub issue #307 (Bug report: admin — RFI & PC Chicago), reporter edweiss412@gmail.com
**One PR closing #307.**

## Problem statement

Bug #307 was filed from the admin wizard step-3 review of show **RFI & PC Chicago**
(drive file `1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg`). Doug flagged two issues; a
third is the auto-generated warning that accompanied the report. All three were reproduced
against the live sheet (INFO tab) using the real parser functions.

Live source data (INFO tab, DATES + TRANSPORTATION blocks):

| Cell | Content | Meaning |
| ---- | ------- | ------- |
| E16 (SHOW DAY 1, 5/13) | `GS: 8:00 AM - ` | start present, end missing |
| E17 (SHOW DAY 2, 5/14) | `GS: ... - 6:00 PM` | start is literal `...` placeholder, only the end is real |
| D41:D43 | `Eric Carroll`, `Eric Weiss`, `Connor Hester` | billing/cost-owner scratch names |
| E39/E41:E43 | `$3,043.08`, `$938.80`, `$960.99`, `$1,143.29` | cost scratch |

### Issue 1 — "Missing 5/13 start time in crew schedule" (admin-preview-only defect)

The parser is **correct**: E16 → `{ entries: [], showStart: "8:00 AM", window: null }`, and
the crew page (`components/crew/sections/ScheduleSection.tsx:294`) surfaces `showStart` as day
meta, plus `resolveKeyTimes` yields the `Day 1 · Tue 5/13 → 8:00 AM` anchor. The defect is confined
to the **admin wizard step-3 breakdown**: `ScheduleBreakdown`
(`components/admin/wizard/step3ReviewSections.tsx:900`) passes **only**
`entries={arr(ros[iso]?.entries)}` to `ScheduleDayRow` (`:831`, call site `:925`), dropping
`showStart`/`window`. A "fragment day" (a show day whose TIME cell yields a start or bare window
but zero titled entries) therefore renders in the admin preview with the date header and **no
time** — exactly what Doug saw (one day, 5/13, no start time).

### Issue 2 — "Transport picked up scratch cells D39:E43" (parser defect)

`extractAssignedNames` (`lib/parser/blocks/transport.ts:598`), when there is **no** `PASSENGERS`
header column (`passengersColIdx === -1`, the v2 case), scans **all** cells (`:610-627`) for
crew-name-shaped content validated against the roster and attaches the first match as
`assigned_names`. This sheet keeps billing/cost-owner names in column D adjacent to dollar costs in
column E — internal scratch, not passengers — so the scan harvested them. Reproduced: legs got
`assigned_names` `["Eric Carroll"]`, `["Eric Weiss"]`, `["Connor Hester"]`.

### Issue 3 — end-only show-day time (parser data-loss + accompanying warning)

E17 `GS: ... - 6:00 PM` has a literal `...` start (matched by `PLACEHOLDER_RE`,
`scheduleTimes.ts:31`), so no leading start is extractable and — because the single `6:00 PM`
token does not satisfy the exactly-2-token bare-window rule (`:165`) — the whole day is dropped
with a `SCHEDULE_TIME_UNPARSED` warn (`:207`, `scheduleTimeUnparsed` in
`lib/parser/blocks/agendaWarnings.ts:52`). The real `6:00 PM` **end** never surfaces anywhere.

## Resolved decisions (canonical — referenced by later sections)

- **R1.** Represent the end-only time as a **new `showEnd: string | null` field on `ScheduleDay`**,
  required (non-optional), mirroring `showStart: string | null`. NOT a nullable `window.start`.
  Rationale: keeps `window` meaning "both ends known"; keeps the end time **out of**
  `resolveKeyTimes`, whose `shows[]` list is explicitly a **show-start** anchor — an end must never
  render as a call time.
- **R2.** `resolveKeyTimes` (`lib/crew/resolveKeyTimes.ts`) is **unchanged**. It reads
  `day.showStart` / `day.window` / `day.entries` by name and simply ignores `showEnd`.
- **R3.** `downgradeRunOfShow` (`lib/data/downgradeRunOfShow.ts`) is **lossy** for `showEnd` (as it
  already is for `showStart`/`window`): it maps `entries` only. Doc comment updated to name `showEnd`.
- **R4.** Transport fix is **passengers-column-only**: remove the no-header all-column scan entirely.
  No test asserts the scan returns non-empty (`tests/parser/blocks/transport.test.ts:150` already
  pins v2 → `[]`; `getShowForViewer.test.ts:312` is a pre-seeded DB round-trip, not a parse).
- **R5.** No DB migration. `run_of_show` is schemaless JSONB; `showEnd` needs no DDL, no
  validation-schema-parity concern.
- **R6.** `SCHEDULE_TIME_UNPARSED` (§12.4 code) is **not** edited — no catalog touch. The end-only
  case simply stops emitting it; the code and its copy are unchanged.

## Fix 1 — wizard fragment-day rendering

**File:** `components/admin/wizard/step3ReviewSections.tsx` (UI → invariant-8 impeccable dual-gate).

`ScheduleDayRow` gains the day's non-entry time fields and renders a single **leading time-meta
line** when there are no titled entries, mirroring the crew `ScheduleSection` semantics:

- Change the call site (`:925`) to pass the day's `showStart`, `window`, `showEnd` (from
  `ros[iso]`) in addition to `entries`.
- In `ScheduleDayRow`, derive a `timeMeta` **only when `entries.length === 0`** (a titled day shows
  its entries, no meta line — mirrors crew, where meta stays undefined for titled days):
  - `window` present and `formatScheduleWindow(window)` non-null → the window string (e.g. `7:30 AM–6:00 PM`);
  - else `showStart` real (sentinel-guarded) → the start string (e.g. `8:00 AM`);
  - else `showEnd` real (sentinel-guarded) → `Ends {showEnd}` (e.g. `Ends 6:00 PM`);
  - else null.
- Render `timeMeta`, when non-null, as a muted line directly under the date header, above the
  (empty) entries grid. Reuse the existing sentinel guard (`hasContent`) / the shared
  `formatScheduleWindow` from `@/lib/crew/agendaDisplay` for the window branch so behavior matches crew.

**Guard conditions.** `ros[iso]` may be undefined (guarded by `arr()`/optional chaining as today).
`showStart`/`window`/`showEnd` may each be null/sentinel — every value passes through the sentinel
guard; a day with entries **and** a stray showStart still shows only its entries (meta gated on
`entries.length === 0`). Empty `ros` → existing "No run-of-show parsed." copy, unchanged.

**Dimensional invariants.** The meta line is a normal text row in the existing flex column
(`ScheduleDayRow`'s `<li className="flex flex-col gap-1">`); it introduces no fixed-dimension parent.
The entries grid is `grid-cols-[auto_1fr]` and is unchanged. No new parent→child dimension relationship
is created, so no Playwright layout-assertion task is required (declared explicitly).

## Fix 2 — transport passengers-column-only

**File:** `lib/parser/blocks/transport.ts`.

`extractAssignedNames` reduces to:

```ts
function extractAssignedNames(
  cells: string[],
  passengersColIdx: number,
  crewMembers?: CrewMemberRow[],
): string[] {
  if (passengersColIdx >= 0) {
    const raw = clean(cells[passengersColIdx] ?? "");
    if (!raw || raw === "-" || raw === "\\-") return [];
    return splitNames(raw, crewMembers);
  }
  // No declared PASSENGERS column → no passengers. The former all-column crew-context
  // scan harvested billing/scratch names from unrelated columns (#307 D41:D43); removed.
  return [];
}
```

`crewMembers` stays in the signature (used by `splitNames`); `splitNames`/`isNameLike` stay
(used by the passengers-column path). All v4-with-passengers behavior (`detectPassengersColIdx`,
the fuzzy `COLUMN_HEADER_AUTOCORRECTED` recovery) is untouched.

**Guard conditions.** `passengersColIdx === -1` → `[]` (was the buggy scan). `passengersColIdx >= 0`
with empty / `-` / `\-` cell → `[]` (unchanged). Multi-name cell → `splitNames` (unchanged).

## Fix 3 — end-only show-day time

**Files:** `lib/parser/types.ts`, `lib/parser/blocks/scheduleTimes.ts`,
`lib/sync/applyParseResult.ts`, `lib/data/decodeRunOfShow.ts`, `lib/data/downgradeRunOfShow.ts`,
`components/crew/sections/ScheduleSection.tsx`.

### Has-content predicate class (R7 — class-sweep, MUST all include `showEnd`)

`showEnd` is a fourth "content" field. Every place that decides "does this day carry usable content?"
via the three-field predicate MUST add `showEnd`. Complete site list (verified by
`grep -rn "showStart [!=]== null" lib components | grep -v test` against origin/main):

| Site | Current predicate | Add |
| ---- | ----------------- | --- |
| `scheduleTimes.ts:206` (final warn guard) | `entries.length === 0 && showStart === null && window === null` | `&& showEnd === null` |
| `applyParseResult.ts:156` (confirmed-day filter) | `entries.length > 0 \|\| showStart !== null \|\| window !== null` | `\|\| day.showEnd !== null` |
| `applyParseResult.ts:166` (`isFullyEmpty`) | `entries.length === 0 && showStart === null && window === null` | `&& d.showEnd === null` |
| `applyParseResult.ts:168` (`priorHadContent`) | `entries.length > 0 \|\| showStart !== null \|\| window !== null` | `\|\| d.showEnd !== null` |
| `decodeRunOfShow.ts:180` (omit-empty) | `entries.length > 0 \|\| showStart !== null \|\| window !== null` | `\|\| showEnd !== null` |

`ScheduleSection.tsx:294` is a *positive-showStart render* check, not an empty-day predicate — the new
`showEnd` render branch is ADDED after it (see Crew render), not edited into it. No other predicate site exists.

**Why `applyParseResult` is load-bearing (Codex spec-review R1, HIGH):** `applyParseResult` runs BEFORE
storage. Its confirmed-day filter (`:156`) drops any day failing the three-field test, so a
`{ entries:[], showStart:null, showEnd:"6:00 PM", window:null }` day would be **silently discarded before
`run_of_show` is written** — and its `isFullyEmpty`/`priorHadContent` pair (`:165-168`) would additionally
misclassify a previously-populated day that becomes end-only as `AGENDA_DAY_EMPTIED`. Without the `:156`
edit the entire end-only fix is a no-op past the parser; without `:166/:168` it emits a false emptied-day
alert. Both are covered by the class-sweep above and test 10.

**Type.** `ScheduleDay` (`types.ts:361`) gains `showEnd: string | null;` (after `showStart`).

**Parser.** In `parseScheduleTimes` (`scheduleTimes.ts`), add an end-only detector reached only
after `showStart`/`entries` are computed and before the final "nothing usable" warn (`:206-208`):

```ts
// End-only day: an unknown-start placeholder followed by a range dash and a single
// trailing clock (e.g. "GS: ... - 6:00 PM"). The start is unknown but the end is real —
// capture it as showEnd (NOT showStart: an end must never seed a resolveKeyTimes anchor).
const END_ONLY_LEAD_RE = /(?:\.\.\.|\bTBD\b|\bTBA\b|\bN\/A\b)\s*[-–]\s*$/i;
let showEnd: string | null = null;
if (
  entries.length === 0 &&
  showStart === null &&
  toks.length === 1 &&
  END_ONLY_LEAD_RE.test(cell.slice(0, first.start))
) {
  showEnd = first.norm;
}
```

- The `day` literal becomes `{ entries, showStart, showEnd, window: null }`.
- The bare-window branch day literal (`:170`) gains `showEnd: null`.
- The final warn (`:206`) fires only when `entries.length === 0 && showStart === null &&
  window === null && showEnd === null` — so a captured end-only day persists and does **not** warn.
- The zero-token branch (`:156`) is unchanged (no clock at all → no end).

**Decode.** `decodeRunOfShow` (`decodeRunOfShow.ts`):

- New object-day path (`:129-172`): read `day["showEnd"]` with the **same** sentinel-guard shape as
  `showStart` (`:141-149`) — `null`/`undefined` → null; string → `shouldHideGenericOptional(v) ? null
  : v`; any other type → `corrupt = true; continue`.
- Legacy array-day path (`:126-128`): `showEnd = null` (old shape has no end).
- The omit-empty check (`:180`) gains `|| showEnd !== null`.
- `result[key]` (`:181`) becomes `{ entries, showStart, showEnd, window }`.
- Doc-comment contract block (`:80-95`) updated to name `showEnd` alongside `showStart`.

**Downgrade.** `downgradeRunOfShow` doc comment (`:11-15`) updated to note `showEnd` is dropped too
(behavior already correct — it maps `entries` only).

**Crew render.** `ScheduleSection.tsx` — add a branch AFTER the `showStart` fragment-day branch
(`:294-303`), mutually exclusive by construction (showEnd is set only when showStart===null and
window===null):

```ts
} else if (sd != null && sd.showEnd != null && dayEntries.length === 0) {
  const t = guardMeta(sd.showEnd);
  meta = t != null ? `Ends ${t}` : undefined;
}
```

## Flag lifecycle table — `ScheduleDay.showEnd`

| Aspect | Value |
| ------ | ----- |
| **Storage** | `shows_internal.run_of_show` JSONB, per-day `ScheduleDay.showEnd` (schemaless; no DDL) |
| **Write path** | `parseScheduleTimes` sets it (end-only detector) → `applyParseResult` (confirmed-day filter + `isFullyEmpty`/`priorHadContent` all `showEnd`-aware per R7) persists `run_of_show` |
| **Read path** | `decodeRunOfShow` → `getShowForViewer` → crew `ScheduleSection` + wizard `ScheduleBreakdown`→`ScheduleDayRow` (via `ros`) |
| **Effect on output** | renders `Ends {time}` day-meta on both crew Schedule and admin step-3 breakdown; **not** a `resolveKeyTimes` anchor (R2) |

No column is empty → not a zombie flag.

## `ScheduleDay` constructor sweep (all sites set `showEnd`)

Because `showEnd` is required (`string | null`), every constructor must set it. **Complete** non-test
site list (verified by `grep -rn "showStart:" lib components | grep -v test` against origin/main):

- `lib/parser/blocks/scheduleTimes.ts:172` — bare-window branch literal → add `showEnd: null`.
- `lib/parser/blocks/scheduleTimes.ts` — main day literal (`:202`) → `{ entries, showStart, showEnd, window }`.
- `lib/parser/index.ts:635-639` — agenda-grid merge literal (`showStart: gridEntries[0]!.start`) → add `showEnd: null`.
- `lib/parser/index.ts:643` — empty merge fallback literal → add `showEnd: null`.
- `lib/parser/blocks/scheduleBookends.ts:48` — `appendEntry` fallback day literal (`ros[iso] ?? {...}`)
  → add `showEnd: null`. (Line 49 spreads `...day`, so a real day's `showEnd` is preserved; only the
  fallback literal needs the field.)
- `lib/data/decodeRunOfShow.ts:181` — `result[key]` literal (+ local `let showEnd` declaration `:123`,
  + decode logic mirroring `showStart` `:141-149`, + omit-empty check `:180`).

`resolveKeyTimes` and `downgradeRunOfShow` construct **no** `ScheduleDay` literal (they read/emit
`entries` only), so they need no constructor edit (R2, R3).

Test fixtures constructing `ScheduleDay` literals gain `showEnd: null` (mechanical). `toEqual` on a
whole `ScheduleDay` must include `showEnd` (per `feedback_optional_field_exactoptional_and_shape_sweep`
— run the FULL suite).

## Test plan (TDD per task; concrete failure modes)

Each test derives expectations from fixture dimensions; none is tautological.

1. **Parser — 5/13 showStart unchanged (regression guard).** `GS: 8:00 AM -` →
   `{ entries: [], showStart: "8:00 AM", showEnd: null, window: null }`, no warn. *Catches: a
   refactor of the end-only branch breaking the existing start case.*
2. **Parser — end-only capture.** `GS: ... - 6:00 PM` →
   `{ entries: [], showStart: null, showEnd: "6:00 PM", window: null }` **and no
   `SCHEDULE_TIME_UNPARSED` warn**. *Catches: the day being dropped/warned (current bug).*
3. **Parser — TBD/N/A end variants.** `TBD - 5:00 PM` → `showEnd: "5:00 PM"`. *Catches: the detector
   keying only on literal `...`.*
4. **Parser — non-end-only still warns.** A contentful clock-less cell (`"see agenda"`), and a
   bare-placeholder cell, keep current behavior (warn / silent per `shouldHideGenericOptional`).
   *Catches: the detector over-firing and swallowing genuine unparseable cells.*
5. **decodeRunOfShow — showEnd round-trips + sentinel-guarded.** `{showEnd:"6:00 PM"}` survives;
   `{showEnd:"TBD"}` → null (not corrupt); `{showEnd: 5}` → corrupt. Legacy array day → `showEnd:null`.
   *Catches: decode dropping or mis-typing the new field.*
6. **Transport — scratch names NOT harvested (the #307 repro).** v2 transport with names in a column
   adjacent to `$` costs and no PASSENGERS header → every leg `assigned_names: []`. *Catches: the
   all-column scan.* Expectation derived from the fixture (no passengers column present).
7. **Transport — passengers column still works (negative-regression).** v4 with `Passengers`
   column → names populate (existing tests `:231-243` continue to pass).
8. **Crew ScheduleSection — end-only meta.** Fragment day with only `showEnd` → DayCard meta
   `Ends 6:00 PM`; `resolveKeyTimes` produces **no** `shows[]` anchor for that day. *Catches: an end
   leaking into the call-time strip (R2).*
9. **Wizard ScheduleDayRow — fragment-day meta.** Days with only `showStart` / only `window` / only
   `showEnd` each render their respective meta line (`8:00 AM` / `7:30 AM–6:00 PM` / `Ends 6:00 PM`);
   a titled day shows entries and **no** meta line. Assert against the rendered meta element, with
   sibling controls removed from the scanned subtree (anti-tautology). *Catches: the current
   entries-only render (Issue 1).*
10. **applyParseResult — end-only day survives storage (Codex R1).** In
    `tests/sync/applyParseResultScheduleDay.test.ts`: a confirmed `showEnd`-only day
    (`{ entries:[], showStart:null, showEnd:"6:00 PM", window:null }`) is present in the stored
    `run_of_show` (not filtered by `:156`); and a prior populated day that becomes `showEnd`-only does
    **not** emit `AGENDA_DAY_EMPTIED` (`isFullyEmpty` returns false for it). *Catches: the end-only fix
    being silently dropped before storage and a false emptied-day alert.* The existing `showStartOnly` /
    `bareWindow` / `fullyEmpty` fixtures in that file gain `showEnd: null`.

## Meta-test inventory

**None created or extended.** This change touches no auth, DB-write, admin-alert, tile-sentinel, or
advisory-lock surface. No `pg_advisory*`. No new §12.4 code. No new Supabase call boundary. Declared
explicitly per the writing-plans meta-test-inventory rule.

## Out of scope

- Surfacing the `SCHEDULE_TIME_UNPARSED` **warning copy** changes — untouched (R6).
- Any `resolveKeyTimes` behavior change — untouched (R2).
- Transport currency/cost extraction — the `$` amounts are intentionally **not** captured; only the
  false-positive names are removed.
