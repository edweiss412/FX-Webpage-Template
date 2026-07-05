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
  `tests/parser/blocks/transport.test.ts:150` already pins v2 → `[]`; `getShowForViewer.test.ts:312` is a
  pre-seeded DB round-trip, not a parse. The ONE test that asserts non-empty no-header names —
  `tests/parser/exporterFixtures.test.ts:661-672` (`Pick Up Warehouse → ["Eric Carroll"]` etc.) — is
  literally the #307 bug encoded as expected output (a prior "B1" fix stopped the col0 stage-label read
  but still harvested the col-D scratch name). It is reconciled to `[]` **in the same transport commit**
  (plan Task 6). No test relies on a *legitimate* no-header passenger assignment (none exists — R10).
- **R5.** No DB migration. `run_of_show` is schemaless JSONB; `showEnd` needs no DDL, no
  validation-schema-parity concern.
- **R6.** `SCHEDULE_TIME_UNPARSED` (§12.4 code) **still exists and still fires** for the genuinely
  unparseable case (a contentful, non-sentinel TIME cell with no clock at all — e.g. `"General Session
  TBD"`). Only the **end-only** trigger is removed (it now parses to `showEnd`). The operator **copy**
  (dougFacing / helpfulContext / longExplanation) is generic ("we couldn't read a start time…") and is
  **unchanged** — so `x1-catalog-parity` holds with no `catalog.ts` copy edit. But the **definition
  column** of master-spec §12.4 (and the `agendaWarnings.ts` doc comment) currently name end-only
  `"GS: ... - 6:00 PM"` as a firing example, which becomes false — see R9. This is a deliberate,
  user-approved behavior change to the canonical spec (issue #3 "Include now"), reconciled in-change,
  not a silent divergence.

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
  (empty) entries grid. Route `showStart`/`showEnd` through `resolveOptionalField` (the sentinel-hiding
  guard — hides `TBD`/`N/A`/`TBA`, NOT the weaker `hasContent`) and the window through the shared
  `formatScheduleWindow` from `@/lib/crew/agendaDisplay`, so a sentinel value hides exactly as it does on
  crew (defense-in-depth; `components/admin/` is outside the `_metaSentinelHidingContract` walk, so this
  is enforced by behavioral test 9, not the structural meta-test).

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

### Corpus audit + ratified decision (R10 — Codex spec-review R4, HIGH: "silent data loss?")

The concern: removing the no-header scan could silently drop a *real* no-header passenger assignment.
**Corpus evidence says there are none.** Audit of all 19 transport-bearing fixtures (both renderer
families — `fixtures/shows/raw/**` and `fixtures/shows/exporter-xlsx/**`, covering every real test show:
ria, consultants, fixed-income, rpas, fintech, asset-mgmt, redefining-fi/RFI, east-coast, legal-forum,
sub-advisory):

- **Zero** fixtures contain a `PASSENGERS` header (the v4 Passengers column is a forward-looking feature
  not present in any real sheet yet; only *synthetic* `transport.test.ts` v4 fixtures exercise it).
- Therefore **every** `assigned_names` value in the real corpus today is produced by the no-header scan.
- Inspecting each corpus transport **schedule** row: none carries a crew name in a scannable
  (non-stage/date/time/phone) column **except** the RFI/PC show, whose `D41:D43` hold billing/cost-owner
  scratch names (`Eric Carroll` / `Eric Weiss` / `Connor Hester` beside the `E`-column `$` costs) — i.e.
  the #307 bug itself. Every other show's scan yields `[]` already.

**Conclusion:** removing the scan loses **zero** legitimate passenger data across the entire supported
corpus and eliminates the single real false positive. The v2 format canonically has no passenger column;
passenger display is genuinely populated **only** via an explicit `PASSENGERS` column (v4). The user
**ratified** "Passengers-column-only" over "keep scan, exclude cost columns" in brainstorming. No
observability warning is added: there is demonstrably nothing to warn about, and a new warning code would
be unrequested scope (a heavy new-§12.4-code path). Test 6 pins the no-header-with-name → `[]` regression.

**EXPLICITLY DO NOT RELITIGATE:** the scan removal is corpus-evidenced (zero legit no-header passengers)
and user-ratified. Reintroducing a scan/heuristic or a drop-warning contradicts both.

## Fix 3 — end-only show-day time

**Files:** `lib/parser/types.ts`, `lib/parser/blocks/scheduleTimes.ts`,
`lib/sync/applyParseResult.ts`, `lib/data/decodeRunOfShow.ts`, `lib/data/downgradeRunOfShow.ts`,
`components/crew/sections/ScheduleSection.tsx`, `scripts/verify-resync-scheduletimes.ts`,
`tests/data/verifyResyncExpectedMap.test.ts`, `lib/parser/blocks/agendaWarnings.ts` (doc comment, R9),
`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 definition column, R9).

### Has-content predicate class (R7 — class-sweep, MUST all include `showEnd`)

`showEnd` is a fourth "content" field. Every place that decides "does this day carry usable content?"
via the three-field predicate MUST add `showEnd`. Complete site list (verified by
`grep -rn "showStart [!=]== null" lib components app scripts | grep -v .test.` against origin/main —
note the sweep now includes `scripts/`, the source of the Codex R2 miss):

| Site | Current predicate | Add |
| ---- | ----------------- | --- |
| `scheduleTimes.ts:206` (final warn guard) | `entries.length === 0 && showStart === null && window === null` | `&& showEnd === null` |
| `applyParseResult.ts:156` (confirmed-day filter) | `entries.length > 0 \|\| showStart !== null \|\| window !== null` | `\|\| day.showEnd !== null` |
| `applyParseResult.ts:166` (`isFullyEmpty`) | `entries.length === 0 && showStart === null && window === null` | `&& d.showEnd === null` |
| `applyParseResult.ts:168` (`priorHadContent`) | `entries.length > 0 \|\| showStart !== null \|\| window !== null` | `\|\| d.showEnd !== null` |
| `decodeRunOfShow.ts:180` (omit-empty) | `entries.length > 0 \|\| showStart !== null \|\| window !== null` | `\|\| showEnd !== null` |
| `verify-resync-scheduletimes.ts:168` (recovered-content) | `entries.length > 0 \|\| showStart != null \|\| window != null` | `\|\| d.showEnd != null` |

`ScheduleSection.tsx:294` and `verify-resync-scheduletimes.ts:93` (`case "showStart"`) are *positive*
checks, not empty-day predicates — a new `showEnd` branch / `case` is ADDED beside each (see Crew render
and R8), not edited in. No other predicate site exists.

### Resync release-gate contract (R8 — Codex spec-review R2, HIGH)

`scripts/verify-resync-scheduletimes.ts` is the deploy-time re-sync verifier (`pnpm
verify-resync-scheduletimes`, run against `TEST_DATABASE_URL` after a forced re-sync). It hard-codes
per-show/day expectations, including **`"2025-05-14": { field: "unparsed" }`** (`:38`) for this exact
RFI/PC show — asserting the day is ABSENT from `run_of_show` AND carries a `SCHEDULE_TIME_UNPARSED`
warning (`:85`, `:134-138`). After Fix 3, that day parses to `showEnd` (present, no warning), so the
gate would **fail (or invite a stale-gate bypass)** on the next parser rollout. Required edits:

- Add `| { field: "showEnd" }` to the `DayExpectation` union (`:18-21`) with a comment.
- Flip `:38` → `"2025-05-14": { field: "showEnd" }, // "GS: ... - 6:00 PM" — end-only, decoded as showEnd`.
- Add `case "showEnd": return day.showEnd != null;` to the `dayHasExpectedField` switch (`:87-94`). The
  switch is TS-exhaustive over the union, so omitting the case is a **compile error** — a built-in guard.
- `:168` recovered-content predicate gains `|| d.showEnd != null` (in the R7 table).
- `unparsed` union member + its absence/warning logic (`:85`, `:134-147`) **stay** (a future genuine
  end-drop could reuse them); after this change no live day maps to `unparsed`, which is correct.

**CI mirror** `tests/data/verifyResyncExpectedMap.test.ts` duplicates the `DayExpectation` type +
`dayHasExpectedField` helper for unit coverage: add `showEnd` to its union (`:7`) and a
`case`/branch, add a red→green test that a present `showEnd`-only day passes `{ field: "showEnd" }`
(and that an end-only day does NOT require the unparsed warning), and add `showEnd: null` to its
`ScheduleDay` fixtures (`:19,24,30,39`). The existing `unparsed`-helper tests (`:27-34,52-67`) test the
helper generically with `"2025-05-14"` as an arbitrary ISO arg — they remain valid and unchanged.

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

### §12.4 / warning-contract reconciliation (R9 — Codex spec-review R3, HIGH)

The canonical `SCHEDULE_TIME_UNPARSED` contract names the end-only case as a firing example; Fix 3
removes that trigger, so the canonical text must be reconciled in the same change (author-approved
behavior change, not a silent fix). Edits — **copy-preserving** (no operator-copy column changes):

- **`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2896`** (§12.4 row, DEFINITION column
  only): remove the `an end-only "GS: ... - 6:00 PM"` example; keep the general definition and the
  `"General Session TBD"` example; add `/ end time` to the "no readable call time / window / agenda"
  list so the firing condition reads "no readable call time / window / agenda / end time (e.g. 'General
  Session TBD')". The three copy columns (dougFacing / crewFacing / followUp) are **untouched**. Edit
  **surgically** — do NOT run prettier on the master spec (`feedback_never_prettier_the_master_spec`:
  prettier mangles §12.4 cells → x1 divergence).
- **`lib/parser/blocks/agendaWarnings.ts:45-51`** doc comment: drop the end-only case from the
  "emitted when" description; it now fires only for the no-clock-contentful case.
- **Three-way §12.4 lockstep (AGENTS.md — followed as a procedure, gate is the arbiter):** the
  implementation task edits the master-spec row, THEN runs `pnpm gen:spec-codes` (regenerates
  `lib/messages/__generated__/spec-codes.ts` from §12.4), THEN runs the `x1-catalog-parity` gate
  (`tests/cross-cutting/codes.test.ts`) which deep-matches the runtime catalog ↔ §12.4 on the four
  **copy** columns only — `dougFacing` / `crewFacing` / `followUp` / `helpfulContext` (`:75-87`). All
  three artifacts (master-spec edit, regenerated `spec-codes.ts`, and any `catalog.ts` change) land in
  the **same commit**.
- **Expected outcome, stated but NOT pre-judged:** because the edit touches only the DEFINITION/trigger
  column (which x1 does not compare) and leaves all four copy columns byte-identical, `gen:spec-codes` is
  expected to produce a **no-op diff** and `catalog.ts` is expected to need no row change. This is a
  *prediction to verify with the gate*, not a license to skip the lockstep: run gen + x1; if either
  produces a diff or failure, update `catalog.ts` accordingly and commit it in the same task. Do NOT run
  prettier on the master spec (`feedback_never_prettier_the_master_spec`).

This is NOT a new §12.4 code (no `TRUST_DOMAINS` / help-family / internal-enum additions); it is an
example-scope narrowing of an existing row, so the "new code = 4 more CI gates" path
(`feedback_new_12_4_code_full_ci_touchpoints`) does not apply — only the copy-parity gates, which stay
green because copy is preserved.

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
6. **Transport — scratch names NOT harvested + no-header behavior is `[]` (the #307 repro + R10
   ratified decision).** Two cases, both with `crewMembers` supplied and NO `PASSENGERS` header:
   (a) the RFI/PC repro — names in a column adjacent to `$` costs → every leg `assigned_names: []`;
   (b) the exact fixture Codex requested — a plain no-header transport row carrying a real roster name
   in a scannable column → `assigned_names: []` (documents that no-header passengers are intentionally
   unsupported, per R10). *Catches: the all-column scan; pins the ratified product decision so a future
   change can't silently re-add the scan.* Expectations derived from the fixture (no passengers column).
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
11. **Resync verifier — 2025-05-14 now `showEnd` (Codex R2).** In
    `tests/data/verifyResyncExpectedMap.test.ts`: a present `showEnd`-only day passes
    `{ field: "showEnd" }`; the switch is exhaustive (compile-time). *Catches: the release gate going
    stale against the new end-only contract.* (The live `scripts/verify-resync-scheduletimes.ts` map flip
    at `:38` is exercised by that gate against `TEST_DATABASE_URL`, not by unit test.)

12. **Sentinel-negative `showEnd` render (Codex R6).** Crew `ScheduleSection` fragment day with
    `sd.showEnd = "TBD"` (and `showStart`/`window`/entries empty) renders **no** `Ends …` meta (the
    `guardMeta`/`resolveOptionalField` guard hides it) — not `Ends TBD`. Plus the structural
    `_metaSentinelHidingContract` extension (pattern includes `showEnd`) fails CI if a future walked
    component reads `showEnd` un-guarded. *Catches: a `TBD`/`N/A`/`TBA` sentinel leaking as `Ends TBD`.*
    (Decode-layer sentinel guard is separately pinned by test 5: `{showEnd:"TBD"}` → null.)

### Parser-behavior test reconciliation (do not blind-delete)

The end-only change flips existing assertions that pin `SCHEDULE_TIME_UNPARSED` for the `GS: ... - 6:00 PM`
shape. Any such test (candidate: `tests/parser/blocks/agendaWarnings.test.ts`, plus `2025-05-14`-referencing
fixtures in `tests/crew/resolveKeyTimes.test.ts`, `tests/parser/blocks/scheduleBookends.test.ts`,
`tests/components/crew/primitives/RunOfShowList.test.tsx`) must be RECONCILED to the new contract
(day present with `showEnd`, no warning), not silently removed. The FULL suite (`pnpm test`) is the net
that surfaces every one (per `feedback_full_suite_before_push_scoped_gates_miss_regressions`).

## Meta-test inventory

**EXTENDS `tests/components/tiles/_metaSentinelHidingContract.test.ts` (Codex spec-review R6, MEDIUM).**
`showEnd` is a new raw sheet-derived value rendered as crew DayCard meta (`Ends {time}`), so it joins the
existing §8.3 sentinel-hiding registry alongside `ScheduleDay.window.start/end` and `showStart`. Required
change to that meta-test:

- The `ScheduleDay` reference entry (`:258-261`) pattern `/\b(window\??\.(start|end)\b|\bshowStart\b)/`
  gains `|\bshowEnd\b` → `/\b(window\??\.(start|end)\b|\bshowStart\b|\bshowEnd\b)/`, and its `description`
  + the block comment (`:244-252`) name `showEnd` (fragment "Ends 6:00 PM" meta).
- The meta-test walks `components/tiles/` + `components/crew/sections/` + `components/crew/primitives/`
  (`:84,101-102`). It requires each walked file matching the pattern to route the value through
  `shouldHideGenericOptional` directly OR via the `resolveOptionalField` wrapper (`:415-417`). The crew
  `ScheduleSection.tsx` (walked) reads `sd.showEnd` via `guardMeta` (= `resolveOptionalField`), so it
  satisfies `hasWrapper` and passes. **No walked file reads `showEnd` un-guarded** — verified because the
  only new `showEnd` reader in a walked dir is `ScheduleSection`, which already imports/uses
  `resolveOptionalField`.
- The wizard `step3ReviewSections.tsx` is under `components/admin/`, which the meta-test does **not**
  walk, so Fix 1's new `showStart`/`window`/`showEnd` reads there are not enforced by this contract.
  Regardless, Fix 1 routes them through `resolveOptionalField` / `formatScheduleWindow` (defense-in-depth
  + consistency with crew; see Fix 1) — and in step-3 the `ros` is fresh parse output whose `showEnd` is
  always a real clock token or null, so a sentinel cannot arise there anyway.

No other meta-test applies: no auth, DB-write, admin-alert, advisory-lock (`pg_advisory*`) surface; no new
§12.4 code (R9 is an example-scope narrowing); no new Supabase call boundary.

## Out of scope

- Surfacing the `SCHEDULE_TIME_UNPARSED` **warning copy** changes — untouched (R6).
- Any `resolveKeyTimes` behavior change — untouched (R2).
- Transport currency/cost extraction — the `$` amounts are intentionally **not** captured; only the
  false-positive names are removed.
