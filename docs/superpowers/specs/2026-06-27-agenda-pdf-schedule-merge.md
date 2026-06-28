# Spec: Surface agenda-PDF schedule in the admin Step-3 review card

**Date:** 2026-06-27
**Slug:** `agenda-pdf-schedule-merge` (retained; the deliverable narrowed during
adversarial review — see §1.1)
**Status:** Draft (autonomous-ship pipeline) — rev 2 (post Codex round 1)

## 1. Problem

The admin Step-3 onboarding review card shows a SCHEDULE breakdown with only bare
dates and no session detail for shows whose structured schedule sources are empty.
For the "Redefining Fixed Income / Private Credit" show (sheet
`1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg`):

- DATES TIME column (`lib/parser/blocks/scheduleTimes.ts`) → one start-only day
  (`"GS: 8:00 AM - "`) and one unparseable placeholder (`"GS: ... - 6:00 PM"` →
  `SCHEDULE_TIME_UNPARSED`, **correct**, out of scope).
- AGENDA tab → title-less START/FINISH skeleton → no titled entries.

The only detailed agenda source is the two agenda PDFs (linked as Drive file
smart-chips: `AGENDA LINK - RFI`, `AGENDA LINK - PCF`). The extractor
(`lib/agenda/extractAgendaSchedule.ts`) parses both at **high confidence**
(verified — `tests/agenda/extractAgendaSchedule.test.ts` passes: rfi.pdf → 18
sessions incl. a 2-track breakout; pcf.pdf → 19 sessions, 1 time auto-correction).

Two facts make the card empty:

1. **Extraction never runs during onboarding.** The onboarding
   `defaultDriveClient` (`lib/sync/runOnboardingScan.ts:218-229`) implements only
   `getFile` + `listFolder`, so `enrichAgenda` short-circuits at
   `if (!downloadFileBytes) return;` (`lib/sync/enrichAgenda.ts:57-58`). The
   staged `parse_result` therefore carries `agenda_links` with **no** `extracted`.
2. **The card has no agenda surface.** `Step3SheetCard` breakdowns are Crew /
   Schedule / Rooms / Hotels / Warnings (`components/admin/wizard/Step3SheetCard.tsx`);
   it never reads `agenda_links` / `extracted`.

### 1.1 Scope narrowing (Codex round-1 Finding 1)

The original draft proposed merging extracted PDF sessions into `runOfShow` on
**both** surfaces. Adversarial review surfaced that the **crew Schedule section
already renders the structured PDF agenda** via `AgendaScheduleBlock`
(`components/crew/sections/ScheduleSection.tsx:118-138` → renders
`AgendaScheduleBlock` per `link.extracted`, "the authoritative schedule overview
… above the day-cards grid"). Merging the same sessions into `runOfShow` would
render them **twice** on crew (in `AgendaScheduleBlock` AND inside each day card).

**Resolution (user-confirmed):** the crew page is already correct (post-extraction)
and is left **unchanged**. The deliverable is to give the **admin Step-3 card** the
same structured-agenda render the crew page already has, by (a) running extraction
during onboarding and (b) rendering `AgendaScheduleBlock` in a new card breakdown.
The `runOfShow` merge, the `ScheduleDay.source` tag, the `decodeRunOfShow` change,
and the day→ISO mapping / session-flattening logic are **all dropped** — they are
unnecessary once we reuse the existing extraction render.

## 2. Goal

The admin Step-3 review card shows the structured per-day agenda schedule extracted
from each high-confidence agenda PDF, populated on first review (extraction runs
during the onboarding scan). No change to crew rendering.

## 3. Non-goals / out of scope

- The `SCHEDULE_TIME_UNPARSED` warning stays (correct flag; sheet edit is the
  operator's call).
- No change to crew (`ScheduleSection`, `AgendaScheduleBlock`, `AgendaEmbed`,
  `RunOfShowList`), to `runOfShow` / `decodeRunOfShow`, or to `ScheduleDay`.
- No change to the extractor.
- No new DB columns / DDL, no migration, no advisory-lock change.
- **Prior-extraction hydration across parses is out of scope** (see §4.4) — it is a
  pre-existing efficiency gap affecting cron today and is filed to BACKLOG, not
  introduced or fixed here.

## 4. Design

### 4.1 Run extraction during onboarding

Extend the onboarding `defaultDriveClient` (`lib/sync/runOnboardingScan.ts:218`) to
implement `downloadFileBytes` + `getAgendaChips` by importing the **existing**
production impls from `lib/drive/agendaDrive.ts` (the cron path already wires them
at `lib/sync/runScheduledCronSync.ts:1665-1666`). The onboarding prepare loop
already calls `enrichWithDrivePins(parsed, driveClient, …)` per sheet
(`runOnboardingScan.ts:933-934`) with `driveClient = deps.driveClient ??
defaultDriveClient()` (`:918`), and `enrichWithDrivePins` already calls
`enrichAgenda` (`enrichWithDrivePins.ts:322`). So once the default client exposes
the two methods, extraction runs during the scan and `agenda_links[].extracted` is
populated in the staged `parse_result` (`runOnboardingScan.ts:933-947, 584-589`).

`enrichAgenda` is best-effort and never throws out of the scan
(`enrichAgenda.ts:172-175`); an `infra_error` leaves a link unenriched and retries
next sync (existing behavior).

### 4.2 Render the agenda in the Step-3 card

Add an `AgendaBreakdown` to `Step3SheetCard` (`components/admin/wizard/Step3SheetCard.tsx`),
rendered inside the existing expandable breakdown area alongside Crew / Schedule /
Rooms / Hotels. Data source: `pr.show.agenda_links` (the staged `ParseResult`'s
`show.agenda_links`; `pr` is already in scope — `:607` reads `pr.runOfShow`).

Render rules:

- `links = pr.show.agenda_links`. If `links.length === 0` → **omit** the Agenda
  breakdown entirely (mirrors the existing breakdowns' empty handling).
- Else render a `BreakdownSection label="Agenda" count={links.length}` containing,
  per link **in array order**:
  - if `link.extracted` is a high-confidence extraction with ≥1 day → render
    `<AgendaScheduleBlock extraction={link.extracted} label={links.length > 1 ?
    agendaDisplayLabel(link.label) : null} />`. `AgendaScheduleBlock` self-gates
    (returns `null` for low/malformed/0-day — `AgendaScheduleBlock.tsx:62-64`), so
    a low-confidence link falls through to the note below.
  - else → a one-line muted note: `"{agendaDisplayLabel(link.label)} · agenda PDF
    not auto-readable — open the PDF to view"` (so the operator sees that a PDF is
    linked but produced no structured schedule).
- The `label` badge (per-document, e.g. "RFI"/"PCF") is shown only when
  `links.length > 1`, mirroring the crew rule
  (`ScheduleSection.tsx:131-132`, `agendaDisplayLabel` from
  `lib/agenda/agendaLabel.ts`, imported at `ScheduleSection.tsx:42`).

**Reuse, not fork:** import the existing `AgendaScheduleBlock`
(`components/crew/AgendaScheduleBlock.tsx`) — it is a pure presentational Server
Component consuming the raw `extracted` jsonb via `normalizeAgendaExtraction`, with
no crew-specific dependency. It is NOT relocated (avoids churn to crew imports).

### 4.3 UI specifics (Opus + impeccable invariant 8)

`AgendaBreakdown` is a UI surface under `components/` → Opus-only + invariant 8
(impeccable critique + audit, HIGH/CRITICAL fixed or `DEFERRED.md`).

- **Guard conditions:** `agenda_links` absent/empty → no breakdown. A link with
  `extracted: undefined` (extraction didn't run / infra error) → note line. A
  link whose `extracted` is low-confidence → note line. A high-confidence link →
  `AgendaScheduleBlock`. `pr` null/corrupt → the card's existing §4.6 no-details
  guard already returns before breakdowns render (unchanged).
- **Dimensional invariants:** `AgendaScheduleBlock` already declares its own
  (`AgendaScheduleBlock.tsx:30-37`: `min-w-0`, `grid-cols-[auto_minmax(0,1fr)]`,
  `wrap-break-word`). The breakdown wrapper adds only flow content; it introduces
  no fixed-dimension parent → no new parent→child invariant. (Tailwind v4 no-
  default-`items-stretch` rule: N/A — no stretch dependency.)
- **Transition inventory:** the breakdown participates in the existing
  expand/collapse toggle of the card (the only state transition). The Agenda
  content itself is server-rendered and static within an expanded card — **instant,
  no animation.** Two content states (block vs note) per link are mutually
  exclusive at render time (no client toggle) — instant.
- **Copy:** the note text is descriptive UI copy, not a raw error code, so it does
  NOT route through `lib/messages/lookup.ts` (invariant 5 is about raw error codes;
  N/A).
- **Day-label fidelity:** `AgendaScheduleBlock` shows `day.dayLabel` verbatim
  (`AgendaScheduleBlock.tsx`). For these PDFs that is `"Tuesday May 13,2024"`
  (source year typo) and `"Wednes day, May 14 , 202 5"` (PDF text-extraction
  spacing). This is acceptable on a **review** surface — it reflects the PDF's own
  header and lets the operator spot source typos. No normalization is added.

### 4.4 Cost & caching reality (Codex round-1 Finding 2)

The original draft claimed the PDF parse cost is "paid once" via the
`agenda_links[].extracted` revision cache. **That claim was wrong and is removed.**
The revision/`extractorVersion` cache check (`enrichAgenda.ts:115-121`) only hits
when a link already carries prior `extracted`; but every parse path
(`parseAgendaLinks` in `lib/parser/index.ts:236-259`, called by both
`runOnboardingScan` and `runScheduledCronSync`) builds **fresh** `agenda_links`
with only `label`/`fileId`/`url` and no `extracted` — the prior stored
`agenda_links` are not hydrated back in before `enrichAgenda`. So extraction
re-downloads + re-parses on each relevant sync. This is **pre-existing cron
behavior**, unchanged by this feature.

What this feature adds: the onboarding scan now also downloads + parses agenda PDFs
inline, per sheet, for every agenda link. Cost is bounded by the scan's existing
fan-out cap (`runOnboardingScan.ts:44-55`) and is best-effort (never blocks the
scan). For the fxav-test-shows folder (≤19 sheets, ≤2 PDFs each) this is ≤~38 PDF
downloads per full scan; re-scans repeat it (operator-triggered, infrequent). This
cost is **accepted** (user decision: inline during scan).

**Prior-extraction hydration** (matching fresh links to prior `extracted` by
`fileId` + revision so the cache actually hits across parses) would remove the
repeated cost for BOTH onboarding re-scans and cron, but it touches the cron read
path and is a pre-existing inefficiency independent of this feature → filed to
`BACKLOG.md` as `BL-AGENDA-EXTRACTION-HYDRATION`, out of scope here.

## 5. Guard conditions (every input) — see §4.3.

## 6. Numeric sweep

- Agenda links for this show: **2** (RFI, PCF); both high-confidence → 2
  `AgendaScheduleBlock`s, each with the per-doc `label` (since `length > 1`).
- RFI: 1 day ("Tuesday May 13,2024"), 18 sessions (1 with 2 breakout tracks).
  PCF: 1 day ("Wednes day, May 14 , 202 5"), 19 sessions (2 null-title break rows
  render per `AgendaScheduleBlock`'s own rules; 1 drift note on the 12:25 lunch).
- `AgendaScheduleBlock` render gate: high-confidence + ≥1 day
  (`AgendaScheduleBlock.tsx:62-64`).
- No counts in `runOfShow` / `decodeRunOfShow` change (those are untouched).

## 7. Test plan (TDD per task)

1. **Onboarding default client exposes the methods (structural — Finding 3).**
   Export the onboarding `defaultDriveClient` from `runOnboardingScan.ts` and add
   it to the `IMPLS` table in `tests/sync/driveClientImplCompleteness.test.ts`
   (currently only the cron default + mock). Assert it exposes `downloadFileBytes`
   + `getAgendaChips`. *Failure mode caught:* the production onboarding path stays
   method-less while a mock-injected scan test passes (card empty in prod).
2. **Onboarding extraction populates `extracted` via the real default path.** In
   the onboarding-scan test harness, run the prepare/scan path WITHOUT injecting a
   `driveClient` (or inject one whose agenda methods are spied) over a sheet with
   agenda chips (reuse `tests/onboarding/enrichAgendaIntegration.test.ts` patterns
   + `fixtures/agenda/*.pdf`); assert the staged `parse_result.show.agenda_links[i].extracted`
   is a high-confidence extraction. *Failure mode:* enrichAgenda silently
   short-circuits.
3. **`AgendaBreakdown` render (UI/RTL).** Given a `ParseResult` with two
   high-confidence `extracted` links → two `agenda-schedule` blocks with RFI/PCF
   labels and representative titles ("Registration & Breakfast", "Lunch"). Given a
   link with no `extracted` → the muted note line, no block. Given zero agenda
   links → no Agenda breakdown rendered. **Derive expected titles from the
   extraction of `fixtures/agenda/*.pdf`, not hardcoded** (anti-tautology); when
   scanning DOM for a label, clone-and-strip the sibling Schedule/Rooms breakdowns
   first so the assertion can't be satisfied by another section.
4. **Crew no-regression (negative).** Assert the crew `ScheduleSection` still
   renders exactly one `AgendaScheduleBlock` per high-confidence link and that
   nothing in this change touches `runOfShow` (guard against accidental
   duplication / re-introduction of the merge). Verify by confirming no new
   `runOfShow` write path exists.
5. **Impeccable dual-gate** (critique + audit) on the admin card diff (invariant 8).

## 8. Meta-test inventory

- **EXTEND** `tests/sync/driveClientImplCompleteness.test.ts` — add the onboarding
  `defaultDriveClient` to the completeness `IMPLS` (Task 1). This is the structural
  defense for Finding 3.
- **Supabase call-boundary** (`tests/sync/_metaInfraContract.test.ts`):
  `downloadFileBytes` + `getAgendaChips` (in `agendaDrive.ts`) are already
  registered; the onboarding client reuses the same functions — **no new boundary,
  no new row.**
- **Advisory-lock topology:** no `pg_advisory*` touched. No change to
  `tests/auth/advisoryLockRpcDeadlock.test.ts`.
- No new RPC-gated table → no PostgREST DML lockdown change.

## 9. Files touched

| File | Change |
|---|---|
| `lib/sync/runOnboardingScan.ts` | extend `defaultDriveClient` w/ `downloadFileBytes`+`getAgendaChips` (import from `agendaDrive.ts`); **export** `defaultDriveClient` for the meta-test |
| `components/admin/wizard/Step3SheetCard.tsx` | new `AgendaBreakdown` (reuses `AgendaScheduleBlock`); render it from `pr.show.agenda_links` |
| `tests/sync/driveClientImplCompleteness.test.ts` | add onboarding default to `IMPLS` |
| `tests/onboarding/...` | extraction-populates-`extracted` test (Task 2) |
| `tests/components/admin/...` | `AgendaBreakdown` render test (Task 3) |
| `BACKLOG.md` | file `BL-AGENDA-EXTRACTION-HYDRATION` |

**Not touched (dropped from rev 1):** `lib/parser/types.ts`,
`lib/data/decodeRunOfShow.ts`, `lib/sync/enrichWithDrivePins.ts`,
`components/crew/**`, any `runOfShow` write path, no new `lib/sync/mergeAgendaIntoRunOfShow.ts`.

## 10. Resolved decisions

- Surface: **admin Step-3 card only**; crew already renders the agenda and is
  unchanged (Codex F1 + user confirmation).
- Render: **reuse `AgendaScheduleBlock`** in a new card breakdown (not a runOfShow
  merge).
- Timing: **extraction inline during the onboarding scan** (cron already runs it).
- Caching: **no cross-parse cache claim**; extraction re-runs per parse
  (pre-existing); hydration → BACKLOG (Codex F2).
- Structural pin: **onboarding `defaultDriveClient` added to the DriveClient
  completeness meta-test** (Codex F3).
