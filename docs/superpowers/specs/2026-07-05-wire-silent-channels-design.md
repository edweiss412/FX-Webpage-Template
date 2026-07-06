# Spec — Wire the Silent Telemetry Channels (Audit Rec. 4)

**Date:** 2026-07-05
**Source:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/edge-case-preparedness-audit-2026-07-04.md` §5 recommendation 4 (findings #14, #15, #16).
**Status:** design approved (this session); autonomous ship.

---

## 1. Problem

The edge-case audit found three ingestion failure modes that happen with **zero pushed signal** — the pipeline does the right structural thing (drops/degrades) but nobody is told:

- **#15 — `UNEXPECTED_PARENT` fully silent.** `listFolder` (`lib/drive/list.ts:112`) drops a misfiled sheet via `onWarning`, but **no production caller wires `onWarning`** (`lib/sync/runOnboardingScan.ts:949`, `lib/sync/runScheduledCronSync.ts:3153` both omit it). The `UNEXPECTED_PARENT` §12.4 message code already exists (`lib/messages/catalog.ts:1525`) — nothing emits it.
- **#14 — first-seen hard-fail is invisible outside the wizard.** A brand-new sheet Doug adds that parse-hard-fails writes only a wizard-session manifest row `status:"hard_failed"` (`lib/sync/runOnboardingScan.ts:736`, visible only inside the wizard); the cron first-seen hard-fail branch (`lib/sync/runScheduledCronSync.ts:2820`) writes nothing durable (raises `PARSE_ERROR_LAST_GOOD` only when `show?.showId` is truthy, `:2831` — null for first-seen). Neither path writes a **live `pending_ingestions` record**, so the failure never reaches the global Needs-Attention inbox / ingestion push that already handles un-ingestable sheets.
- **#16 — degraded-parse dataGaps never push.** A live published show whose re-sync auto-applies (full-replace) a materially worse parse persists new `parse_warnings` (`lib/sync/applyParseResult.ts:206`) but raises no alert; the passive `DataQualityBadge` is pull-only.

## 2. Goals / Non-goals

**Goals:** give each silent channel a signal calibrated to (a) who resolves the underlying issue and (b) whether it is operator-actionable.

**Routing decision (approved):** the signal's audience follows the resolver.

| Unit | Channel | Resolver | Signal | Audience |
|---|---|---|---|---|
| A | `UNEXPECTED_PARENT` sheet drop | dev (phantom parentage) / admin (misfiled) — rare, drop usually *correct* | coded `app_events` log, **no push** | dev-facing (queryable) |
| B | first-seen parse hard-fail | Doug (his new sheet is broken → fix sheet) | live `pending_ingestions` record → Needs-Attention inbox + ingestion realtime candidate (existing surface; §5) | `doug` |
| C | published-show quality regression | Doug (his edit lost data quality → fix sheet); health fallback if parser-coverage gap | new `RESYNC_QUALITY_REGRESSED` admin alert → Bell center (§6) | `doug` |

**Non-goals:**
- No change to the parse/apply behavior itself. C observes a re-sync that **already applied** — it is informational, not a gate (contrast `RESYNC_SHRINK_HELD`, which *holds*). We do not add a new hold.
- A is not promoted to a push (actionability-gating: a rare, usually-correct drop is low-actionability — Track 2 research; alert fatigue).
- No new crew-visible copy. B/C are admin/Doug surfaces only.
- We do NOT change the `admin_alerts_one_unresolved_idx` uniqueness model.

### 2.1 Delivery surfaces — how B and C are actually pushed (round-4 finding 1)

B and C use **different existing push surfaces**, each matched to its data model:

**C → Bell notification center** (PR #324, `project_bell_notification_center_pr324`). The bell feed (`get_bell_feed_rows`, `supabase/migrations/20260705100001_get_bell_feed_rows.sql`) selects unresolved `admin_alerts` rows **directly**, filtered only by `p_excluded_codes = HEALTH_CODES ∪ INBOX_ROUTED_CODES` (`lib/admin/bellAudience.ts`), and `subscribeToBell.ts` fires a per-admin realtime ping. Therefore any `audience:"doug"`, non-`inbox` alert row surfaces in the bell and pings automatically, purely by existing. **C is `audience:"doug"` + banner (NOT `inbox`)** so it lands in the bell. It must NOT be `inbox` (inbox codes are bell-excluded and would need the `candidates.ts`/`SYNC_PROBLEM_CODES` path, which C cannot join — its warnings-conditional resolve would be prematurely cleared by the unconditional success sweep, §6.4). Per-show banner-doug codes like `DRIVE_FETCH_FAILED` are the precedent.

**B → Needs-Attention inbox + ingestion realtime candidate** (via `pending_ingestions`, §5). B does NOT create an `admin_alerts` row at all — it writes a live `pending_ingestions` record, which the EXISTING `needsAttention.ts` inbox renders as a `pending_ingestion` item (retry/discard actions, catalog-safe copy from `last_error_code`) and the EXISTING `candidates.ts` `ingestionRows` path turns into a realtime candidate after 1h. This is the established surface for "a sheet that can't be ingested"; B just adds one more producer to it. (The `candidates.ts` email arm is config-blocked — Resend unset, `project_notify_delivery_state` — so the operative live signals are the inbox + realtime candidate, consistent with every other pending-ingestion.)

This resolves round-4 finding 1 for both: neither is pull-only — C pings via the bell, B surfaces in the inbox + ingestion realtime path.

## 3. Grounding (why the thresholds are what they are)

Two research tracks fed the design (2026-07-05):

**Track 1 — empirical corpus sweep.** Ran `summarizeDataGaps(parseSheet(fixture).warnings)` over all 10 committed show fixtures (`fixtures/shows/raw/*.md`). Gap totals: **min 0, median 4, max 120**. Six shows sit at 0–4; four sit at 43–120 (dominated by `UNKNOWN_FIELD`, the alternate Drive-renderer-family fixtures — see `reference_two_drive_renderer_fixture_families`). **The absolute gap total is show-intrinsic** — a show baselined at 118 is not "worse" than one at 1. → An absolute-count regression floor is meaningless; C **must** be per-show self-relative (a show's new parse vs *its own* last-good).

**Track 2 — data-observability best practice.** Great Expectations / dbt / Monte Carlo / Datafold / Alertmanager / Prometheus:
- "Materially worse" = a **new-failure transition (pass→fail)** plus a **relative-delta guard**, not a bare absolute count.
- Anti-flap = k-consecutive-breach / hysteresis (`for:` / `keep_firing_for:`) + cool-down.
- Batch fan-out = **group into one alert with a list** (Alertmanager `group_by`), never one-per-item.
- Auto-resolve on recovery, cool-down before flipping, don't auto-resolve criticals.
- Fatigue reduction = **actionability gating** + dedup/grouping.

Both tracks are consistent with the storage model already in place (`admin_alerts_one_unresolved_idx on (coalesce(show_id::text,''), code) where resolved_at is null`, `supabase/migrations/20260501001000_internal_and_admin.sql:279`): **one unresolved row per (show, code)** gives storage-native dedup — repeated degraded syncs re-upsert the same row in place, so no notification storm and no separate k-consecutive machinery is required. This matches how `PARSE_ERROR_LAST_GOOD` / `RESYNC_SHRINK_HELD` already raise-on-first + auto-resolve.

---

## 4. Unit A — `UNEXPECTED_PARENT` → dev-facing coded log

### 4.1 Behavior
Wire the existing `onWarning` hook at both production `listFolder` callers. On each dropped file emit:

```ts
log.warn("Dropped sheet with unexpected parent folder", {
  source: "sync.list",           // A distinct source token; see §4.3
  code: "UNEXPECTED_PARENT",
  drive_file_id: warning.driveFileId,
  folder_id: warning.folderId,
  parents: warning.parents,      // string[] — already redaction-safe (Drive folder ids, no PII)
});
```

- `runOnboardingScan.ts:948-949` — pass `{ onWarning }` to the default `listDriveFolder`. The `deps.listFolder` seam (test injection) is unchanged; the `onWarning` is only attached to the **default** listing call so tests that inject `listFolder` are unaffected.
- `runScheduledCronSync.ts:3149-3153` — same wiring.

### 4.2 Signal model
- Emits into `app_events` via `log.warn` (crew-telemetry-taxonomy precedent, PR #317: a coded `log.warn`/`log.info` is a durable `code:`-carrying event, **not** `logAdminOutcome`, and is §12.4-catalog-exempt because `UNEXPECTED_PARENT` is already a message-catalog code, not an admin-alert code).
- Queryable: `pnpm observe events --code UNEXPECTED_PARENT`.
- **No admin alert. No push.** Actionability-gating (§3 Track 2).

### 4.3 Guard conditions
- `warning.parents` is always a `string[]` (`DriveListWarning` type, `lib/drive/list.ts:35-40`); empty array is valid and logged as `[]`.
- The log call is **not** inside any advisory lock (listing happens before per-show processing) — invariant 2 N/A.
- `source` token: use `"sync.list"` (new, distinct from existing sync sources) so `pnpm observe events --source sync.list` isolates listing-phase telemetry. If a lint/registry pins the allowed `source` set, add it there (verified during impl; grep `source:` allow-lists).

### 4.4 Invariant 10 (mutation observability)
`listFolder` is a **read**, not a mutation surface. The coded `log.warn` is the instrument; no `// no-telemetry:` needed, no `AUDITABLE_MUTATIONS` row (no admin HTTP route added).

---

## 5. Unit B — first-seen parse hard-fail → live `pending_ingestions` record

### 5.1 Mechanism: route into the EXISTING pending-ingestion surface (no new code)

**Round-5 pivot.** An earlier draft invented a new global aggregate alert (`FIRST_SEEN_PARSE_FAILED`) with a custom object-map-merge RPC. Codex round-5 correctly flagged that design's incomplete lifecycle pruning (only `stage`/`publish`, not `live_row_conflict`/disappearance) and unbounded context map. Rather than patch a reinvention, B now routes first-seen parse hard-fails into the **existing live `pending_ingestions` surface**, which already solves lifecycle + bounding + push:

- **Table:** `public.pending_ingestions`, live partition (`wizard_session_id IS NULL`), carrying `drive_file_id`, `drive_file_name`, `last_error_code`, `last_error_message`, `attempt_count`, `first_seen_at`, `last_attempt_at`. Upsert seam `upsertLivePendingIngestion(...)` already exists on BOTH tx ports (cron `runScheduledCronSync.ts:2374/741`; onboarding `runOnboardingScan.ts:353`) and is already used by the cron no-show fetch-failure path (`:2374`).
- **Push surface (existing):** `lib/notify/detect/candidates.ts` `ingestionRows` selects live pending_ingestions older than 1h → realtime candidate; `lib/admin/needsAttention.ts` renders each as a `pending_ingestion` item in the Needs-Attention inbox, with catalog-safe copy resolved from `last_error_code` (generic fallback `SHEET_PROCESS_FAILED.dougFacing`, invariant-5-safe — never a raw code) and retry/discard actions keyed by `pending_ingestions.id`.
- **Lifecycle (existing, complete):** `deleteLivePendingIngestion(driveFileId)` (`runScheduledCronSync.ts:772`, deletes `where drive_file_id = $1 and wizard_session_id is null`) clears the row on the file's next successful sync/onboard; retry/discard actions (`app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts`) let the admin clear it manually. **This is the complete lifecycle Codex round-5 asked for — it already covers stage, publish, live_row_conflict (the live show delete path), and manual discard, with one row per file (bounded).**

**Net effect: B has NO new §12.4 code, NO custom RPC, NO migration, NO aggregate map, NO bell-banner wiring.** It is purely: call the existing `upsertLivePendingIngestion` seam at the two first-seen hard-fail sites that currently skip it. This is a strict simplification and the correct existing-pattern home for "a sheet that can't be ingested."

### 5.2 Raise sites (both) — add the missing `upsertLivePendingIngestion` call

A genuine **first-seen parse hard-fail** = the file has no `public.shows` row yet AND phase-1 returned `outcome:"hard_fail"`.

1. **Onboarding scan** — `lib/sync/runOnboardingScan.ts:728-736` (`result.outcome === "hard_fail"` branch; distinct from `:640` `live_row_conflict` and `:710` `defer`, both **excluded** — see below). Currently writes ONLY the wizard-session manifest (`status:"hard_failed"`, wizard-scoped, visible only in the wizard). **Add:** also call `tx.upsertLivePendingIngestion({ driveFileId: file.driveFileId, wizardSessionId: null, driveFileName: file.name, lastErrorCode: result.code, lastErrorMessage: <first hardError message> })` so it enters the global live inbox. Data in scope: `file.driveFileId`, `file.name`, `result.code`, hard-error detail.
2. **Cron** — `lib/sync/runScheduledCronSync.ts:2820-2849`, the `else` of the `show?.showId` guard (`:2831`) — first-seen hard-fail with `showId` null. Currently returns `hard_fail` writing nothing durable. **Add:** `tx.upsertLivePendingIngestion({ driveFileId, wizardSessionId: null, driveFileName: fileMeta.name, lastErrorCode: phase1.code, lastErrorMessage: <first hardError message> })`, mirroring the existing no-show pending path at `:2374`.

Both calls are **tx-bound inside the advisory-locked pipeline tx** (the seam is a tx method; the manifest write at `:736` and the `:2374` pending upsert are already tx-bound there). This matches the established pattern; no post-commit epilogue (invariant 10's post-commit rule governs telemetry emits like Unit A, not durable pipeline writes).

### 5.3 Scope exclusions
- **`live_row_conflict` (`:640`) — excluded.** A live show already exists for this file (`LIVE_ROW_CONFLICT` handles it); it is not a first-seen *parse* failure, and its live pending row is cleared by the live-show path.
- **`defer` (`:710`) — excluded.** The sheet staged/deferred for review — a normal outcome, not a failure; it writes a wizard deferral, not an error.
- Only `outcome === "hard_fail"` on a no-`shows`-row file produces the pending_ingestions error record.

### 5.4 Guard conditions
- `lastErrorMessage`: if the parse produced no hard-error message text, pass the `result.code`'s catalog copy is NOT used here — store the raw hard-error message or null; the inbox renders catalog-safe copy from `last_error_code`, never the raw message (invariant 5).
- `drive_file_name` null (cron with no `fileMeta.name`): store `""`; the inbox copy tolerates a missing name.
- **Re-fail dedup:** `upsertLivePendingIngestion` is an upsert `on conflict (drive_file_id) where wizard_session_id is null` (`:750/794`) — a repeated hard-fail of the same sheet bumps `attempt_count` and refreshes `last_error_code`, never duplicates. Bounded: one row per file.
- **Recovery:** when the sheet is later fixed and syncs/onboards cleanly, the existing success path calls `deleteLivePendingIngestion(driveFileId)` — the row (and its inbox item + push) clears automatically. No custom prune/resolve logic.

### 5.5 Copy
No new catalog code. The inbox renders the existing catalog-safe pending-ingestion copy: if `last_error_code` resolves to a catalog entry, that copy; else the generic `SHEET_PROCESS_FAILED` fallback (`needsAttention.ts:26`). Confirm during impl that the MI hard-fail codes B stores as `last_error_code` resolve to sensible Doug-facing copy (they are existing §12.4 codes); if a specific MI code needs Doug-facing copy it already has it or falls back safely — no new code required for B.

---

## 6. Unit C — published-show data-quality regression → Doug alert

### 6.1 New code
`RESYNC_QUALITY_REGRESSED`. Modeled on `RESYNC_SHRINK_HELD`'s catalog shape (`lib/messages/catalog.ts:155-170`) for the copy fields, but **deliberately diverges on `adminSurface` (banner, not inbox) and action link (none)** for the delivery reasons in §2.1 / the rows below:

| Field | Value |
|---|---|
| `audience` | `"doug"` |
| `resolution` | `"auto"` |
| `adminSurface` | **banner** (default; omit `adminSurface`) — round-4 finding 1. NOT `inbox`: an `inbox` C would be excluded from the bell and could not join `SYNC_PROBLEM_CODES` (its resolve is warnings-conditional, §6.4), leaving it pull-only. As a banner-doug row it surfaces in the Bell notification center with a realtime ping (§2.1), the push #16 requires. Note: this DIVERGES from `RESYNC_SHRINK_HELD` (which is `inbox`) — deliberately, because that code is delivered via `SYNC_PROBLEM_CODES`/`candidates.ts`, a path C cannot use. |
| identity | `{ kind: "global" }` in `alertIdentityMap` (sheet is IN the copy — SPECIFIC, no per-segment identity resolution; same as `RESYNC_SHRINK_HELD` `alertIdentityMap.ts:158`) |
| scope | **show-scoped** (`showId: show.showId`) — no global collision |
| action link | **NONE** (round-3 finding 2). C does **not** join `ALERT_ACTION_CODES` and does **not** mirror `RESYNC_SHRINK_HELD`'s action — that action targets `/admin/show/<slug>#resync` (`alertActions.ts:106-113`), the ReSyncButton for *accepting a held shrink*, which is the wrong surface for an already-applied quality regression. C's closest sibling `PARSE_ERROR_LAST_GOOD` has **no** action link (absent from `ALERT_ACTION_CODES`); its inbox copy directs Doug to the parse panel in prose. C mirrors that — no deep-link button, copy says "open the parse panel." This also avoids adding a UI anchor id (no `app/`/`components/` change → no invariant-8 impeccable gate) and an anchor/route test. |

### 6.2 When it fires
Computed for an **existing published show** whose re-sync **applied** (not held/staged/first-seen). The apply path is `applyParseResult` (`lib/sync/applyParseResult.ts:206` writes new `parse_warnings`). The prior last-good `parse_warnings` is readable at `readShowForPhase1` (`lib/sync/runScheduledCronSync.ts:645-651`, exposed as `priorParseResult.warnings`, `:692`). Both are in scope in `processOneFile_unlocked` at the applied-outcome epilogue.

"Existing published show" = `public.shows` row non-null (`readShowForPhase1` returns non-null `showId`) AND the outcome is the applied/published branch (NOT `hard_fail`, `shrink_held`, `stage`, `skip`). Raise/resolve is **tx-bound, inside the advisory-locked pipeline tx** (same structural slot and `requireTxBoundUpsertAdminAlert` seam as the `PARSE_ERROR_LAST_GOOD` raise at `runScheduledCronSync.ts:2834`) — see §5.2's tx-boundedness correction. Being inside the show lock is load-bearing for C's baseline read-modify-write (§6.4): the per-show lock serializes the read-current-baseline-then-upsert so there is no lost-update race on this show's alert row.

### 6.3 Comparator — `isQualityRegression(prior, next): boolean`
New pure function (co-located with `summarizeDataGaps`, `lib/parser/dataGaps.ts`):

```ts
const prior = summarizeDataGaps(priorWarnings);   // { total, classes }
const next  = summarizeDataGaps(nextWarnings);
```

Fire (`true`) when **either**:
1. **New gap class appears** — `∃ class c: prior.classes[c] === 0 && next.classes[c] > 0`. (pass→fail transition; the clearest signal.)
2. **Existing class worsens materially** — `∃ class c: prior.classes[c] > 0 && (next.classes[c] - prior.classes[c]) >= 5 && next.classes[c] >= prior.classes[c] * 1.5`. (+5 absolute AND +50% relative — dual gate.)

**Rationale for the dual gate (corpus-calibrated):** absolute-only fires on trivial 1→2 deltas; relative-only fires on trivial 118→124 (5% but +6 absolute noise on an already-degraded show). Requiring BOTH suppresses both false-positive ends. Rule 1 (new class) has **no** magnitude gate — a class going 0→1 is a genuine structural transition (a section that used to parse now vanished) and is always worth surfacing.

Do **not** compare `.total` alone (corpus proves absolute totals are show-intrinsic, §3 Track 1).

### 6.4 Anti-flap + auto-resolve (baseline-anchored — round-1 finding 1)

**The bug an immediate-prior comparator would have:** if a show regresses `UNKNOWN_FIELD` 4→40 the alert opens; the next sync at 40→40 is *not a new regression vs its immediate prior (40)*, so a naive "resolve when `isQualityRegression(prior,next)` is false" would **resolve the alert while the show is still materially degraded** — turning a persistent regression into a one-cycle notification. Rejected.

**Baseline-anchored lifecycle (correct):** the alert stores the **pre-regression baseline** and resolves only when the show returns to it.

Alert `context` carries:
```jsonc
{ "drive_file_id", "sheet_name", "breakdown", "new_classes", "worsened",
  "baseline": { /* DataGapsSummary captured at the moment the alert first opened = the last-good summary immediately BEFORE the first regressing sync */ } }
```

On each **applied** sync for a published show (tx-bound, under the show lock — read-modify-write is race-free per §6.2):
1. `prior = summarizeDataGaps(priorWarnings)` (the stored last-good, before this apply); `current = summarizeDataGaps(nextWarnings)`.
2. Read the show's open `RESYNC_QUALITY_REGRESSED` alert (if any) to get its stored `baseline`.
3. **No open alert:** if `isQualityRegression(prior, current)` → **OPEN**, store `baseline = prior` (the pre-regression good state). Else no-op.
4. **Open alert exists (stored `baseline`):** compare `current` against the STORED `baseline`, not the immediate prior:
   - `isQualityRegression(baseline, current)` still true → **keep open**; re-upsert refreshing `breakdown`/`new_classes`/`worsened` but **preserve `baseline` unchanged** (do not let a further 40→80 step move the anchor).
   - `isQualityRegression(baseline, current)` false → **RESOLVE** via a dedicated tx-bound SQL update (new helper `resolveQualityRegression_unlocked(tx, showId)`: `update public.admin_alerts set resolved_at = now() where show_id = $1::uuid and code = 'RESYNC_QUALITY_REGRESSED' and resolved_at is null`). This is a raw tx update (same mechanism family as `resolveStaleSyncProblemAlerts_unlocked`), used because the resolve must be **(a) tx-bound under the show lock** (commits atomically with the sync outcome, same as `PARSE_ERROR_LAST_GOOD`) and **(b) conditional** on baseline recovery — the generic `resolveAdminAlert` helper is neither tx-bound nor conditional. (C is now banner, not inbox, so the inbox manual-resolve guard is moot; the dedicated tx helper is still required for the tx-bound + conditional reasons above.)

**Why C is NOT added to `SYNC_PROBLEM_CODES`:** the generic success sweep `resolveStaleSyncProblemAlerts_unlocked(tx, showId, null)` (called on EVERY successful applied sync, `runScheduledCronSync.ts:3026`) unconditionally resolves every `SYNC_PROBLEM_CODES` member for the show. If C were a member, a "successful" but still-degraded sync (40→40) would resolve C — re-introducing round-1 finding 1. C's resolve is **warnings-conditional (vs baseline), not status-conditional**, so it must stay OUT of `SYNC_PROBLEM_CODES` and use its own dedicated conditional resolve above. (C is not a "sync problem" in the status sense — the sync applied fine.)

This yields the required behavior: **4→40 opens (baseline 4); 40→40 stays open (still regressed vs baseline 4); 40→80 stays open, baseline pinned at 4; 80→4 resolves (no longer regressed vs baseline 4).**

**Baseline preservation across re-upserts:** the existing `upsert_admin_alert` does last-writer-wins on non-`failedKeys` context, so a naive re-raise would clobber `baseline`. Because C is show-scoped and runs under the show advisory lock, the producer reads the current open alert's `baseline` first and passes it back verbatim in `p_context` on every re-upsert (JS read-modify-write, race-free under the lock). No RPC change for C.

- Storage-native dedup: repeated regressed syncs re-upsert the one `(showId, RESYNC_QUALITY_REGRESSED)` row in place — no storm.
- No k-consecutive needed (storage dedups + baseline anchor); consistent with existing alert cadence.

### 6.5 Guard conditions
- `priorWarnings` null/empty (first-ever apply for a show that somehow lacks prior warnings) → `summarizeDataGaps(null) = { total:0, classes:allZero }`. Rule 1 then fires if the new parse has ANY gap class. This is acceptable: a brand-new-to-published show that lands with gaps is worth one Doug signal. (In practice first publish goes through staging, so this edge is rare.)
- `nextWarnings` empty (clean re-sync) → `isQualityRegression` false → auto-resolve path.
- Info-severity warnings are already excluded by `summarizeDataGaps` (`dataGaps.ts:93`) — the comparator inherits that filter, so info churn never triggers C.
- Only the **applied** outcome reaches C — `hard_fail` (→ B/PARSE_ERROR_LAST_GOOD), `shrink_held` (→ RESYNC_SHRINK_HELD), `stage`, `skip` all return before the applied epilogue.

### 6.6 Doug copy (catalog)
- `dougFacing`: "_<sheet-name>_'s latest edit lost some data quality — one or more fields or sections that used to read no longer do. The update is already live; open the parse panel to see what degraded and fix the sheet."
- `title`: "Latest edit lost data quality"
- `followUp`: "Doug → check parse panel, fix sheet"
- `helpHref: "/help/admin/parse-warnings#RESYNC_QUALITY_REGRESSED"` (or `/help/errors#...` — match `RESYNC_SHRINK_HELD`'s family).
- `crewFacing: null` (crew already see the applied data; no separate message).

---

## 7. New-code lockstep touchpoints (C ONLY — B introduces no new code)

**B introduces NO new §12.4 code** (round-5 pivot, §5) — it reuses the existing pending-ingestion surface and the existing catalog copy resolved from `last_error_code`. The lockstep below applies to **C's `RESYNC_QUALITY_REGRESSED` only** (verified files exist against HEAD):

1. **Master spec §12.4 prose** — `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (one new row). Do **not** prettier this file (`feedback_never_prettier_the_master_spec`).
2. **`pnpm gen:spec-codes`** → `lib/messages/__generated__/spec-codes.ts` (regenerated, committed same commit).
3. **`lib/messages/catalog.ts`** — new `RESYNC_QUALITY_REGRESSED` `MESSAGE_CATALOG` row. The x1-catalog-parity gate (`tests/messages/codes.test.ts`) compares runtime catalog ↔ §12.4 prose; all three land together.
4. **`pnpm gen:internal-code-enums`** → `lib/messages/__generated__/internal-code-enums.ts` (x2 gate).
5. **`AdminAlertCode` union** — `lib/adminAlerts/upsertAdminAlert.ts:3-37` (add `RESYNC_QUALITY_REGRESSED`).
6. **`tests/messages/adminAlertsRegistry.ts`** — add `RESYNC_QUALITY_REGRESSED`.
7. **`tests/messages/_metaAlertAudienceContract.test.ts`** — audience row (`doug`).
8. **`tests/messages/adminSurface.test.ts`** — C is **banner** (default, NOT `inbox` — §2.1/§6.1); do NOT add it to the inbox-routed set, so it surfaces in the Bell center.
9. **`tests/messages/_metaAlertActionsContract.test.ts`** — **raise-site-pinning** for C's producer (PR #287 principle): pin `code: "RESYNC_QUALITY_REGRESSED"` to its applied-epilogue producer (`showId: show.showId`). **No action-link row** (touchpoint 10) — verify the actions-contract test permits an alert code with a raise-pin but no action entry (as `PARSE_ERROR_LAST_GOOD` already is); if it requires action-code membership, follow the `PARSE_ERROR_LAST_GOOD` exemption path exactly.
10. **`lib/adminAlerts/alertActions.ts`** — **no change**. C omits an action link (round-3 finding 2): mirrors `PARSE_ERROR_LAST_GOOD` (no action; wrong to mirror `RESYNC_SHRINK_HELD`'s `#resync`). Do NOT add C to `ALERT_ACTION_CODES`.
11. **`lib/adminAlerts/alertIdentityMap.ts`** — `{ kind: "global" }` for C (sheet-in-copy).
12. **`lib/notify/constants.ts` — `SYNC_PROBLEM_CODES`: do NOT add C.** C's resolve is warnings-conditional (vs baseline), so it must be excluded from the unconditional success sweep at `runScheduledCronSync.ts:3026` (round-2 finding 1 — see §6.4). Verify `sync-problem-codes.test.ts` does not force-require every new alert code into `SYNC_PROBLEM_CODES`.
13. **`lib/notify/detect/recoveryResolution.ts` — N/A for C.** The status→code recovery map keys off a sync **status**; C has no distinct status (a regressed sync's status is the normal applied/ok). C resolves via its dedicated `resolveQualityRegression_unlocked`. No recoveryResolution edit.
14. **`lib/cron/classifyProcessed.ts`** — no new bucket. C's "regressed-but-applied" is still an `applied`/success outcome. Confirm no counter change needed.
15. **help/errors** — new anchor + `_families` check (`feedback_new_12_4_code_full_ci_touchpoints`): `/help/admin/parse-warnings#RESYNC_QUALITY_REGRESSED` (match `PARSE_ERROR_LAST_GOOD`'s family) or `/help/errors#RESYNC_QUALITY_REGRESSED`.
16. **Per-show admin page** — the show-scoped C alert renders on `app/admin/show/[slug]/page.tsx` via the existing alert-list renderer (no new component expected; confirm during impl whether any `app/` file changes → if so, invariant 8 impeccable dual-gate).
17. **Run the FULL suite** before push (`feedback_new_12_4_code_full_ci_touchpoints`, `feedback_full_suite_before_push_scoped_gates_miss_regressions`).

## 8. Meta-test inventory (writing-plans requirement)

- **CREATES:** none.
- **EXTENDS (C's new code only):** `adminAlertsRegistry.ts`, `_metaAlertAudienceContract.test.ts`, `adminSurface.test.ts`, `_metaAlertActionsContract.test.ts` (raise-site pin), x1-catalog-parity (`codes.test.ts`), the internal-code-enums gate, and the `dataGapsClassCompleteness`-adjacent parser tests (C's comparator lives next to `summarizeDataGaps`). Verify C is correctly EXCLUDED from `SYNC_PROBLEM_CODES` (§7.12) and the recovery map (§7.13). **B touches no catalog/registry meta-test** (no new code); B's coverage is behavioral (pending_ingestions written at both raise sites + cleared on success — §11).
- **Advisory-lock topology:** untouched. C's alert raise + resolve and B's `upsertLivePendingIngestion` call are all **tx-bound inside the existing `withShowLock` pipeline transaction** (raise mirroring `PARSE_ERROR_LAST_GOOD` at `runScheduledCronSync.ts:2834/2843`; B's pending upsert is the same tx-method family already used at `:2374`). The C resolve helper (`resolveQualityRegression_unlocked`) does **not** acquire `pg_advisory*` — no new lock holder, no nesting. Unit A's `log.warn` telemetry is the only emit outside a lock (listing phase). Declared explicitly.
- **PostgREST DML lockdown:** **no new RPC and no new table** (round-5 pivot — B's custom RPCs are gone; C is pure JS + existing `upsert_admin_alert`). `pending_ingestions` and `admin_alerts` grants are already locked; no lockdown change.

## 9. Invariants honored

- **2 (advisory lock single-holder):** C's alert raise/resolve and B's `upsertLivePendingIngestion` call are **tx-bound inside the existing `withShowLock` pipeline tx** (mirroring `PARSE_ERROR_LAST_GOOD`); no new RPC acquires `pg_advisory*` — no new lock holder, no nesting. The single-holder topology is unchanged. ✓
- **3 (email canonicalization):** no raw emails touched (Drive ids, sheet titles, MI-codes only). ✓
- **4 (no global cursor):** untouched. ✓
- **5 (no raw codes in UI):** all Doug/crew copy routes through `catalog.ts` / `lib/messages/lookup.ts`; A's raw `code:` is in `app_events` (dev telemetry, not user UI) — permitted. ✓
- **9 (Supabase call-boundary):** C's resolve-helper query and B's `upsertLivePendingIngestion` call go through existing tx-bound seams that already destructure `{ data, error }` / use the tx query helper; no new bare Supabase client call is introduced. ✓
- **10 (mutation observability):** governs telemetry emits, NOT alert/pending writes. **A** is the relevant emit — a coded `app_events` `log.warn` from the listing read (outside any lock). **B** writes a `pending_ingestions` row inside an existing sync mutation path (the surface is already registered; the pending-ingestion inbox item is itself the operator signal). **C** is an admin_alerts raise inside an existing sync mutation path (tx-bound). Neither adds a new admin HTTP route or `"use server"` action, so no `AUDITABLE_MUTATIONS` row is required. ✓

## 10. Migration → validation parity

**No migration.** Round-5 pivot removed B's custom RPCs; C adds no DDL (pure JS comparator + existing `upsert_admin_alert` for raise + a raw tx `update admin_alerts` for resolve); B reuses the existing `pending_ingestions` table + `upsertLivePendingIngestion` seam. There is **no `supabase/migrations/**` change**, so `pnpm gen:schema-manifest` is a no-op and the `validation-schema-parity` gate is untouched. The entire feature is migration-free.

## 11. Test plan (TDD per task; anti-tautology)

- **A:** with an injected `listFolder`-free default and a stubbed Drive page returning a phantom-parent file, assert `log.warn` is called with `code:"UNEXPECTED_PARENT"` and the right fields — at **both** callers. Failure mode caught: a caller that silently drops with no telemetry (the current bug).
- **B — pending_ingestions write at both raise sites:** an onboarding first-seen hard-fail (`runOnboardingScan.ts:728`) writes a live `pending_ingestions` row (`wizard_session_id IS NULL`, `last_error_code = result.code`, `drive_file_name`) — assert the row exists AND the wizard manifest row still writes (both). A cron first-seen hard-fail (`runScheduledCronSync.ts:2820`, showId-null) writes the same live row. Failure mode caught: an onboarding-discovered first-seen failure that stays invisible outside the wizard (the bug).
- **B — scope exclusion:** `live_row_conflict` (`:640`) and `defer` (`:710`) do **NOT** write a live `pending_ingestions` error row. Failure mode: a deferred/staged sheet mis-surfaced as an ingestion failure.
- **B — dedup + lifecycle:** a repeated hard-fail of the same `drive_file_id` upserts (bumps `attempt_count`, refreshes `last_error_code`), NOT a duplicate row. A subsequent successful sync/onboard of that file calls `deleteLivePendingIngestion` → the row (and its inbox item) clears. Failure mode: duplicate rows / a stuck inbox item after recovery.
- **B — surfaces in the inbox:** a written live `pending_ingestions` row appears as a `pending_ingestion` item in `needsAttention.ts` output with catalog-safe copy (never a raw `last_error_code`; invariant 5). Failure mode: an alert row that exists but is not delivered to any operator surface (round-4/round-5 concern) — proven delivered via the existing inbox.
- **C — comparator truth table**, derived from **corpus fixtures / `summarizeDataGaps` input** (anti-tautology — assert against the summary objects, never rendered DOM):
  - new class 0→1 → fires (rule 1).
  - `UNKNOWN_FIELD` 4→40 → fires (rule 2: +36 abs, +900% rel).
  - `UNKNOWN_FIELD` 1→2 → does NOT fire (+1 abs < 5).
  - `UNKNOWN_FIELD` 118→124 → does NOT fire (+6 abs but +5% < 50%).
  - clean re-sync (prior gaps → 0) → does NOT fire; auto-resolves.
  - `hard_fail` / `shrink_held` / `stage` outcomes never reach C.
  - Expected values **derived from fixture dimensions**, not hardcoded (a fixture that baselines at 118 exercises the relative-gate boundary).
  - Concrete failure mode per test stated (e.g. "an absolute-only threshold would fire on 118→119 and spam the already-degraded renderer-family shows").
- **C — baseline-anchored lifecycle (round-1 finding 1; the load-bearing correctness test):**
  - 4→40 **opens** the alert with stored `baseline` = the 4-gap summary.
  - 40→40 (next sync, no new regression vs immediate prior) **stays open** (still regressed vs stored baseline 4) — the exact bug a naive immediate-prior comparator would resolve prematurely.
  - 40→80 stays open; stored `baseline` remains 4 (not moved to 40).
  - 80→4 **resolves** (no longer regressed vs baseline 4).
  - Baseline preservation: assert a re-upsert does NOT clobber `context.baseline`.
  - **Resolve path:** the 80→4 resolve goes through the raw tx SQL `resolveQualityRegression_unlocked`, NOT `resolveAdminAlert`. Assert C is absent from `SYNC_PROBLEM_CODES` so the generic success sweep (`:3026`) does not touch it (else it would resolve a still-degraded 40→40 — round-2 finding 1).
  - **Delivery:** assert C is a banner (non-inbox) doug code, so it appears in `get_bell_feed_rows` output (not excluded by `bellExcludedCodes`) — i.e. it is actually pushed to the bell, not pull-only (round-4 finding 1).
  - Failure mode caught: "resolving a still-degraded show after one cycle, hiding a persistent regression"; and "an alert row created but never delivered to any push surface."

## 12. Open decisions (resolved)

- **A push vs log:** log (actionability-gating). Resolved.
- **B mechanism (round-5 pivot):** route first-seen parse hard-fails into the EXISTING live `pending_ingestions` surface (Needs-Attention inbox + ingestion realtime candidate + delete-on-success lifecycle) — NOT a new global aggregate alert with a custom object-map RPC. This structurally resolves the round-5 findings (incomplete prune / unbounded map): `pending_ingestions` is one bounded row per file with a complete, existing lifecycle. B introduces no new §12.4 code, no RPC, no migration. Resolved.
- **B raise sites:** call the existing `upsertLivePendingIngestion` tx seam at both first-seen hard-fail sites that currently skip it (onboarding `:728`, cron `:2820` showId-null); tests pin the `pending_ingestions` write, scope-exclude `live_row_conflict`/`defer`. Resolved (round-4 finding 2's "custom seam vs generic helper" concern is moot — no admin_alerts write for B at all).
- **C comparator:** new-class-appeared OR (+5 abs AND +50% rel); never absolute total. Resolved (corpus-calibrated).
- **C debounce + resolve:** storage-native dedup (one-row-per-(show,code)); **baseline-anchored auto-resolve** — resolve only when current returns to the stored pre-regression baseline, never on immediate-prior equality (round-1 finding 1). Resolved.
- **C raise placement:** tx-bound inside the existing `withShowLock` pipeline tx via `requireTxBoundUpsertAdminAlert`, mirroring `PARSE_ERROR_LAST_GOOD` — NOT a post-commit epilogue (round-1 finding 2). Invariant 10's post-commit-outside-lock rule governs telemetry emits (Unit A), not admin_alerts raises. Resolved.
- **C auto-resolve mechanism:** raw tx-bound SQL `resolveQualityRegression_unlocked`, never `resolveAdminAlert` (not tx-bound/conditional). C excluded from `SYNC_PROBLEM_CODES` so the unconditional success sweep can't prematurely resolve a still-degraded show. Resolved (round-2 finding 1).
- **C action link:** NONE — mirrors `PARSE_ERROR_LAST_GOOD` (no action; copy points to the parse panel), NOT `RESYNC_SHRINK_HELD`'s `#resync` (wrong surface for an already-applied regression). Avoids a wrong deep-link, a UI anchor id (no impeccable gate), and a route test (round-3 finding 2). Resolved.
- **C delivery / push surface:** the Bell notification center (`get_bell_feed_rows` + realtime ping, PR #324) — C is `audience:"doug"` + **banner** so it surfaces in the bell and pings automatically. Banner (not inbox) specifically so it reaches the bell rather than being pull-only (an inbox C couldn't join `SYNC_PROBLEM_CODES` and would be pull-only). Resolved (round-4 finding 1).
