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
  (b) **dedupes/bounds DB-backed** (round-32 pivot): a durable `agenda_extract_leases` row
  (per-staged-row, cross-instance) + a brief `agenda-extract-admit` advisory lock (strict
  deployment-wide cap), with an in-memory cap only as a per-instance fast-path; plus a
  **lifecycle guard** so stale tabs do no work. Crucially,
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
+ **`href: null` — the baseline NEVER carries an Open-PDF href (Codex round-50)**: a staged
`fileId`/`url` captured at scan is not proof the sheet is still unchanged/in-scope, and the
pure baseline cannot run the Drive revision/source-scope fence. So Open-PDF anchors come
ONLY from the endpoint's `200` response (fence-validated, §5.2 step 4) — the card's
**existing per-card source-sheet deep link** is the universal pre-validation recovery path
(loading/stale/error). Once the endpoint runs, its returned items carry validated `href`s
(it recovers `fileId`s via `getAgendaChips` AND passed the fence), so the Open-PDF link
appears in the `ready` state. `adminAgendaPreview.length` IS the agenda-link count; empty
`agenda_links` → no Agenda breakdown. **Blocks ONLY ever come from the extract endpoint
(§5.2), the single freshness-gated source**; the client always fetches it (the endpoint
cache-hits cheaply when already fresh — §5.2 step 5 — so an already-extracted show fills
in fast, just via a
freshness-checked round-trip rather than an unverified baseline block).

`fetchStep3Data` ALSO stamps each `Step3Row` with **`agendaStateKey =
`${wizardSessionId}:${staged_id}:${staged_modified_time}`** (a row-GENERATION identity;
Codex round-36 F2) so the client can key its per-row fetch state by generation, not by
`driveFileId` alone (§5.3) — a rescan/new session that reuses the `driveFileId` with new
staged data forces a state reset + re-fetch instead of showing a stale `ready` result.

### 5.2 Per-show extract endpoint — SHORT transactions, no DB connection during Drive

New route `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`
(POST, `export const maxDuration = 300`).

**No DB connection is held during Drive/PDF work (Codex round-23 F2 + round-24 F2).**
The expensive extraction must not hold (a) the canonical `show:` advisory lock — it
would block finalize/publish — NOR (b) ANY postgres.js transaction/connection — an
advisory-xact-lock-scoped tx held for ≤300 s per show would exhaust the postgres pool.
So the request uses **THREE SHORT DB windows with no DB held in between** (round-19/21):
**tx#1a** (admit lock + lease claim only, commits → releases the admit lock), **tx#1b**
(separate, NO admit lock: staged read + lifecycle + generation + folder), **tx#2** (brief
`show:` lock: persist + lease release). The **durable DB extraction lease** (cross-instance
dedupe — Codex round-32) is claimed in tx#1a and released in tx#2, plus a cheap **in-memory
fast-path** (per-instance):

1. **Auth** — `requireAdminIdentity()` (`@/lib/auth/requireAdmin`); reject otherwise.
2. **In-memory fast-path (NO DB) — OWNERSHIP-scoped `try/finally` (Codex round-28 F2 +
   round-29 F2).** A cheap per-instance optimization that avoids even hitting the DB for
   obvious same-instance duplicates; the **durable lease (step 3) is the cross-instance
   authority**. Flags `ownsInFlight`/`acquiredSlot` default `false`. Check the
   per-`(wiz,dfid)` in-flight set (the staged-row identity — matches the durable lease key,
   round-41): present → `202 { status: "pending", reason: "in_progress" }` immediately (a sibling request for
   THIS row IS extracting; `ownsInFlight`/`acquiredSlot` stay `false`). Else insert the key
   (`ownsInFlight = true`) + try a process-wide semaphore slot
   `AGENDA_MAX_CONCURRENT_EXTRACTIONS` (module-level counter; secondary per-instance
   CPU/Drive-quota bound) — got one → `acquiredSlot = true`; **none free → `202
   { status: "pending", reason: "queued" }`** (Codex round-48 F2 — NOT `in_progress`: this row's extraction has
   NOT started, it's queued behind the LOCAL cap; the client budgets `queued` like the
   global-cap queue, NOT the one-window timer, so it can't time out before admission). A
   **`finally`** releases ONLY
   owned resources (`if (acquiredSlot) releaseSlot(); if (ownsInFlight) deleteInFlightKey()`)
   — a duplicate `202` NEVER deletes the owner's marker/slot. Runs on ALL exits, so nothing
   leaks.
3. **TWO short txns before Drive — tx#1a (admit+claim) THEN tx#1b (read) — round-18/19: the
   `agenda-extract-admit` lock must NOT span the staged-row read.** Because `pg_advisory_xact_lock`
   is transaction-scoped, the admit lock is held for the WHOLE tx it lives in; putting the
   `pending_syncs`/`app_settings` reads in that same tx would serialize EVERY deployment-wide
   admission behind those reads under DB slowness. So the lease claim is its OWN short tx that
   COMMITS (releasing the admit lock) BEFORE the staged read:
   - **tx#1a — claim durable lease (admit lock held ONLY here, microseconds):**
   - **Claim the durable extraction lease — keyed by `(wizard_session_id, drive_file_id)`,
     the STAGED-ROW identity (Codex round-32 + round-41):** the dedup unit is the staged
     ROW, because tx#2 persists the result to exactly that `(wiz, dfid)` `pending_syncs`
     row — so a lease can only meaningfully serialize requests that will write the SAME row.
     This is the actual amplification vector round-32 raised: many instances/tabs/refreshes/
     admins hitting the SAME staged row. (A `drive_file_id`-only lease would serialize a
     rescan/new session against the old one but hand it NO result — different rows — so it
     would wait the full window then re-extract anyway: round-41. We DON'T cross-session
     share; see the scope note below.) The claim ALSO enforces a **STRICT DEPLOYMENT-WIDE
     concurrency cap (Codex round-43 F2 + round-45, user-approved)**. The cap counts live
     leases — the lease rows ARE the active extractions, self-healing via TTL (a raw counter
     leaks a slot on crash). But a bare count-then-insert is RACEABLE under READ COMMITTED
     (many burst admitters all read `n < K` before any commits — the exact tabs/refreshes/
     instances burst this endpoint exists to survive). So admission is **SERIALIZED by a
     brief global advisory lock**, held ONLY for the GC+count+claim inside tx#1a (released at tx#1a commit, BEFORE any Drive work): (1) `pg_advisory_xact_lock(hashtext('agenda-extract-admit'))`;
     (2) **GC expired rows (Codex round-52):** `DELETE FROM public.agenda_extract_leases
     WHERE expires_at <= now()` — reclaims crash/hard-kill rows whose owner never released;
     under the admit lock this is serialized (no concurrent-delete race) and keeps the table
     BOUNDED (≈ live extractions only), so the count never degrades into an unbounded scan of
     accumulated dead rows; (3) **CHECK THIS row's live lease BEFORE the global cap (round-10
     — so a same-row duplicate at FULL cap is `in_progress`, not `queued`):** `SELECT 1 FROM
     public.agenda_extract_leases WHERE wizard_session_id = $1 AND drive_file_id = $2 AND
     expires_at > now()` → if found → `202 { status: "pending", reason: "in_progress" }`; (4) else `SELECT
     count(*) FROM public.agenda_extract_leases` (all remaining are live post-GC) — if `>=
     AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS` → `202 { status: "pending", reason: "queued" }`; (5) else claim
     the per-row lease `INSERT … ON CONFLICT (wizard_session_id, drive_file_id) DO UPDATE …
     WHERE expires_at < now() RETURNING owner` — 0 rows = a live lease for this row (race)
     → `202 { status: "pending", reason: "in_progress" }`; 1 row → claimed.
     Because admissions serialize on the admit key, the next admitter's count sees this
     committed lease, so **no more than K extractions are admitted deployment-wide**
     (strict, not soft). All `202` paths set `Retry-After` and do NO Drive. **CANONICAL
     `202` SHAPE (round-21 — ONE shape everywhere, in-memory AND lease paths, route AND
     client):** `202 { status: "pending", reason: "in_progress" | "queued" }`; the client
     budgets ONLY from `reason`. `reason` is `queued` (count `>= K` OR the local-cap fast-path
     — QUEUED, hasn't started) vs `in_progress` (a live lease/in-flight for THIS row — its
     extraction is running). The client budgets these differently (§5.3) so a row queued
     (local OR global cap) doesn't time out into baseline before its OWN extraction starts. The
     admit lock is held only during the microsecond GC+count+claim — NEVER during the staged
     read (tx#1b) NOR the ≤300 s Drive work (released at **tx#1a** commit, round-19). This
     gives deployment-wide **exactly-one-extraction-per-STAGED-ROW** AND a strict
     deployment-wide total bound. **Scope note (round-41):** we deliberately do NOT cross-session share — a
     concurrent DIFFERENT session for the same `drive_file_id` (only the rare rescan-overlap
     window) extracts its OWN row; whichever session was superseded by the rescan is
     discarded at the lifecycle-guarded persist (tx#2 `0 rows → 409`). At most a brief,
     bounded 2× overlap (≤ a couple PDFs), self-limited by supersession — NOT the unbounded
     same-row amplification round-32 targeted. Cross-session result-sharing (a shared
     extraction cache keyed by `drive_file_id` + `modifiedTime`) is deferred (BACKLOG) —
     the sessions have different staged generations, so sharing is not straightforwardly
     correct. `$owner` is a per-request token. TTL `AGENDA_EXTRACT_LEASE_TTL_MS` ≈
     `maxDuration` + margin (~330 000 ms) so a dead holder's lease auto-expires.
   - **tx#1b — read + lifecycle + generation + folder scope (SEPARATE tx, NO admit lock —
     round-19):** after tx#1a committed (admit lock released), open a fresh short tx: `SELECT
     staged_id, staged_modified_time, parse_result (+ lifecycle cols) from public.pending_syncs
     where wizard_session_id = $1 and drive_file_id = $2`; ALSO `SELECT pending_folder_id from
     public.app_settings where id = 'default'` (for the source-scope fence — round-37);
     evaluate the lifecycle guard; **capture `(staged_id, staged_modified_time)`** for the
     tx#2 generation guard (round-27) and `pending_folder_id` for step 4. (The lease is
     already held from tx#1a, so dedup holds across the tx#1a→tx#1b gap.)
   - **COMMIT/close (release the connection).** Missing row → `200 { items: [] }`. STALE
     (superseded session OR finalize-consumed/in-progress; **approved/applied rows are NOT
     stale** — round-22 F2) → `409 { status: "stale" }`. (On any of these non-extracting
     exits the lease we just claimed is released — see the `finally`, step 7.) NO `show:`
     lock here.
4. **TOP-LEVEL sheet-revision + SOURCE-SCOPE fence — gates ALL fileId trust, before AND
   after Drive (Codex round-28 F1 + round-29 F1 + round-31 + round-37)** — the ENTIRE
   staged parse (links, ordinals, and any previously-recovered `fileId`s) is valid ONLY for
   the sheet revision it was derived from AND only while the sheet is still IN the
   configured onboarding folder. So the fence is NOT scoped to `getAgendaChips` — it is a
   top-level check applied to **every** extraction attempt, whether links are smart-chips
   (need `getAgendaChips`) OR already fileId-bearing (staged OR a previously-recovered
   fileId from a download-failed retry). **BEFORE any Drive trust** (chip read OR download):
   call **`fetchDriveFileMetadata(driveFileId)`** (`lib/drive/fetch.ts:303` — the SAME
   metadata read finalize uses; it returns `parents` AND `modifiedTime` — Codex round-39).
   Do NOT use the sync `DriveClient.getFile` here: that shape STRIPS `parents` and its
   `headRevisionId` is the PER-PDF download cache key (§5.2 step 5/6 / `enrichAgenda.ts:115`),
   NOT the sheet's revision — and a native Google Sheet may have NO `headRevisionId` at all.
   Require BOTH: (a) **sheet revision** — `metadata.modifiedTime` equals the staged row's
   **`staged_modified_time`** (both are Drive `modifiedTime` TIMESTAMPS — compare with the
   existing ISO/ms-precision timestamp matcher the sync/finalize stale-guard uses, NOT
   `Date.parse(<Date>)` which drops ms; `headRevisionId` is NOT compared here); (b) **source
   scope** — `metadata.parents.includes(pending_folder_id)` (from `app_settings`, tx#1b),
   mirroring finalize's guard (`finalize/route.ts:692-697`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`).
   Either fails → **`409 stale`** (revision-stale OR **out-of-scope**: a sheet scanned
   in-scope then MOVED OUT of the folder WITHOUT a content edit passes a revision-only check
   — round-37), NO Drive PDF work (no `getAgendaChips`/`downloadFileBytes`), NO trust of any
   staged/recovered fileId, no write (this is the round-31 fix too: a retry that would
   otherwise skip `getAgendaChips` and download a now-stale recovered fileId is caught
   here). **AFTER** extraction, before persist (step 7), **re-call `fetchDriveFileMetadata`
   AND re-read the CURRENT `app_settings.pending_folder_id` (round-17 — do NOT reuse the
   tx#1b value)** and require BOTH `modifiedTime` STILL equals `staged_modified_time` AND
   `parents.includes(<current pending_folder_id>)` STILL holds — catching a sheet edit, a
   move-out-of-folder, OR a **change to the configured onboarding folder** DURING the ≤300 s
   window (matching finalize, which reads current settings at processing time). Either
   mismatch → `409 stale`, no persist; the operator re-scans. (Mirrors the sync pipeline's modifiedTime TOCTOU fence + finalize's
   source-scope guard.) Because the precheck already
   gated everything, `enrichAgenda`'s single internal `getAgendaChips` (`enrichAgenda.ts:66-68`)
   runs within the fenced window — and the after-check covers any edit landing during it.
5. **Extract (NO DB connection held)** — `enrichAgenda(parseResult,
   defaultAgendaDriveClient(), driveFileId)` (production `downloadFileBytes` +
   `getAgendaChips`, `runScheduledCronSync.ts:1665-1666`; §5.5 caps bound a pathological show).
   `enrichAgenda`'s built-in per-link cache (`getFile` metadata → skip download
   when the stored `extracted` matches `headRevisionId` + `EXTRACTOR_VERSION`) means a
   **cached** show costs only cheap `getFile`s, **zero `downloadFileBytes`/`getAgendaChips`**
   (round-23 F1: "cache hit" ≠ zero Drive — freshness needs the current revision, which
   only `getFile` provides). A link **lacking a `fileId`** (the target smart-chip shape —
   `parseAgendaLinks` stores filename/url text, no `fileId`; recovered by `getAgendaChips`)
   ALWAYS forces extraction (round-22 F1: a "fileId-bearing-only" gate is vacuously true
   for a zero-fileId staged parse). **No DB connection is open during any of this.**
6. **POSITIVE per-link freshness (Codex round-24 F1)** — do NOT trust `enrichAgenda`
   side-effects as freshness proof: on a `downloadFileBytes` `infra_error` (or its
   catch-all), `enrichAgenda` PRESERVES the prior `link.extracted`, so a stale v1 /
   old-revision high-confidence extraction would otherwise be rendered + persisted as a
   fresh block exactly when refresh FAILED. So a link is **block-eligible ONLY if it was
   positively confirmed fresh THIS call**: `extracted.extractorVersion === EXTRACTOR_VERSION`
   **AND** `extracted.sourceRevision === <the `headRevisionId` `getFile` returned this
   call>` **AND the PDF's `headRevisionId` was STABLE across the download (per-PDF
   before+after fence — Codex round-46)**. The latter closes a per-PDF TOCTOU: `enrichAgenda`
   reads `getFile.headRevisionId` (`rev_before`) THEN `downloadFileBytes` THEN extracts; if
   the PDF is edited between that `getFile` and the download, the extracted bytes are the
   NEW revision but stamped with `rev_before`. So after extracting, **re-fetch the PDF's
   `getFile.headRevisionId` (`rev_after`) and require `rev_after === rev_before`**; if it
   changed, the link is **NOT confirmed fresh** → note-only, its block is NOT persisted
   (a later retry picks up the new revision). This mirrors the sheet fence's before+after
   pattern, per linked PDF. `enrichAgenda` (or a thin endpoint wrapper) exposes, per link,
   the just-fetched `headRevisionId` + whether the extraction was confirmed-fresh-AND-stable
   this call; a link that failed to refresh OR changed mid-download → **note-only**
   (`block: null`), its `extracted` NOT written as fresh. (Plan: extend `enrichAgenda`/the
   wrapper to return per-link confirmed-fresh + stable revision, not mutation side-effects.)
7. **SHORT tx #2 — brief `show:` lock + REREAD-MERGE-conditional persist (Codex round-25
   F1)** — open a new tx, acquire the canonical `show:` lock
   (`pg_advisory_xact_lock(hashtext('show:'||drive_file_id))`, blocking, held only for
   this quick write — finalize waits at most ms, never the extraction window). Do NOT
   overwrite the whole `parse_result` with the tx#1b snapshot — that would lose any change
   (another extractor's success, or other staged edits) made during the no-DB extraction
   window, and a LATER stale extraction could erase a newer one. Instead: **REREAD** the
   CURRENT `parse_result` and **MERGE two SEPARATE, fence-validated inputs (Codex round-30):**
   - **`recoveredFileIds`** — the `fileId`s recovered from the SINGLE FENCED chip read
     (§5.2 step 4), for EVERY ordinal+label match, **regardless of whether the PDF
     download/extraction succeeded**. These are bound to the staged sheet revision, so
     persisting them is safe.
   - **`confirmedFreshExtractions`** — the `extracted` payloads ONLY for links positively
     confirmed fresh (§5.2 step 6).
   - **Merge KEY is ORDINAL-FIRST (Codex round-26 + round-44):** the in-memory
     (post-extraction) links and the tx#2-reread current links are the SAME generation's
     `agenda_links` array in document order — the generation guard (`staged_id` +
     `staged_modified_time`) guarantees the array is unchanged, and `enrichAgenda` fills
     `extracted`/`fileId` per index without reordering. So match **by ordinal `i` ↔ `i`**,
     with `label` (and `fileId` when both present) as a SANITY CHECK only — NEVER as the
     sole identifier. `fileId` is **not unique** across duplicate links pointing at the
     same PDF (round-35 F2); a fileId-first merge could attach a confirmed extraction to the
     WRONG duplicate (or both) BEFORE the render-time ordinal gate, persisting a block for a
     link that was NOT confirmed fresh. Ordinal-first matches the ordinal-keyed
     `freshByLinkKey`. For each ordinal `i`, set the **recovered `fileId`** (additive), and
     resolve `extracted` by a **3-way per-ordinal freshness verdict (Codex round-47 F1 —
     structural close-out of the freshness vector):** `link.extracted`'s mere PRESENCE in
     persisted `parse_result` is a FRESHNESS INVARIANT trusted by ALL consumers (admin
     preview, **crew render**, **publish**), not just the admin `freshByLinkKey` gate:
     - **FRESH** (ordinal `i` ∈ `confirmedFreshExtractions`: extractorVersion current +
       `sourceRevision === current PDF rev` + rev stable across download, step 6) → SET the
       fresh `extracted` (block).
     - **KNOWN-STALE** (endpoint SUCCESSFULLY read the current PDF `headRevisionId` this call
       AND the stored `extracted` does NOT match it — old `sourceRevision`/`extractorVersion`
       — and no fresh extraction was obtained, e.g. download failed / mid-download rev
       changed) → **CLEAR `extracted` (`undefined`)** so the stale agenda is NOT published or
       crew-rendered. (An additive-only merge would leave it for finalize + crew to publish
       even after the admin saw note-only — the bug round-47 F1 names.)
     - **UNKNOWN** (could NOT read the current PDF rev — `infra_error`/`unavailable` on the
       PDF `getFile`) → **LEAVE** the existing `extracted` (last-known-good; don't erase on a
       transient fault — round-25; cron re-confirms). Admin preview still note-only.
     So a link whose chip recovery succeeded but whose **download FAILED** (round-30) still
     **persists + returns its recovered `fileId`** (→ a valid Open-PDF href on the note item;
     next retry skips `getAgendaChips`), while remaining **note-only**; its `extracted` is
     CLEARED if known-stale, LEFT if unknown. A confirmed-fresh link gets both fileId +
     `extracted` (block) → warms the cache and carries the agenda to publish.
   - **STRICTLY ADDITIVE to agenda fields — approval-boundary contract (Codex round-43 F1,
     user-approved "keep async fill"):** the merge writes ONLY
     `parse_result.show.agenda_links[i].extracted` and `…agenda_links[i].fileId` for the
     matched links — it NEVER touches any other `parse_result` field (rooms, schedule,
     crew, venue, hotels, transport, gear, …). So an extraction completing AFTER the
     operator approved a row enriches ONLY the agenda (best-effort derived PDF schedule
     data the operator opted into via the "parsing agenda…" UX), and can NEVER alter the
     operator-REVIEWED content. This is the ratified contract — approved rows still extract
     (round-22 F2) AND publish what was approved for every reviewed field; the agenda is
     additive enrichment outside line-item approval. (A test asserts every non-agenda
     `parse_result` field is byte-identical before/after a post-approval extraction.)
   - A request never writes a NEW stale `extracted`; it clears a KNOWN-STALE one and leaves
     an UNKNOWN one (the 3-way verdict above). "Never erases an earlier success" (round-25)
     still holds: a FRESH stored `extracted` (matches the current rev) is never KNOWN-STALE,
     so a later failed/uncertain request never clears a fresh success. A request may also
     persist newly `recoveredFileIds` (additive). If nothing changed at all (no recovered
     fileIds, no fresh sets, no known-stale clears) the write is a no-op / skipped. The write ATOMICALLY re-checks lifecycle, the row generation (tx#1b, round-27),
     **AND current lease ownership (Codex round-36 F1)** — if our extraction ran past
     `AGENDA_EXTRACT_LEASE_TTL_MS` and another owner RECLAIMED the lease + persisted a newer
     revision, this (now-expired) owner MUST NOT clobber it. So the UPDATE is conditional on
     us STILL owning an UNEXPIRED lease, via a correlated guard: `update public.pending_syncs
     set parse_result = $1::jsonb where wizard_session_id = $2 and drive_file_id = $3 AND
     staged_id = $4 AND staged_modified_time = $5 AND <active-session, not-superseded> AND
     <not finalize-consumed/in-progress> AND EXISTS (select 1 from
     public.agenda_extract_leases l where l.wizard_session_id = $2 and l.drive_file_id = $3
     and l.owner = $owner and l.expires_at > now()) returning staged_id` (`$1` = MERGED
     result; `$4/$5` = tx#1b generation; `$owner` = our lease token; does NOT exclude
     `wizard_approved = true`; pass the object, NOT `JSON.stringify`). **0 rows**
     (row superseded / finalize-consumed / regenerated by a rescan / **lease lost to a TTL
     reclaim**) → discard, `409 stale` — never clobbers a newer owner. **1 row** → the SAME
     tx#2 also **releases the durable lease** (owner-scoped: `DELETE FROM
     public.agenda_extract_leases WHERE wizard_session_id = $2 and drive_file_id = $3 AND
     owner = $owner` — only if WE still own it, so a reclaimed lease isn't deleted out from
     under the new owner) → commit (releases `show:`). Then **build + return `200 { items }`** via
     `buildAdminAgendaPreview(mergedLinks, { freshByLinkKey, validatedHrefs: true })`
     (**`validatedHrefs: true`** because this path passed the sheet revision/source-scope
     fence — round-50/51; without it ready-state items would get `href: null`) — where
     `freshByLinkKey` is the set of **ordinals** (indices in `mergedLinks`) of the
     confirmed-fresh links (per-link, NOT `fileId` — round-35 F2: a shared `fileId` across
     duplicate links must not bless a stale duplicate).

**Durable lease `finally` (Codex round-32).** A `finally` releases the lease on EVERY
exit AFTER a successful claim (owner-scoped `DELETE … WHERE owner = $owner`): the
non-extracting tx#1b exits (missing row, `409 stale`), an extraction throw, a revision-
fence `409`, AND the success path if tx#2's release somehow didn't run. (The TTL is the
backstop if even the `finally` release fails — a crashed instance's lease auto-expires at
`AGENDA_EXTRACT_LEASE_TTL_MS`.) The `202` paths (in-memory dup, or a LIVE durable lease held
by another request) claimed NOTHING → release nothing.

**Pool-safety + publish-safety + dedupe:** a DB connection is held ONLY during the two
short txns (claim+read; brief `show:` persist+release) — NEVER during the ≤300 s Drive/PDF
work — so previews cannot exhaust the postgres pool or starve finalize/scan. The `show:`
lock is held only for the millisecond persist `UPDATE`, so a finalize racing the
extraction either consumes the row first (→ our conditional `UPDATE` hits 0 rows → `409`,
discarded) or runs just after. **Finalize itself re-reads `parse_result` under the `show:`
lock before publishing (§5.6, Codex round-34)** — so a finalize that pre-read the row
before our persist still picks up the extracted agenda (the brief tx#2 `show:` lock is
necessary but not sufficient on its own; finalize's read-before-lock is the other half).
**Deployment-wide, exactly ONE extraction per STAGED ROW runs at a time** (the durable
`agenda_extract_leases` row keyed by `(wizard_session_id, drive_file_id)` — cross-instance,
TTL-recovered; a rare concurrent different-session extraction for the same Drive file is
bounded + self-limited by supersession — round-41), with
the in-memory `AGENDA_MAX_CONCURRENT_EXTRACTIONS` as a per-instance aggregate guard and
`AGENDA_CLIENT_CONCURRENCY` per browser; repeated POSTs are cheap (cache → `getFile`, no
download). **Publishing is never gated on a best-effort preview; no DB connection is held
during external I/O; stale refresh-failed extractions render note-only, never a stale
block.**

### 5.3 Client orchestration + live fill-in (UI; Opus + impeccable invariant 8)

`Step3Review`/`Step3SheetCard` are `"use client"`. Each row arrives with the
server-built **baseline** `adminAgendaPreview` (note-only items; §5.1). The card NEVER
computes hrefs — it renders `AdminAgendaItem`s the SERVER built. **An Open-PDF anchor is
rendered ONLY in the `ready` state (Codex round-50):** the only fence-validated hrefs come
from a SUCCESSFUL endpoint `200` (whose precheck confirmed the sheet is still current +
in-scope, §5.2 step 4). **Baseline hrefs are ALWAYS `null`** — a staged `fileId`/`url`
captured at scan is NOT proof the sheet is still unchanged/in-scope, so the card must not
expose it before the fence passes (absence of a `409` is NOT evidence the fence passed).
In `loading`/`stale`/`error`, the **card's existing per-card source-sheet deep link** (which
opens the operator's own sheet — always a safe navigation target) is the universal recovery
path; the per-item Open-PDF anchor appears only once the endpoint validates it.

- `adminAgendaPreview.length === 0` → **no Agenda breakdown** (omitted).
- Else, per row, a state machine over the extract fetch: `idle → loading →
  ready(items) | stale | error`. The client ALWAYS fires the POST (the endpoint is the sole
  freshness-gated block source; baseline blocks never exist) in a `useEffect` keyed on the
  **server-provided `agendaStateKey` — NOT `driveFileId` alone (Codex round-36 F2)**.
  `fetchStep3Data` stamps each `Step3Row` with `agendaStateKey = `
  `${wizardSessionId}:${staged_id}:${staged_modified_time}` (§5.1) — a row-GENERATION
  identity. A rescan or new wizard session can reuse the same `driveFileId` while changing
  `staged_id`/`staged_modified_time`/links/baseline; keying only on `driveFileId` would
  keep a prior `ready`/`error` result (or skip the POST) and show STALE agenda at the UI
  layer, bypassing the server fence. So the per-row fetch STATE (and the POST-firing
  effect) are keyed by `agendaStateKey`: a new generation **resets the row's state to
  `idle` and re-fires** the POST. Throttled to ≤ `AGENDA_CLIENT_CONCURRENCY = 3` in-flight
  across rows.
  The endpoint cache-hits cheaply when already fresh, so this is fast. A
  **`202 { status: "pending", reason: "in_progress" }`** response (another request holds the durable lease)
  keeps the row in `loading` and retries — but the poll budget is **tied to the
  extraction window, NOT a short fixed attempt count (Codex round-33 F1)**: the durable
  lease holder can legitimately run for nearly the full `maxDuration = 300 s`, and under a
  Strict-Mode remount / refresh / second tab the VISIBLE request may be a duplicate that
  only ever sees `202`s while a DIFFERENT request owns the extraction. So the client keeps
  polling `202` (honoring the endpoint's `Retry-After` header, with backoff) until it
  receives the persisted `200`/`409`. **The two `202` reasons are budgeted separately
  (Codex round-47/48 F2):** `in_progress` polling (a lease holder is extracting THIS row) is
  bounded by `AGENDA_CLIENT_POLL_BUDGET_MS` ≈ `maxDuration` + margin (~330 000 ms) — one
  extraction window; **`queued` polling** (the row is QUEUED behind the LOCAL per-instance
  cap OR the deployment-wide global cap and has NOT started) does NOT consume that window —
  it runs under a separate, larger `AGENDA_CLIENT_QUEUE_BUDGET_MS`, and the `in_progress`
  window timer only STARTS once the row is admitted (first `in_progress`/own extraction). So
  under a K+N burst a queued row (local or global cap) keeps polling through the queue wait,
  then still renders its eventual `200` instead of falling back to baseline before its
  extraction began. (A short fixed budget — or one window covering BOTH queue-wait and extraction —
  would abandon the live-fill before the owner persists.) A
  **`409 { status: "stale" }`** is **terminal → `stale` state (Codex round-38)**: a 409 is
  the endpoint's POSITIVE signal that the staged parse is no longer trustworthy
  (superseded/finalizing OR revision/source-scope fence fired — §5.2 step 4) → sanitized
  note-only. A network/5xx — **including the endpoint's `504 { status: "timeout" }`** (the
  deadline-race timeout, §5.2) — → `error` (the fence never ran to completion / extraction
  timed out); the agenda lands via cron post-publish.
- **Open-PDF anchors render ONLY in `ready` (Codex round-50): hrefs come ONLY from the
  endpoint's `200` (fence-validated).** The `AgendaBreakdown` renders the EFFECTIVE items
  per state:
  - `loading` → baseline note items (label/badge) PLUS a calm **"Parsing agenda… (N PDF{s})"**
    eyebrow/skeleton (`N = adminAgendaPreview.length`); **NO per-item Open-PDF anchor** (the
    fence hasn't passed); the card's source-sheet link is the recovery path.
  - `ready` (endpoint `200`) → render `resultItems` (§5.4): block → `AgendaScheduleBlock` +
    overflow note; note item → muted note + **"Open PDF"** (these hrefs are fence-validated —
    the precheck confirmed the sheet is current + in-scope; recovered even for smart-chips).
  - `stale` (terminal `409`) → **SANITIZED note-only, NO anchor, NO block** — a muted
    "agenda source changed — re-scan" note; the agenda lands via cron post-publish (§3).
  - `error` (network/5xx, no successful fence) → **note-only, NO Open-PDF anchor** (the
    fence never confirmed the link — round-50; a stale/out-of-scope baseline href must not
    leak) + the **source-sheet recovery link**. The agenda is not lost — cron extracts it
    post-publish (§3). The card NEVER computes/render an href the server didn't validate.
- Strict-mode/double-render safe (idempotent endpoint + per-row in-flight guard). A
  closed tab simply means un-fired rows aren't previewed during THIS review (re-open
  re-fires; publish → cron). No work is dropped.

**Transition inventory (5 states: `idle`, `loading`, `ready`, `stale`, `error`).** The
only reachable transitions follow the fetch lifecycle (`idle → loading → {ready | stale |
error}`) plus a generation-key reset (any state → `idle` when `agendaStateKey` changes —
round-36 F2); `ready`/`stale`/`error` are otherwise terminal per row. Enumerated:
`idle → loading` (fire POST; replace nothing → skeleton), `loading → ready`
(crossfade placeholder→blocks WITH validated anchors), `loading → stale` (replace
placeholder with the SANITIZED no-href note — round-38), `loading → error` (replace
placeholder with the "couldn't auto-read" note — **NO Open-PDF anchor**, round-50/51),
`{ready|stale|error} → idle` (generation reset:
clear items, re-fire — round-36 F2). Unreachable/instant (no animation): `idle→ready`,
`idle→stale`, `idle→error` (always pass through `loading`); `ready↔stale`, `ready↔error`,
`stale↔error` (terminal — only reachable via an `→idle` reset then a fresh fetch). No
compound transitions: each row is independent; the card's expand/collapse toggle is
unchanged.

**Dimensional invariants:** `AgendaScheduleBlock` already declares its own
(`AgendaScheduleBlock.tsx:30-37`). The placeholder + breakdown wrapper are flow content
(no fixed-dimension parent) → no new parent→child invariant; Tailwind-v4
no-default-`items-stretch` rule N/A.

**Copy:** placeholder/notes are descriptive UI text, not raw error codes → not routed
through `lib/messages/lookup.ts` (invariant 5 N/A).

### 5.4 Server-computed `adminAgendaPreview` (shared render shape)

`buildAdminAgendaPreview(links, opts?): AdminAgendaItem[]` (new `lib/agenda/agendaAdminPreview.ts`,
server-pure, unit-testable) is the SINGLE place agenda display logic lives; the client
card is pure presentation over its output. It is called in BOTH server locations: by
`fetchStep3Data` over the not-yet-extracted staged links (→ the **note-only, href-LESS**
baseline, §5.1) AND by the extract endpoint over the freshly-`extracted` links (→ the
upgraded items with `block`s + validated hrefs, §5.2). Same function, same shape. The
endpoint passes **`opts.validatedHrefs: true`** (it ran the Drive revision/source-scope
fence — §5.2 step 4); the baseline OMITS it, so **baseline `href` is ALWAYS `null` (Codex
round-50)** — an Open-PDF anchor is emitted ONLY after the fence positively validated the
link, never best-effort.

```ts
type AdminAgendaItem = {
  label: string;            // agendaDisplayLabel(link.label) ?? link.label, coerced
  badge: string | null;     // per-doc badge when >1 link, else null
  href: string | null;      // agendaPdfHref(link) when opts.validatedHrefs (endpoint), else null
  block: { extraction: AgendaExtraction; droppedSessions: number;
           droppedDays: number; droppedTracks: number } | null; // null → note item
};
```

Rules (all server-side, derived from earlier review rounds):

- **Freshness is an EXPLICIT REQUIRED input, keyed PER-LINK, default NOT-fresh (Codex
  round-24 F1 + round-25 F2 + round-35):** the signature is `buildAdminAgendaPreview(links,
  opts?: { freshByLinkKey?: Set<number>; validatedHrefs?: boolean })`. A `block` is produced for a link ONLY when its
  **per-link key** is present in `freshByLinkKey` AND it is renderable (below). The key is
  the link's **ordinal** (its index in the `agenda_links` array) — NOT its `fileId`:
  `fileId` alone is **not unique** when two agenda rows point at the SAME Drive PDF, so a
  fileId-keyed set would bless a STALE duplicate (one link refreshed fresh, the other a
  refresh-failed high-confidence `extracted` sharing the fileId) — round-35 F2. The ordinal
  is per-link and matches `buildAdminAgendaPreview`'s own iteration index, so each link is
  gated by ITS OWN confirmation. `freshByLinkKey` **defaults to empty** → no blocks. So
  freshness is never inferred from `link.extracted` side-effects: `fetchStep3Data` passes
  NO `freshByLinkKey` (→ baseline, all note-only); the endpoint passes the ordinals of the
  links it POSITIVELY confirmed fresh THIS call (per §5.2 step 6: `extractorVersion ===
  EXTRACTOR_VERSION` AND `sourceRevision === the `headRevisionId` `getFile` returned this
  call`). A stored v1 / old-revision / refresh-failed link's ordinal is NOT in the set →
  note-only, always. (This replaces the earlier `baseline` flag — empty default IS baseline.)
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
- **Open-PDF href emitted ONLY when `opts.validatedHrefs` (Codex round-50):** without it
  (baseline), `href` is `null` for EVERY item. With it (the endpoint, post-fence),
  `agendaPdfHref(link)`: `link.fileId` (non-empty string) →
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
| Per-PDF download stall (IDLE) | `DRIVE_ASSET_STALL_TIMEOUT_MS` (existing) | `createStallGuard` on the stream (`stallGuard.ts:13-22` FULL wiring: `signal`→`files.get(params,{responseType:'stream',signal,retry:false})`, abort→`stream.destroy`, `reset` on `onChunk`, `clear` in `finally`, `timedOut()`→`infra_error`) | idle stall → `infra_error` |
| Per-PDF TOTAL wall-clock (slow-drip) | `AGENDA_PDF_DEADLINE_MS` (new — Codex round-48 F1) | a per-PDF `AbortController` armed with a TOTAL-time deadline (NOT reset on chunk) wired into the SAME `signal` as the stall guard | total-time exceeded → abort the download/extract → `infra_error` (note-only) — bounds a slow-drip that emits a tiny chunk before each idle timeout to evade the stall guard |
| Endpoint TOTAL wall-clock | `AGENDA_EXTRACT_DEADLINE_MS` (new — Codex round-48 F1; `< maxDuration = 300 s`, e.g. ~250 s) | the route races the whole extract against this deadline (`Promise.race`); on fire it ABORTS the controller, **then AWAITS the extraction promise's settlement BEFORE releasing capacity** (round-18 — a losing `Promise.race` branch is NOT killed; releasing the lease/slot while the work still runs would let a retry double-admit and breach the cap), returns **`504 { status: "timeout" }`**, and unwinds through the `finally` | **Cooperative case** (production Drive deps reject on abort → settle promptly): `504` returned, THEN the `finally` releases the lease + in-memory slot/in-flight. **Non-cooperative case** (a dep that never settles): the lease/slot stay HELD until the platform's 300 s hard-kill (no premature release → no double-admission), recovered by lease TTL-GC. (Matches §5.2 / the plan's `q-stuck` test — NOT an immediate release on timer fire.) |
| `getAgendaChips` call timeout | `DRIVE_FILES_GET_TIMEOUT_MS` (existing) + transient retry (per `sheetGids.ts`) | `getAgendaChips` | timeout → `infra_error` |
| Per-PDF page count | `AGENDA_MAX_PAGES = 80` | `extractAgendaSchedule` early `LOW()` when `doc.numPages > cap` (before the page loop) | low-confidence → note |
| PDFs extracted per show | `AGENDA_MAX_PDFS_PER_SHEET = 6` | `enrichAgenda` loop | links beyond the cap skip; surfaced via the card note (no warning) |

**`EXTRACTOR_VERSION` stays `1` — do NOT bump (Codex round-49).** The page-cap guard is a
pure-function gate that changes output ONLY for >80pp PDFs (the real corpus is ≤10pp, so
v1 and the page-capped output are IDENTICAL there); it applies to every NEW extraction
without a version bump. Bumping 1→2 would mark every EXISTING published-show `extracted`
payload (cron-populated, `extractorVersion: 1`) stale-by-version, and crew renders
`link.extracted` directly — so a bump would either blank legacy agenda on crew until cron
re-extracts OR require a crew render gate (forbidden — "crew unchanged", §11). Since the
endpoint only writes STAGED rows (which had NO prior extraction — the wizard never extracted
before this feature) and published-show freshness remains cron's existing job, keeping
`EXTRACTOR_VERSION = 1` means legacy data stays valid (version matches current), no
invalidation, no crew gate, no migration. A pre-existing >80pp v1 extraction stays cached
(already parsed — the cost was paid; the cap only prevents NEW expensive parses). `getFile`
already routes through
the timed metadata fetch (`fetch.ts` `DRIVE_FILES_GET_TIMEOUT_MS`) — unchanged.
`enrichAgenda` no longer takes the SCAN-level `agendaBudget`/deadline apparatus (the
attempts/scan-deadline knobs are gone) — but it DOES accept a thread-in **`AbortSignal`**
(round-48 F1) so the endpoint's total-time deadline (`AGENDA_EXTRACT_DEADLINE_MS`) and the
per-PDF deadline (`AGENDA_PDF_DEADLINE_MS`) can ACTIVELY cancel in-flight Drive/PDF work
(distinct from the old budget param — this is a cancellation signal, not a per-call budget
count). A `downloadFileBytes`/`getAgendaChips` `infra_error` OR a deadline-abort leaves the
link unenriched (retry on a later poll / cron) — never a permanent drop, and the `finally`
always releases owned resources (lease + in-memory slot).

### 5.6 Finalize re-reads `parse_result` under the `show:` lock (Codex round-34)

The extractor's tx#2 persist is NOT sufficient for publish-safety on its own. **Finalize
reads `pending_syncs.parse_result` BEFORE the per-row processing**
(`selectFinishableCleanRows`, `finalize/route.ts:346-357` + `:943`, reads `ps.parse_result`
into the in-memory `PendingFinalizeRow`), then consumes that pre-read snapshot to
apply/stage. So a finalize that SELECTed the row before the extractor persisted the agenda
can publish/stage the STALE pre-read — dropping the just-extracted agenda even though the
card showed a ready preview.

**The per-row tx ALREADY holds the `show:` lock — NO new holder (Codex round-35).** Each
finalize row runs through `runtime.withRowTx(driveFileId, …)` → `defaultWithRowTx`
(`finalize/route.ts:155-164`), which acquires `pg_advisory_xact_lock(hashtext('show:' ||
$1))` BEFORE `processApprovedRow`. So BOTH apply paths already execute under the canonical
`show:` lock; `adoptShowLockHeld` (`lib/sync/lockedShowTx.ts:155`) merely **ASSERTS** the
held lock (`assertShowLockHeld` — it is NOT an acquisition API). The fix is therefore ONLY
to **re-SELECT `parse_result` for the row INSIDE the already-locked per-row tx, immediately
before consuming it**, and use that fresh value — no topology change, no new lock:

Both re-selects MUST be **generation-scoped (Codex round-42)** — bound to the exact
`staged_id` + `staged_modified_time` finalize originally selected AND the operator
approved. A bare `(wizard_session_id, drive_file_id)` re-select could, under a same-session
rescan/row regeneration landing between finalize's initial `selectFinishableCleanRows` and
this locked re-read, return a NEWER row's `parse_result` while finalize still carries the
OLD row's approval/generation metadata — feeding a mismatched parse into apply/shadow-stage
BEFORE the downstream generation guard rejects. So each re-select is `… where
wizard_session_id = $1 and drive_file_id = $2 AND staged_id = $3 AND staged_modified_time =
$4`; **0 rows (row regenerated) → treat as stale**: demote / `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`
(the existing race path), NO apply/shadow-stage side effects on the mismatched parse.

- **First-seen apply** (`finalize/route.ts:823-828`): under the row-tx's held lock
  (asserted via `adoptShowLockHeld`), add the generation-scoped `SELECT parse_result from
  public.pending_syncs where wizard_session_id = $1 and drive_file_id = $2 AND staged_id =
  $3 AND staged_modified_time = $4` and pass THAT (coerced) to `applyStagedCore` as
  `parseResult` instead of the pre-read `coercedRow.parse_result`; 0 rows → stale (no
  apply). (The extractor's tx#2 does NOT change `staged_id`/`staged_modified_time`, so a
  pure agenda persist still matches; only a genuine rescan-regeneration misses.)
- **Existing-show shadow** (`finalize/route.ts:771`, `stageExistingShowShadow` at
  `:525-568`): this also already runs inside the locked row-tx (the `tx` passed in IS the
  `show:`-locked `rowTx`). Run the SAME generation-scoped re-SELECT and stage THAT into the
  shadow's `parse_result` (`:546`); 0 rows → stale (no shadow-stage). The shadow is the
  authoritative source for the Phase-D apply (and `pending_syncs` is deleted right after,
  `:773`), so the re-read must happen here.

Because the per-row tx already holds `show:<dfid>`, the extractor's tx#2 (which needs the
same lock) is blocked during finalize, so the re-read is the latest committed value and no
extraction interleaves; a later extractor finds the row finalize-consumed → its tx#2
predicate hits 0 rows → `409` (discarded). **Advisory-lock topology (invariant 2)
UNCHANGED:** finalize remains a single `show:` holder per `dfid` via the existing
`defaultWithRowTx` (no NEW holder, no nested re-acquire — the re-select uses the same
locked tx). `tests/auth/advisoryLockRpcDeadlock.test.ts` is extended only to PIN that the
re-select adds no second acquisition (the topology is unchanged).

### 5.7 Freshness & TOCTOU contract (comprehensive — structural close-out)

Revision/freshness TOCTOU recurred across review rounds (28/29/31 sheet revision, 37
source-scope, 39 metadata fidelity, 46 per-PDF revision, 47 persist-invariant). Per the
same-vector-recurrence rule, this section enumerates EVERY Drive-derived trust datum, its
fence, and the consuming boundary — the implementation + review audit against THIS full
table, not one surface at a time. **The governing invariant:** any Drive-derived datum used
for trust is validated before AND after the work that consumes it, and **a value only
persists into `parse_result` while it is provably fresh** — so all three consumers (admin
preview, crew render, publish) can trust the persisted data directly.

| Datum | Read via | Fence (before + after the consuming work) | On stale/unconfirmable |
|---|---|---|---|
| Sheet revision | `fetchDriveFileMetadata.modifiedTime` (§5.2 step 4) | `modifiedTime == staged_modified_time` before chip/download AND after, before persist | `409 stale`, no Drive PDF work / no persist |
| Sheet source-scope | `fetchDriveFileMetadata.parents` (step 4) | `parents.includes(pending_folder_id)` before AND after | `409` out-of-scope, no work / no persist |
| Smart-chip fileId recovery | `getAgendaChips` (one fenced read, step 4/5) | inside the fenced sheet window; ordinal+label correlation | recovered fileIds persist (fence-validated) even if download later fails |
| Per-PDF revision | per-link `getFile.headRevisionId` (step 6) | `rev_after === rev_before` across the download/extract | link NOT confirmed-fresh → note-only, block not persisted |
| Persisted `link.extracted` | the stored value itself | INVARIANT: present ⟹ `extractorVersion` current AND `sourceRevision ===` a confirmed PDF rev; KNOWN-STALE cleared at persist (step 7, round-47 F1) | crew/publish read `extracted` directly and are safe — no separate gate needed |
| Admin preview block | `freshByLinkKey` (ordinals, §5.4) | render gate: block only for confirmed-fresh-THIS-call ordinals | note-only |
| Staged-row generation | `staged_id` + `staged_modified_time` (tx#1b) | tx#2 persist + finalize re-read both bind to it | `409`/stale, no mutation |

The row that closes the publish/crew hole is **persisted `link.extracted` is a freshness
invariant** (round-47 F1): because a known-stale `extracted` is CLEARED at persist, finalize
and crew — which read `link.extracted` directly — never publish/render stale agenda. The
admin `freshByLinkKey` gate is then a SECOND layer (defends the live preview against a stored
value that's stale-but-not-yet-cleared, e.g. an UNKNOWN/transient case), not the only one.

**Scope of the invariant + legacy data (Codex round-49):** this endpoint writes ONLY
STAGED (wizard) rows, which had NO prior `extracted` (the wizard never extracted before this
feature) — so every staged `extracted` the endpoint creates is fresh-or-cleared by the
contract above. PUBLISHED shows' `link.extracted` is maintained by the existing cron
`enrichAgenda` (unchanged by this feature) — crew freshness for live shows is cron's job, as
today. **No `EXTRACTOR_VERSION` bump** (§5.5) means existing `extractorVersion: 1` payloads
stay version-current — the feature invalidates NO legacy data and adds NO crew render gate
("crew unchanged"). So crew/publish behavior for already-published shows is byte-unaffected
by this change.

## 6. Guard conditions (every input)

- `agenda_links` empty / missing / non-array → baseline `adminAgendaPreview = []` → no
  Agenda breakdown.
- staged row missing/corrupt at the endpoint → `{ items: [] }`.
- extract endpoint request fails (network/500) → client `error` state → note-only, **NO
  Open-PDF anchor** (the fence never confirmed the link — round-50/51); source-sheet recovery.
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
   note; **(href cases assume `validatedHrefs: true` — the endpoint mode; round-50/51):**
   (e) no extracted + `fileId` → note + Drive href; (f) `url="https://…"` → href;
   (g) `url="Program.pdf"` → NO anchor; (h) `url="javascript:…"`/relative → NO anchor;
   **(h2) `validatedHrefs` GATE:** the SAME `fileId`/http link with **NO `validatedHrefs`
   (baseline mode)** → `href: null` (no anchor), vs WITH `validatedHrefs: true` → href
   present — proving baseline never emits an href and only the fence-validated endpoint does;
   (i) `agenda_links` undefined/non-array → `[]`; (j) > `AGENDA_MAX_PDFS_PER_SHEET`
   links → capped + "+N more agenda PDFs"; (k) 18-session extraction → 8 + overflow
   `dropped*`; (l) > `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP` tracks in one kept session →
   capped + track overflow; (m) **no `freshByLinkKey` ⇒ all note-only** even for a
   high-confidence `extracted` (round-20 F1 / round-25 F2: the default is NOT-fresh); (n)
   **freshness is an explicit PER-LINK (ordinal) input** — a high-confidence `extracted`
   whose ordinal is NOT in `freshByLinkKey` → note-only; only a link whose ordinal IS in
   the set → block. Assert a stale v1/old-revision `extracted` (ordinal not in set) ALWAYS
   note-only, and that `buildAdminAgendaPreview` NEVER reads version/revision off
   `link.extracted` to decide a block (the set is the sole gate); (n2) **duplicate-fileId,
   per-link gate** (round-35 F2): TWO links with the SAME `fileId`, one ordinal in
   `freshByLinkKey` (fresh) and one NOT (refresh-failed, still high-confidence `extracted`)
   → ONLY the fresh-ordinal link renders a block; the stale duplicate is note-only (proving
   the key is per-link ordinal, not the shared `fileId`).
2. **Extract endpoint (`tests/app/admin/...extractAgenda.test.ts`)** — (a) auth required
   (unauth → rejected); (b) staged `parse_result` w/ chip-based links + agenda client
   over `fixtures/agenda/*.pdf` → `200 { items }` with high-conf blocks **AND each returned
   item carries a non-null validated `href`** (the route passed `validatedHrefs: true` after
   the fence — round-50/51) AND the updated `parse_result` is **persisted** by a raw `tx`
   UPDATE on `pending_syncs` inside the locked transaction (assert via the pipeline-tx test
   seam, not Supabase); (c) **cache
   short-circuit** (round-23 F1): a second call when `extracted` is already fresh
   (`headRevisionId`+`EXTRACTOR_VERSION` match) → items with **zero `downloadFileBytes`
   and zero `getAgendaChips`** (the expensive ops), while the cheap per-link `getFile`
   metadata read IS allowed (needed to read the current revision) — assert the download
   spies are 0, NOT that all Drive is 0; (d) **dedupe — durable + cross-instance, per STAGED ROW** (round-32 + round-41):
   two concurrent POSTs for the same `(wizard_session_id, drive_file_id)` from **independent
   in-memory state stores** (simulating two serverless instances — distinct in-flight
   sets/semaphores) → only ONE claims the `agenda_extract_leases` row + extracts; the
   other's `INSERT … ON CONFLICT (wizard_session_id, drive_file_id) … WHERE expires_at <
   now()` affects 0 rows → `202 { status: "pending", reason: "in_progress" }`, **no second extraction** (assert
   `downloadFileBytes` runs once across both); (d-x) **different-session = independent row**
   (round-41 scope): session B (a NEW wizard session, same `drive_file_id`, different
   `wizard_session_id`) claims its OWN lease row and extracts ITS staged row; if a rescan
   superseded session A, A's in-flight extraction → tx#2 `0 rows` (lifecycle) → `409`
   discarded — assert B's row gets its agenda and A does not clobber it (NOT a cross-session
   result handoff — we accept B re-extracts its own generation); (d-g) **STRICT deployment-wide
   cap under CONCURRENT burst** (round-43 F2 + round-45): with
   `AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS = K`, fire **K+N DISTINCT staged rows
   concurrently** (independent in-memory stores → distinct sessions/instances, overlapping
   admission) → assert **AT MOST K reach `downloadFileBytes`** and the other N get `202`
   (the `agenda-extract-admit` lock serializes admission, so the count is never raced — this
   must FAIL on a bare count-then-insert, catching the oversubscription race, NOT just a
   sequential K-then-(K+1) case); a lease release/expiry then admits a waiting one;
   (d2) **lease TTL recovery + GC**: a
   stale lease with `expires_at < now()` (crashed prior holder) → the next POST's claim
   succeeds (ON CONFLICT update) and extracts; AND (round-52) seed MANY expired crash leases
   (`expires_at <= now()`, never released) → the next admission's `DELETE … WHERE expires_at
   <= now()` GCs them, the live count does NOT include them (so they don't falsely hit the
   cap), and the table returns to ≈live-only (assert row count after admission ≈ live, not
   the seeded pile — admission never depends on an unbounded scan); (d3) **owner-scoped release**: tx#2 deletes
   the lease only when `owner` matches — a lease reclaimed by a new owner after TTL expiry
   is NOT deleted by the old request's `finally`; (d4) **lease released on every exit**:
   after success, `409 stale`, revision-`409`, and extraction-throw, assert no live
   `agenda_extract_leases` row remains for the row; (d5) **expired owner cannot clobber a
   reclaim** (round-36 F1): owner A claims, exceeds `AGENDA_EXTRACT_LEASE_TTL_MS`; owner B
   reclaims (ON CONFLICT update) + extracts + persists a NEWER revision; then A reaches
   tx#2 → its `UPDATE … AND EXISTS(lease owner=A, unexpired)` affects **0 rows** → `409`,
   A does NOT overwrite B's `parse_result` (assert B's persisted revision survives);
   (e) **stale
   guard — pre-check** (round-19 F2): a **superseded-session OR finalize-consumed** row
   in tx#1b → `409 stale`, **zero Drive calls, no write**; (e2) **atomic persist-time
   race** (round-20 F2): row passes tx#1b, extraction runs, session superseded BEFORE tx#2
   → conditional `UPDATE … WHERE … AND <active> RETURNING` affects **0 rows** → `409
   stale`, `parse_result` **unchanged**; (e3) **approved row STILL extracts** (round-22
   F2): `wizard_approved = true` + active + not finalized → extracts, persists,
   `200` (NOT 409); (e3b) **post-approval merge is STRICTLY ADDITIVE** (round-43 F1): an
   APPROVED row with non-trivial non-agenda `parse_result` content (rooms/schedule/crew/
   venue/…) → after a post-approval extraction, assert EVERY non-agenda field is
   BYTE-IDENTICAL (deep-equal) and ONLY `agenda_links[i].extracted`/`fileId` changed —
   proving the agenda enrichment never mutates operator-reviewed content; (h) **target smart-chip shape end-to-end** (round-22 F1 + round-26): a staged row with
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
   (assert `parse_result` not upgraded to a fresh block); (i2) **per-PDF mid-download
   revision change → not fresh** (round-46): the PDF's `getFile.headRevisionId` returns
   `rev_before`, then `downloadFileBytes`+extract run, then the after-`getFile` returns a
   DIFFERENT `rev_after` (PDF edited mid-extraction) → the link is **NOT confirmed-fresh**
   → note-only, its block is **NOT persisted** (assert `parse_result` not upgraded), even
   though the extraction produced high-confidence days; a stable `rev_after === rev_before`
   → block persisted normally; (j) **no DB connection / show:
   lock during Drive** (round-23/24 F2): assert the Drive/PDF window holds NO advisory
   lock and NO open tx — a concurrent `show:` acquisition (finalize) AND a concurrent DB
   query both succeed DURING extraction; `show:` is taken only in tx#2; (k) **reread-merge,
   no lost-update** (round-25 F1): extractor A succeeds + persists link X's fresh
   `extracted`; meanwhile a slower request B (whose refresh FAILED, no fresh links)
   reaches tx#2 LAST → its merge adds nothing → assert link X's fresh `extracted` is
   **still present** (B did not clobber A); also a write to an unrelated `parse_result`
   field in the gap survives (merge touches only fresh `extracted`); (k2) **ordinal-first
   merge, duplicate fileId** (round-44): a staged row with TWO links sharing the SAME
   `fileId`, where ordinal 0 is confirmed fresh and ordinal 1 refresh-FAILS → tx#2 persists
   `extracted` ONLY on the ordinal-0 link; the ordinal-1 duplicate keeps NO fresh
   `extracted` (assert by ordinal, not fileId — a fileId-keyed merge would wrongly tag one
   or both); only ordinal 0 renders a block; (l) **same-session
   rescan generation race** (round-27): tx#1b captures `(staged_id, staged_modified_time)`;
   during extraction a rescan DELETES + RECREATES the `(drive_file_id, wizard_session_id)`
   row with a NEW `staged_id` → tx#2 `WHERE … AND staged_id = $4 AND staged_modified_time
   = $5` affects **0 rows** → `409 stale`, the NEW scan's `parse_result` is NOT mutated by
   the old extraction; (m) **top-level revision fence via `fetchDriveFileMetadata.modifiedTime`** (round-28 F1 +
   round-29 F1 + round-31 + round-39): the fence reads `fetchDriveFileMetadata` (returns
   `parents` + `modifiedTime`) and compares `modifiedTime` to `staged_modified_time` — NOT
   `headRevisionId`. **(m-a)** SAME `modifiedTime` but the sheet metadata has NO
   `headRevisionId` (native Google Sheet) → extraction PROCEEDS (no false `409` — the sheet
   fence never consults `headRevisionId`); **(m-b)** CHANGED `modifiedTime` at the BEFORE
   check → `409 stale`, **zero Drive work** (no `getAgendaChips`/`downloadFileBytes`);
   **(m-c)** changed at the AFTER check (edited during extraction) → `409 stale`, no persist
   (`parse_result` unchanged) — assert for BOTH a smart-chip link AND an already-fileId-
   bearing link (the fence is not scoped to chip reads); **round-31 retry case:** a first
   call persists a recovered `fileId` after a download failure, then the sheet
   `modifiedTime` changes, then a SECOND call MUST return `409 stale` and MUST NOT download
   the now-stale recovered fileId (assert no `downloadFileBytes` on the stale retry);
   (m2) **source-scope fence** (round-37): the staged sheet's current Drive `parents` do
   NOT include `app_settings.pending_folder_id` (moved out of the onboarding folder, no
   content edit so revision still matches) at the BEFORE check → `409 stale`/out-of-scope
   with **zero Drive PDF work** (no `getAgendaChips`/`downloadFileBytes`) and no write; AND
   moved-out DURING extraction (AFTER check fails) → `409`, no persist (`parse_result`
   unchanged); (n) **ownership-
   scoped slot/in-flight lifecycle** (round-28 F2 + round-29 F2): drive each exit
   (success, missing-row, tx error, extraction throw, revision/lifecycle `409`, tx#2
   stale) → assert slot count + in-flight set return to baseline; AND a **duplicate `202`
   does NOT delete the OWNER's in-flight key** (assert the owner's key is still present
   after the duplicate returns, and a THIRD concurrent request still gets `202` with NO
   extraction while the owner runs) — proving `ownsInFlight`/`acquiredSlot` release only
   owned resources; (o) **fileId recovery persists even when download FAILS** (round-30):
   a smart-chip link whose fenced `getAgendaChips` recovers a `fileId` but whose
   `downloadFileBytes` returns `infra_error`/`unavailable` → the returned item is
   **note-only WITH a valid Open-PDF href** (from the recovered fileId), the staged row
   **persists the recovered `fileId`** (NOT a fresh `extracted`/block), and a SECOND call
   then skips `getAgendaChips` (cache-checks via `getFile` on the now-present fileId) —
   asserting `recoveredFileIds` persist independently of `confirmedFreshExtractions`;
   (f) missing row → `200 { items: [] }`; (g) infra fault on read → typed error from the
   `tx` path.
3. **Hygiene caps (`tests/drive/agendaDrive.test.ts`, `extractAgendaSchedule.test.ts`,
   `enrichAgenda.test.ts`)** — byte cap (`cap+1` stream → `unavailable`); stall guard
   (idle + pre-response abort + slow-but-progressing → no false abort); page cap
   (mock `numPages = cap+1` → low, no per-page parse; `extractorVersion === 1` — unchanged, round-49);
   per-show count cap (`AGENDA_MAX_PDFS_PER_SHEET + 1` links → first N extracted);
   **slow-drip TOTAL-time deadline** (round-48 F1): a stream that emits a TINY chunk just
   BEFORE each idle `DRIVE_ASSET_STALL_TIMEOUT_MS` (so the idle stall guard keeps resetting
   and never fires, AND it stays under the byte cap) → the per-PDF/endpoint TOTAL-time
   deadline (`AGENDA_PDF_DEADLINE_MS`/`AGENDA_EXTRACT_DEADLINE_MS`) ABORTS via the
   `AbortSignal` → `infra_error` (note-only), and the `finally` releases the lease +
   in-memory slot (assert resources released, fake timers) — proving total wall-clock is
   bounded BELOW `maxDuration`, not just idle time.
4. **Card live fill-in (RTL, `tests/components/admin/...`)** — given a SERVER-built
   baseline `adminAgendaPreview` (note-only items), pure-presentation + per-row fetch
   state: (a) `loading` → baseline items + "Parsing agenda… (2 PDFs)" eyebrow, **NO per-item
   Open-PDF anchor** (round-50: the fence hasn't passed; even a baseline item with a
   `fileId` shows NO anchor — assert no Open-PDF link in `loading`); (b) `ready`
   (mock fetch resolves with upgraded items) → two `agenda-schedule` blocks (+ overflow
   notes) WITH validated "Open PDF" anchors (the ONLY state with anchors); (c) **`error`
   (mock fetch REJECTS / network/5xx, NO 409) → note-only, NO Open-PDF anchor** (round-50:
   the fence never confirmed the link — a stale/out-of-scope baseline href must not leak);
   assert NO anchor renders, the breakdown still shows the note, and the card's source-sheet
   recovery link is present; (c2) **`409` stale/out-of-scope → SANITIZED note, NO anchor**
   (round-38): `409 { status: "stale" }` → note-only, NO Open-PDF anchor, NO block; (c3)
   **anchors ONLY in `ready`** (round-50): parametrize loading/error/stale all asserting
   ZERO Open-PDF anchors, and `ready` the only state rendering them — proving href exposure
   is gated by positive fence validation, not absence-of-409; (d) empty baseline → no
   breakdown; (e) **always-fetch /
   no stale-baseline bypass** (Codex round-20 F1 + round-21): a nonempty baseline ALWAYS
   triggers the POST — even if a (hypothetical, contract-violating) baseline item arrived
   with a populated `block`, the card MUST still fire the fetch and MUST NOT render that
   baseline block (blocks render only from endpoint-returned `ready` items). Assert the
   fetch fires for every nonempty baseline and no baseline `block` is ever rendered.
   Clone-and-strip sibling breakdowns before scanning DOM (anti-tautology). Assert ≤
   `AGENDA_CLIENT_CONCURRENCY` concurrent in-flight; assert the card computes NO
   normalize/cap/href itself (hrefs only come from the server-built items); (f)
   **long-poll past a fixed retry count** (round-33 F1): the mock returns `202` for MANY
   more than 5 attempts (simulating a duplicate request while another owns the ≤300 s
   extraction), then a `200` with upgraded items → the card MUST keep polling (honoring
   `Retry-After`, bounded by `AGENDA_CLIENT_POLL_BUDGET_MS`, using fake timers) and finally
   render the `ready` blocks — it must NOT fall back to baseline/error after 5 attempts;
   (g) **generation-key reset** (round-36 F2): rerender the SAME `driveFileId` with a NEW
   `agendaStateKey` (changed `staged_id`/`staged_modified_time` — a rescan) AFTER a prior
   `ready` result → assert the prior `ready` items are CLEARED (state → `idle`) and the
   POST RE-FIRES for the new generation (no stale agenda carried across generations); (h)
   **queued (local OR global cap), then admitted** (round-47/48 F2): the mock returns `202
   { reason: "queued" }` for LONGER than one `AGENDA_CLIENT_POLL_BUDGET_MS` window — run it
   BOTH for the global-cap and the local-cap path — then `202 { status: "pending", reason: "in_progress" }`,
   then `200` with items → the card MUST keep polling the whole time (queue budget, fake
   timers) and render the eventual `ready` blocks — it must NOT fall back to baseline/error
   while still `queued` (proving the one-window timer starts only at admission).
5. **Boundary-purity guard (`agendaPurityBoundary.test.ts`)** — `agendaAdminPreview.ts`,
   `AgendaScheduleBlock.tsx`, `normalizeAgendaExtraction.ts` import nothing
   `server-only`/`next/headers`/`fs`.
6. **Crew no-regression + stale-extracted gate (negative)** — crew `ScheduleSection` still
   renders exactly one `AgendaScheduleBlock` per high-conf link; no new `runOfShow` write
   path exists; the onboarding `defaultDriveClient` is **unchanged** (still
   `getFile`+`listFolder` only — asserts the scan gained no PDF work). **Plus the persist
   freshness invariant at the crew/publish boundary** (round-47 F1): given a staged row whose
   link has an OLD-revision `extracted`, run a refresh where the current PDF rev is KNOWN
   (getFile succeeds) but the download FAILS / mid-download rev changes → assert the endpoint
   **CLEARS the stale `extracted`** in `parse_result`, so (a) finalize/publish carries NO
   stale agenda and (b) crew `AgendaScheduleBlock` renders nothing for that link (not the
   stale block). Contrast: an UNKNOWN case (getFile `infra_error`) LEAVES the `extracted`
   (last-known-good). Assert against the persisted `parse_result` + a crew render of it, NOT
   only the admin preview. **Plus legacy-data unaffected** (round-49): an EXISTING published
   show with `extractorVersion: 1` `extracted` payloads → assert this feature does NOT
   invalidate or blank them (no `EXTRACTOR_VERSION` bump → version-current; crew renders them
   exactly as before; the endpoint never touches published rows) — a `constants.test.ts`
   assertion pins `EXTRACTOR_VERSION === 1` (NOT bumped).
7. **Finalize/extract race (`tests/.../finalizeAgendaRace.test.ts`)** — round-34, BOTH
   apply paths: finalize `selectFinishableCleanRows` reads the row's `parse_result` (no
   agenda) FIRST; the extractor then persists the agenda under the `show:` lock; finalize
   then acquires the `show:` lock and applies. Assert the **published/shadow payload
   includes the extracted agenda** (first-seen: `applyStagedCore` receives the re-read
   `parse_result`; existing-show: the staged shadow's `parse_result` carries it) — proving
   finalize re-reads under the lock, not the stale pre-read. Also assert (negative
   regression) that with NO concurrent extraction the published payload is unchanged, and
   that the re-select adds **no new `show:` acquisition** (reuses `defaultWithRowTx`'s lock
   — the topology is unchanged) via the extended advisory-lock meta-test. **Generation-scoped
   re-read** (round-42, BOTH paths): the row is REGENERATED (rescan → new `staged_id`)
   between finalize's initial `selectFinishableCleanRows` and the locked re-read → the
   generation-scoped re-SELECT (`AND staged_id = $3 AND staged_modified_time = $4`) returns
   **0 rows** → finalize treats it as STALE (demote / `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`),
   and does NOT apply or shadow-stage the newer row's `parse_result` under the old approval
   metadata (assert no apply/shadow side effect on the mismatched parse).
8. **Impeccable dual-gate** (critique + audit) on the admin card diff (invariant 8).

## 9. Meta-test inventory

This milestone **EXTENDS** two structural meta-tests: `tests/db/postgrest-dml-lockdown.test.ts`
(new `agenda_extract_leases` registry row — round-32) and
`tests/auth/advisoryLockRpcDeadlock.test.ts` (endpoint as a brief single-holder of `show:`
in tx#2 + a brief global `agenda-extract-admit` holder in tx#1a — round-45; finalize's
publish-safety re-select adds NO new `show:` holder — it reuses the existing
`defaultWithRowTx` lock — round-34/35). It creates no new meta-test.

- **Supabase call-boundary** (invariant 9): the endpoint's `pending_syncs` +
  `agenda_extract_leases` READ/WRITE are **raw postgres.js** inside the sync-pipeline `tx`
  (Codex
  round-19 F1) — they are NOT Supabase/PostgREST calls, so they are governed by the
  `SyncPipelineTx` pattern (the existing sync-pipeline error contract), not the Supabase
  call-boundary registry. The Drive reads (`downloadFileBytes`/`getAgendaChips`) ARE
  googleapis boundaries, already registered in `tests/sync/_metaInfraContract.test.ts`.
  The only Supabase call is `requireAdminIdentity()` (existing, registered).
- **Advisory-lock topology (invariant 2) — only a BRIEF `show:` persist holder (Codex
  round-23/24 F2):** the endpoint takes NO advisory lock during Drive work (dedupe is
  in-memory, not a DB lock — round-24 F2). It holds the canonical `show:` key ONLY around
  the persist `UPDATE` in SHORT tx #2 (single-holder; no nested re-acquire; never during
  external I/O). **PLUS a brief global `agenda-extract-admit` key (round-45):** held ONLY in
  tx#1a around the global-cap count + lease claim (released at tx#1a commit, NEVER during
  Drive). It is a single global key (not per-`dfid`). Lock order across the request:
  `agenda-extract-admit` (tx#1a) is taken and RELEASED before `show:` (tx#2) — they live in
  SEPARATE transactions, so there is no nesting and no AB-BA (nothing holds `show:` then
  takes `agenda-extract-admit`). Pin both new keys in `tests/auth/advisoryLockRpcDeadlock.test.ts`.
  **Finalize's publish-safety re-select adds NO new holder (round-35):**
  finalize already holds `show:<dfid>` per row via `defaultWithRowTx`
  (`finalize/route.ts:164`); the §5.6 re-`SELECT parse_result` runs inside that SAME locked
  tx (`adoptShowLockHeld` only ASSERTS the held lock, not acquires). **Extend
  `tests/auth/advisoryLockRpcDeadlock.test.ts`** to pin: the endpoint is a brief `show:`
  persist holder (no DB lock/connection during Drive), AND the finalize re-select does not
  add a second `show:` acquisition. Document existing `show:` holders (approve/apply/discard
  staged routes + sync pipeline + the finalize `defaultWithRowTx`).
- **PostgREST DML lockdown (extended for the NEW lease table — round-32):** the
  `pending_syncs.parse_result` write is a **privileged raw postgres.js UPDATE** through the
  sync-pipeline `tx` — NOT a PostgREST `from('pending_syncs').update`; `pending_syncs` DML
  is already REVOKEd (`20260601000000_b2_show_lifecycle.sql`). The **new
  `public.agenda_extract_leases` table** is likewise mutated ONLY by the endpoint's raw
  postgres.js (claim/release), so its migration MUST `REVOKE INSERT, UPDATE, DELETE … FROM
  anon, authenticated` (and `SELECT` too — no client read need), and a **registry row is
  added to `tests/db/postgrest-dml-lockdown.test.ts`** (the `describe.each` registry +
  orphan reconciliation — see the class-wide pattern). Confirm `pending_syncs`'s row is
  present too.
- **Migration discipline (round-32):** the `agenda_extract_leases` migration is a NEW
  table → the migration lands with (1) local apply + TDD, (2) `pnpm gen:schema-manifest`
  regenerated + committed, (3) surgical apply to the validation project
  (`vzakgrxqwcalbmagufjh`) — the `validation-schema-parity` gate asserts validation ⊇
  manifest. Idempotent DDL (`create table if not exists`, `REVOKE` is idempotent).
- No catalog change (§3).

## 10. Files touched

| File | Change |
|---|---|
| `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` (new) | POST `maxDuration=300`: auth → in-memory fast-path → **tx#1a** (brief `agenda-extract-admit` advisory lock → GC + strict global-cap count + claim durable `agenda_extract_leases`; at cap OR live lease → `202`; commits/releases the admit lock) → **tx#1b** (SEPARATE tx, NO admit lock — round-19): SELECT `pending_syncs.parse_result` + lifecycle + capture generation + `app_settings.pending_folder_id` → top-level **revision + source-scope fence** via `fetchDriveFileMetadata` (`modifiedTime == staged_modified_time` + `parents.includes(pending_folder_id)`) → **`enrichAgenda` with NO DB connection held** (positive per-link freshness; stale-refresh → note-only) → revision re-check → **SHORT tx#2** brief `show:` lock + atomic generation+lifecycle-conditional `UPDATE … RETURNING` (recoveredFileIds + confirmedFreshExtractions; 0 rows → `409`) + owner-scoped lease release → `buildAdminAgendaPreview` → `200 { items }`. `finally` releases lease on every exit. No DB held during Drive; raw postgres.js |
| `supabase/migrations/<ts>_agenda_extract_leases.sql` (new) | `create table if not exists public.agenda_extract_leases (wizard_session_id uuid not null, drive_file_id text not null, owner text not null, expires_at timestamptz not null, primary key (wizard_session_id, drive_file_id))` — keyed by the staged-row identity (round-41; `wizard_session_id` type matches `pending_syncs`); **`create index if not exists agenda_extract_leases_expires_at_idx on public.agenda_extract_leases (expires_at)`** (round-52 — the GC `DELETE … WHERE expires_at <= now()` + live count); `REVOKE INSERT, UPDATE, DELETE, SELECT … FROM anon, authenticated`. Apply local + validation; regen schema-manifest |
| `app/api/admin/onboarding/finalize/route.ts` | re-SELECT `parse_result` INSIDE the already-`show:`-locked per-row tx (`defaultWithRowTx:164`) before consuming it on BOTH paths (round-34/35): first-seen apply (`:823-828`) and existing-show shadow (`:771`/`:546`). Publish-safety; **NO new lock holder** — reuses the existing per-row lock |
| `lib/agenda/agendaAdminPreview.ts` (new) | server-pure `buildAdminAgendaPreview(links, opts?: { freshByLinkKey?: Set<number>; validatedHrefs?: boolean })` — block ONLY for links whose **ordinal** is in `freshByLinkKey` (per-link, NOT fileId — round-35 F2; default empty ⇒ note-only); `href` emitted ONLY when `validatedHrefs` (endpoint, post-fence — round-50; baseline href always null); `capExtractionForAdmin`, `agendaPdfHref` |
| `lib/agenda/constants.ts` | add `AGENDA_PDF_MAX_BYTES`, `AGENDA_MAX_PAGES`, `AGENDA_MAX_PDFS_PER_SHEET`, `AGENDA_ADMIN_SESSIONS_CAP`, `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`, `AGENDA_CLIENT_CONCURRENCY`, `AGENDA_CLIENT_POLL_BUDGET_MS` (~330 000 — replaces a fixed retry count; round-33 F1), `AGENDA_CLIENT_QUEUE_BUDGET_MS` (larger — covers waiting behind the global cap; round-47 F2), `AGENDA_MAX_CONCURRENT_EXTRACTIONS` (per-instance), `AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS` (deployment-wide, via live-lease count — round-43 F2), `AGENDA_EXTRACT_LEASE_TTL_MS` (~330 000), `AGENDA_PDF_DEADLINE_MS` + `AGENDA_EXTRACT_DEADLINE_MS` (~250 000, `< maxDuration` — total-time deadlines, round-48 F1); **`EXTRACTOR_VERSION` stays `1`** (NOT bumped — round-49; `DRIVE_ASSET_STALL_TIMEOUT_MS`/`DRIVE_FILES_GET_TIMEOUT_MS` already exist) |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | extend: pin the endpoint as a brief `show:`||dfid holder (tx#2) + a brief global `agenda-extract-admit` holder (tx#1a, never during Drive); finalize re-select adds no new holder |
| `tests/db/postgrest-dml-lockdown.test.ts` | add `agenda_extract_leases` registry row (REVOKE all client DML); ensure `pending_syncs` covered |
| `supabase/__generated__/schema-manifest.json` | regenerated via `pnpm gen:schema-manifest` to include `agenda_extract_leases` (validation-schema-parity gate) |
| `lib/agenda/extractAgendaSchedule.ts` | page-cap guard (early `LOW()` when `doc.numPages > AGENDA_MAX_PAGES`) |
| `lib/drive/agendaDrive.ts` | `downloadFileBytes` stream + byte cap (`readBoundedNodeStream({onChunk})`) + `createStallGuard` full wiring → `unavailable`/`infra_error`; `getAgendaChips` + timeout + retry |
| `lib/sync/enrichAgenda.ts` | per-show count cap (`AGENDA_MAX_PDFS_PER_SHEET`) + skip; **no `agendaBudget` param**; **expose per-link confirmed-fresh + just-fetched `headRevisionId`** (round-24 F1); **per-PDF before+after `headRevisionId` stability check** (round-46: re-`getFile` after download; `rev_after !== rev_before` → not fresh) so the endpoint can positively gate blocks (not rely on preserve-on-error side-effects) |
| `lib/drive/agendaDrive.ts` | `downloadFileBytes` byte cap + idle stall + total-time deadline; **`getAgendaChips` bounding** (it is currently UNBOUNDED — add gaxios `{signal,timeout}` + composed deadline + one transient retry); both accept an optional `{ signal?, deadlineMs? }` |
| `lib/sync/enrichWithDrivePins.ts` (interface only — amended-in round-9) | the SHARED `DriveClient` interface (`:67`) `downloadFileBytes?`/`getAgendaChips?` (`:102/:115`) gain the OPTIONAL `{ signal?: AbortSignal; deadlineMs?: number }` arg so cancellation threads through the shared boundary — backward-compatible (existing scan/cron callers omit it). Blast radius: update `lib/sync/mocks/mockDriveClient.ts` + keep `tests/sync/driveClientImplCompleteness.test.ts` green |
| `components/admin/OnboardingWizard.tsx` (`fetchStep3Data` `:191`) | ALWAYS build `adminAgendaPreview = buildAdminAgendaPreview(arr(pr?.show?.agenda_links))` per row — **omit `freshByLinkKey` AND `validatedHrefs`** (default ⇒ **note-only, `href: null`**; round-25 F2 / round-50), pure, never blocks; also stamp `agendaStateKey` |
| Step-3 row type | add `adminAgendaPreview: AdminAgendaItem[]` to `Step3Row` (always present; empty → no breakdown); new `AdminAgendaItem` type |
| `components/admin/wizard/Step3SheetCard.tsx` + `Step3Review.tsx` | new client `AgendaBreakdown` + per-row extract-fetch state machine (throttled), "parsing…" placeholder, live replace; pure presentation over `AdminAgendaItem` |
| tests (per §8) | new + extended |

**Not touched:** `lib/sync/runOnboardingScan.ts` (scan unchanged — no PDF work; the new
optional DriveClient arg is backward-compatible so the scan path compiles unchanged),
`lib/parser/types.ts`, `lib/data/decodeRunOfShow.ts`, `components/crew/**`, any `runOfShow`
write path. (`lib/sync/enrichWithDrivePins.ts` was moved to "touched" in round-9 — the
shared `DriveClient` interface needs the optional cancellation arg; it is the only change
there.)

## 11. Resolved decisions

- Surface: **admin Step-3 card only**; crew unchanged (round 1 + user).
- Architecture: **async-decouple** — scan stays fast (no PDF work); a per-show
  extract endpoint fills the card live; "parsing agenda…" placeholder → preview on
  resolve (user-approved pivot, round 16).
- Endpoint boundary: **THREE SHORT txns, NO DB connection held during Drive** (Codex
  round-23/24 F2 + round-19) — tx#1a (admit lock + lease claim, commits before any read),
  tx#1b (separate, NO admit lock: staged read + lifecycle + generation), extract with no DB held, tx#2
  brief `show:` lock + atomic conditional persist. **Dedupe + cap are DB-backed (round-32
  pivot — supersedes the original in-memory-only design):** the durable
  `agenda_extract_leases` row (per-staged-row dedupe) + the brief `agenda-extract-admit`
  advisory lock (strict deployment-wide cap via live-lease count) are MANDATORY for
  cross-instance correctness; the in-memory `AGENDA_MAX_CONCURRENT_EXTRACTIONS` cap is ONLY
  a per-instance fast-path/secondary guard, NOT the authority. No DB connection is held
  during Drive. Raw postgres.js (no Supabase for `pending_syncs`/`agenda_extract_leases`).
- Freshness: cache hit costs a cheap `getFile` (not zero Drive — round-23 F1); blocks
  render ONLY for links whose **ordinal** is in `freshByLinkKey` (an EXPLICIT typed input,
  per-link not fileId — round-35 F2; default empty — round-25 F2) = links **positively
  confirmed fresh this call** (current `EXTRACTOR_VERSION` + current `headRevisionId` + the
  PDF's `headRevisionId` STABLE across the download, a per-PDF before+after fence — round-46);
  a refresh-failed OR mid-download-edited extraction is note-only and never persisted as a
  fresh block (round-24 F1 + round-46).
- Persisted `link.extracted` is a FRESHNESS INVARIANT (round-47 F1, structural close-out —
  §5.7): present ⟹ provably fresh; a KNOWN-STALE `extracted` (current PDF rev readable AND
  ≠ stored `sourceRevision`/version, no fresh extraction) is CLEARED at persist so crew
  render + publish — which read `link.extracted` directly — never expose stale agenda; an
  UNKNOWN (transient infra_error) is LEFT (last-known-good, round-25). The full per-datum
  fence table is §5.7.
- Queue budgeting (round-47/48 F2): the `202` carries `reason` — **`queued`** (behind the
  LOCAL per-instance cap OR the deployment-wide global cap; not started) vs `in_progress` (a
  lease holder is extracting THIS row). The client's one-window `AGENDA_CLIENT_POLL_BUDGET_MS`
  timer starts only at admission; `queued` polling uses a larger `AGENDA_CLIENT_QUEUE_BUDGET_MS`
  — so a row queued behind EITHER cap still renders its eventual `200`.
- No `EXTRACTOR_VERSION` bump (round-49): stays `1`. The page-cap guard applies to new
  extractions without a bump; bumping would mark legacy published-show v1 `extracted`
  stale-by-version and (since crew renders `extracted` directly and "crew unchanged" forbids
  a crew gate) blank legacy crew agenda or force a migration. Endpoint writes only staged
  rows (no prior extraction); published freshness stays cron's job → legacy data untouched.
- Total-time deadline + active cancellation (round-48 F1 + round-18): per-PDF
  (`AGENDA_PDF_DEADLINE_MS`) and endpoint (`AGENDA_EXTRACT_DEADLINE_MS`, `< maxDuration`)
  TOTAL-time deadlines via an `AbortSignal` bound a slow-drip download that evades the idle
  stall guard. On the endpoint deadline: abort, then **AWAIT extraction settlement BEFORE
  releasing capacity** (round-18 — never release the lease/slot while the work may still run,
  or a retry double-admits), return `504`. Cooperative deps settle promptly (then `finally`
  releases); a non-cooperative dep holds the lease until the 300 s hard-kill, recovered by
  lease TTL-GC (the documented residual).
- Persist integrity: tx#2 **rereads + merges only confirmed-fresh results** into the
  current `parse_result` (never a whole-blob clobber — round-25 F1). The merge matches
  **ordinal-first** (`i ↔ i` — the in-memory and reread links are the same generation's
  `agenda_links` in order, guaranteed by the generation guard; `label`/`fileId` are sanity
  checks only, never the sole key — round-44, since `fileId` isn't unique across duplicate
  links), and persists **both the recovered `fileId` AND the fresh `extracted`** (only for
  confirmed-fresh ordinals) — warming the cache so the next request cache-hits and publish
  carries the agenda (round-26). tx#2 also binds to the **row generation**
  (`staged_id` + `staged_modified_time` captured in tx#1b) so a same-session rescan that
  regenerates the row during extraction can't receive the old extraction (round-27).
- Hrefs: **fence-validated only** (round-25 F3 → tightened round-50) — an Open-PDF anchor is
  emitted ONLY by the endpoint's `200` (`opts.validatedHrefs`, after the Drive
  revision/source-scope fence); the baseline emits NO href. The per-card source-sheet deep
  link is the universal pre-validation recovery (loading/stale/error).
- Revision + source-scope fence: a **TOP-LEVEL precheck** via `fetchDriveFileMetadata`
  (returns `parents` + `modifiedTime`; NOT the sync `getFile` which strips `parents`) —
  requires `metadata.modifiedTime == staged_modified_time` (a TIMESTAMP compare, NOT
  `headRevisionId` — which is only the per-PDF cache key, and a native Sheet may lack it —
  round-39) AND `parents.includes(pending_folder_id)`. Gates ALL fileId trust (chip
  recovery AND download of any staged/recovered fileId), before AND after the Drive phase;
  a post-scan sheet edit (incl. between a download-failed recovery and its retry) OR a
  move-OUT-of-folder without an edit → `409 stale`/out-of-scope, mirroring finalize's
  `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` (round-28/29/31/37/39).
- Concurrency: a **durable `agenda_extract_leases` row keyed by
  `(wizard_session_id, drive_file_id)`** — the STAGED-ROW identity (claimed in tx#1a,
  released owner-scoped in tx#2, TTL-recovered) — gives **deployment-wide per-staged-row
  dedupe + bound** across instances (round-32; this is the real amplification vector —
  tabs/refreshes/admins on the same staged row). A `drive_file_id`-only key was tried
  (round-40) but reverted (round-41): it serialized a rescan/new session against the old
  one WITHOUT a result handoff (tx#2 persists only to the current row), so the waiting
  session re-extracts anyway. A concurrent DIFFERENT session for the same Drive file (rare
  rescan-overlap) extracts its own row, bounded + self-limited by supersession; cross-session
  result-sharing is deferred (BACKLOG). In-memory ownership-scoped fast-path (same
  `(wiz,dfid)` key) + `AGENDA_MAX_CONCURRENT_EXTRACTIONS` per-instance hard cap. NO
  DB connection held during Drive. Adds a migration (REVOKE + manifest + validation apply).
- Deployment-wide cap (round-43 F2 + round-45 + round-52, user-approved): a **STRICT**
  DB-backed global bound — admission (**GC expired** → live-lease COUNT <
  `AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS` → per-row lease claim) is SERIALIZED by a brief
  `agenda-extract-admit` advisory lock in tx#1a (released before any Drive), so a burst can't
  race the count past K. Under the lock, expired rows are `DELETE`d before the count (round-52)
  — crash/hard-kill leases self-heal AND the table stays bounded (≈ live only; `expires_at`
  index), so the count never degrades into an unbounded scan. Tested with concurrent K+N
  oversubscription + a many-expired-crash-leases GC case.
- Approval boundary (round-43 F1, user-approved "keep async fill"): approved rows still
  extract (round-22 F2) and the agenda carries to publish; the tx#2 merge is **strictly
  additive** to `agenda_links[].extracted`/`fileId` and NEVER touches any operator-reviewed
  `parse_result` field. The agenda is best-effort derived PDF data the operator opted into
  via the "parsing agenda…" UX, outside line-item approval. **DO NOT RELITIGATE** — ratified
  by the user; cite this row.
- fileId vs extraction persistence split: tx#2 merges `recoveredFileIds` (every fenced
  ordinal+label match — persisted even when the PDF download FAILS, giving the note a
  valid Open-PDF href + warming the row so retries skip `getAgendaChips`) SEPARATELY from
  `confirmedFreshExtractions` (blocks only for fresh links) — round-30.
- Lease ownership at persist (round-36 F1): tx#2's `pending_syncs` UPDATE is conditional on
  `EXISTS(lease owner=me AND expires_at > now())`, so an owner that exceeded the TTL and
  was reclaimed by another instance can NOT clobber the newer revision (0 rows → `409`).
- Client state key (round-36 F2): per-row fetch state + the POST effect are keyed by the
  server-stamped `agendaStateKey` (`wizardSessionId:staged_id:staged_modified_time`), NOT
  `driveFileId` alone — a rescan/new generation resets state + re-fetches (no stale UI).
- Open-PDF anchors render ONLY after positive fence validation (round-38 + round-50): hrefs
  come ONLY from the endpoint's `200` (`opts.validatedHrefs`, post revision/source-scope
  fence). Baseline `href` is ALWAYS `null`. `loading`/`stale`(409)/`error`(network/5xx) →
  note-only, NO Open-PDF anchor (absence of a 409 is NOT evidence the fence passed) — the
  card's source-sheet deep link is the universal recovery. Closes the loading + error
  baseline-href leak round-38 left open.
- Publish-safety: finalize **re-reads `parse_result` inside its already-`show:`-locked
  per-row tx** (`defaultWithRowTx:164`) before apply/shadow-stage on BOTH paths
  (round-34/35) — the extractor's tx#2 persist alone is not enough because finalize reads
  the row BEFORE per-row processing. The re-select is **generation-scoped** (`AND staged_id
  AND staged_modified_time` — round-42) so a same-session regeneration can't feed a newer
  parse under the old approval metadata (0 rows → stale, no apply/shadow side effect). **No
  advisory-lock topology change** — the re-select reuses the existing per-row lock
  (`adoptShowLockHeld` asserts, not acquires).
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
- Baseline freshness (Codex round-20 F1 / round-25 F2): `fetchStep3Data`'s baseline is
  ALWAYS note-only (omits `freshByLinkKey` ⇒ empty default); blocks come ONLY from the endpoint, which
  freshness-gates on `EXTRACTOR_VERSION` (stays `1` — round-49) + `headRevisionId` via
  `enrichAgenda` — a sourceRevision-stale extraction can never render or skip the refresh.
- Persistence: endpoint **persists** the extracted agenda to the staged `parse_result`
  (cache + dedupe + publish-carries-forward) via the staged-mutation discipline
  (advisory lock + DML lockdown + Supabase write boundary); cron remains a fallback.
- Render: server-pure `buildAdminAgendaPreview` (predicate + caps + `dropped*` + href +
  badge); client card is pure presentation; reuse pure `AgendaScheduleBlock`.
- Hygiene caps kept (bytes/pages/per-show count/stall/total-deadline) as shared per-PDF
  bounds; only the **scan-level `agendaBudget`/scan-deadline/attempts apparatus** is
  **dropped** (no longer needed off the scan path). **AbortSignal threading is RETAINED and
  REQUIRED** (round-22) — the endpoint + per-PDF total deadlines (`AGENDA_EXTRACT_DEADLINE_MS`
  / `AGENDA_PDF_DEADLINE_MS`) thread an `AbortSignal` into `downloadFileBytes`/`getAgendaChips`/
  `enrichAgenda` so cooperative Drive work aborts promptly (§5.5; round-48/18).
- Drop from inline drafts: onboarding-client wiring, the scan-level `agendaBudget`/
  `EnrichContext` change, `AGENDA_MAX_SCAN_ATTEMPTS`, `AGENDA_SCAN_DEADLINE_MS` — NOT the
  endpoint/Drive `AbortSignal` (that is retained, above).
