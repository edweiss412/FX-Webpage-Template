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
- No extractor *algorithm* change. NOTE: `extractAgendaSchedule` gains ONE guard —
  the §4.5 page cap (early `LOW()` return before the page loop) — and
  `downloadFileBytes` + `enrichAgenda` gain the §4.5 byte cap + per-sheet count cap.
  These are shared, so they also bound the cron path (a deliberate net improvement,
  sized far above the real corpus so behavior is unchanged for real shows). The page
  guard bumps `EXTRACTOR_VERSION` 1→2 (gate-logic change per its own contract).
- No new DB columns / DDL, no migration, no advisory-lock change. No §12.4 catalog
  change (the budget warnings reuse the existing `AGENDA_PDF_UNREADABLE` code).
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

- **Defensive coercion (Codex round-3 Finding 3):** the staged `parse_result` is
  untyped-on-the-wire JSONB; an old/corrupt row may have `agenda_links`
  missing/non-array, or per-link `label`/`fileId`/`url` of the wrong type. Read via
  `const links = arr(pr.show?.agenda_links)` (the existing `arr` guard,
  `Step3SheetCard.tsx:62`); per link, treat `label`/`fileId`/`url` as strings only
  when `typeof === "string"` (else `""`/absent). If `links.length === 0` → **omit**
  the Agenda breakdown entirely.
- **Open-PDF href validation (Codex round-3 Finding 2):** `parseAgendaLinks` stores
  arbitrary non-URL text (filenames/descriptions) in `url`
  (`lib/parser/index.ts:253-255`), so `url` must NOT be rendered as an href blindly.
  A shared helper `agendaPdfHref(link): string | null` returns:
  `link.fileId` (non-empty string) → `https://drive.google.com/file/d/${fileId}/view`;
  else `link.url` ONLY when `typeof url === "string" && /^https?:\/\//i.test(url)`;
  else `null`. The "Open PDF" anchor renders only when the href is non-null, with
  `target="_blank" rel="noopener noreferrer"`; a null href → note text only.
- Else render a `BreakdownSection label="Agenda" count={links.length}` containing,
  per link **in array order**. **The block-vs-note choice is made by an EXPLICIT
  renderability predicate, NOT `link.extracted` truthiness** (Codex round-2
  Finding 2): a React component returning `null` does NOT fall through to a sibling
  branch, so `link.extracted ? <Block/> : <Note/>` would render an empty section
  for a low-confidence/malformed/zero-day payload (which IS truthy). The card
  computes the SAME gate `AgendaScheduleBlock` uses, up front:
  ```ts
  const norm = normalizeAgendaExtraction(link.extracted); // lib/agenda/normalizeAgendaExtraction
  const renderable = !!norm && norm.confidence === "high" && norm.days.length > 0;
  ```
  - if `renderable` → render `<AgendaScheduleBlock extraction={link.extracted}
    label={links.length > 1 ? agendaDisplayLabel(link.label) : null} />`.
  - else (missing / low-confidence / malformed / zero-day `extracted`) → a one-line
    muted note: `"{agendaDisplayLabel(link.label) ?? link.label} · agenda PDF not
    auto-readable"`, **followed by an "Open PDF" anchor iff `agendaPdfHref(link)` is
    non-null** (the validated href above). No valid target → note text only.
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

### 4.5 Onboarding extraction budget (Codex round-2 Finding 1)

The onboarding scan route holds a single request open (`maxDuration = 300`,
`app/api/admin/onboarding/scan/route.ts:19`) while `prepareOnboardingFiles`
processes **every** spreadsheet the folder `listFolder` returns, at concurrency
`ONBOARDING_PREPARE_CONCURRENCY = 12` (`runOnboardingScan.ts`). That cap bounds
concurrent *sheet* prep, NOT total agenda work. Today `downloadFileBytes`
(`lib/drive/agendaDrive.ts:53`) reads the **full arraybuffer** with no byte cap,
and `enrichAgenda` iterates **all** agenda links with no count cap — so a large
shared folder, a sheet with many agenda links, or a single huge PDF could push the
scan into route-timeout / memory / quota failure. (This unbounded shape already
exists on cron; bounding it here improves both paths.)

**Four** explicit, testable caps are added (constants in `lib/agenda/constants.ts`),
each with deterministic **skip + warning** behavior — never a silent drop. Together
they bound **every** cost dimension — per-PDF memory (bytes), per-PDF parse time
(pages), per-sheet count, AND per-scan total — so total inline work in the 300s
onboarding request is hard-bounded regardless of folder size:

| Cap | Constant (proposed) | Where enforced | On exceed |
|---|---|---|---|
| Per-PDF download size (memory) | `AGENDA_PDF_MAX_BYTES = 25 * 1024 * 1024` | `downloadFileBytes` (`agendaDrive.ts`) | streamed bounded read aborts → `{ kind: "unavailable" }` → `enrichAgenda` emits existing `AGENDA_PDF_UNREADABLE` (download-failed message) |
| Per-PDF page count (parse time) | `AGENDA_MAX_PAGES = 80` | `extractAgendaSchedule` (early, right after `getDocument`) | `if (doc.numPages > AGENDA_MAX_PAGES) return LOW()` → 0-day low-confidence → admin note / crew embed-only |
| Agenda PDFs extracted per sheet | `AGENDA_MAX_PDFS_PER_SHEET = 6` | `enrichAgenda` loop | links beyond the cap are skipped with one `AGENDA_PDF_UNREADABLE` warning ("too many agenda PDFs on this sheet …") |
| **Agenda PDFs extracted per scan (folder-wide)** | `AGENDA_MAX_PDFS_PER_SCAN = 40` | `enrichAgenda` via a shared `agendaBudget` on `EnrichContext` | once the scan's shared budget reaches 0, **all** further links across **all** sheets skip extraction with one `AGENDA_PDF_UNREADABLE` warning ("agenda extraction budget for this scan reached — open the PDF") |

**Byte cap mechanism:** `downloadFileBytes` switches its Drive `files.get({ alt:
"media" })` from `responseType: "arraybuffer"` to `responseType: "stream"` and
consumes it via `bytesFromNodeStream(stream, AGENDA_PDF_MAX_BYTES)`
(`lib/sync/boundedBytes.ts:110`); a `ByteLimitExceededError`
(`boundedBytes.ts:5`) is caught and mapped to `{ kind: "unavailable" }` (NOT
`infra_error` — deterministic too-large outcome, mirrors the 404/403 →
`unavailable` mapping at `agendaDrive.ts:65`). Bounds peak memory per PDF.

**Page cap mechanism (Codex round-3 Finding 1):** the byte cap alone does NOT bound
parse time — a small-byte PDF can carry many pages, and `extractAgendaSchedule`
loops `for (p=1..doc.numPages) getTextContent()` (`extractAgendaSchedule.ts:142`),
keeping the 300s onboarding request open. The page cap is checked **once, right
after `getDocument(...).promise`, before the page loop**, returning `LOW()` when
`doc.numPages > AGENDA_MAX_PAGES`. This is a true CPU/time bound (the work is never
done), unlike a `Promise.race` timeout (which lets pdfjs keep running in the
background and consuming CPU across the 12 concurrent prepares). It is a gate-logic
change, so **`EXTRACTOR_VERSION` is bumped 1→2** (its own contract — `constants.ts:11`)
and all `extractorVersion === 1` test assertions update to `2`
(`tests/agenda/extractAgendaSchedule.test.ts`, `tests/agenda/constants.test.ts`,
`tests/onboarding/enrichAgendaIntegration.test.ts`).

**Scan-level budget mechanism (Codex round-4 Finding 1):** per-PDF + per-sheet caps
bound each unit but total work still scales with folder size (sheets × ≤6 × ≤80 pp),
which could keep the streamed 300s request open or saturate CPU on a large shared
folder. So a **folder-wide** cap is added: `EnrichContext` gains an optional
`agendaBudget?: { remaining: number }` (`lib/sync/enrichWithDrivePins.ts`).
`runOnboardingScan` creates **one** budget `{ remaining: AGENDA_MAX_PDFS_PER_SCAN }`
**before** the `mapWithConcurrency(prepareOne)` loop and passes the SAME object into
every per-sheet `EnrichContext` (`runOnboardingScan.ts:934`). `enrichAgenda`, before
each extraction, checks `agendaBudget?.remaining`: `> 0` → decrement and extract;
`<= 0` → skip with the budget warning. The decrement is synchronous (no `await`
between read and write), so it is safe under the 12-way async interleaving (JS single
thread). The cron path passes **no** `agendaBudget` (single show — the per-sheet cap
already bounds it; `undefined` budget = no scan limit). This makes total onboarding
agenda work ≤ `AGENDA_MAX_PDFS_PER_SCAN` extractions, each ≤ bytes × pages — a hard
ceiling independent of folder size. (`AGENDA_MAX_PDFS_PER_SCAN = 40` covers the real
folder — ~19 sheets, ≤2 PDFs each — with headroom; surplus on a pathological folder
is skipped + warned, and the scan still completes.)

**No new §12.4 catalog code:** all four reuse the existing `AGENDA_PDF_UNREADABLE`
code with new free-text `message` strings; the catalog pins code→`helpfulContext`,
not per-instance messages, so no catalog/`gen:spec-codes` change is required.

These caps are sized far above the real corpus (rfi.pdf 538 KB / 10 pp, pcf.pdf
495 KB / 7 pp, fit.pdf 2-day < 80 pp; ≤2 PDFs per sheet) so production extraction is
unaffected; they are pure pathological-input backstops.

## 5. Guard conditions (every input) — see §4.3 + §4.5.

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
3. **`AgendaBreakdown` render (UI/RTL) — predicate, href, coercion (round-2 F2 +
   round-3 F2/F3).** Cases: (a) two high-confidence `extracted` links → two
   `agenda-schedule` blocks with RFI/PCF labels + representative titles;
   (b) **low-confidence** `extracted` → note, no empty block; (c) **malformed**
   `extracted` (garbage object) → note; (d) **high-confidence zero-day** → note;
   (e) no `extracted`, `fileId` set → note + "Open PDF" → `drive.google.com/file/d/<id>/view`;
   (f) no `extracted`, `url = "https://…"` → note + "Open PDF" → that url;
   (g) no `extracted`, `url = "Program.pdf"` (filename) → note, **NO anchor**
   (href validation); (h) no `extracted`, `url = "javascript:…"`/relative →
   **NO anchor**; (i) `agenda_links` **undefined** / `pr.show` missing the field /
   **non-array** → no Agenda breakdown, **no crash** (defensive `arr`); (j) zero
   links → no breakdown. **Derive expected titles from the extraction of
   `fixtures/agenda/*.pdf`, not hardcoded** (anti-tautology); when scanning DOM for
   a label, clone-and-strip sibling breakdowns first. *Failure modes caught:* the
   `link.extracted ? <Block/> : <Note/>` empty-section trap; rendering arbitrary
   sheet text as an href; crashing on corrupt staged JSON.
4. **Extraction budget — bytes × pages × count (round-2 F1 + round-3 F1).**
   - `downloadFileBytes` byte cap: a mocked Drive `files.get` stream emitting
     > `AGENDA_PDF_MAX_BYTES` → `{ kind: "unavailable" }` (NOT `infra_error`); a
     stream under the cap → `{ kind: "bytes" }` with correct bytes (regression:
     existing fixture downloads still succeed). Feed `cap + 1` bytes.
   - `extractAgendaSchedule` page cap: mock the pdfjs loader so `getDocument` yields
     a doc with `numPages = AGENDA_MAX_PAGES + 1` → returns `confidence: "low"`,
     `days: []` **without** iterating pages (assert `getPage`/`getTextContent` is
     not called past the guard, or use a spy). Regression: `fixtures/agenda/*.pdf`
     (≤10 pp) still extract high-confidence. Also assert `extractorVersion === 2`.
   - `enrichAgenda` per-sheet count cap: a `ParseResult` with
     `AGENDA_MAX_PDFS_PER_SHEET + 1` fileId-bearing links → only the first N are
     extracted; the surplus links get an `AGENDA_PDF_UNREADABLE` warning and no
     `extracted`.
   - `enrichAgenda` scan-level budget: drive several `enrichAgenda` calls sharing
     one `agendaBudget = { remaining: 2 }` (small test value via injected ctx) →
     extraction stops after 2 total PDFs across calls; later links across later
     "sheets" skip with the budget warning. Also assert a `ctx` with **no**
     `agendaBudget` (cron) imposes no scan limit. *Failure mode caught:* total inline
     extraction unbounded by folder size — scan exceeding the 300s request.
5. **Crew no-regression (negative).** Assert the crew `ScheduleSection` still
   renders exactly one `AgendaScheduleBlock` per high-confidence link and that
   nothing in this change touches `runOfShow` (guard against accidental
   duplication / re-introduction of the merge). Verify by confirming no new
   `runOfShow` write path exists.
6. **Impeccable dual-gate** (critique + audit) on the admin card diff (invariant 8).

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
| `lib/sync/runOnboardingScan.ts` | extend `defaultDriveClient` w/ `downloadFileBytes`+`getAgendaChips`; **export** `defaultDriveClient` for the meta-test; create one `agendaBudget` per scan and pass it into every per-sheet `EnrichContext` |
| `lib/sync/enrichWithDrivePins.ts` | add optional `agendaBudget?: { remaining: number }` to `EnrichContext`; pass `ctx.agendaBudget` into `enrichAgenda` |
| `lib/agenda/constants.ts` | add `AGENDA_PDF_MAX_BYTES`, `AGENDA_MAX_PAGES`, `AGENDA_MAX_PDFS_PER_SHEET`, `AGENDA_MAX_PDFS_PER_SCAN`; bump `EXTRACTOR_VERSION` 1→2 (§4.5) |
| `lib/agenda/extractAgendaSchedule.ts` | page-cap guard: early `LOW()` when `doc.numPages > AGENDA_MAX_PAGES` (before the page loop) |
| `lib/drive/agendaDrive.ts` | `downloadFileBytes` byte cap via streamed `bytesFromNodeStream` → `unavailable` on exceed |
| `lib/sync/enrichAgenda.ts` | per-sheet count cap + scan-level `agendaBudget` decrement/skip + skip-warnings (new param) |
| `components/admin/wizard/Step3SheetCard.tsx` | new `AgendaBreakdown` (reuses `AgendaScheduleBlock` + `normalizeAgendaExtraction` predicate + `agendaPdfHref` validator + `arr` coercion); render from `pr.show?.agenda_links` |
| `tests/sync/driveClientImplCompleteness.test.ts` | add onboarding default to `IMPLS` |
| `tests/drive/agendaDrive.test.ts` | byte-cap test (Task 4) |
| `tests/agenda/extractAgendaSchedule.test.ts` | page-cap test + `extractorVersion === 2` (Task 4) |
| `tests/agenda/constants.test.ts`, `tests/onboarding/enrichAgendaIntegration.test.ts` | update `EXTRACTOR_VERSION`/`extractorVersion` assertions 1→2 |
| `tests/sync/enrichAgenda.test.ts` | per-sheet count-cap test (Task 4) |
| `tests/onboarding/...` | extraction-populates-`extracted` test (Task 2) |
| `tests/components/admin/...` | `AgendaBreakdown` render test incl. low/malformed/zero-day/href/coercion (Task 3) |
| `BACKLOG.md` | file `BL-AGENDA-EXTRACTION-HYDRATION` |

**Not touched (dropped from rev 1):** `lib/parser/types.ts`,
`lib/data/decodeRunOfShow.ts`, `components/crew/**`, any `runOfShow` write path, no
new `lib/sync/mergeAgendaIntoRunOfShow.ts`. (`enrichWithDrivePins.ts` IS touched as
of rev5 — the `EnrichContext.agendaBudget` field.)

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
- Render gate: **explicit `normalizeAgendaExtraction` predicate** decides
  block-vs-note (never `link.extracted` truthiness); note carries an "Open PDF"
  link; tests cover low/malformed/zero-day (Codex round-2 F2).
- Budget: **per-PDF byte + per-PDF page + per-sheet count + per-scan total** caps,
  deterministic skip+warning, sized above the real corpus (Codex round-2/3/4 F1).
  Page cap bumps `EXTRACTOR_VERSION`→2. Scan-level cap via a shared `agendaBudget` on
  `EnrichContext` (onboarding only; cron passes none). Every cost dimension bounded.
- Href safety: **`agendaPdfHref` validator** — Drive URL from `fileId`, or `url`
  only when `^https?://`, else no anchor (Codex round-3 F2).
- Robustness: **`arr(pr.show?.agenda_links)` + per-field string coercion** against
  corrupt staged JSONB (Codex round-3 F3).
