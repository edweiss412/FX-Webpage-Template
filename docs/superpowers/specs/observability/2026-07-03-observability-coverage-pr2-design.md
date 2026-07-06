# Observability coverage PR-2 — silent-surface instrumentation — design

**Date:** 2026-07-03
**Branch:** `fix/observability-coverage-pr2` (worktree off `origin/main` @ 2e235e14, includes PR-1 #239)
**Origin:** Observability audit #4. PR-2 of two (PR-1 #239 = the HIGH empty-id/attribution incident). This PR closes the remaining MED/LOW coverage gaps: durable app_events on outcomes that currently return/throw silently.

## Problem

The audit found surfaces that mutate state or hit infra faults but emit **no durable `app_events` row**, so an operator can't reconstruct who/when/why from telemetry:

1. **Public show-unpublish** (`app/api/show/[slug]/unpublish/route.ts`) — a live show is archived via an emailed link with zero forensic actor record (success **and** the 503 infra catch both silent).
2. **finalize/finalize-cas per-row hard-fails** — `demotePending`/shadow-retain branches persist a failure code to `pending_syncs`/SSE but emit no `app_events`, so a mixed-batch finalize logs only the successes; the failed rows (incl. the infra fault `DRIVE_FETCH_FAILED`) are invisible.
3. **~9 admin-mutation POSTs** silent on success and/or their infra catch (inconsistent with logging siblings like `pending-ingestions/[id]/retry`).
4. **OAuth callback session-exchange leg** logs neither success nor its 503 infra faults.
5. **`enrichAgenda:391`** outer-catch omits `code` (ungroupable null-code row).
6. **agenda-extract route 504-timeout** branch emits no durable row while every sibling terminal does.
7. **55 null-code `error`/`warn` sites** (they persist but are ungroupable) — stamp the 8 highest-value auth-boundary ones now.
8. **Malformed `agenda_links`** (a `url` that is a bare filename, no resolvable `fileId`) are skipped silently at `enrichAgenda:137`.

## Design principle: strip-exempt forensic codes (no §12.4)

Every code introduced here lives **inside** a `log.{error,warn,info}(...)` or `logAdminOutcome(...)` span, so `stripLogEmissionCalls` removes it before the §12.4 producer scan (`PRODUCER_RE`, `lib/messages/__internal__/codeProducers.ts`) — **no catalog / `gen:spec-codes` / `code-scenarios` / `_families` / emphasis work.** The one governing gate is the forensic registry `tests/log/_metaAdminOutcomeContract.test.ts`:

- **New `logAdminOutcome` codes** → add a row to `AUDITABLE_MUTATIONS` (`{file, code}`) and the `SANCTIONED_CODES` set (Assertion 1 checks the file imports+awaits `logAdminOutcome` and contains `"CODE"`; Assertion 3 checks SHOUTY + every sanctioned code used).
- **New `log.error`/`log.warn`/`log.info(code)` forensic codes** → add to `NEW_FORENSIC_CODES` (Assertion 4 leak-checks they stay OUT of the §12.4 producer set).
- **Reused existing catalog codes** (Surface 2) → do NOT add to `NEW_FORENSIC_CODES` (they are legitimate producers via their catalog site).

**#218 placement rule (mandatory):** `logAdminOutcome` is emitted **POST-COMMIT** — hoist an `outcome` ref inside the tx callback (`withTx`/`withRowTryLock`/`withRowTx`), and `await logAdminOutcome(...)` only **after** the wrapper resolves (a committed mutation), never inside the callback (which would log a success a later commit-failure rolls back) and never fire-and-forget (a Server Action can freeze before the async persist completes). Idempotent re-poll returns (already-done) and 409 concurrency guards remain **unlogged** (they commit nothing).

## Surface-by-surface (exact instrumentation)

Each entry: **CODE** · call · placement · registry.

### S1 — `app/api/show/[slug]/unpublish/route.ts`
- **`SHOW_UNPUBLISHED_VIA_EMAILED_LINK`** — `await logAdminOutcome({ code, source: "api.show.unpublish", showId: result.showId })` (no `actorEmail` — public/emailed-link leg, no admin identity). Placement: the `result.outcome === "success"` branch (~:51), POST-COMMIT (`unpublishShowViaEmailedLink` owns its lock/tx and has committed when it resolves). Do NOT reuse `SHOW_UNPUBLISHED` (catalog + Doug admin_alert) or `SHOW_UNPUBLISHED_BY_ADMIN` (wrong actor).
- **`UNPUBLISH_INFRA_FAILED`** — `log.error("unpublish link consume threw", { source: "api.show.unpublish", code, error })` in the 503 catch (~:42-44).
- Registry: `AUDITABLE_MUTATIONS` + `SANCTIONED_CODES` (SHOW_UNPUBLISHED_VIA_EMAILED_LINK); `NEW_FORENSIC_CODES` (UNPUBLISH_INFRA_FAILED). Route adds `import { log } from "@/lib/log"` + `logAdminOutcome`.
- **Guard:** expired(400)/not_found(404)/missing-token(404) stay unlogged (expected outcomes, not faults).

### S2 — finalize / finalize-cas per-row hard-fails (REUSE catalog codes)

**POST-COMMIT flush (mandatory #218 shape — resolves the rollback-window risk).** The `demotePending(...)` calls run INSIDE the per-row tx (finalize/route.ts:698 comment: "NEVER inside this per-row tx (pre-commit = stale)"). Logging AT those call sites would persist an `app_events` failure row for a demotion that a later batch commit-fault could roll back. Instead, mirror the EXISTING `SHOW_FINALIZED` OUTCOME-REF pattern (finalize/route.ts:1085-1090): the per-row terminal codes are already collected in `perRow: PerRowResult[]` (`hasPerRowFailures = input.perRow.some(row => row.code !== OK_CODE)`, :667-669). **Emit the per-row failure logs at the same POST-COMMIT block where `SHOW_FINALIZED` is emitted — after `deps.withTx` resolves — iterating the committed `input.perRow` for `row.code !== OK_CODE`.** Because a post-callback commit fault throws out of `withTx` into the outer catch (typed 500) and never reaches this post-commit block, a rolled-back batch logs neither `SHOW_FINALIZED` nor any per-row failure — exactly the required semantics.
- Per-row emit (POST-COMMIT, one per committed failed row, carrying `code` + `driveFileId` column + `wizardSessionId` context): `DRIVE_FETCH_FAILED` → **`log.error`** (infra); `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` / `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` / `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED` / `STAGED_REVIEW_ITEMS_CORRUPT` → **`log.warn`** (recoverable staleness). Branch on `row.code` to pick error-vs-warn (a small map: `DRIVE_FETCH_FAILED` → error, else → warn).
- `finalize-cas/route.ts` `applyShadow`: identically, the retained/blocked rows carry their code in the collected `shadowResults`/`per_row` set; emit each `code !== "OK"` at the finalize-cas POST-COMMIT flush (after its committing wrapper resolves) — NOT at the shadow-validation return sites (which are pre-commit) — using the **SAME shared severity map** as finalize (`code === "DRIVE_FETCH_FAILED"` → `log.error`, else `log.warn`). In practice finalize-cas's shadow-validation path emits staleness codes (`STAGED_PARSE_OUTDATED_AT_PHASE_D`, parse-source code, `SHOW_ARCHIVED_IMMUTABLE`) → `log.warn`; routing through the shared map means if `DRIVE_FETCH_FAILED` ever reaches this path it is correctly an `log.error`, not under-classified. Extract the map to one shared helper (`severityForFinalizeRowCode(code)`) used by both routes.
- Registry: **none** — all codes are existing catalog producers, reused inside log spans (strip-exempt; do NOT add to `NEW_FORENSIC_CODES`).
- **Guard (do NOT touch):** the 409 concurrency guards (`finalize-cas` :709/713/720/724/726/731/736/746/795/804; `finalize` :1100/1104/1108/1112/1153) — intentionally unlogged per #218. These never reach the per-row flush (they short-circuit before the committing wrapper).
- **Fail-open:** the post-commit emit loop is best-effort (`try { await log.* } catch {}`), like the existing `SHOW_FINALIZED` emit — a logging fault must not turn a committed finalize into a 500.

### S3 — ~9 admin-mutation POSTs
New `logAdminOutcome` on committed success (POST-COMMIT) + `log.error` on infra catch. Correction: data-quality ignore/unignore **already log success** — only their catch is a gap.

| Route file | outcome code (POST-COMMIT) | infra log.error code |
|---|---|---|
| `app/api/admin/admin-alerts/[id]/resolve/route.ts` | `ADMIN_ALERT_RESOLVED` (actorEmail, showId:null) at the real-mutation return (~:127; skip idempotent :113) | `ADMIN_ALERT_RESOLVE_FAILED` (wrap the `withTx` ~:93) |
| `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` | `ADMIN_ALERT_RESOLVED` (showId:`show.id`) (~:128; skip idempotent :112) | `ADMIN_ALERT_RESOLVE_FAILED` |
| `app/api/admin/show/[slug]/data-quality/ignore/route.ts` | (already `WARNING_IGNORED` :122) | `DATA_QUALITY_INFRA_ERROR` (reuse) in catch :113-115 |
| `app/api/admin/show/[slug]/data-quality/unignore/route.ts` | (already `WARNING_UNIGNORED` :119) | `DATA_QUALITY_INFRA_ERROR` in catch :111-113 |
| `app/api/admin/pending-ingestions/[id]/discard/route.ts` | `PENDING_INGESTION_DISCARDED` (actorEmail, driveFileId) POST-`withRowTryLock` (~after :123) | `log.error` on throw |
| `app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified` + `.../permanent_ignore` | `PENDING_INGESTION_DEFERRED` / `PENDING_INGESTION_IGNORED` — see placement note below | `log.error` on non-rollback rethrow |
| `app/api/admin/onboarding/rescan-sheet/route.ts` | `SHEET_RESCANNED` gated `result.status==="updated"`, POST-`run` (~:91) | `RESCAN_INFRA_ERROR` (wrap `run()` ~:90) |
| `app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts` | `FINALIZE_CLEANUP_DONE` (actorEmail) POST-commit (~after :222) | `log.error` before `throw error` (~:243) |
| `app/api/admin/show/staged/[stagedId]/discard/route.ts` | `STAGE_DISCARDED` (reuse) POST-`discardStaged` (actorEmail, driveFileId) (~:81) | `log.error` on throw |

- **Code novelty (verified — all genuinely NEW forensic outcome codes, NOT in `catalog.ts` nor already-sanctioned):** `ADMIN_ALERT_RESOLVED`, `PENDING_INGESTION_DISCARDED`, `PENDING_INGESTION_DEFERRED`, `PENDING_INGESTION_IGNORED`, `SHEET_RESCANNED`, `FINALIZE_CLEANUP_DONE` → add to `AUDITABLE_MUTATIONS` (with their route file) + `SANCTIONED_CODES`. `STAGE_DISCARDED`, `WARNING_IGNORED`, `WARNING_UNIGNORED`, `DATA_QUALITY_INFRA_ERROR` are REUSED (already sanctioned/existing). **`PENDING_INGESTION_RETRIED` is REUSED** — it is ALREADY in `SANCTIONED_CODES` (and the LIVE `pending-ingestions/[id]/retry` route's `AUDITABLE_MUTATIONS` row); the wizard shared-handler file gets a NEW `AUDITABLE_MUTATIONS` row that also uses it, but NO new `SANCTIONED_CODES` entry (Assertion 3: code ∈ SANCTIONED ✓, and it stays "used ≥1 route" ✓).
- **Every S3 infra-catch `log.error` code named + classified (all NEW forensic → `NEW_FORENSIC_CODES`; none cataloged):** `admin-alerts/[id]/resolve` + `show/[slug]/alerts/[id]/resolve` → `ADMIN_ALERT_RESOLVE_FAILED`; data-quality ignore/unignore catches → `DATA_QUALITY_INFRA_ERROR` (REUSED existing); `pending-ingestions/[id]/discard` → `PENDING_INGESTION_DISCARD_FAILED`; wizard shared handler (defer/ignore/retry) non-rollback rethrow → `PENDING_INGESTION_ACTION_FAILED` (single code; the action is in the log context); `rescan-sheet` → `RESCAN_INFRA_ERROR`; `cleanup-abandoned-finalize` → `FINALIZE_CLEANUP_FAILED`; `show/staged/[stagedId]/discard` → `STAGE_DISCARD_FAILED`. So **`NEW_FORENSIC_CODES` additions from S3:** `ADMIN_ALERT_RESOLVE_FAILED`, `RESCAN_INFRA_ERROR`, `PENDING_INGESTION_DISCARD_FAILED`, `PENDING_INGESTION_ACTION_FAILED`, `FINALIZE_CLEANUP_FAILED`, `STAGE_DISCARD_FAILED`.
- **Registry placement — SETTLED (not deferred to the plan):** `_metaAdminOutcomeContract` Assertion 1 text-scans the **route file** listed in `AUDITABLE_MUTATIONS` for the `"CODE"` literal + `await logAdminOutcome(`. `defer_until_modified`/`permanent_ignore` are thin re-exports of `handleWizardPendingIngestionAction`, **defined in `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:534`** (verified). **Instrument all three wizard actions IN that shared handler** (emitting `PENDING_INGESTION_DEFERRED` / `PENDING_INGESTION_IGNORED` on the deferred/ignored committed returns, and `PENDING_INGESTION_RETRIED` on the wizard-retry committed return — that wizard-retry success is currently silent, a bonus fix), POST-COMMIT after `withRowTx` resolves, and **register `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` in `AUDITABLE_MUTATIONS`** for `PENDING_INGESTION_DEFERRED` + `PENDING_INGESTION_IGNORED` + `PENDING_INGESTION_RETRIED` (all three literals live in that file → Assertion 1 passes). The thin `defer_until_modified`/`permanent_ignore` route files are NOT separately registered. NOTE: the DISTINCT `app/api/admin/pending-ingestions/[id]/retry/route.ts` (LIVE, already registered for `PENDING_INGESTION_RETRIED`) is unchanged. The live `show/staged/[stagedId]/discard/route.ts` gets its own `STAGE_DISCARDED` `AUDITABLE_MUTATIONS` row (distinct file from the already-registered onboarding staged discard).
- **Fail-open (mandatory for EVERY S3 emission — explicit wrap):** each new `log.error` inside an existing `catch` AND each post-commit `logAdminOutcome` is **explicitly** wrapped `try { await ... } catch {}` at its callsite — **even when it sits inside a route `try`** — so a logger throw can never be caught by the route's own `catch` and turn a committed mutation into a 500 (or replace the original error response). See the global Fail-open invariant.

### S4 — `app/auth/callback/route.ts` (all log.error/info, strip-exempt)
- `OAUTH_CLIENT_CONSTRUCTION_FAILED` — log.error, createSupabaseServerClient catch (~:171-177, 503).
- `OAUTH_EXCHANGE_THREW` — log.error, exchangeCodeForSession catch (~:179-185, 503).
- `OAUTH_EXCHANGE_REJECTED` — log.error carrying `error: exchangeResult.error` at the `exchangeResult.error` branch (~:186-190); the user-facing `OAUTH_STATE_INVALID` redirect is unchanged.
- `OAUTH_IS_ADMIN_INFRA_ERROR` — log.error, is_admin `infra_error` branch (~:203-216, 503).
- `OAUTH_SIGN_IN_SUCCEEDED` — `log.info(code, { source: "auth.callback", actorHash: hashForLog(canonicalEmail) })` on successful session establishment (persists via info+code; hashed email, never raw).
- Registry: all 5 → `NEW_FORENSIC_CODES`.

### S5 — `lib/sync/enrichAgenda.ts:391`
Add `code: "AGENDA_ENRICH_THREW"` to the existing `log.error("threw (link left as-is)", { source, spreadsheetId, error })`. Registry: `NEW_FORENSIC_CODES`.

### S6 — agenda-extract 504 (`.../extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`)
`log.warn("agenda extract timed out", { source: "api.admin.onboarding.extractAgenda", code: "AGENDA_EXTRACT_TIMEOUT", driveFileId, wizardSessionId, deadlineMs })` immediately before the `{status:"timeout"},504` return (~:354). Registry: `NEW_FORENSIC_CODES`.

### S7 — 8 auth-boundary null-code stamps (of 55; rest deferred → out of scope)
Stamp `code` on the existing `log.error`/`log.warn` at each:
1. `app/api/realtime/subscriber-token/route.ts:162` → stamp `code: "REALTIME_JWT_SECRET_TOO_SHORT"` on the existing emission. Also: `showIdFromSlug` infra (~:71→:81) is a fully-silent 500 → add a NEW `log.error` `REALTIME_TOKEN_SHOW_LOOKUP_FAILED` **inside the existing failure branch, best-effort (`try { await log.error } catch {}`), with NO change to the 500 status/body**.
2. `app/auth/callback/route.ts:84` → `OAUTH_GETUSER_FAILED`.
3. `app/auth/callback/route.ts:122` → `OAUTH_CLAIM_ALERT_FAILED`.
4. `app/api/auth/picker-bootstrap/route.ts:84` → `PICKER_BOOTSTRAP_RESOLVE_ALERT_FAILED`.
5. `app/api/auth/picker-bootstrap/route.ts:105` → `PICKER_BOOTSTRAP_CLAIM_ALERT_FAILED`.
6. `app/auth/sign-out/route.ts:104` **and** `:109` → `AUTH_SIGNOUT_FAILED` (both arms, same code).
7. `app/api/admin/sync/[slug]/route.ts:29,44,49` → `SYNC_SLUG_LOOKUP_FAILED`.
8. `app/api/admin/staged/[fileId]/apply/route.ts:30,41,45` → `LIVE_STAGED_APPLY_LOOKUP_FAILED`.
Registry: all → `NEW_FORENSIC_CODES`.

### S8 — `lib/sync/enrichAgenda.ts:137` malformed agenda link (forensic, option A)
`log.warn("agenda link has no resolvable fileId", { source: "sync.enrichAgenda", code: "AGENDA_LINK_UNRESOLVED", spreadsheetId, ordinal: i, label: link.label })` immediately before the `if (!link.fileId) continue;`. Registry: `NEW_FORENSIC_CODES`. (Option B — a user-facing data-quality catalog code — is deliberately NOT chosen: expensive 3-way + gates for a low-value signal.)

## Guard conditions & invariants

- **Invariant 5 (no raw error codes in UI):** untouched — all codes are forensic/log-only; no user-visible copy path.
- **Invariant 9 (Supabase call-boundary):** every new `log.error`/`logAdminOutcome` is additive; the underlying Supabase calls are unchanged. No new `{data,error}` destructure surfaces.
- **Scanner-safety / §12.4:** every code sits inside a stripped `log.*`/`logAdminOutcome` span; no new `code:"SHOUTY"` reaches `PRODUCER_RE`; no catalog/`gen:*` work. Assertion 4 pins this.
- **Advisory-lock topology:** untouched (no `pg_advisory*` edits; logs are outside the lock windows — POST-COMMIT).
- **Fail-open (mandatory, all surfaces — EXPLICIT wrap at every callsite):** every NEW emission that could throw — post-commit `logAdminOutcome` AND every catch-side `log.error`/`log.warn` — is **explicitly** wrapped `try { await log.* } catch {}` **at its own callsite**. Do NOT rely on any surrounding route `try`: a post-commit `logAdminOutcome` placed inside a route's outer `try` whose logger throws would be caught by that route's OWN `catch` and replace an already-committed-success response with an infra 500 — the exact behavior-change this PR forbids. A logging fault must NEVER change a route's control flow, response body, or status code. This explicit-wrap rule is the operative guarantee behind the "pure add, no behavior change" claim, and applies uniformly to S1–S8 (the S2 post-commit flush loop and the S4/S5/S6/S7/S8 catch-side emissions included). **Code-stamp vs new emission:** where the change merely ADDS a `code:` field to an ALREADY-EXISTING `log.error`/`log.warn` call (most of S5 and the code-stamp items of S7), that is a pure field-add — it does NOT alter the existing emission's throw posture (already-awaited/already-wrapped as it was), so no new wrapping is introduced and none is required; the explicit-wrap rule governs only the NEWLY-ADDED emissions (S1–S4, S6, S8, and the two fully-silent new emissions in S7). No existing emission's fail-open behavior is changed.
- **Actor privacy:** pass the canonical admin email (`requireAdminIdentity`, already `canonicalize`d) ONLY to `logAdminOutcome`, which hashes it via `hashForLog` before persistence — no raw email is ever written to a log field, and no callsite hashes directly. The public unpublish leg carries no actor (no admin identity).
- **No behavior change:** every change is a pure add of a log emission (or a `code` field on an existing emission); no control-flow, response, or status-code change.

## Out of scope (deferred — explicit)

- **The remaining 47 null-code `error`/`warn` sites** (RSC page loaders `app/admin/show/[slug]/page.tsx`, asset routes, `lib/admin/load*`, `withCronRunSummary:106/107`, the never-empty-500 finalize wrappers, staged apply/approve/discard/unapprove, `admin/actions.ts`, manifest ignore, reap-stale, scan, ignored-sheets unignore, `observe/client-error`, `selectIdentity`) → **BACKLOG batch** (`BL-NULLCODE-STAMP-BATCH-2`). They persist today (error/warn always persist); only groupability is deferred. The full list is enumerated in the citation brief. Some (`app/admin/show/[slug]/page.tsx`) are `app/`-non-api UI files → subject to the UI-Opus rule and out of this backend PR.
- **S8 option B** (user-facing data-quality catalog code) → BACKLOG (requires product decision on surfacing malformed links to Doug + the 3-way + 4 gates).
- **DB CHECK constraints on empty `drive_file_id`** and the empty-id **write path** → PR-1 BACKLOG (unchanged).
- (The wizard `retry` action's silent success is **NOT** deferred — it is IN SCOPE under S3: the shared `handleWizardPendingIngestionAction` instruments all three wizard actions defer/ignore/**retry**, emitting the reused `PENDING_INGESTION_RETRIED` on the committed retry return.)

## Watchpoints (pre-load for review)

- **Every new code is strip-exempt forensic** (inside a log/logAdminOutcome span). The ONLY registry is `_metaAdminOutcomeContract.test.ts` (outcome→AUDITABLE_MUTATIONS+SANCTIONED; error/warn→NEW_FORENSIC_CODES). No §12.4, no admin-alert catalog, no `_families`, no emphasis, no `trustDomains` (all routes pre-registered). Do not relitigate as needing catalog work.
- **S2 reuses existing catalog codes** — they must NOT be added to `NEW_FORENSIC_CODES` (Assertion 4 would then wrongly flag legitimate producers).
- **Registry Assertion 1 is a text-scan of the route file — SETTLED (single source):** the shared-handler file `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` is the registered `AUDITABLE_MUTATIONS` file (carries the `PENDING_INGESTION_DEFERRED`/`_IGNORED`/`_RETRIED` literals + `await logAdminOutcome`); the thin `defer_until_modified`/`permanent_ignore` route files are NOT registered. (Not "decided in the plan" — see S3.)
- **POST-COMMIT placement** is load-bearing (#218) — logging inside a tx callback logs a not-yet-committed success; idempotent/409 paths stay unlogged.
- **S7 is scoped to 8 sites**, not all 55 — a deliberate reviewability decision; the rest is a documented BACKLOG batch, not an oversight.
