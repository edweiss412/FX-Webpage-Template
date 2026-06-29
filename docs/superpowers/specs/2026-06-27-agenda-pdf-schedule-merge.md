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
- **The extract endpoint PERSISTS + dedupes** (Codex round-18): client-side throttling
  alone can't stop multiple tabs/refreshes/strict-mode/direct POSTs from re-doing
  expensive Drive/PDF work. So the endpoint (a) **caches** by persisting the extraction
  into the staged `parse_result` and short-circuiting when it's already fresh, and
  (b) **dedupes** concurrent same-show requests via the per-show advisory lock
  (`hashtext('show:' || drive_file_id)`, the canonical sync-pipeline key; invariant 2
  single-holder). This reuses the existing staged-mutation discipline (advisory lock +
  PostgREST DML lockdown for the `pending_syncs.parse_result` write + Supabase
  call-boundary). Bonus: persistence means re-view is instant AND publish carries the
  extracted agenda forward (crew sees it on publish, not just after the next cron).
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
 extraction (getFile+           (advisory-locked):                links + no preview yet,
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

### 5.2 Per-show extract endpoint — advisory-locked, cache-on-revision, persists

New route `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`
(POST, `export const maxDuration = 300`). Per request, all inside ONE transaction under
the per-show advisory lock (the established staged-mutation pattern —
`withPostgresSyncPipelineLock` / `makeSyncPipelineTx`, as used by the
approve/apply/discard routes):

1. **Auth** — `requireAdminIdentity()` (`@/lib/auth/requireAdmin`); reject otherwise.
2. **Advisory lock (dedupe)** — `pg_try_advisory_xact_lock(hashtext('show:' ||
   drive_file_id))` (the CANONICAL sync-pipeline key — single-holder, invariant 2; the
   endpoint is the sole holder for its call, never nests a second). **Try**-lock (non-
   blocking): if NOT acquired (another request is extracting this show) → return `202
   { status: "in_progress" }` immediately — no held connection, no duplicate work; the
   client keeps "parsing…" and retries (§5.3).
3. **Read** the staged `parse_result` from `pending_syncs` (`.eq("wizard_session_id",
   …)` + `drive_file_id`, `parse_result` column; Supabase read, invariant 9 — `{ data,
   error }`, infra fault → typed error result). Missing row (race) → `200 { items: [] }`
   → client keeps its baseline (§5.3).
4. **Cache short-circuit** — if every fileId-bearing `agenda_link` already has
   `extracted` with a matching `headRevisionId` + current `EXTRACTOR_VERSION`
   (`enrichAgenda`'s existing freshness check, `enrichAgenda.ts:115-121`) → **skip all
   Drive work**, build the preview from the stored `extracted`, return `200 { items }`.
   This is the dominant repeat path (re-view, refresh, multi-tab after the first run).
5. **Extract + persist** — else `enrichAgenda(parseResult, defaultAgendaDriveClient(),
   driveFileId)` (production `downloadFileBytes` + `getAgendaChips`,
   `runScheduledCronSync.ts:1665-1666`; one show ≤ a couple PDFs ⇒ well within 300 s;
   per-PDF/per-show hygiene caps §5.5 bound a pathological show). Then **persist** the
   updated `parse_result` (now carrying `extracted`) back to `pending_syncs` via the
   RPC-gated staged-write path (PostgREST DML lockdown — the `pending_syncs` mutation
   goes through the same SECURITY DEFINER / pipeline-tx path as the other staged
   mutations, never a raw `from('pending_syncs').update`). Build + return
   `200 { items }`.

**Dedupe + cache properties:** concurrent same-show POSTs → the first holds the lock +
extracts + persists; the rest get `202 in_progress` (no duplicate Drive work) and on
retry hit the cache (step 4). Different shows use different hashkeys → parallel (bounded
by the client's `AGENDA_CLIENT_CONCURRENCY`). Holding the lock during the (capped,
≤ couple-PDF) extraction mirrors the onboarding scan, which already does Drive work
under the per-show lock (PR #80 `PostgresOnboardingScanTx`). React strict-mode
double-fire is absorbed by the try-lock + cache. **No durable work is duplicated and no
unbounded server amplification is possible.**

### 5.3 Client orchestration + live fill-in (UI; Opus + impeccable invariant 8)

`Step3Review`/`Step3SheetCard` are `"use client"`. Each row arrives with the
server-built **baseline** `adminAgendaPreview` (note-only items, validated hrefs; §5.1).
The card NEVER computes hrefs — it always renders `AdminAgendaItem`s the SERVER built
(baseline or endpoint result).

- `adminAgendaPreview.length === 0` → **no Agenda breakdown** (omitted).
- Else, per row, a state machine over the extract fetch: `idle → loading →
  ready(items) | error`. The client fires the POST in a `useEffect` keyed on
  `driveFileId` (throttled to ≤ `AGENDA_CLIENT_CONCURRENCY = 3` in-flight across rows)
  UNLESS the baseline already has populated `block`s (already-extracted/cached
  fast-path → state starts `ready`, no fetch). A **`202 { status: "in_progress" }`**
  response (another request holds the lock) keeps the row in `loading` and retries
  after a short backoff (≤ `AGENDA_CLIENT_RETRY_LIMIT = 5` attempts, then → `error`/
  baseline) — so the placeholder simply persists until the in-flight extraction lands.
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
   required (unauth → rejected); (b) staged `parse_result` w/ chip-based links + agenda
   client over `fixtures/agenda/*.pdf` → `200 { items }` with high-conf blocks AND the
   updated `parse_result` is **persisted** to `pending_syncs` via the RPC-gated path
   (assert the write happened, through the pipeline-tx, not a raw `from().update`);
   (c) **cache short-circuit**: a second call when `extracted` is already fresh
   (matching `headRevisionId`+`EXTRACTOR_VERSION`) → returns items with **zero Drive
   calls** (spy `downloadFileBytes`/`getAgendaChips` = 0); (d) **dedupe**: bypass the
   client throttle — two concurrent POSTs for the same show → the second sees the
   advisory `try_lock` fail → `202 { status: "in_progress" }` and does **no** duplicate
   extraction (assert Drive calls happen once); (e) missing staged row → `200 { items:
   [] }`; (f) infra fault on read → typed error result (invariant 9), not silent empty.
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

- **Supabase call-boundary** (invariant 9): the endpoint's staged-`parse_result` READ
  and WRITE are Supabase call boundaries → register both (destructure `{ data, error }`;
  infra fault → typed result, never silent). Drive reads
  (`downloadFileBytes`/`getAgendaChips`) already registered in
  `tests/sync/_metaInfraContract.test.ts`.
- **Advisory-lock topology (invariant 2):** the endpoint is a NEW holder of
  `hashtext('show:' || drive_file_id)` (JS-side, `pg_try_advisory_xact_lock`, the
  canonical sync-pipeline key). It is the SOLE holder for its call (never nests another
  acquisition of the same key). **Extend `tests/auth/advisoryLockRpcDeadlock.test.ts`**
  to pin this new holder into the topology (single-holder; no nested re-acquire under
  the same hashkey → no deadlock). Document every existing holder of this key (the
  approve/apply/discard staged routes + the sync pipeline) and confirm the endpoint
  adds no second layer.
- **PostgREST DML lockdown:** the `pending_syncs.parse_result` write goes through the
  existing RPC-gated staged-mutation path (the same SECURITY DEFINER / pipeline-tx the
  approve/apply routes use) — NOT a raw `from('pending_syncs').update`. Confirm
  `pending_syncs` INSERT/UPDATE/DELETE are REVOKEd from `authenticated`/`anon` (and add
  a registry row to `tests/db/postgrest-dml-lockdown.test.ts` if `pending_syncs` isn't
  already covered). No NEW table.
- No catalog change (§3).

## 10. Files touched

| File | Change |
|---|---|
| `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` (new) | POST `maxDuration=300`: auth → `pg_try_advisory_xact_lock('show:'||dfid)` (not acquired → `202 in_progress`) → read staged `parse_result` → cache short-circuit if `extracted` fresh → else `enrichAgenda(…, defaultAgendaDriveClient())` + **persist** to `pending_syncs` (RPC-gated) → `buildAdminAgendaPreview` → `200 { items }` |
| `lib/agenda/agendaAdminPreview.ts` (new) | server-pure `buildAdminAgendaPreview`, `capExtractionForAdmin`, `agendaPdfHref` |
| `lib/agenda/constants.ts` | add `AGENDA_PDF_MAX_BYTES`, `AGENDA_MAX_PAGES`, `AGENDA_MAX_PDFS_PER_SHEET`, `AGENDA_ADMIN_SESSIONS_CAP`, `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`, `AGENDA_CLIENT_CONCURRENCY`, `AGENDA_CLIENT_RETRY_LIMIT`; bump `EXTRACTOR_VERSION` 1→2 (`DRIVE_ASSET_STALL_TIMEOUT_MS`/`DRIVE_FILES_GET_TIMEOUT_MS` already exist) |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | extend: pin the endpoint as a single-holder of `show:`||dfid |
| `tests/db/postgrest-dml-lockdown.test.ts` | ensure `pending_syncs` DML lockdown covered (registry row if absent) |
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
  extract endpoint fills the card live; "parsing agenda…" placeholder → preview on
  resolve (user-approved pivot, round 16).
- Endpoint boundary: **advisory-locked (`try_lock` on `show:`||dfid) + cache-on-revision
  + persist to staged `parse_result`** (Codex round-18) — concurrent same-show POSTs
  dedupe (`202 in_progress`), re-views cache-hit (no Drive work), publish carries the
  agenda forward. Reuses the staged-mutation discipline (advisory lock + DML lockdown +
  Supabase write boundary).
- Persistence: endpoint **persists** the extracted agenda to the staged `parse_result`
  (cache + dedupe + publish-carries-forward) via the staged-mutation discipline
  (advisory lock + DML lockdown + Supabase write boundary); cron remains a fallback.
- Render: server-pure `buildAdminAgendaPreview` (predicate + caps + `dropped*` + href +
  badge); client card is pure presentation; reuse pure `AgendaScheduleBlock`.
- Hygiene caps kept (bytes/pages/per-show count/stall/timeout) as shared per-PDF
  bounds; the **scan-level** budget/deadline/active-cancellation is **dropped** (no
  longer needed off the scan path).
- Drop from inline drafts: onboarding-client wiring, `agendaBudget`/`EnrichContext`
  change, `AGENDA_MAX_SCAN_ATTEMPTS`, `AGENDA_SCAN_DEADLINE_MS`, active-cancellation
  signal threading.
