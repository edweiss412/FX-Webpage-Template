# Spec: Surface agenda-PDF sessions in the run-of-show schedule

**Date:** 2026-06-27
**Slug:** `agenda-pdf-schedule-merge`
**Status:** Draft (autonomous-ship pipeline)

## 1. Problem

On the admin Step-3 review card (and the crew page), the SCHEDULE section shows
only bare dates with no session detail for shows whose structured schedule
sources are empty. Concretely, for the "Redefining Fixed Income / Private Credit"
show (sheet `1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg`):

- The DATES TIME column (`lib/parser/blocks/scheduleTimes.ts`) yields only a
  start-only day (`"GS: 8:00 AM - "`) and one unparseable placeholder
  (`"GS: ... - 6:00 PM"` → `SCHEDULE_TIME_UNPARSED`, **correct**, out of scope).
- The AGENDA tab is a title-less START/FINISH skeleton → no titled entries
  (`lib/parser/blocks/agenda.ts` merge in `lib/parser/index.ts:441-452` only
  lifts grid days with `gridEntries.length > 0`).

The only detailed agenda source is the two agenda PDFs, linked as Drive file
smart-chips on the INFO tab (`AGENDA LINK - RFI`, `AGENDA LINK - PCF`). The
agenda extractor (`lib/agenda/extractAgendaSchedule.ts`) already parses both at
**high confidence** (verified: `tests/agenda/extractAgendaSchedule.test.ts`
passes — rfi.pdf → 18 sessions w/ breakout tracks; pcf.pdf → 19 sessions). But:

1. **The extraction never runs during onboarding.** The onboarding
   `defaultDriveClient` (`lib/sync/runOnboardingScan.ts:218-229`) implements only
   `getFile` + `listFolder`, so `enrichAgenda` short-circuits at its
   `if (!downloadFileBytes) return;` guard (`lib/sync/enrichAgenda.ts:57-58`).
2. **Even when extraction runs (cron), the extracted sessions feed only the crew
   PDF-embed viewer** (`agenda_links[].extracted`) — they are NOT merged into
   `runOfShow`, so the SCHEDULE section stays empty on both surfaces.

## 2. Goal

Fill empty show-days in `runOfShow` with sessions extracted from the agenda PDFs,
so the SCHEDULE section (admin Step-3 card AND crew page) shows the agenda when
the sheet's structured sources carry no titled entries. Run the extraction during
onboarding so the review card is populated on first view; the cron path already
runs it.

## 3. Non-goals / out of scope

- The `SCHEDULE_TIME_UNPARSED` warning ("Show-day time unreadable") stays — it is
  a correct flag for a genuinely-unfilled start time (`"GS: ... - 6:00 PM"`);
  fixing the sheet is the operator's call.
- No change to the agenda PDF **embed viewer** (`components/agenda/*`,
  `AgendaPdfViewer`, `AgendaEmbed`).
- No change to the extractor itself (`extractAgendaSchedule`) — it already works.
- No new DB columns / DDL: `source` rides inside the existing `run_of_show`
  JSONB and the staged `parse_result`. No migration, no advisory-lock change.

## 4. Design

### 4.1 Run extraction during onboarding

Extend the onboarding `defaultDriveClient` (`lib/sync/runOnboardingScan.ts:218`)
to implement `downloadFileBytes` + `getAgendaChips` by importing the **existing**
production impls from `lib/drive/agendaDrive.ts` (the cron path already wires
them at `lib/sync/runScheduledCronSync.ts:1665-1666`). This makes `enrichAgenda`
run during the scan. Extraction caches on `agenda_links[].extracted` keyed by
`headRevisionId` + `EXTRACTOR_VERSION` (`lib/sync/enrichAgenda.ts:115-121`), so a
later cron sync reuses it — the PDF download/parse cost is paid once.

**Cost / fan-out:** the onboarding scan deliberately bounds Drive fan-out
(`runOnboardingScan.ts:44-55`, ~6 Drive calls/sheet). Adding agenda extraction
adds, per sheet with N agenda links: 1 `getAgendaChips` (only when ≥1 link lacks
a parsed fileId), then per link 1 `getFile` + (cache-miss) 1 `downloadFileBytes`
+ CPU parse. This is **accepted** (user decision: "Inline during scan, cached").
`enrichAgenda` is best-effort and never throws out of the scan
(`enrichAgenda.ts:172-175`).

**Guard conditions:** if a sheet has zero agenda links, `enrichAgenda` iterates an
empty list — no Drive calls beyond the existing ones. If `getAgendaChips`/
`downloadFileBytes` return `infra_error`, the link is left unenriched and retried
next sync (existing behavior, unchanged).

### 4.2 New sync-layer merge step

Add `lib/sync/mergeAgendaIntoRunOfShow.ts` exporting
`mergeAgendaIntoRunOfShow(result: ParseResult): void`, called from
`enrichWithDrivePins` immediately after the `enrichAgenda` call
(`lib/sync/enrichWithDrivePins.ts:322`). Because both `runOnboardingScan` and
`runScheduledCronSync` go through `enrichWithDrivePins`, both paths inherit it,
and the merged `runOfShow` flows into BOTH persistence sinks:

- crew: `shows_internal.run_of_show` (written in `runScheduledCronSync.ts`'s
  `insert into public.shows_internal (..., run_of_show)`), read by
  `getShowForViewer` (`lib/data/getShowForViewer.ts:577-590`) → decoded by
  `decodeRunOfShow` (`lib/data/decodeRunOfShow.ts`).
- admin: the staged `parse_result` the Step-3 card reads (no decoder).

**It mutates `result.runOfShow` in place.** If `result.runOfShow` is `undefined`
(no DATES/AGENDA-tab days at all) BUT a PDF maps to a canonical show-day, the
step initializes `result.runOfShow = {}` and adds the PDF day(s). Show-day ISO
candidates come from `result.show.dates` (showDays / set / travel — the same set
`deriveSchedulePhases` uses) PLUS any existing `runOfShow` keys.

**Per-day precedence** (for each candidate show-day ISO):

1. Existing day with `entries.length > 0` (titled structured run-of-show) → **keep
   untouched**.
2. Else if a PDF AgendaDay maps to this ISO (§4.3) and yields ≥1 displayable
   entry (§4.4) → set `{ entries: <pdf entries>, showStart: <first entry start>,
   window: null, source: "pdf" }`.
3. Else → leave the existing day as-is (empty / showStart-only / window) — never
   downgrade a structured day.

**Confidence gate:** only `extraction.confidence === "high"` days are eligible
(low confidence already yields `days: []`, so this is belt-and-suspenders).

### 4.3 PDF day → ISO mapping (year-typo tolerant)

`AgendaDay.date` is **always `null`** (`extractAgendaSchedule.ts:497` is the sole
push site). Mapping therefore parses month+day from `AgendaDay.dayLabel`, which is
free-form and may be corrupted by PDF text extraction:

- RFI: `dayLabel = "Tuesday May 13,2024"` (wrong **year** — 2024 vs the 2025 show)
- PCF: `dayLabel = "Wednes day, May 14 , 202 5"` (mangled spacing in day + year)

Algorithm `mapAgendaDayToIso(dayLabel, showDayIsos): string | null`:

1. Parse `(month, day)` from `dayLabel` with a tolerant regex: an English month
   name (full or 3-letter prefix, case-insensitive) followed by a 1–2 digit day,
   allowing arbitrary inter-word whitespace
   (e.g. `/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i`).
   **Year is deliberately ignored** (it is the corrupted field).
2. Build `(month, day)` for each candidate show-day ISO (from its `YYYY-MM-DD`).
3. If exactly one show-day shares the parsed `(month, day)` → return that ISO.
   If zero or more-than-one match → return `null` (skip — degrade safely, never
   bind to the wrong day; mirrors the `resolveSourceCell` exactly-one-or-null
   precedent at `lib/drive/showDayTimeAnchors.ts:89-96`).
4. Unparseable `dayLabel` → `null` (no positional fallback — a wrong-day binding
   is worse than no binding).

**Multiple PDFs → same ISO** (general case; does NOT occur for this show — RFI=13,
PCF=14): concatenate all mapped days' entries for that ISO, sort by start
minute-of-day, and drop adjacent exact-duplicate `(start,title)` entries. (For
this show each PDF maps to a distinct day, so no concat/sort is exercised, but the
rule is specified and tested with a synthetic fixture.)

### 4.4 Session → AgendaEntry flattening

`AgendaSession` → zero-or-more `AgendaEntry` (`lib/parser/types.ts:340-347`,
`{ start, finish?, trt?, title, room?, av? }`; `title` is **required, non-null**):

- **Time:** `session.time` is either a range (`"8:00 AM – 8:45 AM"`) or a single
  clock (`"5:00 PM"`). Split on the first dash class `[–—-]` (en/em/hyphen):
  `start` = left part trimmed; `finish` = right part trimmed when present and
  non-empty; single clock → `start` only, no `finish`. `trt`/`av` are not produced
  (the extractor has no source for them).
- **Tracks:** if `session.tracks.length >= 1`, emit one `AgendaEntry` per track:
  `title = track.title ?? session.title`, `room = track.room ?? session.room ?? undefined`,
  same `start`/`finish`. Else emit one entry: `title = session.title`,
  `room = session.room ?? undefined`.
- **Drop rule:** an emitted entry whose resolved `title` is `null`/empty or fails
  `shouldHideGenericOptional` is dropped (e.g. PCF's 2 null-title break rows). This
  matches the crew render gate `isDisplayableEntry`
  (`lib/crew/agendaDisplay.ts:43-45`), so dropped-here ≡ would-not-render-anyway.
  `room`/`finish` are only set when non-empty strings (so `decodeRunOfShow`'s
  "every present optional must be a string" rule holds, `decodeRunOfShow.ts:42-50`).

A PDF day that yields zero displayable entries after this is treated as "no PDF
day for this ISO" (precedence step 2 fails → step 3).

### 4.5 The `source` provenance tag

Add an optional field to `ScheduleDay` (`lib/parser/types.ts:349-353`):

```ts
export type ScheduleDay = {
  entries: AgendaEntry[];
  showStart: string | null;
  window: { start: string; end: string } | null;
  source?: "pdf"; // present only on days filled from an agenda PDF (§4.2 step 2)
};
```

**Flag lifecycle table:**

| Aspect | Detail |
|---|---|
| **Storage** | inside `shows_internal.run_of_show` JSONB (crew) + staged `parse_result` (admin). No DDL. |
| **Write path** | `mergeAgendaIntoRunOfShow` sets `source: "pdf"` on PDF-filled days (§4.2 step 2). Structured days never get it. |
| **Read path (crew)** | `decodeRunOfShow` must validate + preserve it: `source === "pdf"` → keep; any other value → drop the field (NOT corrupt). Add to the rebuilt `result[key]` object. |
| **Read path (admin)** | Step-3 card reads staged `parse_result.runOfShow` directly (no decoder) — tag survives natively. |
| **Effect on output** | both surfaces render a subtle "from agenda PDF" provenance marker on tagged days (§4.6). No effect on entry rendering. |

Because `decodeRunOfShow` rebuilds each day as `{ entries, showStart, window }`
(`decodeRunOfShow.ts:181`), it currently strips `source`. The decoder MUST be
extended (validated, with a negative-regression test) or the crew tag never
appears.

### 4.6 UI (Opus + impeccable invariant 8)

Both surfaces already render `runOfShow` entries automatically once days carry
entries — no change needed to make sessions appear. The only UI addition is the
provenance marker on `source === "pdf"` days:

- **Crew** (`components/crew/primitives/RunOfShowList.tsx`): the `RunOfShowList`
  signature gains an optional `source?: "pdf"` prop; when `"pdf"`, render a small
  muted label (e.g. eyebrow text "From agenda PDF") above/below the list. Callers
  (`TodaySection`, the Schedule section) pass `runOfShow[iso]?.source`.
- **Admin** (`components/admin/wizard/Step3SheetCard.tsx`): `ScheduleDayRow`
  (line 182) gains the same optional source; render an inline muted tag on tagged
  days.

**Dimensional invariants:** the marker is inline/flow text, not inside a
fixed-dimension flex parent, so no parent→child height/width invariant is
introduced. (No Tailwind-v4 `items-stretch` concern.)

**Transition inventory:** the marker has two states per day — present (`source ===
"pdf"`) vs absent. The transition is **instant — no animation needed** (server-
rendered; day source does not toggle client-side within a mounted card).

**Copy:** the marker is descriptive UI text, not an error code, so it does not go
through `lib/messages/lookup.ts` (invariant 5 is about raw error codes; N/A here).

## 5. Guard conditions (every input)

- `result.runOfShow` `undefined` → init `{}` only if a PDF maps; else leave
  `undefined`.
- `agenda_links` empty / all `extracted` undefined → no-op merge.
- `extraction.confidence === "low"` or `days: []` → no eligible days.
- `dayLabel` empty/unparseable → that day maps to `null` (skipped).
- `(month, day)` matches 0 or ≥2 show-days → skipped.
- Day yields 0 displayable entries → treated as no PDF day for that ISO.
- Existing structured day with `entries.length > 0` → never overwritten.
- `result.show.dates` all null (no show-days) → no candidate ISOs from dates; only
  existing `runOfShow` keys are candidates.

## 6. Numeric sweep

- Agenda links for this show: **2** (RFI, PCF).
- Show-days for this show: **2** (2025-05-13, 2025-05-14); `runOfShow` shows 3
  keys incl. 2025-05-15 (travel-out, AGENDA-tab empty day) — only 13 & 14 get PDF
  fill.
- RFI sessions: **18** extracted; ~17 displayable after the breakout expands to 2
  track-entries and 0 are null-title. PCF: **19** extracted, **2** null-title rows
  dropped → 17 displayable.
- `RUN_OF_SHOW_DISPLAY_CAP = 20` (`lib/crew/agendaDisplay.ts:16`) — both days
  under cap; overflow stub path unaffected.
- `EXTRACTOR_VERSION` cache key — unchanged (no extractor change).

## 7. Test plan (TDD per task)

1. `mapAgendaDayToIso` unit: RFI "Tuesday May 13,2024" → 2025-05-13; PCF
   "Wednes day, May 14 , 202 5" → 2025-05-14; ambiguous (two show-days same
   month/day) → null; unparseable → null; year-only-wrong still matches.
   *Failure mode caught:* naive exact-ISO or year-sensitive matching (would bind
   nothing for the 2024 typo).
2. `flattenSession` unit: range → start+finish; single clock → start only;
   tracks=2 → 2 entries; null title → dropped; room preserved; finish/room only
   set when non-empty.
   *Failure mode:* dropping room/finish, or emitting a null-title entry that
   crashes `decodeRunOfShow`/render.
3. `mergeAgendaIntoRunOfShow` unit (synthetic ParseResult + extracted): structured
   day kept; empty day filled + `source:"pdf"` + showStart=first start; no-PDF day
   untouched; two-PDF-same-ISO concat+sort+dedupe; `runOfShow` undefined → init.
   *Failure mode:* overwriting a structured day; wrong showStart; missing source
   tag.
4. **End-to-end via real fixtures** (`fixtures/agenda/rfi.pdf` + `pcf.pdf`,
   already committed, byte-identical to live): feed both extractions through the
   merge against a 2025-05-13/14 show; assert 05-13 entries include
   "Registration & Breakfast" and the wrapped "Adapting…Unpredictability?" title,
   05-14 includes "Lunch", both days `source:"pdf"`. **Derive expectations from
   the extraction output, not hardcoded counts** (anti-tautology: assert against
   the extraction, not the merged container).
5. `decodeRunOfShow` negative-regression: a stored day with `source:"pdf"`
   round-trips (preserved); `source:"bogus"` → field dropped, NOT corrupt; absent
   source → absent. *Failure mode:* decoder silently strips the tag (crew marker
   never shows) — verify by mutating the decoder to drop it and seeing the test
   fail.
6. Onboarding wiring: `runOnboardingScan` `defaultDriveClient` now exposes
   `downloadFileBytes` + `getAgendaChips`; a scan over a show with agenda chips
   populates `runOfShow` from the PDF. Assert via the existing scan test harness
   with a mock Drive client returning the fixtures.
7. **UI (real-browser/RTL):** `RunOfShowList` + `ScheduleDayRow` render the
   "from agenda PDF" marker iff `source==="pdf"`; absent otherwise. Clone-and-
   strip sibling controls before scanning DOM for the label (anti-tautology).
8. Impeccable dual-gate (critique + audit) on the admin + crew diff (invariant 8).

## 8. Meta-test inventory

- **Supabase call-boundary contract** (`tests/sync/_metaInfraContract.test.ts`):
  `downloadFileBytes` + `getAgendaChips` are already registered (cron). The
  onboarding client reuses the same functions (no new boundary) — confirm no new
  registry row is required; add an inline `// not-subject-to-meta` note only if a
  new call site is introduced. **No new meta-test created.**
- **Advisory-lock topology:** no `pg_advisory*` touched (the merge is pure
  in-memory mutation of the parse result before the existing locked write). No
  change to `tests/auth/advisoryLockRpcDeadlock.test.ts`.
- No new RPC-gated table → no PostgREST DML lockdown change.

## 9. Files touched

| File | Change |
|---|---|
| `lib/parser/types.ts` | add `source?: "pdf"` to `ScheduleDay` |
| `lib/sync/mergeAgendaIntoRunOfShow.ts` | **new** — merge + `mapAgendaDayToIso` + `flattenSession` |
| `lib/sync/enrichWithDrivePins.ts` | call merge after `enrichAgenda` (line ~322) |
| `lib/sync/runOnboardingScan.ts` | extend `defaultDriveClient` with the two methods |
| `lib/data/decodeRunOfShow.ts` | validate + preserve `source` on day rebuild |
| `components/crew/primitives/RunOfShowList.tsx` | `source` prop + marker |
| `components/crew/sections/TodaySection.tsx` (`:593`) + `components/crew/sections/ScheduleSection.tsx` | pass `runOfShow[iso]?.source` to `RunOfShowList` |
| `components/admin/wizard/Step3SheetCard.tsx` | `ScheduleDayRow` source + marker |
| tests (per §7) | new + extended |

## 10. Resolved decisions

- Display: **merge into the SCHEDULE section** (not a separate breakdown).
- Surfaces: **both** admin card and crew schedule (sync-layer merge into
  `runOfShow`).
- Timing: **inline during scan, cached** (cron reuses).
- Precedence: **structured titled entries win; PDF fills empties; never
  downgrade**.
- Mapping: **month+day from `dayLabel`, year ignored, exactly-one-or-skip**.
- Tag: **`source:"pdf"` on `ScheduleDay`**, decoder-preserved, subtle UI marker.
