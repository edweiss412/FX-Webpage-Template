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
  single-holder), with a **lifecycle guard** so stale tabs do no work. This reuses the
  existing staged-mutation discipline: ONE `withPostgresSyncPipelineLock` postgres.js
  transaction owns the lock + the raw-SQL read/write of `pending_syncs` (PostgREST DML
  for `pending_syncs` is already REVOKEd). Bonus: persistence means re-view is instant
  AND publish carries the extracted agenda forward (crew sees it on publish, not just
  after the next cron).
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
`buildAdminAgendaPreview(arr(pr?.show?.agenda_links), { baseline: true })` (§5.4) — pure,
no Drive calls. **Every baseline item is NOTE-ONLY (`block: null`)** carrying only the
server-validated `href` + `label` + `badge` — even if the staged `parse_result` already
has `extracted` (Codex round-20 F1: the baseline can't verify freshness — it cannot know
the current Drive `headRevisionId` without a Drive call, and a stored extraction may be a
stale `EXTRACTOR_VERSION` v1; so it must NOT render blocks). The baseline's sole job is
to supply **validated hrefs for every state** (loading/error; Codex round-17).
`adminAgendaPreview.length` IS the agenda-link count. An empty `agenda_links` → empty
array → no Agenda breakdown. **Blocks ONLY ever come from the extract endpoint (§5.2),
which is the single freshness-gated source** (version + revision via `enrichAgenda`); the
client always fetches it (the endpoint cache-hits cheaply when the extraction is already
fresh — §5.2 step 5 — so an already-extracted show still fills in fast, just via a
freshness-checked round-trip rather than an unverified baseline block).

### 5.2 Per-show extract endpoint — advisory-locked, cache-on-revision, persists

New route `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`
(POST, `export const maxDuration = 300`).

**ONE transaction owner — raw postgres.js, NO Supabase for `pending_syncs`
(Codex round-19 F1).** A `pg_try_advisory_xact_lock` lives in a postgres.js transaction;
a Supabase/PostgREST call is a SEPARATE connection and CANNOT join that transaction — so
the read/write must NOT go through Supabase or the read/write would be outside the lock
(or a write-RPC re-taking `show:` would violate single-holder). The endpoint therefore
owns the JS-side `withPostgresSyncPipelineLock(driveFileId, { tryOnly: true }, async (tx) =>
{…})` transaction (the staged-mutation pattern; lock key `hashtext('show:' ||
drive_file_id)` via `lib/sync/lockedShowTx.ts`) and does the staged-row SELECT + UPDATE
as **raw SQL through that same `tx`/`SyncPipelineTx`** — no Supabase/PostgREST for
`pending_syncs` at all. Sequence:

1. **Auth** — `requireAdminIdentity()` (`@/lib/auth/requireAdmin`); reject otherwise.
2. **Try-lock** — `withPostgresSyncPipelineLock(..., { tryOnly: true })`. Not acquired
   (another request is extracting this show) → `202 { status: "in_progress" }`
   immediately (no held connection, no duplicate work; client retries, §5.3).
   Single-holder (invariant 2): the lock is acquired at exactly this JS layer; the raw
   SQL read/write below do NOT re-acquire it.
3. **SELECT** `parse_result` (+ lifecycle columns) `from public.pending_syncs where
   wizard_session_id = $1 and drive_file_id = $2` via `tx` (raw postgres.js). Missing
   row → `200 { items: [] }` (client keeps baseline).
4. **Lifecycle guard (Codex round-19 F2)** — BEFORE any Drive work, verify the row is
   still extractable: `wizard_session_id` is the **currently-active** pending wizard
   session AND the row is NOT already approved / finalizing / consumed (the same
   active-session + approval-state predicate the wizard/finalize flow uses — exact
   columns pinned in the plan: e.g. `approval_payload IS NULL`, no finalize-in-progress
   marker, session-supersession check). If STALE → release immediately (no Drive work,
   no write) and return a **terminal** `409 { status: "stale" }`; the client stops
   retrying and shows the baseline note (§5.3). This prevents an old Step-3 tab from
   holding the `show:` lock for up to 300 s, doing Drive work, and persisting agenda to
   a row a superseding session / finalize no longer owns.
5. **Cache short-circuit** — if every fileId-bearing `agenda_link` already has
   `extracted` with a matching `headRevisionId` + current `EXTRACTOR_VERSION`
   (`enrichAgenda.ts:115-121`) → skip all Drive work, build preview from stored
   `extracted`, return `200 { items }`. Dominant repeat path (re-view, refresh,
   multi-tab after the first run).
6. **Extract** — else `enrichAgenda(parseResult, defaultAgendaDriveClient(),
   driveFileId)` (production `downloadFileBytes` + `getAgendaChips`,
   `runScheduledCronSync.ts:1665-1666`; ≤ a couple PDFs ⇒ well within 300 s; §5.5 caps
   bound a pathological show). The Drive reads are the ONLY external I/O inside the tx;
   holding the lock during this capped work mirrors the onboarding scan (PR #80, which
   already does Drive work under the per-show lock).
7. **Persist — ATOMIC lifecycle-conditional UPDATE (Codex round-20 F2)** — the pre-work
   guard (step 4) is only an optimization; a supersession/finalize/cleanup could land
   AFTER it but before the write (during the ≤300 s extraction) UNLESS every such
   transition is proven to hold this same `show:` lock for the whole window (the spec
   does not assume that). So the lifecycle predicate is re-checked ATOMICALLY in the
   write itself: `update public.pending_syncs set parse_result = $1::jsonb where
   wizard_session_id = $2 and drive_file_id = $3 AND <active-session predicate> AND
   <not approved/finalizing predicate> returning staged_id` via `tx`, passing the
   updated object (NOT `JSON.stringify` — postgres.js serializes the `$1::jsonb` param
   itself; double-encoding is a known footgun). **If 0 rows updated** (the row was
   superseded/finalized/deleted mid-extraction) → the extraction is discarded (harmless,
   not persisted) and the endpoint returns terminal `409 { status: "stale" }`. **If 1
   row** → build + return `200 { items }`. The write is privileged postgres.js (the
   sync-pipeline connection), so the PostgREST `pending_syncs` DML REVOKE
   (`20260601000000_b2_show_lifecycle.sql`) is satisfied (no PostgREST write). Commit
   releases the advisory lock. (The same predicate columns back the step-4 fast-exit.)

**Dedupe + cache:** concurrent same-show POSTs → first holds the lock + extracts +
persists; others get `202 in_progress` and on retry cache-hit (step 5). Different shows
→ different hashkeys → parallel (bounded by `AGENDA_CLIENT_CONCURRENCY`). Strict-mode
double-fire absorbed by try-lock + cache. **No durable work is duplicated; no unbounded
amplification; stale rows do no work.**

### 5.3 Client orchestration + live fill-in (UI; Opus + impeccable invariant 8)

`Step3Review`/`Step3SheetCard` are `"use client"`. Each row arrives with the
server-built **baseline** `adminAgendaPreview` (note-only items, validated hrefs; §5.1).
The card NEVER computes hrefs — it always renders `AdminAgendaItem`s the SERVER built
(baseline or endpoint result).

- `adminAgendaPreview.length === 0` → **no Agenda breakdown** (omitted).
- Else, per row, a state machine over the extract fetch: `idle → loading →
  ready(items) | error`. The client ALWAYS fires the POST (the endpoint is the sole
  freshness-gated block source; baseline blocks never exist) in a `useEffect` keyed on
  `driveFileId`, throttled to ≤ `AGENDA_CLIENT_CONCURRENCY = 3` in-flight across rows.
  The endpoint cache-hits cheaply when already fresh, so this is fast. A
  **`202 { status: "in_progress" }`**
  response (another request holds the lock) keeps the row in `loading` and retries
  after a short backoff (≤ `AGENDA_CLIENT_RETRY_LIMIT = 5` attempts, then → `error`/
  baseline). A **`409 { status: "stale" }`** (lifecycle guard — superseded session /
  finalizing row) is **terminal**: stop retrying, render the baseline note (any agenda
  lands via cron post-publish). A network/5xx → `error` → baseline.
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

- **`opts.baseline` (Codex round-20 F1):** when called with `{ baseline: true }`
  (`fetchStep3Data`), `block` is FORCED to `null` for every item — the baseline never
  renders unverified blocks (it can't confirm `headRevisionId`/`EXTRACTOR_VERSION`
  freshness without a Drive call). Only the endpoint (which calls it WITHOUT `baseline`
  on links whose `extracted` was just set by `enrichAgenda` to the current
  `headRevisionId` + `EXTRACTOR_VERSION`) renders blocks → blocks are always
  freshness-gated.
- **Renderability predicate, NOT `extracted` truthiness:** (endpoint path) `const norm =
  normalizeAgendaExtraction(link.extracted); const renderable = !!norm &&
  norm.confidence === "high" && norm.days.length > 0;` (a low/malformed/zero-day
  payload is truthy — `extracted ? block : note` would yield an empty block).
  `renderable` → `block = { extraction: capExtractionForAdmin(norm,…), dropped* }`;
  else `block = null`. Freshness (version/revision) is guaranteed UPSTREAM by the
  endpoint's `enrichAgenda` cache/extract (a stale-version `extracted` would have been
  re-extracted at step 5/6), so a stored v1 extraction can never reach a rendered block.
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
   capped + track overflow; (m) **`{ baseline: true }` forces note-only** even for a
   high-confidence `extracted` (Codex round-20 F1: baseline never renders blocks); (n)
   a stored `extractorVersion: 1` extraction passed WITHOUT `baseline` still yields a
   block ONLY via the endpoint's fresh-extracted path — assert the predicate alone does
   not gate version (freshness is the endpoint's `enrichAgenda` job), so the test pins
   that `fetchStep3Data` uses `baseline: true` (the version-bypass is closed by baseline,
   not by the predicate).
2. **Extract endpoint (`tests/app/admin/...extractAgenda.test.ts`)** — (a) auth required
   (unauth → rejected); (b) staged `parse_result` w/ chip-based links + agenda client
   over `fixtures/agenda/*.pdf` → `200 { items }` with high-conf blocks AND the updated
   `parse_result` is **persisted** by a raw `tx` UPDATE on `pending_syncs` inside the
   locked transaction (assert via the pipeline-tx test seam, not Supabase); (c) **cache
   short-circuit**: a second call when `extracted` is already fresh
   (`headRevisionId`+`EXTRACTOR_VERSION` match) → items with **zero Drive calls** (spy
   `downloadFileBytes`/`getAgendaChips` = 0); (d) **dedupe**: bypass the client throttle —
   two concurrent POSTs for the same show → the second's `try_lock` fails → `202
   in_progress`, **no** duplicate extraction (Drive calls happen once); (e) **stale
   guard — pre-work** (round-19 F2): row already superseded/approved/finalizing at step
   4 → `409 stale`, **zero Drive calls, no write**; (e2) **stale — atomic persist-time
   race** (round-20 F2): row passes step-4, extraction runs, session superseded BEFORE
   the write → the conditional `UPDATE … WHERE … AND <active> RETURNING` affects **0
   rows** → `409 stale`, `parse_result` **unchanged** (assert); (f) missing staged row
   → `200 { items: [] }`; (g) infra fault on read → typed error from the `tx` path.
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
   href, no client href logic); (d) empty baseline → no breakdown; (e) **always-fetch /
   no stale-baseline bypass** (Codex round-20 F1 + round-21): a nonempty baseline ALWAYS
   triggers the POST — even if a (hypothetical, contract-violating) baseline item arrived
   with a populated `block`, the card MUST still fire the fetch and MUST NOT render that
   baseline block (blocks render only from endpoint-returned `ready` items). Assert the
   fetch fires for every nonempty baseline and no baseline `block` is ever rendered.
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

- **Supabase call-boundary** (invariant 9): the endpoint's `pending_syncs` READ + WRITE
  are **raw postgres.js** inside the `withPostgresSyncPipelineLock` transaction (Codex
  round-19 F1) — they are NOT Supabase/PostgREST calls, so they are governed by the
  `SyncPipelineTx` pattern (the existing sync-pipeline error contract), not the Supabase
  call-boundary registry. The Drive reads (`downloadFileBytes`/`getAgendaChips`) ARE
  googleapis boundaries, already registered in `tests/sync/_metaInfraContract.test.ts`.
  The only Supabase call is `requireAdminIdentity()` (existing, registered).
- **Advisory-lock topology (invariant 2):** the endpoint is a NEW holder of
  `hashtext('show:' || drive_file_id)` (JS-side, `pg_try_advisory_xact_lock`, the
  canonical sync-pipeline key). It is the SOLE holder for its call (never nests another
  acquisition of the same key). **Extend `tests/auth/advisoryLockRpcDeadlock.test.ts`**
  to pin this new holder into the topology (single-holder; no nested re-acquire under
  the same hashkey → no deadlock). Document every existing holder of this key (the
  approve/apply/discard staged routes + the sync pipeline) and confirm the endpoint
  adds no second layer.
- **PostgREST DML lockdown:** the `pending_syncs.parse_result` write is a **privileged
  raw postgres.js UPDATE** through the sync-pipeline `tx` (the same connection the
  approve/apply routes mutate staged rows with) — NOT a PostgREST
  `from('pending_syncs').update`. `pending_syncs` INSERT/UPDATE/DELETE are already
  REVOKEd from `authenticated`/`anon` (`20260601000000_b2_show_lifecycle.sql`), so the
  lockdown intent (no client-role DML) is satisfied; confirm `pending_syncs` has a
  registry row in `tests/db/postgrest-dml-lockdown.test.ts` (add if absent). No NEW
  table, no migration.
- No catalog change (§3).

## 10. Files touched

| File | Change |
|---|---|
| `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` (new) | POST `maxDuration=300`: auth → `withPostgresSyncPipelineLock('show:'||dfid, {tryOnly:true})` (not acquired → `202 in_progress`) → raw `tx` SELECT `pending_syncs.parse_result` → **lifecycle guard** (superseded/finalizing → `409 stale`) → cache short-circuit if `extracted` fresh → else `enrichAgenda(…, defaultAgendaDriveClient())` + raw `tx` UPDATE `pending_syncs` → `buildAdminAgendaPreview` → `200 { items }`. ALL in one postgres.js tx; no Supabase for `pending_syncs` |
| `lib/agenda/agendaAdminPreview.ts` (new) | server-pure `buildAdminAgendaPreview(links, opts?)` (`opts.baseline` forces note-only — round-20 F1), `capExtractionForAdmin`, `agendaPdfHref` |
| `lib/agenda/constants.ts` | add `AGENDA_PDF_MAX_BYTES`, `AGENDA_MAX_PAGES`, `AGENDA_MAX_PDFS_PER_SHEET`, `AGENDA_ADMIN_SESSIONS_CAP`, `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`, `AGENDA_CLIENT_CONCURRENCY`, `AGENDA_CLIENT_RETRY_LIMIT`; bump `EXTRACTOR_VERSION` 1→2 (`DRIVE_ASSET_STALL_TIMEOUT_MS`/`DRIVE_FILES_GET_TIMEOUT_MS` already exist) |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | extend: pin the endpoint as a single-holder of `show:`||dfid |
| `tests/db/postgrest-dml-lockdown.test.ts` | ensure `pending_syncs` DML lockdown covered (registry row if absent) |
| `lib/agenda/extractAgendaSchedule.ts` | page-cap guard (early `LOW()` when `doc.numPages > AGENDA_MAX_PAGES`) |
| `lib/drive/agendaDrive.ts` | `downloadFileBytes` stream + byte cap (`readBoundedNodeStream({onChunk})`) + `createStallGuard` full wiring → `unavailable`/`infra_error`; `getAgendaChips` + timeout + retry |
| `lib/sync/enrichAgenda.ts` | per-show count cap (`AGENDA_MAX_PDFS_PER_SHEET`) + skip; **no `agendaBudget` param** (scan apparatus removed) |
| `components/admin/OnboardingWizard.tsx` (`fetchStep3Data` `:191`) | ALWAYS build `adminAgendaPreview = buildAdminAgendaPreview(arr(pr?.show?.agenda_links), { baseline: true })` per row (pure, **note-only** + validated hrefs — never blocks; round-20 F1) |
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
- Endpoint boundary: **one postgres.js tx via `withPostgresSyncPipelineLock` (try-lock
  on `show:`||dfid) — raw `tx` SELECT + UPDATE of `pending_syncs`, NO Supabase for it**
  (Codex round-19 F1); cache-on-revision + persist; concurrent same-show → `202
  in_progress`; re-view cache-hit; publish carries the agenda forward.
- Lifecycle guard (Codex round-19 F2 + round-20 F2): a pre-work check fast-exits stale
  rows, AND the lifecycle predicate is re-checked ATOMICALLY in the persist
  `UPDATE … WHERE … AND <active> RETURNING` (0 rows → `409 stale`, nothing persisted) —
  so a supersession/finalize racing the ≤300 s extraction can't write to a consumed row.
- Baseline freshness (Codex round-20 F1): `fetchStep3Data`'s baseline is ALWAYS
  note-only (`{ baseline: true }`); blocks come ONLY from the endpoint, which
  freshness-gates on `EXTRACTOR_VERSION` (bumped to 2) + `headRevisionId` via
  `enrichAgenda` — a stale v1 cached extraction can never render or skip the refresh.
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
