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
  (b) **dedupes/bounds** via an in-memory process-wide concurrency cap (NOT a DB lock —
  Codex round-24 F2), with a **lifecycle guard** so stale tabs do no work. Crucially,
  **NO DB connection is held during the ≤300 s Drive/PDF work** (short read tx → extract
  with no DB → short brief-`show:`-lock persist tx), so previews can't exhaust the
  postgres pool or block finalize/publish (round-23/24 F2). Raw postgres.js (no Supabase
  for `pending_syncs`; its PostgREST DML is already REVOKEd). Bonus: persistence means
  re-view skips the expensive download AND publish carries the extracted agenda forward
  (crew sees it on publish, not just
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
`buildAdminAgendaPreview(arr(pr?.show?.agenda_links))` (§5.4) with **NO `freshByLinkKey`**
— pure, no Drive calls, so **every baseline item is NOTE-ONLY** (the empty-default
`freshByLinkKey` ⇒ no blocks; round-20 F1 / round-25 F2). It carries `label` + `badge`
+ a **best-effort `href`**: present when `agendaPdfHref` can resolve it (a `/d/`-URL
`fileId` or an `http(s)` `url`), but **`null` for the target smart-chip links**, whose
staged value is filename text with NO `fileId` (recovered only by `getAgendaChips`, a
Drive call the pure baseline cannot make — Codex round-25 F3). For those, the loading/
error note shows **no Open-PDF anchor**; the card's **existing source-sheet deep link**
(per-card, already present) is the universal PDF-recovery path. Once the endpoint runs,
its returned items DO carry recovered `href`s (the endpoint recovers `fileId`s via
`getAgendaChips` even when the PDF download fails), so the Open-PDF link appears in
`ready`/note states. `adminAgendaPreview.length` IS the agenda-link count; empty
`agenda_links` → no Agenda breakdown. **Blocks ONLY ever come from the extract endpoint
(§5.2), the single freshness-gated source**; the client always fetches it (the endpoint
cache-hits cheaply when already fresh — §5.2 step 5 — so an already-extracted show fills
in fast, just via a
freshness-checked round-trip rather than an unverified baseline block).

### 5.2 Per-show extract endpoint — SHORT transactions, no DB connection during Drive

New route `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`
(POST, `export const maxDuration = 300`).

**No DB connection is held during Drive/PDF work (Codex round-23 F2 + round-24 F2).**
The expensive extraction must not hold (a) the canonical `show:` advisory lock — it
would block finalize/publish — NOR (b) ANY postgres.js transaction/connection — an
advisory-xact-lock-scoped tx held for ≤300 s per show, across many shows/tabs/admins
(client throttling is per-browser only), would exhaust the postgres pool and starve
finalize/scan. So the request uses **two SHORT transactions with no DB held in between**,
plus an **in-memory process-wide concurrency cap** (no DB) for resource bounding and
best-effort same-instance dedupe:

1. **Auth** — `requireAdminIdentity()` (`@/lib/auth/requireAdmin`); reject otherwise.
2. **Concurrency slot (in-memory, NO DB)** — acquire a process-wide semaphore slot
   `AGENDA_MAX_CONCURRENT_EXTRACTIONS` (a module-level counter; bounds CPU/Drive-quota
   per warm instance) + a per-`(wiz,dfid)` in-flight set (coalesces same-instance
   duplicate POSTs → `202 { status: "in_progress" }`). Cross-instance simultaneous
   duplicates are rare, ≤ a couple PDFs, and the cache (step 4/persist) makes the
   second cheap — accepted, never a held DB connection.
3. **SHORT tx #1 — read + lifecycle pre-check** — open a tx, `SELECT parse_result (+
   lifecycle cols) from public.pending_syncs where wizard_session_id = $1 and
   drive_file_id = $2`, evaluate the lifecycle guard, then **COMMIT/close (release the
   connection)**. Missing row → `200 { items: [] }`. STALE (superseded session OR
   finalize-consumed/in-progress; **approved/applied rows are NOT stale** — round-22 F2,
   they stay extractable until finalize consumes them, incl. after "Select all") →
   `409 { status: "stale" }` (release slot, no Drive). NO `show:` lock here.
4. **Extract (NO DB connection held)** — `enrichAgenda(parseResult,
   defaultAgendaDriveClient(), driveFileId)` (production `downloadFileBytes` +
   `getAgendaChips`, `runScheduledCronSync.ts:1665-1666`; §5.5 caps bound a pathological
   show). `enrichAgenda`'s built-in per-link cache (`getFile` metadata → skip download
   when the stored `extracted` matches `headRevisionId` + `EXTRACTOR_VERSION`) means a
   **cached** show costs only cheap `getFile`s, **zero `downloadFileBytes`/`getAgendaChips`**
   (round-23 F1: "cache hit" ≠ zero Drive — freshness needs the current revision, which
   only `getFile` provides). A link **lacking a `fileId`** (the target smart-chip shape —
   `parseAgendaLinks` stores filename/url text, no `fileId`; recovered by `getAgendaChips`)
   ALWAYS forces extraction (round-22 F1: a "fileId-bearing-only" gate is vacuously true
   for a zero-fileId staged parse). **No DB connection is open during any of this.**
5. **POSITIVE per-link freshness (Codex round-24 F1)** — do NOT trust `enrichAgenda`
   side-effects as freshness proof: on a `downloadFileBytes` `infra_error` (or its
   catch-all), `enrichAgenda` PRESERVES the prior `link.extracted`, so a stale v1 /
   old-revision high-confidence extraction would otherwise be rendered + persisted as a
   fresh block exactly when refresh FAILED. So a link is **block-eligible ONLY if it was
   positively confirmed fresh THIS call**: `extracted.extractorVersion === EXTRACTOR_VERSION`
   **AND** `extracted.sourceRevision === <the `headRevisionId` `getFile` returned this
   call>`. `enrichAgenda` (or a thin endpoint wrapper) exposes, per link, the
   just-fetched `headRevisionId` + whether the extraction was confirmed this call; a link
   that failed to refresh → **note-only** (`block: null`) and its stale `extracted` is
   NOT written back as if fresh. (Plan: extend `enrichAgenda`/the wrapper to return
   per-link confirmed-fresh + revision, rather than relying on mutation side-effects.)
6. **SHORT tx #2 — brief `show:` lock + REREAD-MERGE-conditional persist (Codex round-25
   F1)** — open a new tx, acquire the canonical `show:` lock
   (`pg_advisory_xact_lock(hashtext('show:'||drive_file_id))`, blocking, held only for
   this quick write — finalize waits at most ms, never the extraction window). Do NOT
   overwrite the whole `parse_result` with the tx#1 snapshot — that would lose any change
   (another extractor's success, or other staged edits) made during the no-DB extraction
   window, and a LATER stale extraction could erase a newer one. Instead: **REREAD** the
   CURRENT `parse_result`, and **MERGE ONLY the positively-confirmed-fresh results** into
   it — touching nothing else.
   - **Merge KEY handles the target smart-chip shape (Codex round-26):** the current row's
     links may have NO `fileId` (smart-chips — the `fileId` is RECOVERED by `getAgendaChips`
     into the in-memory link DURING extraction). Matching by `fileId` alone would find no
     key on the current (fileId-less) row → the recovered extraction could never persist
     (RFI/PCF would stay note-only forever, cache never warms, publish carries nothing).
     So the merge matches each in-memory link to a current link by the SAME contract
     `enrichAgenda` recovery uses: by `fileId` when the current link has one, else by the
     **ordinal + label chip-correlation** (document-order 1:1, label-aligned — the
     `getAgendaChips` ordinal contract). For each confirmed-fresh match, set BOTH the
     **recovered `fileId` AND the fresh `extracted`** on the current link (additive — for
     a fileId-less link this fills in the `fileId`; never clobbers other fields). This
     warms the cache (the persisted row now has `fileId` + fresh `extracted` → the next
     request cache-hits) and carries the agenda to publish.
   - A request with NO confirmed-fresh links merges nothing (a failed/stale refresh NEVER
     erases an earlier success). The write ATOMICALLY re-checks lifecycle: `update
     public.pending_syncs set parse_result = $1::jsonb where wizard_session_id = $2 and
     drive_file_id = $3 AND <active-session, not-superseded> AND <not
     finalize-consumed/in-progress> returning staged_id` (`$1` = MERGED result; predicate
     matches step 3, does NOT exclude `approval_payload IS NOT NULL`; pass the object,
     NOT `JSON.stringify`). **0 rows** → discard, `409 stale`. **1 row** → commit
     (releases `show:`). Then **build + return `200 { items }`** via
     `buildAdminAgendaPreview(mergedLinks, { freshByLinkKey })` — where `freshByLinkKey`
     is keyed by the (now-present) recovered `fileId`s of the confirmed-fresh links.

**Pool-safety + publish-safety + dedupe:** a DB connection is held ONLY during the two
short txns (read pre-check; brief `show:` persist) — NEVER during the ≤300 s Drive/PDF
work — so previews across many shows/tabs/admins cannot exhaust the postgres pool or
starve finalize/scan. The `show:` lock is held only for the millisecond persist `UPDATE`,
so a finalize racing the extraction either consumes the row first (→ our conditional
`UPDATE` hits 0 rows → `409`, discarded) or runs just after our brief `UPDATE`.
Concurrent work is bounded by the in-memory `AGENDA_MAX_CONCURRENT_EXTRACTIONS` (per
instance, no DB) + the per-browser `AGENDA_CLIENT_CONCURRENCY`; repeated POSTs are cheap
(cache → cheap `getFile`, no download). Best-effort same-instance dedupe coalesces
duplicate POSTs; cross-instance simultaneous duplicates are rare + cheap + cached.
**Publishing is never gated on a best-effort preview; no DB connection is held during
external I/O; stale refresh-failed extractions render note-only, never a stale block.**

### 5.3 Client orchestration + live fill-in (UI; Opus + impeccable invariant 8)

`Step3Review`/`Step3SheetCard` are `"use client"`. Each row arrives with the
server-built **baseline** `adminAgendaPreview` (note-only items; §5.1). The card NEVER
computes hrefs — it renders `AdminAgendaItem`s the SERVER built (baseline or endpoint
result). Hrefs are **best-effort**: present for resolvable links; for smart-chip links
(no `fileId`) the baseline href is `null` and the **card's existing per-card source-sheet
deep link** is the PDF-recovery path until the endpoint returns recovered hrefs (§5.1).

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
  resultItems.length ? resultItems : baselineItems` (preferring the endpoint result,
  whose items carry recovered hrefs even for smart-chips; falling back to baseline on a
  hard fetch failure — where a smart-chip item may have no anchor, covered by the
  source-sheet link), with a state-driven affordance:
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

- **Freshness is an EXPLICIT REQUIRED input, default NOT-fresh (Codex round-24 F1 +
  round-25 F2):** the signature is `buildAdminAgendaPreview(links, opts?: { freshByLinkKey?:
  Set<string> })`. A `block` is produced for a link ONLY when its stable key (its
  `fileId`) is present in `freshByLinkKey` AND it is renderable (below). `freshByLinkKey`
  **defaults to empty** → no blocks. So freshness is never inferred from `link.extracted`
  side-effects: `fetchStep3Data` passes NO `freshByLinkKey` (→ baseline, all note-only),
  and the endpoint passes the set of links it POSITIVELY confirmed fresh THIS call (per
  §5.2 step 5: `extractorVersion === EXTRACTOR_VERSION` AND `sourceRevision === the
  `headRevisionId` `getFile` returned this call`). A stored v1 / old-revision / refresh-
  failed link is NOT in the set → note-only, always. (This replaces the earlier
  `baseline` flag — the empty default IS the baseline behavior.)
- **Renderability predicate, NOT `extracted` truthiness:** for a link in `freshByLinkKey`,
  `const norm = normalizeAgendaExtraction(link.extracted); const renderable = !!norm &&
  norm.confidence === "high" && norm.days.length > 0;` (a low/malformed/zero-day payload
  is truthy — `extracted ? block : note` would yield an empty block). `renderable` →
  `block = { extraction: capExtractionForAdmin(norm,…), dropped* }`; else `block = null`.
  Because freshness is gated by `freshByLinkKey` BEFORE this, a stale extraction can never
  reach a rendered block, and is not persisted as if fresh.
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
   capped + track overflow; (m) **no `freshByLinkKey` ⇒ all note-only** even for a
   high-confidence `extracted` (round-20 F1 / round-25 F2: the default is NOT-fresh); (n)
   **freshness is an explicit required input** — a high-confidence `extracted` whose
   `fileId` is NOT in `freshByLinkKey` → note-only; only a link whose `fileId` IS in
   `freshByLinkKey` → block. Assert a stale v1/old-revision `extracted` (not in the set)
   ALWAYS returns note-only, and that `buildAdminAgendaPreview` NEVER reads version/
   revision off `link.extracted` to decide a block (the set is the sole gate).
2. **Extract endpoint (`tests/app/admin/...extractAgenda.test.ts`)** — (a) auth required
   (unauth → rejected); (b) staged `parse_result` w/ chip-based links + agenda client
   over `fixtures/agenda/*.pdf` → `200 { items }` with high-conf blocks AND the updated
   `parse_result` is **persisted** by a raw `tx` UPDATE on `pending_syncs` inside the
   locked transaction (assert via the pipeline-tx test seam, not Supabase); (c) **cache
   short-circuit** (round-23 F1): a second call when `extracted` is already fresh
   (`headRevisionId`+`EXTRACTOR_VERSION` match) → items with **zero `downloadFileBytes`
   and zero `getAgendaChips`** (the expensive ops), while the cheap per-link `getFile`
   metadata read IS allowed (needed to read the current revision) — assert the download
   spies are 0, NOT that all Drive is 0; (d) **dedupe**: bypass the client throttle —
   two concurrent same-instance POSTs for the same show → the second is coalesced by the
   in-memory in-flight set → `202 in_progress`, no duplicate extraction; (e) **stale
   guard — pre-check** (round-19 F2): a **superseded-session OR finalize-consumed** row
   in tx#1 → `409 stale`, **zero Drive calls, no write**; (e2) **atomic persist-time
   race** (round-20 F2): row passes tx#1, extraction runs, session superseded BEFORE tx#2
   → conditional `UPDATE … WHERE … AND <active> RETURNING` affects **0 rows** → `409
   stale`, `parse_result` **unchanged**; (e3) **approved row STILL extracts** (round-22
   F2): `approval_payload IS NOT NULL` + active + not finalized → extracts, persists,
   `200` (NOT 409); (h) **target smart-chip shape end-to-end** (round-22 F1 + round-26): a staged row with
   links having **zero `fileId`s** + **no `extracted`** → endpoint calls `getAgendaChips`
   (recover fileId) + `downloadFileBytes` → tx#2 merges by **ordinal+label** (no fileId to
   match on) and persists BOTH the recovered `fileId` AND fresh `extracted` → returns
   blocks; then assert a **SECOND** request **cache-hits** (the persisted row now has
   `fileId` + fresh `extracted` → zero `downloadFileBytes`/`getAgendaChips`), proving the
   recovered fileId was persisted and the cache warmed; (i) **stale refresh →
   note-only, not persisted-as-fresh** (round-24 F1): a stored high-confidence `extracted`
   with old `extractorVersion` (v1) OR old `sourceRevision`, AND the refresh
   `downloadFileBytes` returns `infra_error` → the returned item is **note-only**
   (`block: null`) and the stale `extracted` is **NOT written back as a fresh block**
   (assert `parse_result` not upgraded to a fresh block); (j) **no DB connection / show:
   lock during Drive** (round-23/24 F2): assert the Drive/PDF window holds NO advisory
   lock and NO open tx — a concurrent `show:` acquisition (finalize) AND a concurrent DB
   query both succeed DURING extraction; `show:` is taken only in tx#2; (k) **reread-merge,
   no lost-update** (round-25 F1): extractor A succeeds + persists link X's fresh
   `extracted`; meanwhile a slower request B (whose refresh FAILED, no fresh links)
   reaches tx#2 LAST → its merge adds nothing → assert link X's fresh `extracted` is
   **still present** (B did not clobber A); also a write to an unrelated `parse_result`
   field in the gap survives (merge touches only fresh `extracted`); (f) missing row →
   `200 { items: [] }`; (g) infra fault on read → typed error from the `tx` path.
3. **Hygiene caps (`tests/drive/agendaDrive.test.ts`, `extractAgendaSchedule.test.ts`,
   `enrichAgenda.test.ts`)** — byte cap (`cap+1` stream → `unavailable`); stall guard
   (idle + pre-response abort + slow-but-progressing → no false abort); page cap
   (mock `numPages = cap+1` → low, no per-page parse; `extractorVersion === 2`);
   per-show count cap (`AGENDA_MAX_PDFS_PER_SHEET + 1` links → first N extracted).
4. **Card live fill-in (RTL, `tests/components/admin/...`)** — given a SERVER-built
   baseline `adminAgendaPreview` (note-only items), pure-presentation + per-row fetch
   state: (a) `loading` → baseline items + "Parsing agenda… (2 PDFs)" eyebrow; (b) `ready`
   (mock fetch resolves with upgraded items) → two `agenda-schedule` blocks (+ overflow
   notes); (c) **`error` (mock fetch REJECTS) → baseline items render**: a `fileId`/http
   item shows a SAFE "Open PDF" anchor (round-17, server-validated, no client href
   logic), while a **smart-chip item (no `fileId`) shows the note with NO anchor** and
   the breakdown still renders (round-25 F3 — the per-card source-sheet link is the
   recovery path; the card never invents an href); (d) empty baseline → no breakdown; (e) **always-fetch /
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
  are **raw postgres.js** inside the sync-pipeline `tx` (Codex
  round-19 F1) — they are NOT Supabase/PostgREST calls, so they are governed by the
  `SyncPipelineTx` pattern (the existing sync-pipeline error contract), not the Supabase
  call-boundary registry. The Drive reads (`downloadFileBytes`/`getAgendaChips`) ARE
  googleapis boundaries, already registered in `tests/sync/_metaInfraContract.test.ts`.
  The only Supabase call is `requireAdminIdentity()` (existing, registered).
- **Advisory-lock topology (invariant 2) — only a BRIEF `show:` persist holder (Codex
  round-23/24 F2):** the endpoint takes NO advisory lock during Drive work (dedupe is
  in-memory, not a DB lock — round-24 F2). It holds the canonical `show:` key ONLY around
  the persist `UPDATE` in SHORT tx #2 (single-holder; no nested re-acquire; never during
  external I/O). **Extend `tests/auth/advisoryLockRpcDeadlock.test.ts`** to pin: the
  endpoint is a brief `show:` persist holder and holds NO DB lock/connection during the
  Drive/PDF window. Document the existing `show:` holders (approve/apply/discard staged
  routes + sync pipeline) and confirm the endpoint adds no second layer.
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
| `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` (new) | POST `maxDuration=300`: auth → in-memory concurrency slot (`AGENDA_MAX_CONCURRENT_EXTRACTIONS`) + same-instance in-flight dedupe (→`202`) → **SHORT tx#1** SELECT `pending_syncs.parse_result` + lifecycle pre-check (superseded/finalize-consumed → `409`; approved OK) → **`enrichAgenda` with NO DB connection held** (positive per-link freshness; stale-refresh → note-only) → **SHORT tx#2** brief `show:` lock + atomic lifecycle-conditional `UPDATE … RETURNING` (0 rows → `409`) → `buildAdminAgendaPreview` → `200 { items }`. No DB held during Drive; raw postgres.js |
| `lib/agenda/agendaAdminPreview.ts` (new) | server-pure `buildAdminAgendaPreview(links, opts?: { freshByLinkKey?: Set<string> })` — block ONLY for links in `freshByLinkKey` (default empty ⇒ note-only; round-25 F2); `capExtractionForAdmin`, `agendaPdfHref` (best-effort, null for smart-chips) |
| `lib/agenda/constants.ts` | add `AGENDA_PDF_MAX_BYTES`, `AGENDA_MAX_PAGES`, `AGENDA_MAX_PDFS_PER_SHEET`, `AGENDA_ADMIN_SESSIONS_CAP`, `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`, `AGENDA_CLIENT_CONCURRENCY`, `AGENDA_CLIENT_RETRY_LIMIT`, `AGENDA_MAX_CONCURRENT_EXTRACTIONS`; bump `EXTRACTOR_VERSION` 1→2 (`DRIVE_ASSET_STALL_TIMEOUT_MS`/`DRIVE_FILES_GET_TIMEOUT_MS` already exist) |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | extend: pin the endpoint as a single-holder of `show:`||dfid |
| `tests/db/postgrest-dml-lockdown.test.ts` | ensure `pending_syncs` DML lockdown covered (registry row if absent) |
| `lib/agenda/extractAgendaSchedule.ts` | page-cap guard (early `LOW()` when `doc.numPages > AGENDA_MAX_PAGES`) |
| `lib/drive/agendaDrive.ts` | `downloadFileBytes` stream + byte cap (`readBoundedNodeStream({onChunk})`) + `createStallGuard` full wiring → `unavailable`/`infra_error`; `getAgendaChips` + timeout + retry |
| `lib/sync/enrichAgenda.ts` | per-show count cap (`AGENDA_MAX_PDFS_PER_SHEET`) + skip; **no `agendaBudget` param**; **expose per-link confirmed-fresh + just-fetched `headRevisionId`** (round-24 F1) so the endpoint can positively gate blocks (not rely on preserve-on-error side-effects) |
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
- Endpoint boundary: **two SHORT txns, NO DB connection held during Drive** (Codex
  round-23/24 F2) — tx#1 read+lifecycle, extract with no DB held, tx#2 brief `show:` lock
  + atomic conditional persist. Dedupe + resource-bound via an in-memory process-wide
  `AGENDA_MAX_CONCURRENT_EXTRACTIONS` cap (no DB lock) — so previews can't exhaust the
  pool or block finalize/publish. Raw postgres.js (no Supabase for `pending_syncs`).
- Freshness: cache hit costs a cheap `getFile` (not zero Drive — round-23 F1); blocks
  render ONLY for links in `freshByLinkKey` (an EXPLICIT typed input, default empty —
  round-25 F2) = links **positively confirmed fresh this call** (current
  `EXTRACTOR_VERSION` + current `headRevisionId`); a refresh-failed stale extraction is
  note-only and never persisted as a fresh block (round-24 F1).
- Persist integrity: tx#2 **rereads + merges only confirmed-fresh results** into the
  current `parse_result` (never a whole-blob clobber — round-25 F1). The merge matches by
  `fileId` when present, else by the **ordinal+label chip-correlation** (so the target
  fileId-less smart-chip links can be matched), and persists **both the recovered `fileId`
  AND the fresh `extracted`** — warming the cache so the next request cache-hits and
  publish carries the agenda (round-26).
- Hrefs: **best-effort** — resolvable links get a validated Open-PDF href; smart-chip
  links (no `fileId`) get none from the pure baseline (the endpoint result carries
  recovered hrefs; the per-card source-sheet link is the universal fallback — round-25 F3).
- Lifecycle guard (Codex round-19/20/22 F2): extractable = active session AND NOT
  finalize-consumed/superseded; **approved/applied rows STILL extract** (they're visible
  review rows until finalize consumes them, and persistence carries the agenda to
  publish). A pre-work check fast-exits stale rows; the predicate is re-checked
  ATOMICALLY in the persist `UPDATE … WHERE … AND <active> RETURNING` (0 rows → `409
  stale`, nothing persisted) — racing supersession/finalize can't write a consumed row.
- Cache predicate (Codex round-22 F1): cache-hit requires EVERY agenda link to have BOTH
  a `fileId` AND a fresh `extracted` — any link missing a `fileId` (the target
  smart-chip shape, recovered only by `getAgendaChips`) FORCES extraction, so a
  zero-fileId staged parse can never vacuously skip and stay note-only.
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
