# ONBOARDING_SHEET_UNREADABLE — hybrid lifecycle + names-in-card

**Date:** 2026-07-16
**Status:** Draft (autonomous-ship pipeline; user ratified design + autonomy 2026-07-16)
**Predecessor spec:** `docs/superpowers/specs/2026-07-07-flow1-onboarding-empty-state-alert.md` (created the code; §3.2 ratified event-manual lifecycle, §3.4 the current copy). This spec supersedes that lifecycle decision for this one code.

---

## 1. Problem

`ONBOARDING_SHEET_UNREADABLE` (emitted at `app/api/admin/onboarding/scan/route.ts:299-311`) has two operator-hostile properties, both confirmed against live code:

1. **Not actionable in place.** Context carries only `folder_id`, `wizard_session_id`, `failed_drive_file_ids` — no sheet names. The identity map renders zero segments (`lib/adminAlerts/alertIdentityMap.ts:137`, `{ kind: "global" }`), and the catalog copy tells Doug to re-run setup *just to learn which sheets failed* (`lib/messages/catalog.ts:2013`). Names are in scope at every emit-relevant site (`lib/sync/runOnboardingScan.ts:718`, `const file = prepared.file`).
2. **Goes stale while the condition heals.** The cron tick first-seen-ingests unregistered folder files every tick (`lib/sync/runScheduledCronSync.ts:2951` comment: "first-seen stages for review"). Doug fixes a sheet in Drive without re-running setup → cron stages it → the alert stays open claiming re-run setup is the only path. Nothing ever auto-clears it: the row's only mutation paths are the manual resolve routes; a later clean setup scan emits nothing and clears nothing (predecessor spec §3.2 "the prior open row is NOT auto-cleared").

## 2. Resolved decisions (user-ratified 2026-07-16 — do not relitigate)

| # | Decision | Ratified over |
|---|----------|---------------|
| D1 | **Hybrid lifecycle**: system auto-resolves when the condition clears, AND the manual Resolve button stays (no 409). | Strict auto-only (rejected: a deliberately-kept non-template Google Sheet hard-fails forever and would pin the alert open with no manual out; a disconnected folder wedges it permanently). |
| D2 | **Names-in-card** via context field + identity segments. | Copy interpolation (predecessor spec §3.4 keeps `dougFacing` constant; segments need no `INTERPOLATED_DOUG_FACING_CODES` machinery). |
| D3 | New registry lifecycle class `"hybrid"` extending the alert-resolve-truthing binary model. | Reusing `"auto"` (would flip catalog `resolution` to `"auto"` via the parity test `tests/messages/_metaAdminAlertCatalog.test.ts:713-719`, suppressing the button at `components/admin/BellPanel.tsx:201` / `components/admin/PerShowAlertSection.tsx:418` and 409ing the routes at `app/api/admin/admin-alerts/[id]/resolve/route.ts:124`, `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:135` — contradicts D1). |
| D4 | Both user-review gates waived; autonomous ship through merged PR. | — |

Out of scope (ratified): no `ALERT_ACTIONS` entry (10-code pin, predecessor §3.5 rationale stands); no notify-email changes (auto-resolution is not a delivery event; the notify system emails on alert *creation* paths only); no lifecycle changes to any other code.

## 3. Design

### 3.1 Names into the emit (producer side)

**`lib/sync/runOnboardingScan.ts`** — the `processed` element type gains `name`:

- Type sites: `runOnboardingScan.ts:129-133` and `:142-146` — `{ driveFileId: string; outcome: ... }` becomes `{ driveFileId: string; name: string; outcome: ... }`.
- Push sites (all five in `scanPreparedFileWithTx`, where `const file = prepared.file` at `:718` puts `file.name` in scope): `:737`, `:823`, `:860`, `:893`, `:919` — each adds `name: file.name`. The sixth push at `:1100` (outer-loop `live_row_conflict`) uses `prepared.file.name`.
- `name` is the Drive file display name already shown to Doug in wizard Step 3 (manifest `name` column, `tx.upsertManifest` calls) — no new data classification.

**`app/api/admin/onboarding/scan/route.ts:292-311`** — the emit builds id→name pairs from `result.processed` hard-failed entries:

```
failed = processed.filter(p => p.outcome === "hard_failed")
pairs  = dedupe by driveFileId (first name wins), sort by driveFileId
context = {
  folder_id,
  wizard_session_id,
  failed_drive_file_ids: pairs.map(p => p.driveFileId),   // unchanged shape
  failed_sheet_names:    pairs.map(p => p.name),           // NEW, index-aligned
}
```

- **Index alignment invariant:** `failed_sheet_names[i]` is the name of `failed_drive_file_ids[i]`. Both arrays are sorted by drive file id (the ids array was already "sorted distinct", predecessor §3.2; the names array follows the same pair sort).
- The key is deliberately NOT `failedKeys` — the upsert RPC's union-merge branch triggers on that exact key (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:38`); this context must keep taking the `else p_context` full-replace branch (predecessor §3.2 rationale: the one open row always describes the latest scan).

### 3.2 Names onto the card (render side)

- **`lib/adminAlerts/alertIdentityMap.ts:137`** — flip `ONBOARDING_SHEET_UNREADABLE` from `{ kind: "global" }` to:
  ```ts
  ONBOARDING_SHEET_UNREADABLE: {
    segments: [{ kind: "contextField", key: "failed_sheet_names", label: "Sheet" }],
  }
  ```
  Segment union already has `contextField` (`alertIdentityMap.ts:22-28`, member at `:26`); `ROLE_FLAGS_NOTICE` at `:143-150` is the array-valued precedent.
- **`lib/adminAlerts/projectIdentityContext.ts`** — the projection is hardcoded per-field extraction (`:40-103`), not a registry: add a `failed_sheet_names` block mirroring the `role_change_crew_names` block at `:87-95` — string-array extraction, cap at 3 (the existing `ROLE_CHANGE_NAMES_CAP = 3` at `:30` pattern; this field gets its own constant `FAILED_SHEET_NAMES_CAP = 3` with the same slice-plus-total shape at `:93`), passing each name through the same sanitizer helpers the sibling block uses (control/bidi strip, length cap, token-like redaction are projection-wide guarantees).
- **`lib/adminAlerts/identityTypes.ts:28`** — extend the serialized identity type for the new field exactly as `role_change_crew_names` is typed.
- **`lib/adminAlerts/resolveAlertIdentities.ts:97-102`** — the "+N more" overflow append is generic to capped array segments; verify the new field routes through it (expected zero code change; if the overflow append is keyed per-field, add the key).
- No new UI components; `BellPanel`/`PerShowAlertSection` render segments generically.

### 3.3 Lifecycle contract extension ("hybrid" class)

**`tests/messages/_metaAdminAlertCatalog.test.ts`** (`ADMIN_ALERTS_LIFECYCLE`, `:279-284` types, `:286+` registry):

- New union member: `{ class: "hybrid"; resolveSites: [ResolveSite, ...ResolveSite[]] }` — resolveSites REQUIRED and non-empty, same structural grep enforcement as `"auto"` (the meta-test's resolve-site existence assertions must include hybrid entries in their iteration).
- `ONBOARDING_SHEET_UNREADABLE` moves from `{ class: "event-manual" }` to:
  ```ts
  { class: "hybrid", resolveSites: [
    { file: "app/api/admin/onboarding/scan/route.ts", pattern: /resolveOnboardingSheetUnreadableAlert/ },
    { file: "lib/sync/runScheduledCronSync.ts",       pattern: /resolveOnboardingSheetUnreadableAlert/ },
  ] }
  ```
- **Parity test `:713-719` is UNCHANGED**: `class === "auto" ? "auto" : "manual"` already maps `"hybrid"` → catalog `resolution: "manual"`. Catalog row keeps `resolution: "manual"` (`lib/messages/catalog.ts:2010`) → `isAutoResolving` stays false (`lib/adminAlerts/audience.ts:52-57,63`) → button renders, routes never 409. This is the load-bearing trick that makes D1 cheap.
- **Copy-ban test `:727-742`**: add `ONBOARDING_SHEET_UNREADABLE` to the `EXEMPT` set (`:729`, currently empty) with a comment: hybrid class — the copy's self-clear promise is now true (two pinned resolve sites) while the manual button legitimately stays.
- **Counts comment `:275-277`** updated: 26 auto / 17 event-manual / 1 hybrid / 1 state-manual-justified / 0 deferred = 45. The only per-class count assertion is `26` auto at `:687` (verified — no event-manual count expect exists); it is unchanged. Add a sibling `1` hybrid count assertion next to it so the new class is anchored.

### 3.4 Resolve observers

Shared helper **`lib/adminAlerts/resolveOnboardingSheetUnreadable.ts`** (new), `recoveryResolution.ts`-style (`lib/notify/detect/recoveryResolution.ts:36-77` is the template): service-role/direct-postgres conditional UPDATE, `resolved_by` stays NULL (system precedent — `recoveryResolution` sets only `resolved_at`), typed `{ kind: "ok"; resolved: boolean } | { kind: "infra_error" }` result (invariant 9), never throws. **The helper itself does NO logging** — exactly like `recoveryResolution.ts` (verified: no `log` import; it returns `infra_error` silently and the caller owns telemetry). `admin_alerts` is not an invariant-2 advisory-lock table — no lock, and both call sites are post-commit/outside any tx.

**Forensic-code contract (review R2 finding, resolved in the spec's favor):** the only durable emit either caller adds is a single `log.info` with `code: "ONBOARDING_ALERT_AUTO_RESOLVED"` on a *successful* resolve. This is deliberately `log.info`, NOT `log.warn`/`log.error`: the forensic-code AST guard `findLogErrorWarnCalls` (`tests/log/_metaAdminOutcomeContract.test.ts:317+`) collects `log.error`/`log.warn` calls ONLY, so an `info`-level code is exempt from `NEW_FORENSIC_CODES` / `NULLCODE_BATCH2_STAMPS` registration (confirmed: the guard's `visit` matches `node.expression.name.text === "error" || "warn"`). The fail-open paths introduce **NO new `log.warn`/`log.error` code** — an `infra_error` degrades silently into each caller's existing tick/response handling (guard table below), so the forensic-code registries stay untouched. This keeps the design off the entire forensic-registration surface that R2 flagged.

Two exported functions:

1. **`resolveOpenUnreadableAlertUnconditionally()`** — scan-route observer. `UPDATE public.admin_alerts SET resolved_at = now() WHERE code = 'ONBOARDING_SHEET_UNREADABLE' AND show_id IS NULL AND resolved_at IS NULL RETURNING id`. Called from the scan route's `result.outcome === "completed"` block when the hard-failed set is EMPTY (the `else` of the existing `failedIds.length > 0` branch at `route.ts:297`), in its own sibling best-effort `try/catch` (same isolation contract as the existing two emits, predecessor §3.2 "independent best-effort boundary"). Rationale for unconditional (no folder check): global dedup key semantics — "the one open row always describes the latest scan" (predecessor §3.2); a clean latest scan means no row should be open, regardless of which folder the stale row described.
2. **`resolveUnreadableAlertIfHealed(input)`** — cron observer, called from the tick epilogue (between the file-loop end at `runScheduledCronSync.ts:~3881` and `finishCompletedRun` at `:3883`), fail-open (an `infra_error` or thrown dependency NEVER fails the tick; forensic `log.warn` only). Evaluation:
   a. Fetch the open row (`code`, `show_id IS NULL`, `resolved_at IS NULL`). None → done.
   b. Read `app_settings.pending_wizard_session_id` (column cited at `lib/sync/discardStaged.ts:226`, `lib/sync/wizardSessionRollback.ts:57`). Non-null → **skip entirely** (wizard owns folder truth while a session is pending — mirrors the cron wizard-ownership skip ratified in PR #406; the scan-route observer covers that window).
   c. `context.folder_id !== ` the tick's active folder id (already resolved at `runScheduledCronSync.ts:3725`) → resolve: the row describes a folder no longer in play (stale-folder rule; prevents the D1 disconnected-folder wedge).
   d. Else, for EVERY `id` in `context.failed_drive_file_ids`, at least one of:
      - **removed** — `id ∉ listedDriveFileIds` (the tick's own listing, `runScheduledCronSync.ts:3733`); the file is gone, so it can no longer fail.
      - **registered** — a `public.shows` row with `drive_file_id = id` exists. A registered file became a live show; if its CURRENT revision hard-fails, the per-show cron path owns that (retain-last-good + `PARSE_ERROR_LAST_GOOD`, a different `show_id`-scoped alert, `runScheduledCronSync.ts:2951`), so the first-seen unreadable alert is genuinely superseded — no revision match needed.
      - **staged (current-revision)** — a LIVE `public.pending_syncs` row (`wizard_session_id IS NULL`) with `drive_file_id = id` AND `staged_modified_time = ` the listed file's `modifiedTime` (`DriveListedFile.modifiedTime`, `lib/drive/list.ts:28,64`). **The revision match is load-bearing** (review R1 finding 1): a live pending row persists until apply/discard and carries the `staged_modified_time` of whatever revision was last staged (`pending_syncs.staged_modified_time timestamptz not null`, DDL `supabase/migrations/20260501001000_internal_and_admin.sql:143`); a bare drive-file-id match would let a STALE staged row for an older, since-superseded revision prove "healed" while the file's CURRENT revision still hard-fails. Requiring `staged_modified_time == current listing modifiedTime` proves the revision now in Drive is the one staged. (`wizard_session_id IS NULL` excludes wizard-owned staged rows — those are covered by the wizard-pending skip in (b); it also matches the live-row semantics the cron uses everywhere, e.g. `runScheduledCronSync.ts:966`.)
      All satisfied → resolve. Any id still present-in-folder AND unregistered AND not-current-revision-staged → leave open (still genuinely failing).
   e. **CAS guard on `(id, last_seen_at)`** (review R1 finding 2): the resolve UPDATE is `... WHERE id = $id AND resolved_at IS NULL AND last_seen_at = $observedLastSeenAt`, where `$observedLastSeenAt` is read in step (a). The `failed_drive_file_ids`-only CAS is insufficient: the upsert full-replaces context on the one open global row while keeping the SAME failed-id array possible (different folder, same ids), so an ids-only CAS could resolve a freshly-refreshed alert using a stale observation. `last_seen_at` is bumped to `now()` on EVERY upsert conflict (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:49`, `20260505000000_upsert_admin_alert.sql:17`), so any concurrent scan that touched the row moves `last_seen_at` and fails the CAS. A lost CAS is a no-op (next tick re-evaluates fresh truth). `last_seen_at timestamptz not null` (`20260501001000_internal_and_admin.sql:274`).

**Guard conditions (observer inputs):**

| Input state | Behavior |
|---|---|
| No open row | No-op, no queries beyond the fetch. |
| `pending_wizard_session_id` non-null | Skip evaluation (wizard-owned window). |
| `context.folder_id` missing/malformed (not a string) | Treat as mismatch → resolve (row is unidentifiable — stale by definition). No new warn/error code; the successful resolve emits the single `log.info ONBOARDING_ALERT_AUTO_RESOLVED`. |
| `context.failed_drive_file_ids` missing, not an array, or empty array | Do NOT resolve (fail-open toward keeping the alert visible; an empty list on an open row is a producer bug, not proof of health). Silent no-op — no new warn/error code. |
| `failed_sheet_names` absent (row emitted by pre-this-spec code) | Irrelevant to observers (predicate reads ids only); card renders zero segments exactly as today until the next failing scan replaces context. No backfill. |
| Stale live pending row (older `staged_modified_time` than current listing) | id NOT counted as staged → alert stays open (revision-match guard, §3.4d). |
| Any DB/list dependency throws | Helper returns `infra_error` silently; tick and scan response unaffected. No new warn/error code (caller degrades quietly). |
| CAS conflict on `last_seen_at` (concurrent scan replaced context) | No-op; next tick re-evaluates fresh truth. |

**Telemetry (invariant 10 posture):** each successful resolve emits a durable `log.info` with `code: "ONBOARDING_ALERT_AUTO_RESOLVED"` (`source`: `"admin.onboarding.scan"` or `"cron/sync"`), post-commit, best-effort. App_events-only code, NOT a §12.4 row (precedent: the forensic infra code at `app/api/admin/admin-alerts/[id]/resolve/route.ts:158`, "Plain structural API code (not a §12.4 row)"). Not `REPORT_*`-prefixed (report-code namespace scanner). `log.info` level ⇒ exempt from the `log.error`/`log.warn` forensic AST guard (§3.4 above), so no `NEW_FORENSIC_CODES` registry row. It is NOT collected by the internal-code-enum extractor: `stripLogEmissionCalls` strips `log.error|warn|info|debug` AND `logAdminOutcome` calls (`lib/messages/__internal__/stripLogEmissionCalls.ts:26`, `LOG_CALL_AT` regex), so an `info`-level `code:` never reaches the enum scan — no `internal-code-enums` row for this code. The scan route is already a registered `AUDITABLE_MUTATIONS` surface (`tests/log/_auditableMutations.ts:158`); the cron library path is not a mutation-surface unit (not a route/action/`"use server"` file, per the `_metaMutationSurfaceObservability` walk over `["app","lib","components"]` `"use server"` + admin routes) — the `log.info` code satisfies the non-admin instrumentation rule for the new write.

### 3.5 Copy rewrite (§12.4 three-way lockstep)

All in ONE commit (x1 gate `tests/messages/codes.test.ts:92`): (a) master spec §12.4 table row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2959` + helpfulContext appendix entry at `:3189`; (b) `pnpm gen:spec-codes`; (c) `lib/messages/catalog.ts:2008-2021` row. Never run prettier on the master spec.

New copy (exact strings; `resolution` stays `"manual"`, `audience: "doug"`, `crewFacing: null`, severity default `warning`):

- `title`: "Some sheets couldn't be read" (unchanged).
- `dougFacing`: "Some sheets in your show folder couldn't be read, so they were skipped — the affected sheets are named on this alert. Fix or remove them in Drive and this alert clears on its own; you can also dismiss it now."
- `followUp`: "Doug → fix or remove the named sheets in Drive (live sync picks them up), or Settings → Re-run setup for the guided path; alert self-clears either way"
- `helpfulContext`: "During setup we scanned your Drive folder and found one or more files we couldn't read as a show sheet, so we skipped them — they aren't staged and won't appear on any crew page. The first few affected sheets are named on this alert. Fix the sheet's layout in Drive (most often a missing or renamed section header) or remove the file from the folder — the live sync notices on its own and this alert clears automatically. Re-running setup from Settings also works and gives a guided list. You can dismiss this alert at any time."
- `helpHref` unchanged. The dropped claim ("re-run setup to see which ones") was the predecessor's workaround for having no names; §3.35 of that spec is superseded on this point.

Regens: `pnpm gen:spec-codes` + commit (copy edit — the only change that touches generated spec-codes). `pnpm gen:internal-code-enums` is run defensively before push and committed IFF it produces a diff, but NO diff is expected: the one existing extractor-visible code (`ONBOARDING_SHEET_UNREADABLE` via `upsertAdminAlert`) is unchanged, the new forensic `ONBOARDING_ALERT_AUTO_RESOLVED` is `log.info` (stripped, §3.4), and the new `failed_sheet_names` context KEY is not a code literal. The `x2` gate's `git diff --exit-code` therefore stays green with no enum edit. No new §12.4 code rows → no x-gate family fan-out beyond x1.

### 3.6 Tier × domain completeness matrix

| Layer | Action |
|---|---|
| Table DDL / migrations | **N/A** — context is free jsonb; resolve is a plain UPDATE. No schema change, no manifest regen, no validation-project apply. |
| `upsert_admin_alert` RPC | N/A — unchanged; producer keeps the full-replace branch (no `failedKeys` key). |
| RPC write path (new) | N/A — resolves go through direct service-role SQL (recoveryResolution precedent), not a new RPC; no PostgREST DML-lockdown surface added. |
| Producer emit | `runOnboardingScan.ts` processed `name` + `scan/route.ts` context pairs (§3.1). |
| Resolve write path | New `lib/adminAlerts/resolveOnboardingSheetUnreadable.ts` + two call sites (§3.4). |
| Identity projection/render | `projectIdentityContext.ts` block + `identityTypes.ts` + `alertIdentityMap.ts` + (verify) `resolveAlertIdentities.ts` overflow (§3.2). |
| Catalog/spec prose | §3.5 lockstep. |
| Meta-tests | §3.3 lifecycle + §5 inventory below. |
| Frontend | No component changes (generic segment renderer). |
| observe CLI | No changes — `queryAlerts` already projects via `projectIdentityContext`; new field flows through the same allowlisted projection. |

### 3.7 Flag lifecycle

No new boolean flags. The one state field touched: `admin_alerts.resolved_at` — write paths now = 2 manual routes + 2 observer sites; read paths unchanged (open-row filters). `resolved_by` deliberately NULL on system resolves (distinguishes system from operator resolution in forensics; matches `recoveryResolution.ts`).

## 4. Transition inventory

Alert card states: open ↔ resolved only; no new visual states, no animation changes (resolution removes the row from open-list queries exactly as manual resolve does today). N/A beyond that — no multi-state component work.

## 5. Meta-test inventory (writing-plans handoff)

- **EXTENDS** `tests/messages/_metaAdminAlertCatalog.test.ts`: hybrid class union + registry entry + resolve-site grep coverage for hybrid + EXEMPT entry + counts.
- **EXTENDS** `tests/adminAlerts/alertIdentityMatrix.test.ts`: fixture at `:360-368` gains `failed_sheet_names` + expected segments (was global/no-segments); length anchor `:455` unchanged (45).
- **UNCHANGED anchors verified**: `_metaAlertIdentityMap.test.ts:40` (45), `_metaAlertAudienceContract.test.ts:72` (DOUG 19), parity test body.
- **Supabase call-boundary meta-registry**: the new resolve helper uses direct postgres (not a Supabase client call) — same class as `recoveryResolution.ts`, which is not in `tests/auth/_metaInfraContract.test.ts`; no registry row needed, note inline if the meta-test's scope says otherwise at plan time.
- Advisory-lock topology: untouched (no `pg_advisory*` anywhere in the diff).
- **Forensic-code registries UNTOUCHED** (review R2): `ONBOARDING_ALERT_AUTO_RESOLVED` is `log.info` (exempt from the `log.error`/`log.warn` AST guard `tests/log/_metaAdminOutcomeContract.test.ts:317+` and stripped by `stripLogEmissionCalls`), so no `NEW_FORENSIC_CODES` / `NULLCODE_BATCH2_STAMPS` / `SANCTIONED_CODES` row. The helper is silent; no `log.warn`/`log.error` code added. Declared explicitly so the plan doesn't accidentally add one.

## 6. Test plan (anti-tautology per AGENTS.md)

1. **Emit alignment**: fixture scan with 3 hard-failed files (names deliberately unsorted vs ids) → assert `failed_sheet_names[i]` matches the name of `failed_drive_file_ids[i]` for all i, derived from fixture inputs, not hardcoded strings.
2. **Clean-scan resolve**: seed open row (any folder) → completed scan, zero hard-failed → row resolved. Failure mode caught: observer wired to the wrong branch (only fires when failures exist).
3. **Cron predicate matrix** (DB-backed, each id state derived from seeded rows): all-removed / all-registered / all-current-revision-staged / mixed-satisfied → resolved; one-still-failing → NOT resolved; folder-mismatch → resolved regardless of ids; wizard-pending → untouched even when all ids satisfied; empty/missing ids array → untouched. Two negative regressions pinned by review R1:
   - **stale-staged (finding 1)**: seed a LIVE `pending_syncs` row for a failed id whose `staged_modified_time` is OLDER than the listing's `modifiedTime` for that id (still present in folder, unregistered) → alert MUST stay open. Also assert the positive twin: same row with `staged_modified_time == modifiedTime` → resolves.
   - **same-id replacement race (finding 2)**: read the open row, then replace its context via the upsert (same `failed_drive_file_ids`, different folder_id, bumping `last_seen_at`) BEFORE the resolve UPDATE → CAS on `last_seen_at` must make the UPDATE a no-op (row stays open).
   Assert on `resolved_at` in the DB row, never on "helper was called".
4. **Manual path regression**: `isAutoResolving("ONBOARDING_SHEET_UNREADABLE")` false; global resolve route 200-resolves it (no 409); button not suppressed (existing component tests' fixtures extended, sentinel-safe).
5. **Identity render**: 5-name context → exactly 3 name segments + "+2 more"; 0/absent names → zero segments (legacy row); names pass through sanitizer (token-like string in a name gets redacted — proves the block uses the shared helpers).
6. **Lockstep gates**: x1 catalog parity, x2 enums diff, copy-ban EXEMPT justified, lifecycle counts.
7. **Full suite + typecheck + eslint + format:check before push** (worktree memory rules).

## 7. Watchpoints (adversarial-review preempts — EXPLICITLY DO NOT RELITIGATE)

- **Hybrid class vs alert-resolve-truthing binary model**: user-ratified D1/D3 (this spec §2). The parity test's `"auto" ? "auto" : "manual"` mapping is deliberately reused, not weakened; hybrid still pins resolveSites structurally.
- **Manual-button retention**: ratified over strict-auto (D1). The strict reading of "should only resolve once removed" loses the deliberately-kept-file and disconnected-folder escape hatches.
- **Unconditional clean-scan resolve (no folder check)**: follows the ratified global-dedup-key semantics of the predecessor spec §3.2 ("one open row always describes the latest scan").
- **`resolved_by` NULL on system resolves**: `recoveryResolution.ts:50-52` precedent.
- **No notify/email fan-out**: ratified out of scope (§2).
- **Empty-ids row not auto-resolved**: fail-open toward visibility is the project's alert posture (fail-visible, `lib/adminAlerts/audience.ts:60-62` comment).
- **Staged predicate requires current-revision match** (review R1 finding 1, resolved): a bare drive-file-id `pending_syncs` match is a false-heal vector; §3.4d requires `wizard_session_id IS NULL AND staged_modified_time == listing modifiedTime`.
- **CAS on `last_seen_at`, not `failed_drive_file_ids`** (review R1 finding 2, resolved): full-context-replace can keep the same ids under a different folder; the id-array CAS is insufficient. §3.4e.
- **Forensic-code registration** (review R2, resolved in spec's favor): the auto-resolve emit is `log.info` (AST-guard-exempt + `stripLogEmissionCalls`-stripped) and the helper is silent — no forensic-registry row, no internal-code-enum diff, no §12.4 row. §3.4/§3.5. If a reviewer wants it at `warn`/`error`, that would pull in `NEW_FORENSIC_CODES` registration — deliberately avoided by using `info` for a benign success signal.
