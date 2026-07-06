# Observability coverage PR-2 — implementation plan

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit. Steps use `- [ ]`.

**Goal:** Add durable `app_events` on the 8 currently-silent/null-code observability surfaces (audit #4 PR-2). Pure ADD of logging — no control-flow/response/status change.

**Architecture:** `logAdminOutcome` (POST-COMMIT, explicitly best-effort) on admin-mutation successes; `log.error`/`log.warn` (best-effort) on infra faults + the finalize per-row POST-COMMIT flush; `code:` stamps on existing null-code emissions. Every code is strip-exempt forensic (no §12.4). The one registry is `tests/log/_metaAdminOutcomeContract.test.ts`.

**Tech Stack:** TypeScript (strict, exactOptional), Next.js 16, Vitest, Supabase.

**Spec:** `docs/superpowers/specs/observability/2026-07-03-observability-coverage-pr2-design.md` (Codex-APPROVE'd, 4 rounds) — the file:line-precise source of truth for every surface. This plan is the task/test decomposition; consult the spec for each surface's exact codes + placement.

## Global Constraints (from spec)

- **Strip-exempt forensic:** every new code lives inside a `log.*()`/`logAdminOutcome()` span → no §12.4/catalog/`gen:*`/`_families`/emphasis. Registry = `_metaAdminOutcomeContract.test.ts` only: `logAdminOutcome` codes → `AUDITABLE_MUTATIONS` + `SANCTIONED_CODES`; `log.error/warn/info(code)` codes → `NEW_FORENSIC_CODES`; reused catalog codes → NEITHER.
- **POST-COMMIT (#218):** `await logAdminOutcome` only after the committing wrapper (`withTx`/`withRowTryLock`/`withRowTx`) resolves; never inside the callback; never fire-and-forget. 409/idempotent paths unlogged.
- **Fail-open (EXPLICIT):** every NEW emission wrapped `try { await log.* } catch {}` at its own callsite (never rely on a surrounding route `try`). Code-stamps on EXISTING emissions are pure field-adds (no wrap change).
- **No behavior change:** no status/body/control-flow change; actor email only via `logAdminOutcome` (hashes internally); no raw email logged.
- **Commit per task**, conventional-commits. Run the FULL suite before push (source-scanning meta-tests).

## Test patterns

- **logAdminOutcome success (S1, S3):** the registry `AUDITABLE_MUTATIONS` row IS a failing structural test (Assertion 1 fails until the route imports+awaits `logAdminOutcome` with the `"CODE"` literal). PLUS a behavioral test with `setLogSink` capture: exercise the committed-success path (mock deps so the tx resolves) → assert one captured record with `source`+`code`; exercise the infra-catch → assert the `log.error` code; assert idempotent/409 paths emit NOTHING.
- **log.error/warn forensic (S2, S4-S8):** `setLogSink` capture — drive the fault/terminal branch (dep-injected throw / timeout / malformed input) → assert a record with the expected `code`+`source`; add the code to `NEW_FORENSIC_CODES` (Assertion 4 then guards it stays out of the §12.4 producer set).
- **Anti-tautology:** each behavioral test must exercise the REAL branch (not just assert the string exists); the negative case (idempotent/409/happy-path) must assert NO spurious emission.

---

### Task 1 — S1 public unpublish
**Files:** `app/api/show/[slug]/unpublish/route.ts`; registry `tests/log/_metaAdminOutcomeContract.test.ts`; test `tests/api/show/unpublish-telemetry.test.ts` (new).
- [ ] Test: register `{file:"app/api/show/[slug]/unpublish/route.ts", code:"SHOW_UNPUBLISHED_VIA_EMAILED_LINK"}` in `AUDITABLE_MUTATIONS` + add to `SANCTIONED_CODES`; add `UNPUBLISH_INFRA_FAILED` to `NEW_FORENSIC_CODES`. Behavioral: success→captured `SHOW_UNPUBLISHED_VIA_EMAILED_LINK` (showId, no actorEmail); 503-catch→`UNPUBLISH_INFRA_FAILED`; expired(400)/404→no emission. Run → FAIL.
- [ ] Impl per spec S1: import `log`+`logAdminOutcome`; `await logAdminOutcome({code:"SHOW_UNPUBLISHED_VIA_EMAILED_LINK", source:"api.show.unpublish", showId:result.showId})` POST-COMMIT in the success branch, wrapped `try{}catch{}`; `try{ await log.error("unpublish link consume threw",{source:"api.show.unpublish", code:"UNPUBLISH_INFRA_FAILED", error}) }catch{}` in the 503 catch. Run → PASS.
- [ ] Commit `feat(show): durable telemetry on public unpublish (outcome + infra fault)`.

### Task 2 — S2 finalize / finalize-cas per-row POST-COMMIT flush
**Files:** `app/api/admin/onboarding/finalize/route.ts`, `finalize-cas/route.ts`, a shared `severityForFinalizeRowCode` helper; test `tests/api/onboarding/finalize-perrow-telemetry.test.ts`.
- [ ] Test: dep-injected mixed batch (1 applied + rows failing `DRIVE_FETCH_FAILED` and `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`) → after commit, assert `SHOW_FINALIZED` (success, existing) AND one `log.error` `DRIVE_FETCH_FAILED` + one `log.warn` `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`, each carrying `driveFileId`+`wizardSessionId`; a ROLLED-BACK batch (commit-fault) → NO per-row failure emission (mirrors SHOW_FINALIZED). No `NEW_FORENSIC_CODES` change (reused catalog codes). Run → FAIL.
- [ ] Impl per spec S2: at the existing POST-COMMIT block (where `SHOW_FINALIZED` emits, after `deps.withTx` resolves), iterate `input.perRow` for `code !== OK_CODE`, emit via `severityForFinalizeRowCode(code)` (DRIVE_FETCH_FAILED→error else warn), best-effort. finalize-cas mirrors at its post-commit flush. Do NOT touch the 409 guards or the demotePending sites. Run → PASS.
- [ ] Commit `feat(onboarding): durable per-row telemetry on finalize hard-fails (post-commit)`.

### Task 3 — S3 admin-alert resolves
**Files:** `admin-alerts/[id]/resolve/route.ts`, `show/[slug]/alerts/[id]/resolve/route.ts`; registry; test.
- [ ] Test: register both files → `ADMIN_ALERT_RESOLVED` (AUDITABLE+SANCTIONED); `ADMIN_ALERT_RESOLVE_FAILED`→NEW_FORENSIC. Behavioral: real-mutation→`ADMIN_ALERT_RESOLVED` (actorEmail; showId null vs show.id); idempotent skip→no emission; withTx throw→`ADMIN_ALERT_RESOLVE_FAILED`. FAIL.
- [ ] Impl per spec S3 (rows 1-2): POST-COMMIT logAdminOutcome at the real-mutation return; wrap the `withTx` to log.error on throw; both best-effort. PASS.
- [ ] Commit `feat(admin): durable telemetry on admin-alert resolve (both scopes)`.

### Task 4 — S3 data-quality catch (infra only; success already logged)
**Files:** `data-quality/ignore/route.ts`, `unignore/route.ts`; registry (`DATA_QUALITY_INFRA_ERROR` already exists → NEW_FORENSIC only if not already there); test.
- [ ] Test: force the 500 catch on each → assert `log.error` `DATA_QUALITY_INFRA_ERROR`; success path unchanged (still `WARNING_IGNORED`/`WARNING_UNIGNORED`). FAIL.
- [ ] Impl: `try{ await log.error(...,{code:"DATA_QUALITY_INFRA_ERROR",...}) }catch{}` in each catch (:113-115 / :111-113). PASS.
- [ ] Commit `feat(admin): log data-quality ignore/unignore infra faults`.

### Task 5 — S3 pending-ingestion discard + wizard shared handler
**Files:** `pending-ingestions/[id]/discard/route.ts`, `onboarding/pending_ingestions/[id]/retry/route.ts` (shared `handleWizardPendingIngestionAction`); registry; test.
- [ ] Test: register `pending-ingestions/[id]/discard` → `PENDING_INGESTION_DISCARDED`; register `onboarding/pending_ingestions/[id]/retry/route.ts` → `PENDING_INGESTION_DEFERRED`+`_IGNORED`+`_RETRIED` (RETRIED reused-sanctioned). Add SANCTIONED: DISCARDED/DEFERRED/IGNORED; NEW_FORENSIC: `PENDING_INGESTION_DISCARD_FAILED`, `PENDING_INGESTION_ACTION_FAILED`. Behavioral: each committed action→its code; rollback/409→no emission; throw→the *_FAILED code. FAIL.
- [ ] Impl per spec S3: discard route hoist-ref + POST-`withRowTryLock` logAdminOutcome; shared handler emits DEFERRED/IGNORED/RETRIED POST-`withRowTx` (branch on action) + log.error `PENDING_INGESTION_ACTION_FAILED` on the non-rollback rethrow; all best-effort. PASS.
- [ ] Commit `feat(admin): durable telemetry on pending-ingestion discard + wizard defer/ignore/retry`.

### Task 6 — S3 rescan-sheet + cleanup-abandoned-finalize + show/staged discard
**Files:** those 3 routes; registry; test.
- [ ] Test: register `rescan-sheet`→`SHEET_RESCANNED`, `cleanup-abandoned-finalize/[sessionId]`→`FINALIZE_CLEANUP_DONE`, `show/staged/[stagedId]/discard`→`STAGE_DISCARDED`(reused). SANCTIONED: SHEET_RESCANNED, FINALIZE_CLEANUP_DONE. NEW_FORENSIC: `RESCAN_INFRA_ERROR`, `FINALIZE_CLEANUP_FAILED`, `STAGE_DISCARD_FAILED`. Behavioral per route (success-gated + infra). FAIL.
- [ ] Impl per spec S3 (rows 7-9): SHEET_RESCANNED gated `status==="updated"`; FINALIZE_CLEANUP_DONE post-commit; STAGE_DISCARDED post-`discardStaged`; each + its *_FAILED log.error, best-effort. PASS.
- [ ] Commit `feat(admin): durable telemetry on rescan-sheet, cleanup-finalize, staged discard`.

### Task 7 — S4 OAuth callback
**Files:** `app/auth/callback/route.ts`; registry (5 NEW_FORENSIC); test.
- [ ] Test: NEW_FORENSIC += OAUTH_CLIENT_CONSTRUCTION_FAILED, OAUTH_EXCHANGE_THREW, OAUTH_EXCHANGE_REJECTED, OAUTH_IS_ADMIN_INFRA_ERROR, OAUTH_SIGN_IN_SUCCEEDED. Behavioral (dep-inject each fault) → each log.error code; success→`OAUTH_SIGN_IN_SUCCEEDED` with `actorHash` (hashed, never raw email). FAIL.
- [ ] Impl per spec S4: 4 log.error on the infra branches + log.info(OAUTH_SIGN_IN_SUCCEEDED, actorHash:hashForLog(canonicalEmail)) on success; keep OAUTH_STATE_INVALID redirect; all best-effort. PASS.
- [ ] Commit `feat(auth): durable telemetry on OAuth session-exchange (success + infra faults)`.

### Task 8 — S5 enrichAgenda:391 + S6 agenda-extract 504 + S8 agenda-links unresolved
**Files:** `lib/sync/enrichAgenda.ts` (2 spots), `extract-agenda/.../route.ts`; registry (3 NEW_FORENSIC); test.
- [ ] Test: NEW_FORENSIC += AGENDA_ENRICH_THREW, AGENDA_EXTRACT_TIMEOUT, AGENDA_LINK_UNRESOLVED. Behavioral: enrichAgenda outer-catch→AGENDA_ENRICH_THREW; extract 504 timeout branch→AGENDA_EXTRACT_TIMEOUT (driveFileId+wizardSessionId+deadlineMs); a `!link.fileId` link→AGENDA_LINK_UNRESOLVED (spreadsheetId+ordinal+label). FAIL.
- [ ] Impl per spec S5/S6/S8: add `code` to the enrichAgenda:391 log.error (pure stamp); new log.warn before the 504 return (best-effort); new log.warn before the `:137 continue` (best-effort). PASS.
- [ ] Commit `feat(sync): code the enrichAgenda outer-catch + agenda-extract timeout + unresolved agenda link`.

### Task 9 — S7 eight auth-boundary null-code stamps
**Files:** the 8 files in spec S7; registry (NEW_FORENSIC for each new code); test.
- [ ] Test: NEW_FORENSIC += REALTIME_JWT_SECRET_TOO_SHORT, REALTIME_TOKEN_SHOW_LOOKUP_FAILED, OAUTH_GETUSER_FAILED, OAUTH_CLAIM_ALERT_FAILED, PICKER_BOOTSTRAP_RESOLVE_ALERT_FAILED, PICKER_BOOTSTRAP_CLAIM_ALERT_FAILED, AUTH_SIGNOUT_FAILED, SYNC_SLUG_LOOKUP_FAILED, LIVE_STAGED_APPLY_LOOKUP_FAILED. Behavioral spot-checks (≥3 representative: subscriber-token, sign-out, callback getUser). FAIL.
- [ ] Impl per spec S7: stamp `code` on each existing emission (pure field-add); add the NEW best-effort `log.error` REALTIME_TOKEN_SHOW_LOOKUP_FAILED in the silent-500 branch (no status/body change). PASS.
- [ ] Commit `feat(observability): stamp forensic codes on 8 auth-boundary null-code sites`.

### Task 10 — Whole-diff verification
- [ ] `pnpm typecheck` clean; `pnpm exec eslint <changed set>` 0 errors.
- [ ] `pnpm format:check` clean.
- [ ] `npx vitest run tests/log/_metaAdminOutcomeContract.test.ts tests/cross-cutting/codes.test.ts tests/cross-cutting/no-raw-codes.test.ts` — registry + §12.4 producer-scan green (Assertion 4: no forensic code leaked).
- [ ] **FULL suite** `VITEST_EXCLUDE_ENV_BOUND=1 npx vitest run` — catch source-scanning meta-tests (jsonb, no-inline-email, emphasis, admin-alert catalog); triage db/psql env-absence failures vs real.
- [ ] Sanity grep: `git diff origin/main...HEAD -- 'app/**' 'lib/**' | grep -nE 'code:\s*"[A-Z_]+"'` — confirm every new code sits inside a log/logAdminOutcome span (none reaches PRODUCER_RE); `grep` for any `logAdminOutcome` NOT wrapped in try/catch or not awaited-post-commit.
