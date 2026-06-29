# Spec: Surface agenda-PDF schedule in the admin Step-3 review card (async-decouple)

**Date:** 2026-06-27
**Slug:** `agenda-pdf-schedule-merge` (retained for continuity; deliverable narrowed +
re-architected during adversarial review — see §1.1)
**Status:** Draft (autonomous-ship pipeline) — **rev 17: async-decouple architecture**

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
(`lib/agenda/extractAgendaSchedule.ts`) parses both at **high confidence** (verified —
`tests/agenda/extractAgendaSchedule.test.ts` passes: rfi.pdf → 18 sessions incl. a
2-track breakout; pcf.pdf → 19 sessions, 1 time auto-correction). Extraction output
has `AgendaDay.date === null` always; the day maps to a show-date only via `dayLabel`
(RFI `"Tuesday May 13,2024"` — note the 2024 source typo; PCF `"Wednes day, May 14 ,
202 5"`) — **but day→date mapping is NOT needed here** (we render the PDF's own days,
not merge into `runOfShow`; see §1.1).

Two facts make the card empty:

1. **Extraction never runs for the staged show during the wizard.** The onboarding
   `defaultDriveClient` (`lib/sync/runOnboardingScan.ts:218-229`) implements only
   `getFile` + `listFolder`, so `enrichAgenda` short-circuits at
   `if (!downloadFileBytes) return;` (`lib/sync/enrichAgenda.ts:57-58`); the staged
   `parse_result` carries `agenda_links` with **no** `extracted`. Cron
   (`runScheduledCronSync`) DOES extract agenda for every folder sheet, but it runs on
   a SCHEDULE — there is no guaranteed run between the operator's wizard scan and
   publish, so a staged show is not reliably extracted during the review.
2. **The card has no agenda surface.** `Step3SheetCard` breakdowns are Crew /
   Schedule / Rooms / Hotels / Warnings (`components/admin/wizard/Step3SheetCard.tsx`);
   it never reads `agenda_links` / `extracted`.

### 1.1 Design history (why this architecture)

Adversarial review (16 rounds) drove two pivots, both ratified by the user:

- **Round 1 — crew already renders the agenda.** The crew Schedule section already
  renders the structured PDF agenda via `AgendaScheduleBlock`
  (`components/crew/sections/ScheduleSection.tsx:118-138`, per `link.extracted`). So
  merging extracted sessions into `runOfShow` would DOUBLE-render on crew. Resolution:
  crew is left **unchanged**; the deliverable is the **admin Step-3 card** only. The
  `runOfShow` merge / `ScheduleDay.source` tag / `decodeRunOfShow` change / day→ISO
  mapping / session-flattening are all **dropped**.
- **Rounds 4–16 — inline extraction during the scan can't cleanly bound wall-clock.**
  Running extraction inline in the 300 s onboarding scan request required an escalating
  apparatus (byte/page/per-sheet/per-scan caps, stall guards, a wall-clock deadline,
  active cancellation) and STILL left a gap: a deadline-skipped agenda would not
  reliably re-extract during the wizard (cron is schedule-based; §1). Resolution
  (user-approved): **decouple extraction from the scan** — the scan stays fast (no PDF
  work), and each show's agenda is extracted by a separate per-show request that fills
  the card in live. This deletes the entire wall-clock apparatus.

## 2. Goal

During the onboarding Step-3 review, each show's agenda-PDF schedule fills into a new
Agenda breakdown on its card — shown as a "parsing agenda…" placeholder that is
replaced live by the structured schedule (time · title · room, breakout tracks) as
extraction completes — without adding any PDF work to the (wall-clock-bounded) scan.
No change to crew rendering.

## 3. Non-goals / out of scope

- The `SCHEDULE_TIME_UNPARSED` warning stays (correct flag; sheet edit is the
  operator's call).
- No change to crew (`ScheduleSection`, `AgendaScheduleBlock`, `AgendaEmbed`,
  `RunOfShowList`), to `runOfShow` / `decodeRunOfShow`, or to `ScheduleDay`.
- **No PDF work added to the onboarding scan** — the onboarding `defaultDriveClient`
  stays `getFile` + `listFolder` only (so the scan's wall-clock is unchanged). No
  scan-level agenda budget / deadline / stall apparatus (all dropped vs the inline
  drafts).
- **The extract endpoint is READ-ONLY** — it does NOT write the staged `parse_result`.
  So: no new DB write, no advisory-lock acquisition, no PostgREST DML lockdown, no
  migration. Persistence of agenda extraction remains cron's job post-publish (the
  existing baseline — crew agenda has always appeared after the first post-publish cron
  sync; no regression).
- **`StagedReviewCard` surfaces are out of scope**: the live first-seen page
  (`app/admin/show/staged/[stagedId]/page.tsx`) and the wizard finalize-failure
  re-review (`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`)
  render `StagedReviewCard` with a summary-only `StagedRow` (no full breakdown); they
  get no agenda preview — consistent with their contract, no regression. The single
  in-scope surface is the onboarding wizard Step-3.
- No §12.4 catalog change (extraction failures reuse the existing `AGENDA_PDF_UNREADABLE`
  code already emitted by `enrichAgenda`; the card surfaces failures via a note, §5.4).

## 4. Architecture overview

```
 scan (unchanged, fast)         per-show async extract            live UI fill-in
 ──────────────────────         ─────────────────────            ───────────────
 runOnboardingScan stages       POST /api/admin/onboarding/       Step3Review (client):
 parse_result WITHOUT           extract-agenda/[wiz]/[dfid]       for each show w/ agenda
 extraction (getFile+           (READ-ONLY):                      links + no preview yet,
 listFolder only)               • auth (requireAdminIdentity)     fire the POST (throttled),
        │                       • read staged parse_result        show "parsing agenda…",
        ▼                       • enrichAgenda(result, prod        replace with returned
 fetchStep3Data builds            agendaClient, dfid)  ← Drive    adminAgendaPreview on
 Step3Row { …, baseline          PDF reads, per-PDF caps         resolve (or keep the
   adminAgendaPreview? }          + per-show count cap            failure/empty).
        │                       • buildAdminAgendaPreview                │
        └──────────────────────► returns { adminAgendaPreview } ◄───────┘
```

## 5. Design

### 5.1 Scan unchanged

`runOnboardingScan` and its `defaultDriveClient` are **not modified** — the onboarding
scan continues to stage `parse_result` with `agenda_links` (label/fileId/url, no
`extracted`). No inline PDF download/parse → the scan's existing wall-clock behavior is
untouched. (This reverts every inline-extraction change from the earlier drafts.)

`fetchStep3Data` (`components/admin/OnboardingWizard.tsx:191`, server) ALWAYS computes a
**baseline** `adminAgendaPreview: AdminAgendaItem[]` per `Step3Row` by calling
`buildAdminAgendaPreview(arr(pr?.show?.agenda_links))` (§5.4) on the staged links —
**pure, no Drive calls**. With no `extracted` yet, every item is **note-only**
(`block: null`) but carries the server-validated `href` + `label` + `badge`. This is
the load-bearing fix for the loading/error states (Codex round-17): the card ALWAYS has
server-validated hrefs available, in every state, without ever computing an href
client-side. `adminAgendaPreview.length` IS the agenda-link count (no separate field).
If the staged `parse_result` already carries `extracted` (e.g. a first-seen cron staged
it earlier), the baseline already includes the populated `block`s — so the card renders
the full agenda immediately and the client skips the round-trip (an inherent fast-path,
not a special case). An empty `agenda_links` → empty array → no Agenda breakdown.

### 5.2 Per-show read-only extract endpoint

New route `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`
(POST, `export const maxDuration = 300`). Read-only; per request:

1. **Auth** — `requireAdminIdentity()` (same gate as the other onboarding routes);
   reject otherwise.
2. **Read** the staged `parse_result` for `(wizardSessionId, driveFileId)` from
   `pending_syncs` (`.eq("wizard_session_id", …)`, `parse_result` column; Supabase read;
   invariant 9 — destructure `{ data, error }`, infra fault → typed error result, never
   silent). Missing/corrupt row (race: deleted mid-review) → `{ items: [] }`; the client
   then keeps its server-built baseline (§5.3), so Open-PDF links never disappear.
3. **Extract** — `enrichAgenda(parseResult, defaultAgendaDriveClient(), driveFileId)`,
   reusing the PRODUCTION `downloadFileBytes` + `getAgendaChips` (`lib/drive/agendaDrive.ts`,
   the same impls cron wires at `runScheduledCronSync.ts:1665-1666`). One show ⇒ ≤ a
   couple PDFs ⇒ trivially within the request's own 300 s — **no scan-level budget /
   deadline / active-cancellation needed**. Per-PDF and per-show hygiene caps (§5.5)
   bound a pathological single show.
4. **Build + return** `{ items: AdminAgendaItem[] }` via `buildAdminAgendaPreview`
   (§5.4) over the now-`extracted` `agenda_links`. No DB write.

Idempotent + safe to call repeatedly (React strict-mode double-fire, re-view): it only
reads + does Drive reads + returns; `enrichAgenda`'s `headRevisionId`/`extractorVersion`
cache makes a repeat call cheap when `extracted` is already present on the in-memory
links (within a call) — across calls it re-extracts, which is acceptable (≤ a couple
PDFs).

### 5.3 Client orchestration + live fill-in (UI; Opus + impeccable invariant 8)

`Step3Review`/`Step3SheetCard` are `"use client"`. Each row arrives with the
server-built **baseline** `adminAgendaPreview` (note-only items, validated hrefs; §5.1).
The card NEVER computes hrefs — it always renders `AdminAgendaItem`s the SERVER built
(baseline or endpoint result).

- `adminAgendaPreview.length === 0` → **no Agenda breakdown** (omitted).
- Else, per row, a state machine over the extract fetch: `idle → loading → ready(items)
  | error`. The client fires the POST in a `useEffect` keyed on `driveFileId` (throttled
  to ≤ `AGENDA_CLIENT_CONCURRENCY = 3` in-flight across rows) UNLESS the baseline already
  has populated `block`s (already-extracted fast-path → state starts `ready`, no fetch).
- The `AgendaBreakdown` renders the EFFECTIVE items = `state === "ready" &&
  resultItems.length ? resultItems : baselineItems` (so hrefs are always present, even
  on an empty/raced endpoint result), with a state-driven affordance:
  - `loading` → render the baseline note items PLUS a calm **"Parsing agenda… (N PDF{s})"**
    eyebrow/skeleton (`N = adminAgendaPreview.length`); each baseline item still shows its
    "Open PDF" anchor.
  - `ready` → render `resultItems` (§5.4): block → `AgendaScheduleBlock` + overflow note;
    note item → muted note + "Open PDF".
  - `error` (request rejected/non-2xx) → render the **baseline** items (muted
    "couldn't auto-read — open the PDF" note + the server-validated "Open PDF" anchor).
    The agenda is not lost — cron extracts it post-publish (§3). Hrefs come from the
    baseline `AdminAgendaItem`, so the fallback is safe with NO client href logic.
- Strict-mode/double-render safe (idempotent endpoint + per-row in-flight guard). A
  closed tab simply means un-fired rows aren't previewed during THIS review (re-open
  re-fires; publish → cron). No work is dropped.

**Transition inventory (this component's states):** `idle/loading → ready`
(crossfade/replace placeholder with content), `idle/loading → error` (replace with
note), `ready`/`error` are terminal per row. No compound transitions (each row is
independent; the toggle is the card's existing expand/collapse — unchanged).

**Dimensional invariants:** `AgendaScheduleBlock` already declares its own
(`AgendaScheduleBlock.tsx:30-37`). The placeholder + breakdown wrapper are flow content
(no fixed-dimension parent) → no new parent→child invariant; Tailwind-v4
no-default-`items-stretch` rule N/A.

**Copy:** placeholder/notes are descriptive UI text, not raw error codes → not routed
through `lib/messages/lookup.ts` (invariant 5 N/A).

### 5.4 Server-computed `adminAgendaPreview` (shared render shape)

`buildAdminAgendaPreview(links): AdminAgendaItem[]` (new `lib/agenda/agendaAdminPreview.ts`,
server-pure, unit-testable) is the SINGLE place agenda display logic lives; the client
card is pure presentation over its output. It is called in BOTH server locations: by
`fetchStep3Data` over the not-yet-extracted staged links (→ the note-only baseline with
validated hrefs, §5.1) AND by the extract endpoint over the freshly-`extracted` links
(→ the upgraded items with `block`s, §5.2). Same function, same shape — the only
difference is whether `link.extracted` is populated.

```ts
type AdminAgendaItem = {
  label: string;            // agendaDisplayLabel(link.label) ?? link.label, coerced
  badge: string | null;     // per-doc badge when >1 link, else null
  href: string | null;      // agendaPdfHref(link) — validated
  block: { extraction: AgendaExtraction; droppedSessions: number;
           droppedDays: number; droppedTracks: number } | null; // null → note item
};
```

Rules (all server-side, derived from earlier review rounds):

- **Renderability predicate, NOT `extracted` truthiness:** `const norm =
  normalizeAgendaExtraction(link.extracted); const renderable = !!norm &&
  norm.confidence === "high" && norm.days.length > 0;` (a low/malformed/zero-day
  payload is truthy — `extracted ? block : note` would yield an empty block).
  `renderable` → `block = { extraction: capExtractionForAdmin(norm,…), dropped* }`;
  else `block = null`.
- **Render-size cap (`capExtractionForAdmin`):** keep ≤ `AGENDA_ADMIN_SESSIONS_CAP = 8`
  sessions across days (later days dropped once hit) and ≤
  `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP = 6` tracks per kept session; return the capped
  extraction + `dropped*` counts. The card renders an overflow note ("+N more sessions
  — open the PDF" / "Some breakout tracks hidden — open the PDF") when any `dropped* >
  0`. `dropped*` ride as SIBLINGS of `extraction` (not inside it — `normalizeAgendaExtraction`
  would strip fields placed inside `AgendaExtraction`). Cap the items array at
  `AGENDA_MAX_PDFS_PER_SHEET` with a trailing "+N more agenda PDFs" note item.
- **Open-PDF href validation (`agendaPdfHref`):** `link.fileId` (non-empty string) →
  `https://drive.google.com/file/d/${fileId}/view`; else `link.url` ONLY when
  `typeof url === "string" && /^https?:\/\//i.test(url)` (parser stores arbitrary
  filename text in `url`, `lib/parser/index.ts:253-255`); else `null` (note text only,
  no anchor). Anchor uses `target="_blank" rel="noopener noreferrer"`.
- **Badge** set only when the link count > 1 (`agendaDisplayLabel` from
  `lib/agenda/agendaLabel.ts`, mirroring crew `ScheduleSection.tsx:131-132`).
- **Payload:** the endpoint returns ONLY `AdminAgendaItem[]` (capped) — never the raw
  full `extracted` — so the browser receives only the bounded preview.

**Reuse, not fork:** the card imports the existing `AgendaScheduleBlock`
(`components/crew/AgendaScheduleBlock.tsx`). It is a PURE isomorphic component (imports:
React `JSX` type + the pure `normalizeAgendaExtraction`; no `server-only`/`next/headers`/
`fs`/Drive dep), so rendering it inside the `"use client"` card is valid (bundled
client-side). A structural purity-guard test (§8) keeps `AgendaScheduleBlock`,
`normalizeAgendaExtraction`, and `agendaAdminPreview.ts` server-only-free so the client
import graph stays valid.

### 5.5 Per-PDF / per-show hygiene caps (kept from the inline drafts)

Even off the scan path, a single extract request must not hang or blow memory on a
pathological show. These are SHARED with cron (a net improvement) and sized far above
the real corpus (rfi 538 KB/10 pp, pcf 495 KB/7 pp, ≤2 PDFs/show):

| Cap | Constant | Where | On exceed |
|---|---|---|---|
| Per-PDF download size | `AGENDA_PDF_MAX_BYTES = 25 * 1024 * 1024` | `downloadFileBytes` streamed via `readBoundedNodeStream(stream, cap, { onChunk })` | `ByteLimitExceededError` → `{ kind: "unavailable" }` → `AGENDA_PDF_UNREADABLE` |
| Per-PDF download stall | `DRIVE_ASSET_STALL_TIMEOUT_MS` (existing) | `createStallGuard` on the stream (`stallGuard.ts:13-22` FULL wiring: `signal`→`files.get(params,{responseType:'stream',signal,retry:false})`, abort→`stream.destroy`, `reset` on `onChunk`, `clear` in `finally`, `timedOut()`→`infra_error`) | idle stall → `infra_error` |
| `getAgendaChips` call timeout | `DRIVE_FILES_GET_TIMEOUT_MS` (existing) + transient retry (per `sheetGids.ts`) | `getAgendaChips` | timeout → `infra_error` |
| Per-PDF page count | `AGENDA_MAX_PAGES = 80` | `extractAgendaSchedule` early `LOW()` when `doc.numPages > cap` (before the page loop) | low-confidence → note |
| PDFs extracted per show | `AGENDA_MAX_PDFS_PER_SHEET = 6` | `enrichAgenda` loop | links beyond the cap skip; surfaced via the card note (no warning) |

The page-cap guard bumps `EXTRACTOR_VERSION` 1→2 (gate-logic change per
`constants.ts:11`; update the `extractorVersion === 1` assertions in
`tests/agenda/extractAgendaSchedule.test.ts`, `tests/agenda/constants.test.ts`,
`tests/onboarding/enrichAgendaIntegration.test.ts`). `getFile` already routes through
the timed metadata fetch (`fetch.ts` `DRIVE_FILES_GET_TIMEOUT_MS`) — unchanged.
`enrichAgenda` no longer takes any `agendaBudget` param (the scan-level apparatus is
gone). A `downloadFileBytes`/`getAgendaChips` `infra_error` leaves the link unenriched
(retry on a later call / cron) — never a permanent drop.

## 6. Guard conditions (every input)

- `agenda_links` empty / missing / non-array → baseline `adminAgendaPreview = []` → no
  Agenda breakdown.
- staged row missing/corrupt at the endpoint → `{ items: [] }`.
- extract endpoint request fails (network/500) → client `error` state → note + Open PDF.
- `extracted` low-confidence / malformed / zero-day → `block = null` → note item.
- per-link `label`/`fileId`/`url` wrong type → string-coerced in `buildAdminAgendaPreview`.
- `url` is non-http text (filename) → no anchor.
- show with > `AGENDA_MAX_PDFS_PER_SHEET` agenda links → first N extracted, rest skip.
- PDF > 25 MB / > 80 pp / stalled → `unavailable`/`infra_error`/low → note (per §5.5).
- tab closed mid-parse → un-fired rows simply not previewed this session (no drop).

## 7. Numeric sweep

- Agenda links for the example show: **2** (RFI, PCF), both high-confidence → 2 items,
  each badged (count > 1). RFI 18 sessions → 8 shown + "+10 more" note; PCF 19 → 8 + "+11
  more"; tracks ≤2/session (under cap).
- Caps: bytes 25 MB, pages 80, per-show PDFs 6, sessions 8, tracks 6, client
  concurrency 3 — all far above the real corpus.
- No `runOfShow`/`decodeRunOfShow` counts change (untouched).

## 8. Test plan (TDD per task)

1. **`buildAdminAgendaPreview` unit (`agendaAdminPreview.test.ts`)** — cases:
   (a) two high-conf links → two blocks, RFI/PCF badges, titles derived from
   `fixtures/agenda/*.pdf` extraction (anti-tautology: derive from extraction, not
   hardcoded); (b) low-conf → note; (c) malformed → note; (d) high-conf zero-day →
   note; (e) no extracted + `fileId` → note + Drive href; (f) `url="https://…"` → href;
   (g) `url="Program.pdf"` → NO anchor; (h) `url="javascript:…"`/relative → NO anchor;
   (i) `agenda_links` undefined/non-array → `[]`; (j) > `AGENDA_MAX_PDFS_PER_SHEET`
   links → capped + "+N more agenda PDFs"; (k) 18-session extraction → 8 + overflow
   `dropped*`; (l) > `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP` tracks in one kept session →
   capped + track overflow.
2. **Extract endpoint (`tests/app/admin/...extractAgenda.test.ts`)** — (a) auth
   required (unauth → rejected); (b) given a staged `parse_result` with chip-based
   agenda links + a mock/prod-shaped agenda client over `fixtures/agenda/*.pdf` →
   returns `{ items }` with the high-conf blocks; (c) **read-only**: asserts NO write
   to `pending_syncs`/staged (spy the DB layer — zero mutations); (d) missing staged
   row → `{ items: [] }`; (e) infra fault on read → typed error result (invariant 9),
   not a silent empty.
3. **Hygiene caps (`tests/drive/agendaDrive.test.ts`, `extractAgendaSchedule.test.ts`,
   `enrichAgenda.test.ts`)** — byte cap (`cap+1` stream → `unavailable`); stall guard
   (idle + pre-response abort + slow-but-progressing → no false abort); page cap
   (mock `numPages = cap+1` → low, no per-page parse; `extractorVersion === 2`);
   per-show count cap (`AGENDA_MAX_PDFS_PER_SHEET + 1` links → first N extracted).
4. **Card live fill-in (RTL, `tests/components/admin/...`)** — given a SERVER-built
   baseline `adminAgendaPreview` (note-only items with hrefs), pure-presentation +
   per-row fetch state: (a) `loading` → baseline items + "Parsing agenda… (2 PDFs)"
   eyebrow, each with its "Open PDF" anchor; (b) `ready` (mock fetch resolves with
   upgraded items) → two `agenda-schedule` blocks (+ overflow notes); (c) **`error`
   (mock fetch REJECTS) → the baseline items render with the "Open PDF" anchor present
   and a SAFE href** (Codex round-17 — proves the error fallback has a server-validated
   href, no client href logic); (d) empty baseline → no breakdown; (e) baseline already
   has `block`s (already-extracted) → renders immediately, **no fetch fired**.
   Clone-and-strip sibling breakdowns before scanning DOM (anti-tautology). Assert ≤
   `AGENDA_CLIENT_CONCURRENCY` concurrent in-flight; assert the card computes NO
   normalize/cap/href itself (hrefs only come from the server-built items).
5. **Boundary-purity guard (`agendaPurityBoundary.test.ts`)** — `agendaAdminPreview.ts`,
   `AgendaScheduleBlock.tsx`, `normalizeAgendaExtraction.ts` import nothing
   `server-only`/`next/headers`/`fs`.
6. **Crew no-regression (negative)** — crew `ScheduleSection` still renders exactly one
   `AgendaScheduleBlock` per high-conf link; no new `runOfShow` write path exists; the
   onboarding `defaultDriveClient` is **unchanged** (still `getFile`+`listFolder` only —
   asserts the scan gained no PDF work).
7. **Impeccable dual-gate** (critique + audit) on the admin card diff (invariant 8).

## 9. Meta-test inventory

- **Supabase call-boundary** (`tests/auth/_metaInfraContract.test.ts` / sync analog):
  the extract endpoint's staged-`parse_result` READ is a Supabase call boundary →
  register it (destructure `{ data, error }`; infra fault → typed result). The Drive
  reads (`downloadFileBytes`/`getAgendaChips`) are already registered in
  `tests/sync/_metaInfraContract.test.ts` (reused, no new row).
- **Advisory-lock topology:** none touched — the endpoint is READ-ONLY (no mutation of
  `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`), so no
  `pg_advisory*` is required (invariant 2 N/A). Explicitly declared.
- **PostgREST DML lockdown:** N/A — no new table, no DML (read-only endpoint).
- No catalog change (§3).

## 10. Files touched

| File | Change |
|---|---|
| `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` (new) | READ-ONLY POST: auth → read staged `parse_result` → `enrichAgenda(…, defaultAgendaDriveClient())` → `buildAdminAgendaPreview` → `{ items }`. `maxDuration = 300`. |
| `lib/agenda/agendaAdminPreview.ts` (new) | server-pure `buildAdminAgendaPreview`, `capExtractionForAdmin`, `agendaPdfHref` |
| `lib/agenda/constants.ts` | add `AGENDA_PDF_MAX_BYTES`, `AGENDA_MAX_PAGES`, `AGENDA_MAX_PDFS_PER_SHEET`, `AGENDA_ADMIN_SESSIONS_CAP`, `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`, `AGENDA_CLIENT_CONCURRENCY`; bump `EXTRACTOR_VERSION` 1→2 (`DRIVE_ASSET_STALL_TIMEOUT_MS`/`DRIVE_FILES_GET_TIMEOUT_MS` already exist) |
| `lib/agenda/extractAgendaSchedule.ts` | page-cap guard (early `LOW()` when `doc.numPages > AGENDA_MAX_PAGES`) |
| `lib/drive/agendaDrive.ts` | `downloadFileBytes` stream + byte cap (`readBoundedNodeStream({onChunk})`) + `createStallGuard` full wiring → `unavailable`/`infra_error`; `getAgendaChips` + timeout + retry |
| `lib/sync/enrichAgenda.ts` | per-show count cap (`AGENDA_MAX_PDFS_PER_SHEET`) + skip; **no `agendaBudget` param** (scan apparatus removed) |
| `components/admin/OnboardingWizard.tsx` (`fetchStep3Data` `:191`) | ALWAYS build the baseline `adminAgendaPreview = buildAdminAgendaPreview(arr(pr?.show?.agenda_links))` per row (pure, note-only + validated hrefs; populated `block`s if `extracted` already present) |
| Step-3 row type | add `adminAgendaPreview: AdminAgendaItem[]` to `Step3Row` (always present; empty → no breakdown); new `AdminAgendaItem` type |
| `components/admin/wizard/Step3SheetCard.tsx` + `Step3Review.tsx` | new client `AgendaBreakdown` + per-row extract-fetch state machine (throttled), "parsing…" placeholder, live replace; pure presentation over `AdminAgendaItem` |
| tests (per §8) | new + extended |

**Not touched:** `lib/sync/runOnboardingScan.ts` (scan unchanged — no PDF work),
`lib/sync/enrichWithDrivePins.ts`, `lib/parser/types.ts`, `lib/data/decodeRunOfShow.ts`,
`components/crew/**`, any `runOfShow` write path.

## 11. Resolved decisions

- Surface: **admin Step-3 card only**; crew unchanged (round 1 + user).
- Architecture: **async-decouple** — scan stays fast (no PDF work); a per-show
  **read-only** extract endpoint fills the card live; "parsing agenda…" placeholder →
  preview on resolve (user-approved pivot, round 16).
- Persistence: endpoint is **read-only**; agenda persistence stays cron's job
  post-publish (existing baseline) → no advisory lock / DML lockdown / migration.
- Render: server-pure `buildAdminAgendaPreview` (predicate + caps + `dropped*` + href +
  badge); client card is pure presentation; reuse pure `AgendaScheduleBlock`.
- Hygiene caps kept (bytes/pages/per-show count/stall/timeout) as shared per-PDF
  bounds; the **scan-level** budget/deadline/active-cancellation is **dropped** (no
  longer needed off the scan path).
- Drop from inline drafts: onboarding-client wiring, `agendaBudget`/`EnrichContext`
  change, `AGENDA_MAX_SCAN_ATTEMPTS`, `AGENDA_SCAN_DEADLINE_MS`, active-cancellation
  signal threading.
