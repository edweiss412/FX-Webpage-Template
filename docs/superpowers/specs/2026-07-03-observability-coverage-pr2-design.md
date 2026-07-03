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
`finalize/route.ts` `processApprovedRow` demote branches → one log per blocked row carrying `code` + `driveFileId` (column) + `wizardSessionId` (context):
- `DRIVE_FETCH_FAILED` (~:708-716) → **`log.error`** (infra).
- `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` (~:718-726), `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` (~:728-741, :785-798, :846-859), `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED` (~:865-881), `STAGED_REVIEW_ITEMS_CORRUPT` (~:903-914) → **`log.warn`** (expected/recoverable staleness).
`finalize-cas/route.ts` `applyShadow` retained rows → emit at the collection loop (~:786-791) one `log.warn` per `result.code !== "OK"` carrying the row's code (`STAGED_PARSE_OUTDATED_AT_PHASE_D`, parse-source code, `SHOW_ARCHIVED_IMMUTABLE`, etc.) + `driveFileId` + `wizardSessionId`.
- Registry: **none** — all codes are existing catalog producers, reused inside log spans (strip-exempt; do NOT add to `NEW_FORENSIC_CODES`).
- **Guard (do NOT touch):** the 409 concurrency guards (`finalize-cas` :709/713/720/724/726/731/736/746/795/804; `finalize` :1100/1104/1108/1112/1153) — intentionally unlogged per #218.
- **Placement:** the demote branches are the terminal per-row decision (post the per-row work); emit there (not post-whole-batch), so a mixed batch logs each failed row individually. Confirm none is inside an uncommitted-rollback window.

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

- **New SANCTIONED_CODES:** `ADMIN_ALERT_RESOLVED`, `PENDING_INGESTION_DISCARDED`, `PENDING_INGESTION_DEFERRED`, `PENDING_INGESTION_IGNORED`, `SHEET_RESCANNED`, `FINALIZE_CLEANUP_DONE`. **New NEW_FORENSIC_CODES (log.error):** `ADMIN_ALERT_RESOLVE_FAILED`, `RESCAN_INFRA_ERROR` (reuse `DATA_QUALITY_INFRA_ERROR`).
- **Registry placement note (load-bearing):** `_metaAdminOutcomeContract` Assertion 1 reads the **route file** listed in `AUDITABLE_MUTATIONS` for the `"CODE"` literal + `await logAdminOutcome(`. `defer_until_modified`/`permanent_ignore` are thin re-exports delegating to `handleWizardPendingIngestionAction` (`pending-ingestions/[id]/retry/route.ts`). Two options — decided in the plan: **(a)** instrument in the shared handler AND register `retry/route.ts` in `AUDITABLE_MUTATIONS` with the code(s) (Assertion 1 passes since the string is in that file), OR **(b)** pass the outcome code as a parameter so the literal appears in each route file. Prefer (a) if the shared handler branches on action → carries all three code literals; else (b). The reused `STAGE_DISCARDED` row already exists for the onboarding discard file — the live `show/staged/[stagedId]/discard` needs its own row.

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
1. `app/api/realtime/subscriber-token/route.ts:162` → `REALTIME_JWT_SECRET_TOO_SHORT` (also: `showIdFromSlug` infra ~:71→:81 is a fully-silent 500 → add a `log.error` `REALTIME_TOKEN_SHOW_LOOKUP_FAILED`).
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
- **Fail-open:** every new `logAdminOutcome`/`log.*` that could throw is either already inside the route's outer try or wrapped so a logging fault never breaks the mutation/response (mirror the existing `try { await logAdminOutcome } catch {}` idiom where the route lacks an outer guard).
- **Actor privacy:** `actorEmail` only where an admin identity exists (`requireAdminIdentity`), already `canonicalize`d; `hashForLog` is the only email→log path; the public unpublish leg carries no actor.
- **No behavior change:** every change is a pure add of a log emission (or a `code` field on an existing emission); no control-flow, response, or status-code change.

## Out of scope (deferred — explicit)

- **The remaining 47 null-code `error`/`warn` sites** (RSC page loaders `app/admin/show/[slug]/page.tsx`, asset routes, `lib/admin/load*`, `withCronRunSummary:106/107`, the never-empty-500 finalize wrappers, staged apply/approve/discard/unapprove, `admin/actions.ts`, manifest ignore, reap-stale, scan, ignored-sheets unignore, `observe/client-error`, `selectIdentity`) → **BACKLOG batch** (`BL-NULLCODE-STAMP-BATCH-2`). They persist today (error/warn always persist); only groupability is deferred. The full list is enumerated in the citation brief. Some (`app/admin/show/[slug]/page.tsx`) are `app/`-non-api UI files → subject to the UI-Opus rule and out of this backend PR.
- **S8 option B** (user-facing data-quality catalog code) → BACKLOG (requires product decision on surfacing malformed links to Doug + the 3-way + 4 gates).
- **DB CHECK constraints on empty `drive_file_id`** and the empty-id **write path** → PR-1 BACKLOG (unchanged).
- **The wizard `retry` action's silent success** in `handleWizardPendingIngestionAction` (adjacent to defer/ignore) → fold in with S3's shared-handler instrumentation if trivial, else note.

## Watchpoints (pre-load for review)

- **Every new code is strip-exempt forensic** (inside a log/logAdminOutcome span). The ONLY registry is `_metaAdminOutcomeContract.test.ts` (outcome→AUDITABLE_MUTATIONS+SANCTIONED; error/warn→NEW_FORENSIC_CODES). No §12.4, no admin-alert catalog, no `_families`, no emphasis, no `trustDomains` (all routes pre-registered). Do not relitigate as needing catalog work.
- **S2 reuses existing catalog codes** — they must NOT be added to `NEW_FORENSIC_CODES` (Assertion 4 would then wrongly flag legitimate producers).
- **Registry Assertion 1 is a text-scan of the route file** — for the delegating defer/ignore routes, the `"CODE"` literal + `await logAdminOutcome(` must appear in the file registered in `AUDITABLE_MUTATIONS` (shared-handler-registered OR literal-in-each-route). Decided in the plan.
- **POST-COMMIT placement** is load-bearing (#218) — logging inside a tx callback logs a not-yet-committed success; idempotent/409 paths stay unlogged.
- **S7 is scoped to 8 sites**, not all 55 — a deliberate reviewability decision; the rest is a documented BACKLOG batch, not an oversight.
