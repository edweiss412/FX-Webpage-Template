# Spec — Wire the Silent Telemetry Channels (Audit Rec. 4)

**Date:** 2026-07-05
**Source:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/edge-case-preparedness-audit-2026-07-04.md` §5 recommendation 4 (findings #14, #15, #16).
**Status:** design approved (this session); autonomous ship.

---

## 1. Problem

The edge-case audit found three ingestion failure modes that happen with **zero pushed signal** — the pipeline does the right structural thing (drops/degrades) but nobody is told:

- **#15 — `UNEXPECTED_PARENT` fully silent.** `listFolder` (`lib/drive/list.ts:112`) drops a misfiled sheet via `onWarning`, but **no production caller wires `onWarning`** (`lib/sync/runOnboardingScan.ts:949`, `lib/sync/runScheduledCronSync.ts:3153` both omit it). The `UNEXPECTED_PARENT` §12.4 message code already exists (`lib/messages/catalog.ts:1525`) — nothing emits it.
- **#14 — first-seen hard-fail raises no admin alert.** A brand-new sheet Doug adds that parse-hard-fails writes a wizard-session manifest row `status:"hard_failed"` (`lib/sync/runOnboardingScan.ts:736`) but pushes no alert; the cron first-seen hard-fail branch (`lib/sync/runScheduledCronSync.ts:2820`) raises `PARSE_ERROR_LAST_GOOD` **only when `show?.showId` is truthy** (`:2831`) — null for first-seen, so nothing fires.
- **#16 — degraded-parse dataGaps never push.** A live published show whose re-sync auto-applies (full-replace) a materially worse parse persists new `parse_warnings` (`lib/sync/applyParseResult.ts:206`) but raises no alert; the passive `DataQualityBadge` is pull-only.

## 2. Goals / Non-goals

**Goals:** give each silent channel a signal calibrated to (a) who resolves the underlying issue and (b) whether it is operator-actionable.

**Routing decision (approved):** the signal's audience follows the resolver.

| Unit | Channel | Resolver | Signal | Audience |
|---|---|---|---|---|
| A | `UNEXPECTED_PARENT` sheet drop | dev (phantom parentage) / admin (misfiled) — rare, drop usually *correct* | coded `app_events` log, **no push** | dev-facing (queryable) |
| B | first-seen parse hard-fail | Doug (his new sheet is broken → fix sheet) | pushed admin alert | `doug` |
| C | published-show quality regression | Doug (his edit lost data quality → fix sheet); health fallback if parser-coverage gap | pushed admin alert | `doug` |

**Non-goals:**
- No change to the parse/apply behavior itself. C observes a re-sync that **already applied** — it is informational, not a gate (contrast `RESYNC_SHRINK_HELD`, which *holds*). We do not add a new hold.
- A is not promoted to a push (actionability-gating: a rare, usually-correct drop is low-actionability — Track 2 research; alert fatigue).
- No new crew-visible copy. B/C are admin/Doug surfaces only.
- We do NOT change the `admin_alerts_one_unresolved_idx` uniqueness model.

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

## 5. Unit B — first-seen parse hard-fail → global aggregate Doug alert

### 5.1 New code
`FIRST_SEEN_PARSE_FAILED`.

| Field | Value |
|---|---|
| `audience` | `"doug"` |
| `resolution` | `"auto"` |
| `adminSurface` | `"inbox"` (Needs-attention to-do; mirrors `PARSE_ERROR_LAST_GOOD`/`RESYNC_SHRINK_HELD`) |
| `severity` | (predicate code — has `title`/`longExplanation`/`helpHref`) |
| identity | global — `showId: null` (like `SYNC_STALLED`) |

### 5.2 Raise sites (both)
A genuine **first-seen parse hard-fail** = the file has no `public.shows` row yet AND phase-1 returned `outcome:"hard_fail"`. Two entry points reach this:

1. **Onboarding scan** — `lib/sync/runOnboardingScan.ts:728-736` (`result.outcome === "hard_fail"` branch, distinct from the `:640` `live_row_conflict` and `:710` `defer` branches which are **excluded**). Data in scope: `file.driveFileId`, `file.name` (sheet title), `result.code`.
2. **Cron** — `lib/sync/runScheduledCronSync.ts:2820-2849`, the `else` of the `show?.showId` guard (`:2831`). Data in scope: `driveFileId`, `phase1.code`; sheet title is the parse result's title if available (fallback: the Drive `fileMeta.name`).

Both raises are **post-commit, outside the advisory lock** (mirror the existing `upsertAdminAlert` raise at `runScheduledCronSync.ts:2834`, which is already post-`logSync`, in the locked-tx epilogue — B's raise goes in the SAME structural position: after the outcome is durable, using the tx-bound `requireTxBoundUpsertAdminAlert` on the cron path and the onboarding tx's `upsertAdminAlert` seam on the onboarding path).

### 5.3 Aggregate context model + auto-resolve

The uniqueness index collapses all `showId:null` `FIRST_SEEN_PARSE_FAILED` sightings to **one row**. Context accumulates the failing set:

```jsonc
{ "failures": { "<driveFileId>": { "sheet_title": "<name>", "code": "<MI-code>" }, ... } }
```

- **Add (raise):** on a first-seen hard-fail, set `failures[driveFileId] = { sheet_title, code }`. Keyed by `driveFileId` → natural dedup (a repeated failure of the same sheet overwrites its own entry, no growth).
- **Prune + resolve (recovery):** a first-seen sheet leaves the failing set when it is next processed **successfully** — i.e. it stages (`stage` outcome) or publishes, meaning it is no longer a first-seen parse-failure. At each such bounded success site, remove `failures[driveFileId]`; **if `failures` becomes empty, resolve the alert** (`resolveAdminAlert({ showId: null, code: "FIRST_SEEN_PARSE_FAILED" })`, mirroring `lib/notify/detect/stall.ts:17`'s global resolve via `.is("show_id", null)`).

**Merge semantics require an RPC change.** The current `upsert_admin_alert` (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql`) merges a **grow-only text array** (`failedKeys`) — it cannot prune, and it merges text not objects. B needs **object-map add** and **key-prune**. Design decision (see §5.4): rather than overload `upsert_admin_alert` with prune semantics (it is a shared, heavily-tested chokepoint), model B's context mutation as **read-modify-write inside the same SECURITY DEFINER upsert call by passing the full recomputed `failures` map as `p_context`** — the producer computes the next map (merge-in on add, delete-key on prune) from the current row, and passes the whole object. This keeps `upsert_admin_alert` a plain last-writer-wins for non-`failedKeys` context (its documented default: "Producers WITHOUT a `failedKeys` key behave byte-for-byte as the old function"). The read-current-then-write is done **under the per-show advisory lock is N/A** (global alert, no show) — instead it races only with other first-seen files; because first-seen files are processed serially within a scan and the alert row is global, we serialize the read-modify-write via a dedicated `upsert_first_seen_parse_failed(p_driveFileId, p_sheet_title, p_code)` / `resolve_first_seen_parse_failed(p_driveFileId)` RPC pair that does the map mutation **inside the function** (single statement, atomic) rather than in JS. This avoids a lost-update race between concurrent producers.

### 5.4 RPC: `upsert_first_seen_parse_failed` / `prune_first_seen_parse_failed`
New migration adds two SECURITY DEFINER functions:

- `upsert_first_seen_parse_failed(p_drive_file_id text, p_sheet_title text, p_code text) returns uuid` — inserts the global row if absent, else `jsonb_set`s `failures->p_drive_file_id`. `set search_path = public, pg_temp`. `revoke all ... from public, anon, authenticated; grant execute ... to service_role` (PostgREST DML lockdown / call-boundary discipline).
- `prune_first_seen_parse_failed(p_drive_file_id text) returns uuid` — deletes `failures->p_drive_file_id`; if the resulting `failures` object is empty (`failures = '{}'::jsonb`), sets `resolved_at = now()` (auto-resolve). Same grants.

Both are apply-twice idempotent (`create or replace`). Migration follows the validation-parity checklist (§10).

### 5.5 Guard conditions
- If `p_sheet_title` is null/empty (cron path with no parsed title and no `fileMeta.name`), store `""` — the Doug copy renders a count + "open onboarding to see which" and does not depend on every title being present.
- Concurrent first-seen failures in one scan: serialized by the in-RPC `jsonb_set` (atomic per call); no JS-side read-modify-write.
- A file that hard-fails, then next scan stages: add then prune → net removal → resolve when last one clears. Idempotent prune of an absent key is a no-op (still checks empties-then-resolve).

### 5.6 Doug copy (catalog)
- `dougFacing`: "One or more brand-new sheets you added couldn't be read at all, so they haven't been onboarded. Open onboarding to see which sheet(s) failed and the reason, fix the sheet, and re-scan."
- `title`: "New sheet couldn't be read"
- `longExplanation`, `helpfulContext`, `followUp` ("Doug → fix sheet, re-scan"), `helpHref: "/help/errors#FIRST_SEEN_PARSE_FAILED"`.
- `crewFacing: null` (never crew-visible — the show doesn't exist yet).

---

## 6. Unit C — published-show data-quality regression → Doug alert

### 6.1 New code
`RESYNC_QUALITY_REGRESSED`. Mirrors `RESYNC_SHRINK_HELD` field-for-field (`lib/messages/catalog.ts:155-170`):

| Field | Value |
|---|---|
| `audience` | `"doug"` |
| `resolution` | `"auto"` |
| `adminSurface` | `"inbox"` |
| identity | `{ kind: "global" }` in `alertIdentityMap` (sheet is IN the copy — SPECIFIC, no per-segment identity resolution; same as `RESYNC_SHRINK_HELD` `alertIdentityMap.ts:158`) |
| scope | **show-scoped** (`showId: show.showId`) — no global collision |

### 6.2 When it fires
Computed for an **existing published show** whose re-sync **applied** (not held/staged/first-seen). The apply path is `applyParseResult` (`lib/sync/applyParseResult.ts:206` writes new `parse_warnings`). The prior last-good `parse_warnings` is readable at `readShowForPhase1` (`lib/sync/runScheduledCronSync.ts:645-651`, exposed as `priorParseResult.warnings`, `:692`). Both are in scope in `processOneFile_unlocked` at the applied-outcome epilogue.

"Existing published show" = `public.shows` row non-null (`readShowForPhase1` returns non-null `showId`) AND the outcome is the applied/published branch (NOT `hard_fail`, `shrink_held`, `stage`, `skip`). Raise is **post-commit, outside the lock** (same structural slot as the `PARSE_ERROR_LAST_GOOD` raise).

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

### 6.4 Anti-flap + auto-resolve
- Storage-native dedup: repeated regressed syncs re-upsert the one `(showId, RESYNC_QUALITY_REGRESSED)` row in place — no storm.
- **Auto-resolve** when a later applied sync is **not** a regression vs its own prior (i.e. `isQualityRegression` is false) → `resolveStaleSyncProblemAlerts_unlocked` / `resolveAdminAlert({ showId, code })`. This mirrors `PARSE_ERROR_LAST_GOOD`'s auto-resolve-on-clean-sync (`runScheduledCronSync.ts:2843`).
- No k-consecutive needed (storage dedups); consistent with existing alert cadence.

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

## 7. New-code lockstep touchpoints (both B and C)

Each new §12.4 code fans out (verified files exist against HEAD):

1. **Master spec §12.4 prose** — `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (new rows). Do **not** prettier this file (`feedback_never_prettier_the_master_spec`).
2. **`pnpm gen:spec-codes`** → `lib/messages/__generated__/spec-codes.ts` (regenerated, committed same commit).
3. **`lib/messages/catalog.ts`** — new `MESSAGE_CATALOG` rows. The x1-catalog-parity gate (`tests/messages/codes.test.ts`) compares runtime catalog ↔ §12.4 prose; all three land together.
4. **`pnpm gen:internal-code-enums`** → `lib/messages/__generated__/internal-code-enums.ts` (x2 gate).
5. **`AdminAlertCode` union** — `lib/adminAlerts/upsertAdminAlert.ts:3-37` (add both codes).
6. **`tests/messages/adminAlertsRegistry.ts`** — add both (the alert-code registry).
7. **`tests/messages/_metaAlertAudienceContract.test.ts`** — audience rows (`doug` for both).
8. **`tests/messages/adminSurface.test.ts`** — `inbox` for both.
9. **`tests/messages/_metaAlertActionsContract.test.ts`** — alert-action rows + **raise-site-pinning regex** (this is the raise-site-pinning meta-test, PR #287; e.g. pin `code: "RESYNC_QUALITY_REGRESSED"` to its producer). C is show-scoped (pin `showId: show.showId, code: "RESYNC_QUALITY_REGRESSED"`); B is global (pin `showId: null, code: "FIRST_SEEN_PARSE_FAILED"` — or via the new RPC helper name).
10. **`lib/adminAlerts/alertActions.ts`** — action entries (both; C mirrors `RESYNC_SHRINK_HELD:106`, B mirrors `SYNC_STALLED`).
11. **`lib/adminAlerts/alertIdentityMap.ts`** — `{ kind: "global" }` for both (B truly global; C sheet-in-copy).
12. **`lib/notify/constants.ts`** — add to the sync-problem/notify code set if applicable (C is a sync-problem code like `RESYNC_SHRINK_HELD:6`; B is a global detector like `SYNC_STALLED`).
13. **`lib/notify/detect/recoveryResolution.ts`** — if C participates in the status→code recovery map (`shrink_held → RESYNC_SHRINK_HELD`, `:8/:63`), add the analogous mapping so a recovered sync auto-resolves it.
14. **`lib/cron/classifyProcessed.ts`** — classification counter if the outcome needs a bucket (C's "regressed-but-applied" is still an `applied` outcome — likely no new bucket; confirm).
15. **help/errors** — new anchors + `_families` check (`feedback_new_12_4_code_full_ci_touchpoints`): `/help/errors#FIRST_SEEN_PARSE_FAILED`, `RESYNC_QUALITY_REGRESSED`.
16. **Per-show admin page** — the show-scoped C alert renders on `app/admin/show/[slug]/page.tsx` via the existing alert-list renderer (no new component expected; confirm during impl whether any `app/` file changes → if so, invariant 8 impeccable dual-gate).
17. **Run the FULL suite** before push (`feedback_new_12_4_code_full_ci_touchpoints`, `feedback_full_suite_before_push_scoped_gates_miss_regressions`).

## 8. Meta-test inventory (writing-plans requirement)

- **CREATES:** none.
- **EXTENDS:** `adminAlertsRegistry.ts`, `_metaAlertAudienceContract.test.ts`, `adminSurface.test.ts`, `_metaAlertActionsContract.test.ts` (incl. raise-site pins), `recovery-resolution.test.ts`, `sync-problem-codes.test.ts`, x1-catalog-parity (`codes.test.ts`), the internal-code-enums gate, and the `dataGapsClassCompleteness`-adjacent parser tests (C's comparator lives next to `summarizeDataGaps`).
- **Advisory-lock topology:** untouched. All raises are post-commit, outside the lock; single-holder rule (invariant 2) unaffected. New RPCs (`upsert/prune_first_seen_parse_failed`) do **not** acquire `pg_advisory*`. Declared explicitly.
- **PostgREST DML lockdown:** new RPCs are SECURITY DEFINER with `revoke ... from public, anon, authenticated; grant execute to service_role`. They do not add a new RPC-gated *table* (they mutate the existing `admin_alerts`, whose grants are already locked). Confirm `admin_alerts` INSERT/UPDATE is already REVOKEd from `authenticated`.

## 9. Invariants honored

- **2 (advisory lock):** raises post-commit, outside lock; no new holder. ✓
- **3 (email canonicalization):** no raw emails touched (Drive ids, sheet titles, MI-codes only). ✓
- **4 (no global cursor):** untouched. ✓
- **5 (no raw codes in UI):** all Doug/crew copy routes through `catalog.ts` / `lib/messages/lookup.ts`; A's raw `code:` is in `app_events` (dev telemetry, not user UI) — permitted. ✓
- **9 (Supabase call-boundary):** new RPC call sites destructure `{ data, error }`, distinguish thrown vs returned error; register in the relevant meta-test or carry `// not-subject-to-meta:` with reason. ✓
- **10 (mutation observability):** A is a read (coded log). B/C are alert-raises inside existing sync mutation paths, post-commit — no new admin HTTP route, so no `AUDITABLE_MUTATIONS` row; the existing sync surfaces are already registered. ✓

## 10. Migration → validation parity

The B RPC migration (`supabase/migrations/<ts>_first_seen_parse_failed_rpcs.sql`) lands with the parity checklist in the SAME PR:
1. Apply locally + test (TDD).
2. `pnpm gen:schema-manifest` → commit regenerated `supabase/**/schema-manifest.json`.
3. Apply surgically to the validation project (`supabase db query --linked "<SQL>"`; then `notify pgrst, 'reload schema';`). `TEST_DATABASE_URL` lives in **main** `.env.local` (`feedback_validation_creds_in_main_env_local`).
The `validation-schema-parity` CI job asserts validation ⊇ manifest. C adds **no** DDL (pure JS comparator + existing `upsert_admin_alert`), so C is migration-free.

## 11. Test plan (TDD per task; anti-tautology)

- **A:** with an injected `listFolder`-free default and a stubbed Drive page returning a phantom-parent file, assert `log.warn` is called with `code:"UNEXPECTED_PARENT"` and the right fields — at **both** callers. Failure mode caught: a caller that silently drops with no telemetry (the current bug).
- **B — comparator/aggregate:** two distinct first-seen sheets fail → one alert row, `failures` map has 2 keys; re-raise of the same sheet → still 2 keys (dedup); prune one → 1 key, unresolved; prune last → `failures` empty AND `resolved_at` set. Scope-exclusion: `live_row_conflict` (`:640`) and `defer` (`:710`) do **not** raise `FIRST_SEEN_PARSE_FAILED`. Both raise sites (onboarding + cron showId-null) covered. Failure mode: a second failing sheet clobbering the first's row; a recovered sheet leaving a stuck alert.
- **C — comparator truth table**, derived from **corpus fixtures / `summarizeDataGaps` input** (anti-tautology — assert against the summary objects, never rendered DOM):
  - new class 0→1 → fires (rule 1).
  - `UNKNOWN_FIELD` 4→40 → fires (rule 2: +36 abs, +900% rel).
  - `UNKNOWN_FIELD` 1→2 → does NOT fire (+1 abs < 5).
  - `UNKNOWN_FIELD` 118→124 → does NOT fire (+6 abs but +5% < 50%).
  - clean re-sync (prior gaps → 0) → does NOT fire; auto-resolves.
  - `hard_fail` / `shrink_held` / `stage` outcomes never reach C.
  - Expected values **derived from fixture dimensions**, not hardcoded (a fixture that baselines at 118 exercises the relative-gate boundary).
  - Concrete failure mode per test stated (e.g. "an absolute-only threshold would fire on 118→119 and spam the already-degraded renderer-family shows").

## 12. Open decisions (resolved)

- **A push vs log:** log (actionability-gating). Resolved.
- **B aggregate vs per-sheet:** aggregate global row + keyed `failures` map + prune-on-success. Resolved.
- **B RPC:** dedicated `upsert/prune_first_seen_parse_failed` SECURITY DEFINER pair (atomic in-RPC map mutation) rather than overloading `upsert_admin_alert`. Resolved.
- **C comparator:** new-class-appeared OR (+5 abs AND +50% rel); never absolute total. Resolved (corpus-calibrated).
- **C debounce:** storage-native (one-row-per-(show,code)); no separate k-consecutive. Resolved.
