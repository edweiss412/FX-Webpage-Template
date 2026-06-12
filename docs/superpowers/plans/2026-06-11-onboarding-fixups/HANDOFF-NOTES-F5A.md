# F5a execution handoff notes (Tasks 5.1, 5.2, 5.3, 5.5, 5.6)

Executed 2026-06-12 on `spec/onboarding-fixups`. **Task 5.4 (half (ii): residue
inertness + F4 reap sweep) is F5b — deliberately NOT implemented here** (depends
on Phase 4's `reapStaleOnboardingSessions`). The S5 real-DB retry-race test
documents committed W1 scan residue but defers the "F4 reap sweeps it"
assertion to F5b alongside Task 5.4.

> **F5b CLOSED (2026-06-12, post-F4):** Task 5.4 landed. Half (a) was verified
> as already pinned by the F5a "half (i)" route-level test + the mid-tx
> statement-time tests — not duplicated. Half (b) added the commit-window
> residue test (residue exists, wizard-scoped, fresh-skip respected by the F4
> 24h guard, swept after backdating `deferred_at` + manifest
> `observed_at`/`transitioned_at`), the `perFileProcessor` F5 inertness pin
> (negative-regression verified: deleting `.is("wizard_session_id", null)`
> fails it), and the S5-deferred reap assertion (fresh-skip, then backdate
> `parsed_at`/`observed_at`/`transitioned_at`/`first_seen_at`/`last_attempt_at`,
> then sweep of the committed W1 `pending_syncs` + manifest residue). The
> two-half guarantee is fully pinned; F5 is complete.

## Task 5.6 — PostgREST DML lockdown evaluation (recorded verbatim)

F5 introduces NO new RPC and NO new table. The three mutated tables are already
registered in `RPC_GATED_TABLES` with REVOKEs: `pending_syncs`
(`tests/db/postgrest-dml-lockdown.test.ts:193`), `pending_ingestions` (`:208`),
`deferred_ingestions` (`:222`). `onboarding_scan_manifest` is mutated by the
retry route via direct server-side `postgres.js` SQL (not PostgREST); its
PostgREST DML lockdown — together with `wizard_finalize_checkpoints` (`:304`)
and `shows_pending_changes` (`:316`) — landed via F1 Task 1.3
(`supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql`,
registry row at `:287`). Verified present at execution time. **No F5-side
extension needed.** F4 Task 4.7 re-verifies at milestone close-out.

## Citation correction (for the spec's next edit pass)

The spec (§7) and AGENTS.md cite the x1 parity gate as
`tests/messages/codes.test.ts:92`. The live gate is
`tests/cross-cutting/codes.test.ts` (describe "AC-X.1 §12.4 catalog parity"),
run via `pnpm test:audit:x1-catalog-parity` (chains `pnpm gen:spec-codes`).

## Task 5.5 sweep table + dispositions (as executed)

| # | Surface | Disposition |
|---|---------|-------------|
| S1 | `requireCurrentWizardRow` (retry route) | Report-only. Source comment added: returned refusal commits an EMPTY tx (no mutation precedes); mutating-statement misses must throw. |
| S2 | `discardStaged` `defaultUpsertWizardDeferral` | Report-only. Already currency-predicated; its 0-row miss returns BEFORE any other mutation (empty-tx commit, benign). Pinned by existing unit test ("wizard-scope deferral CAS supersession aborts before deleting pending_syncs"). |
| S3 | `discardStaged` manifest miss AFTER deferral wrote | **Fixed.** Throws `WizardSessionSupersededRollbackError` for `variant !== "try_again"`; `try_again` (no deferral precedes) keeps the returned outcome. |
| S4 | `defaultDeleteWizardPendingSync` | **Fixed.** Currency EXISTS predicate + boolean return; 0-row (always post-manifest-mutation) throws for every variant. Negative-regression verified: removing the EXISTS clause fails `tests/onboarding/discardStagedCasRaceDb.test.ts`. |
| S5 | `retrySingleFile_unlocked` pending-ingestion delete (R12 HIGH) | **Fixed.** Currency EXISTS predicate + boolean return; 0-row throws with `attemptedAction: "retry"`. Retry route's Task-5.1 catch maps it (no new route code). R32-1: the S5 real-DB test writes real W1 scan residue, asserts 409 + residue committed; reap-sweep half deferred to F5b. |

Sweep completeness re-run (`rg "pending_wizard_session_id" app lib --type ts`):
consumers are `sessionLifecycle.ts` (lock-ordered, Phase 4), the retry route
(S1 + 5.1), `discardStaged.ts` (S2–S4), `retrySingleFile.ts` (S5), and
`runOnboardingScan.ts` (per-statement CAS-gated per master spec; commit-window
residue is the accepted, F4-swept class). No other post-read stale-session
mutators remain.

## Adversarial-review preempts (do NOT relitigate)

- **Commit-window residue is ACCEPTED, not closed** — spec §7 R5-2, ratified §8.
  Do not propose `app_settings` row locks from per-show-locked paths (R4-1
  deadlock inversion vs `cleanupAbandonedFinalize`'s `finalize:` →
  `app_settings FOR UPDATE` → show-locks order, `sessionLifecycle.ts:329-374`)
  or SERIALIZABLE. F5 adds NO locks (spec §3.3); verified:
  `rg "pg_advisory" app/api/admin/onboarding/pending_ingestions lib/sync/wizardSessionRollback.ts`
  → no matches.
- **Alert copy avoids absolute-rollback claims by design** (R32-1): retry's scan
  residue commits; copy says "cancelled before it could change the new wizard's
  state", action-generic. Copy-honesty + copy-parity tests pin this.
- **`errorResponse` returns inside tx callbacks** that remain are all
  PRE-mutation (S1/S2-benign empty-tx commits) — re-grepped both patched
  surfaces at close-out; no `errorResponse` return sits after a mutating
  statement.

## Verification (all green at close-out, local Supabase up)

- `pnpm vitest run tests/onboarding tests/sync/perFileProcessor.test.ts tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaErrorCatalogDocs.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/db/postgrest-dml-lockdown.test.ts` → 440 passed.
- `pnpm vitest run tests/sync --silent` → 539 passed, 2 skipped.
- `pnpm test:audit:x1-catalog-parity` → 14 passed.
- `tsc --noEmit` → clean.
- Negative regressions: 5.2 (deferral predicate removed → race test fails);
  5.5 (`defaultDeleteWizardPendingSync` EXISTS removed → discard race test
  fails). Both restored and re-verified.

## Plan-vs-reality deviations

- `handleWizardPendingIngestionAction` takes `(context, routeDeps, action)` —
  no `Request` first parameter (plan snippets showed one). Followed live code.
- S5 unit test lives at `tests/onboarding/retrySingleFile.test.ts` (plan said
  `tests/sync/retrySingleFile.test.ts`).
- The best-effort current-session reader is shared:
  `readCurrentWizardSessionIdBestEffort` in `lib/sync/wizardSessionRollback.ts`
  (both routes consume it) rather than per-route duplicates.
- `ADMIN_ALERTS_WRITE_SITES` value type extended to `WriteSite | WriteSite[]`
  so one code can pin BOTH producers (retry + discard routes).
- Discard real-DB race uses the plan-sanctioned hook-style dep (real
  `discardStaged_unlocked` control flow + production default SQL; the hook
  flips the session after the real manifest CAS) instead of replaying the
  statement order manually.

## Formatting note

A `prettier --check` sweep of touched files was evaluated and intentionally
NOT applied: the repo's committed state (incl. `lib/messages/catalog.ts` and
the master spec at the F5a base commit) does not conform to file-based
prettier with the repo `.prettierrc`, there is no CI format gate, and a
`--write` pass reflows the entire line-anchored master spec (§12.4 tables,
spec-id anchors, `file:line` citations). F5a hunks match the surrounding
style of each file instead.
