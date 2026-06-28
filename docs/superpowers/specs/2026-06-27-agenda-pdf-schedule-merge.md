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
Rooms / Hotels.

**All agenda display logic is computed SERVER-SIDE into an explicit preview shape**
(Codex round-8 F2 + round-9 F2) — the `"use client"` card is pure presentation. The
Step-3 row gains `adminAgendaPreview?: AdminAgendaItem[]`, built at row assembly from
`parse_result.show.agenda_links` and serialized INSTEAD of the heavy raw extractions
(the server also strips `agenda_links[].extracted` from the client-bound
`parse_result`, so the full extraction never crosses to the browser):

```ts
type AdminAgendaItem = {
  label: string;            // agendaDisplayLabel(link.label) ?? link.label, coerced
  badge: string | null;     // per-doc badge when >1 link, else null
  href: string | null;      // agendaPdfHref(link) — validated (see below)
  block: {                  // present iff renderable; else null → note-only item
    extraction: AgendaExtraction;  // already capped (sessions+tracks)
    droppedSessions: number; droppedDays: number; droppedTracks: number;
  } | null;
};
```

The card renders purely from `row.adminAgendaPreview`: a `block` item →
`<AgendaScheduleBlock extraction={block.extraction} label={badge} />` + overflow note
driven by the explicit `dropped*` counts (which survive serialization because they
are siblings of `extraction`, NOT inside it — `AgendaScheduleBlock`/`normalizeAgendaExtraction`
would strip extra fields placed inside the `AgendaExtraction`, round-9 F2); a
`block: null` item → the muted note + "Open PDF" anchor (when `href` non-null).

Server-side build rules (the logic that produces each `AdminAgendaItem`):

- **Defensive coercion (Codex round-3 Finding 3):** the staged `parse_result` is
  untyped-on-the-wire JSONB; an old/corrupt row may have `agenda_links`
  missing/non-array, or per-link `label`/`fileId`/`url` of the wrong type.
  `buildAdminAgendaPreview` reads `agenda_links` via an array guard (`arr(...)`, the
  pattern at `Step3SheetCard.tsx:62` — imported/shared into the server helper); per
  link, treat `label`/`fileId`/`url` as strings only when `typeof === "string"`
  (else `""`/absent). Empty/missing/non-array `agenda_links` → empty preview →
  `fetchStep3Data` sets no `adminAgendaPreview` → the card **omits** the Agenda
  breakdown (the card just checks `row.adminAgendaPreview?.length`).
- **Open-PDF href validation (Codex round-3 Finding 2):** `parseAgendaLinks` stores
  arbitrary non-URL text (filenames/descriptions) in `url`
  (`lib/parser/index.ts:253-255`), so `url` must NOT be rendered as an href blindly.
  A shared helper `agendaPdfHref(link): string | null` returns:
  `link.fileId` (non-empty string) → `https://drive.google.com/file/d/${fileId}/view`;
  else `link.url` ONLY when `typeof url === "string" && /^https?:\/\//i.test(url)`;
  else `null`. The "Open PDF" anchor renders only when the href is non-null, with
  `target="_blank" rel="noopener noreferrer"`; a null href → note text only.
- **`block` vs note is decided by an EXPLICIT renderability predicate, NOT
  `link.extracted` truthiness** (Codex round-2 Finding 2 — a low-confidence/malformed/
  zero-day payload is truthy, so `extracted ? block : note` would yield an empty
  block). The server computes the SAME gate `AgendaScheduleBlock` uses:
  ```ts
  const norm = normalizeAgendaExtraction(link.extracted); // lib/agenda/normalizeAgendaExtraction
  const renderable = !!norm && norm.confidence === "high" && norm.days.length > 0;
  ```
  - `renderable` → `block = { extraction: capExtractionForAdmin(norm, …), droppedSessions, droppedDays, droppedTracks }` (cap per "Render-size cap").
  - else (missing / low-confidence / malformed / zero-day, **including a cap/budget-
    skipped link** which simply has no `extracted`) → `block = null`; the card shows
    the muted note `"{label} · agenda schedule not shown here"` + "Open PDF" iff
    `href` non-null (copy accurate for both "couldn't auto-read" and "skipped").
- `badge` (per-doc, e.g. "RFI"/"PCF") is set only when the renderable-or-noted link
  count `> 1`, mirroring the crew rule (`ScheduleSection.tsx:131-132`,
  `agendaDisplayLabel` from `lib/agenda/agendaLabel.ts`).
- The `BreakdownSection label="Agenda" count={adminAgendaPreview.length}` is omitted
  when the preview is empty.

**Render-size cap (Codex round-5 Finding 1).** `AgendaScheduleBlock` maps **all**
days/sessions/tracks — fine on the crew page (authoritative full view) but, on the
**review** card, an up-to-80-page high-confidence agenda would bloat the expanded
card, and the existing card breakdowns all cap their lists (`SCHEDULE_ENTRIES_CAP=6`,
`ROOMS_CAP`, etc. — `Step3SheetCard.tsx:57-58`). The cap is applied in the admin
breakdown **by slicing the extraction BEFORE it reaches `AgendaScheduleBlock`** (so
the crew component and crew page are untouched):

- A helper `capExtractionForAdmin(extraction, sessionCap, trackCap)` walks `days` in
  order, accumulating sessions until `AGENDA_ADMIN_SESSIONS_CAP` total sessions are
  kept (a partially-filled day keeps its first sessions; later days are dropped once
  the cap is hit). **For each KEPT session it also truncates `tracks` to the first
  `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`** (Codex round-6 Finding 2 — the staged
  extraction is untyped JSONB; a corrupt/unusual session with hundreds of track rows
  would otherwise bloat the card despite the session cap, since `AgendaScheduleBlock`
  renders every track of every kept session). Returns
  `{ capped, droppedSessions, droppedDays, droppedTracks }`.
- The `dropped*` counts ride on the preview `block` (siblings of `extraction`). The
  card renders an overflow note under the block when `droppedSessions > 0` **or
  `droppedTracks > 0`**: `"+{droppedSessions} more sessions — open the PDF"` (or, when
  only tracks dropped, `"Some breakout tracks hidden — open the PDF"`) with the item
  `href` anchor. Mirrors `ScheduleBreakdown`'s in-place overflow stub. (The counts are
  an explicit side-channel precisely because `AgendaScheduleBlock`/`normalizeAgendaExtraction`
  would discard any field placed INSIDE the `AgendaExtraction` — round-9 F2.)
- **Links** are bounded by the per-sheet extraction cap, but the server also caps the
  preview at `AGENDA_MAX_PDFS_PER_SHEET` items (note items included), appending a
  synthetic trailing note item `"+N more agenda PDFs"` when exceeded — so even a
  pathological `agenda_links` array can't produce unbounded rows OR payload.
- Constants `AGENDA_ADMIN_SESSIONS_CAP = 8`, `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP = 6`
  (compact review view; full agenda is one "Open PDF" click away). Real corpus (RFI
  18 / PCF 19 sessions; ≤2 tracks/session) → 8 shown + overflow note, tracks
  unaffected (under the track cap) — exactly the bounded-review behavior intended.

**Where the server build runs.** `adminAgendaPreview` is computed in the SERVER
component `OnboardingWizard`'s row-assembly function **`fetchStep3Data`**
(`components/admin/OnboardingWizard.tsx:191`, an `async` server fn that reads
`onboarding_scan_manifest` + the staged `parse_result` at `:231`/`:277-283` and maps
to `Step3Row[]` at `:295`) — and, for the LIVE first-seen path, the analogous staged
review server component `app/admin/show/staged/[stagedId]/page.tsx`. There, per row:
build `adminAgendaPreview` from `parse_result.show.agenda_links`, AND **strip**
`agenda_links[].extracted` from the `parseResult` placed on the client-bound
`Step3Row`. So the browser receives only the bounded preview (≤ `AGENDA_MAX_PDFS_PER_SHEET`
items, each block ≤ `AGENDA_ADMIN_SESSIONS_CAP` sessions × `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`
tracks) — never the full extraction. A test pins `fetchStep3Data`'s output: the
serialized `Step3Row` carries ≤ cap sessions/tracks, the correct `dropped*`, and no
raw `extracted`. (The broader "full `parse_result` → client" shape is pre-existing
for every breakdown; this feature caps only the one large item — extracted agenda.)

**Component boundary (Codex round-10 Finding 1).** `Step3SheetCard`/`Step3Review` are
`"use client"`; the agenda renderer must therefore be **client-safe**. The existing
`AgendaScheduleBlock` (`components/crew/AgendaScheduleBlock.tsx`) is in fact a PURE,
isomorphic component — its only imports are the React `JSX` type and the pure
`normalizeAgendaExtraction` (whose only import is `@/lib/agenda/types`); it has NO
`server-only`/`next/headers`/`fs`/Drive dependency (the "Server Component" phrasing in
its doc comment describes its crew *usage context*, not a hard constraint). A
component with no `"use client"` and no server-only deps adopts its importer's
environment, so importing it INTO the client card is valid and bundles it client-side
— no Next.js boundary break. It renders `block.extraction` (already capped + small).
**Guard:** a structural test asserts the admin agenda render path pulls in nothing
`server-only` (keeps `AgendaScheduleBlock`/`normalizeAgendaExtraction` pure), so a
future server-only import there is caught rather than silently breaking the client
build. The card is otherwise pure presentation over `AdminAgendaItem` — it does NOT
call `normalizeAgendaExtraction`/`capExtractionForAdmin`/`agendaPdfHref` itself (those
run in `fetchStep3Data`); it only renders `block.extraction` via `AgendaScheduleBlock`
plus the `dropped*` overflow note and the `href` anchor. `AgendaScheduleBlock` is NOT
relocated (avoids churn to crew imports).

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
each with **deterministic skip** behavior — never a silent drop (skips are surfaced;
see "Skip visibility" below). Together they bound **every** cost dimension — per-PDF
memory (bytes), per-PDF parse time (pages), per-sheet count, AND per-scan total
(incl. the `getAgendaChips` Sheets call) — so total inline work in the 300s
onboarding request is hard-bounded regardless of folder size:

| Cap | Constant (proposed) | Where enforced | On exceed |
|---|---|---|---|
| Per-PDF download size (memory) | `AGENDA_PDF_MAX_BYTES = 25 * 1024 * 1024` | `downloadFileBytes` (`agendaDrive.ts`) | streamed bounded read aborts → `{ kind: "unavailable" }` → `enrichAgenda` emits existing `AGENDA_PDF_UNREADABLE` (download-failed message) |
| Per-PDF page count (parse time) | `AGENDA_MAX_PAGES = 80` | `extractAgendaSchedule` (early, right after `getDocument`) | `if (doc.numPages > AGENDA_MAX_PAGES) return LOW()` → 0-day low-confidence → admin note / crew embed-only |
| Agenda-link **attempts** per sheet | `AGENDA_MAX_PDFS_PER_SHEET = 6` | `enrichAgenda` loop, **at the top of each link iteration, BEFORE `getFile`** | the (i ≥ cap)-th link skips **before any Drive call**; surfaced via the admin card note / crew embed (NO warning — see "Skip visibility" below) |
| **Agenda-link attempts per scan (folder-wide)** | `AGENDA_MAX_PDFS_PER_SCAN = 40` | `enrichAgenda` entry-gate + per-link decrement, **before `getAgendaChips` AND before `getFile`** | once the shared budget reaches 0, the sheet skips **all** agenda work (chips + links) **before any Sheets/Drive call**; surfaced via the card note / crew embed (NO warning) |

**Call-timeout / stall guard (Codex round-8 Finding 1).** Byte/page/count caps bound
*work*, not a *hang*: googleapis/gaxios have no default wall-clock, and moving agenda
Drive/Sheets calls into the 300s onboarding request re-opens the onboarding-scan hang
class the repo already closed for its export reads (PRs #128/#132/#136/#140 — untimed
Drive reads stalled `prepareOne`). So the two NEW calls reuse the existing guards:
- `downloadFileBytes` (now streamed): wrap the byte-stream consumption in
  `createStallGuard(...)` (`lib/drive/stallGuard.ts:32` — the idle/no-progress
  AbortController already used for asset/revision byte-streams; a stalled socket
  trips the idle timer) and pass its `signal` to the gaxios stream request; an abort
  (stall) is caught → `{ kind: "infra_error" }` (transient, retried next sync — NOT a
  deterministic `unavailable`).
- `getAgendaChips` (Sheets `spreadsheets.get`): add `{ timeout: DRIVE_FILES_GET_TIMEOUT_MS }`
  (`lib/drive/fetch.ts:99`) and the existing transient-retry wrapper, mirroring the
  timed+retried Sheets get at `lib/drive/sheetGids.ts`. A timeout → `{ kind: "infra_error" }`.
- `getFile` already routes through the timed metadata fetch
  (`fetch.ts` `DRIVE_FILES_GET_TIMEOUT_MS`) on both clients — unchanged.
This makes every new Drive/Sheets call wall-clock-bounded, so no single stalled call
can hang the scan past its guard.

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
every per-sheet `EnrichContext` (`runOnboardingScan.ts:934`).

**The budget (and the per-sheet cap) are consumed per-link as a PROCESSING-ATTEMPT
budget, decremented at the TOP of each link iteration BEFORE `getFile` / download /
extract — NOT only on successful extraction** (Codex round-6 Finding 1). This is
critical: if the budget were checked only after the mime/trashed gate, a folder full
of non-PDF / trashed / unavailable agenda links would still issue up to
`AGENDA_MAX_PDFS_PER_SHEET` `getFile` metadata calls per sheet × every sheet,
re-opening the exact timeout/quota class the budget exists to close. So `enrichAgenda`'s
per-link loop, FIRST thing per link: if the per-sheet counter ≥ cap OR
`agendaBudget?.remaining <= 0` → `continue` **before any Drive call**; else decrement
both counters and proceed to `getFile`/download/extract. A link that consumes an
attempt but then fails the mime/byte gate still counts (it did Drive work). The
decrement is synchronous (no `await` between read and write), so it is safe under the
12-way async interleaving (JS single thread). The cron path passes **no** `agendaBudget`
(single show — the per-sheet cap already bounds it; `undefined` budget = no scan
limit).

**Budget CONSUMES for `getAgendaChips`, not just gates it (Codex round-7 F1 +
round-9 F1).** `enrichAgenda` does fileId recovery via `getAgendaChips(spreadsheetId)`
ONCE per sheet whenever any link lacks a `fileId` — and this feature's target shows
ARE chip-based. An entry-gate alone is insufficient: if chip recovery then returns
`infra_error` / a count-mismatch / no-chip rows, the per-link loop hits
`if (!link.fileId) continue` and **never decrements**, so a folder of chip-failing
sheets keeps `remaining` unchanged and issues one Sheets read per sheet — the bypass
round-9 F1 caught. Fix: the **chip recovery itself reserves budget**. Before calling
`getAgendaChips`, `enrichAgenda`: if `agendaBudget && remaining <= 0` → skip chip
recovery entirely (links stay fileId-less → note items); else **decrement 1**
(reserving the Sheets call) and call `getAgendaChips`. The decrement happens
**regardless of the chip call's outcome** (rows / mismatch / `infra_error`), so every
`getAgendaChips` consumes budget. The per-link loop then decrements per processed
fileId-bearing link as before. Net: `getAgendaChips` calls ≤ `AGENDA_MAX_PDFS_PER_SCAN`
+ concurrency, and total Sheets+Drive calls (chips + getFile + downloads) are all
budget-bounded, independent of folder size or chip-failure rate. (The per-sheet cap
`AGENDA_MAX_PDFS_PER_SHEET` likewise counts the chip reservation + per-link attempts.)

Net: total onboarding agenda work — `getAgendaChips` reads, `getFile` metadata, and
`downloadFileBytes` — is ≤ `AGENDA_MAX_PDFS_PER_SCAN` (+concurrency) attempts, each
≤ bytes × pages. A hard ceiling independent of folder size or how many links are
non-PDF/chip-based. (`AGENDA_MAX_PDFS_PER_SCAN = 40` covers the real ~19-sheet folder
with headroom; surplus is skipped, the scan completes.)

**Skip visibility — no warning for count/scan-budget skips (Codex round-7 Finding 2).**
The Step-3 + per-show warning UIs render the **cataloged title/helpfulContext** for a
known code, not the per-instance `w.message` (`PerShowActionableWarnings.tsx:30-36`,
`Step3SheetCard.tsx` WarningsBreakdown). So emitting `AGENDA_PDF_UNREADABLE` with a
custom "budget reached" message would display the GENERIC "agenda PDF unreadable"
guidance — misleading (looks like a broken link). Therefore the **count- and
scan-budget skips emit NO warning**; they are surfaced instead by the **admin
AgendaBreakdown note** ("agenda schedule not shown here — open the PDF" + the
validated `agendaPdfHref`), which renders for any link lacking a high-confidence
`extracted` (§4.2) — operator-visible and actionable, without a misleading catalog
warning. On cron (no scan budget; per-sheet cap only fires for a >6-PDF show), a
skipped link still appears in the crew `AgendaEmbed` (which lists every fileId link),
so it is never invisible. The **byte cap** (→ `unavailable` → existing
`AGENDA_PDF_UNREADABLE`) and **page cap** (→ low-confidence 0-session → existing
`AGENDA_PDF_UNREADABLE`) reuse EXISTING already-cataloged-and-displayed paths
unchanged. **No new §12.4 catalog code, no `gen:spec-codes` change.**

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
3. **Agenda preview — server helper unit + pure-card render (round-2 F2 + round-3
   F2/F3 + round-8/9/10).** Split in two: **(3a) `buildAdminAgendaPreview` unit
   tests** (`lib/agenda/agendaAdminPreview.ts`, server-pure) drive the cases below on
   the LOGIC (predicate/href/cap/coercion/`dropped*`), asserting the returned
   `AdminAgendaItem[]`; **(3b) `AgendaBreakdown` presentation tests** feed
   hand-built `AdminAgendaItem[]` and assert the card renders block→`AgendaScheduleBlock`
   + overflow note from `dropped*` + `href` anchor, note→muted line, empty→omitted —
   the card calls NO normalize/cap/href. **(3c) boundary-purity guard** (round-10
   F1): a structural test asserting `lib/agenda/agendaAdminPreview.ts`,
   `components/crew/AgendaScheduleBlock.tsx`, and `lib/agenda/normalizeAgendaExtraction.ts`
   import nothing `server-only`/`next/headers`/`fs` (so the client card's import graph
   stays valid). Cases (driving 3a, with 3b rendering the resulting items): (a) two
   high-confidence `extracted` links → two
   `agenda-schedule` blocks with RFI/PCF labels + representative titles;
   (b) **low-confidence** `extracted` → note, no empty block; (c) **malformed**
   `extracted` (garbage object) → note; (d) **high-confidence zero-day** → note;
   (e) no `extracted`, `fileId` set → note + "Open PDF" → `drive.google.com/file/d/<id>/view`;
   (f) no `extracted`, `url = "https://…"` → note + "Open PDF" → that url;
   (g) no `extracted`, `url = "Program.pdf"` (filename) → note, **NO anchor**
   (href validation); (h) no `extracted`, `url = "javascript:…"`/relative →
   **NO anchor**; (i) `agenda_links` **undefined** / `pr.show` missing the field /
   **non-array** → no Agenda breakdown, **no crash** (defensive `arr`); (j) zero
   links → no breakdown; (k) **render-size cap (round-5 F1):** the real
   `fixtures/agenda/rfi.pdf` extraction (18 sessions > `AGENDA_ADMIN_SESSIONS_CAP`)
   → exactly `AGENDA_ADMIN_SESSIONS_CAP` session rows rendered + a "+N more sessions
   — open the PDF" overflow note with the validated href; an extraction with
   ≤ cap sessions → no overflow note; (l) `agenda_links` with
   `> AGENDA_MAX_PDFS_PER_SHEET` entries → only that many link rows + a "+N more
   agenda PDFs" note; (m) **track cap (round-6 F2):** a synthetic high-confidence
   extraction with one kept session carrying `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP + N`
   tracks → only the cap is rendered + the track-overflow note (assert via the
   `agenda-schedule` block's track rows, count derived from the constant); (n)
   **client-payload cap + overflow side-channel (round-8 F2 + round-9 F2):** the
   SERVER row-assembly applied to an over-cap extraction yields client `rows` whose
   `adminAgendaPreview[i].block.extraction` carries ≤ `AGENDA_ADMIN_SESSIONS_CAP`
   sessions / ≤ `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP` tracks AND non-zero
   `droppedSessions`/`droppedTracks`; the raw `agenda_links[].extracted` is **stripped**
   from the client `parse_result`. Assert against the **serialized row props** (surplus
   never reaches the browser) AND that the card, rendering from those props, shows the
   "+N more sessions" overflow note (proves the drop-count side-channel survives
   serialization — not swallowed by `normalizeAgendaExtraction`). **Derive expected counts from the
   extraction + the cap constants, not hardcoded** (anti-tautology — a fixture with
   fewer than cap sessions/tracks can never prove truncation); when scanning DOM for a
   label, clone-and-strip sibling breakdowns first. *Failure modes caught:* the
   `link.extracted ? <Block/> : <Note/>` empty-section trap; arbitrary sheet text as
   an href; crashing on corrupt staged JSON; an 80-page agenda / many-track session
   bloating the DOM **or the client payload**.
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
     extracted; the surplus links have **no `extracted` and emit NO warning** (assert
     the warnings list gains no `AGENDA_PDF_UNREADABLE` for the skipped links — they
     surface via the card note, tested in Task 3).
   - `enrichAgenda` scan budget **consumes for `getAgendaChips`** (round-6 F1 +
     round-7 F1 + **round-9 F1**): drive several `enrichAgenda` calls (distinct
     "sheets", each with ≥1 **fileId-less** link) sharing one
     `agendaBudget = { remaining: 2 }`, where `getAgendaChips` returns the **failure
     outcomes** — `infra_error` on one sheet, a label/count **mismatch** on another,
     **no-chip rows** on a third (so the per-link loop would NOT decrement) → assert
     the spied `getAgendaChips` is invoked **≤ ~2 times total** (the chip call itself
     consumed budget despite failing), NOT once per sheet, and `getFile` likewise ≤
     budget; later sheets return early (no Sheets/Drive call). Assert a `ctx` with
     **no** `agendaBudget` (cron) imposes no scan limit. *Failure mode caught:* a
     folder of chip-FAILING sheets issuing unbounded `getAgendaChips` reads because
     the loop-only decrement never fires.
   - **Call-timeout / stall (round-8 F1):** `downloadFileBytes` over a stream that
     stalls (no bytes past the idle window, via a tiny `createStallGuard` timeout
     seam) → `{ kind: "infra_error" }` (aborted, not a hang); `getAgendaChips` whose
     Sheets call rejects with a timeout → `{ kind: "infra_error" }`. *Failure mode
     caught:* an untimed Drive/Sheets call hanging the onboarding scan (the
     #128/#132/#136/#140 class).
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
| `lib/agenda/constants.ts` | add `AGENDA_PDF_MAX_BYTES`, `AGENDA_MAX_PAGES`, `AGENDA_MAX_PDFS_PER_SHEET`, `AGENDA_MAX_PDFS_PER_SCAN`, `AGENDA_ADMIN_SESSIONS_CAP`, `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`; bump `EXTRACTOR_VERSION` 1→2 (§4.5) |
| `lib/agenda/extractAgendaSchedule.ts` | page-cap guard: early `LOW()` when `doc.numPages > AGENDA_MAX_PAGES` (before the page loop) |
| `lib/drive/agendaDrive.ts` | `downloadFileBytes` byte cap via streamed `bytesFromNodeStream` → `unavailable` on exceed; **+ `createStallGuard` idle-abort on the stream → `infra_error` on stall**; `getAgendaChips` **+ `DRIVE_FILES_GET_TIMEOUT_MS` + transient retry** (per `sheetGids.ts`) → `infra_error` on timeout |
| `components/admin/OnboardingWizard.tsx` (`fetchStep3Data`, `:191`) + `app/admin/show/staged/[stagedId]/page.tsx` | **server-side** build `adminAgendaPreview: AdminAgendaItem[]` per row (predicate via `normalizeAgendaExtraction` + `capExtractionForAdmin` + `dropped*` + `agendaPdfHref` + badge + `arr`/string coercion); strip `agenda_links[].extracted` from the client-bound `Step3Row.parseResult` |
| Step-3 row type (`AdminAgendaItem` + `adminAgendaPreview` field on `Step3Row`) | new shared type carrying the server-computed preview |
| `lib/agenda/agendaAdminPreview.ts` (new) | server-pure helpers `capExtractionForAdmin`, `agendaPdfHref`, `buildAdminAgendaPreview(links)` — unit-testable in isolation |
| `lib/sync/enrichAgenda.ts` | budget **consumes 1 for `getAgendaChips`** (before the call, regardless of outcome) + per-link attempt decrement before `getFile`; per-sheet + scan caps; **no warning** on cap/budget skip (new `agendaBudget` param) |
| `components/admin/wizard/Step3SheetCard.tsx` | new `AgendaBreakdown` — **pure presentation over `row.adminAgendaPreview`** (NOT `pr.show.agenda_links`): each item's `block` → `<AgendaScheduleBlock extraction={block.extraction}/>` + `dropped*` overflow note + `href` anchor; note item → muted note. Does NOT call normalize/cap/href itself. |
| `tests/sync/driveClientImplCompleteness.test.ts` | add onboarding default to `IMPLS` |
| `tests/drive/agendaDrive.test.ts` | byte-cap test (Task 4) |
| `tests/agenda/extractAgendaSchedule.test.ts` | page-cap test + `extractorVersion === 2` (Task 4) |
| `tests/agenda/constants.test.ts`, `tests/onboarding/enrichAgendaIntegration.test.ts` | update `EXTRACTOR_VERSION`/`extractorVersion` assertions 1→2 |
| `tests/sync/enrichAgenda.test.ts` | per-sheet count-cap + scan-budget-consumes-`getAgendaChips` (failure outcomes) + stall/timeout tests (Task 4) |
| `tests/onboarding/...` | extraction-populates-`extracted` (Task 2); `fetchStep3Data` serialized-props test (≤cap, `dropped*`, no raw `extracted`) (Task 3) |
| `tests/agenda/agendaAdminPreview.test.ts` (new) | `buildAdminAgendaPreview`/`capExtractionForAdmin`/`agendaPdfHref` unit cases a–n (Task 3a) |
| `tests/components/admin/...` | `AgendaBreakdown` pure-render from `AdminAgendaItem[]` (Task 3b) |
| `tests/.../agendaPurityBoundary.test.ts` (new) | structural: admin agenda render path imports nothing server-only (Task 3c) |
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
- Render-size cap: **`AGENDA_ADMIN_SESSIONS_CAP = 8` + `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP = 6`
  per link** (slice extraction before `AgendaScheduleBlock`; "+N more — open the PDF"
  overflow incl. dropped tracks) + render at most `AGENDA_MAX_PDFS_PER_SHEET` link
  rows; crew/`AgendaScheduleBlock` untouched (Codex round-5 F1 + round-6 F2).
- Budget enforcement point: **per-link attempt consumed before `getFile`, and an
  entry-gate before `getAgendaChips`** (bounds ALL Drive/Sheets calls — chips,
  metadata, downloads — on non-PDF/chip-based/failed links, not just successful
  extractions — Codex round-6 F1 + round-7 F1).
- Skip visibility: **count/scan-budget skips emit NO warning** (the warning UI shows
  the cataloged generic title, not `w.message`) — surfaced via the admin card note +
  crew embed; byte/page caps reuse existing cataloged warning paths. No §12.4 change
  (Codex round-7 F2).
- Call-timeout: **`createStallGuard` on the `downloadFileBytes` stream + `DRIVE_FILES_GET_TIMEOUT_MS`
  + retry on `getAgendaChips`** (reuse the existing onboarding-scan Drive-timeout
  guards; stall/timeout → `infra_error`) so no Drive/Sheets hang can stall the scan
  (Codex round-8 F1).
- Client payload + display logic: **server-computed `adminAgendaPreview` shape**
  built in `fetchStep3Data` (`OnboardingWizard.tsx:191`) via the new server helper
  `lib/agenda/agendaAdminPreview.ts` (predicate + cap + `dropped*` side-channel +
  validated href + badge); client card is pure presentation over `AdminAgendaItem`;
  raw `extracted` stripped from the client `parse_result` (Codex round-8/9 F2).
- Component boundary: **`AgendaScheduleBlock`/`normalizeAgendaExtraction` are pure
  isomorphic** (no server-only deps) → valid to render inside the `"use client"` card;
  a structural purity-guard test keeps them that way (Codex round-10 F1). §9 table +
  §4.2 carry the single non-contradictory contract: card consumes only
  `row.adminAgendaPreview` (round-10 F2).
- Chip budget: **`getAgendaChips` consumes 1 budget before the call regardless of
  outcome** (not just an entry-gate) so chip-failing sheets can't bypass the
  scan-level bound (Codex round-9 F1).
