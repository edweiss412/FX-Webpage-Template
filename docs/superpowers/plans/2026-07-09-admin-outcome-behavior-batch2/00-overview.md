# Plan — BL-ADMIN-OUTCOME-BEHAVIOR Batch 2 (16 clean DI-seam route POSTs)

Spec: `docs/superpowers/specs/2026-07-09-admin-outcome-behavior-batch2.md`. **Test-only.** One PR graduates 16 of the 24 grandfathered route POSTs to inline behavioral proof; pin **24 → 8**. All edits in `tests/log/adminOutcomeBehavior.test.ts` + registry data in `tests/log/mutationSurface/exemptions.ts` (+ its `exemptions.test.ts`).

**Meta-test inventory:** EXTENDS `tests/log/adminOutcomeBehavior.test.ts` (executable admin behavioral contract) and `tests/log/_metaMutationSurfaceObservability.test.ts` (static discovery — passes unchanged since the 16 surfaces stay registered, just move grandfather→proven). Edits registry data in `exemptions.ts`. **No new meta-test file.** No `pg_advisory*` (test-only) → holder-topology N/A. No new §12.4 code, no Supabase call-boundary surface, no UI.

**Anti-tautology posture:** every one of the 18 code-rows is proven by a `observeSuccessCodes` success drive (code observed on the committed branch) **paired** with an `observeCodes` failure drive (same code ABSENT) — so no record can pass unconditionally. The recorded value is keyed `${file}::${fn}::${code}` and asserted by Task 18 against `AUDITABLE_MUTATIONS`, not against any self-rendered container.

## Task 1 — test scaffolding (helpers + describe block), still GREEN

- Add a local `fakeTx(overrides)` helper in the Batch-2 region: returns a `tx` object whose `queryOne`/`run` (and the specific reads each route uses — `readLockedPendingIngestion`, alert-row select, etc.) resolve the per-route committed/refusal shapes from spec §3.1. Scoped to the Batch-2 block; touches no existing test.
- Add a local `drainNdjson(res)` helper (read `res.body` to EOF, mirror `tests/onboarding/scanRoute.test.ts:143`) for route #18.
- Import the 16 handlers (+ `handleWizardPendingIngestionAction` for #14) from their route modules.
- Add the `describe("Batch 2 — clean DI-seam admin route POSTs observe success only")` shell with the per-route `routeDeps` builders (default `requireAdminIdentity: async () => ({ email: "admin@example.com" })`; #15 rescan uses the existing module `requireAdmin` mock — no identity dep).

Verify: `pnpm typecheck` + `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` green, grandfather still 24. (No proofs recorded yet — the describe has no `test()`s or only skipped placeholders, so Task 18 is unaffected.)

## Task 2 — RED: remove 16 grandfather rows + flip pins

- Delete the 16 route rows from `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`exemptions.ts`), leaving **8** (4 heavy DI-seam + 4 plain-POST for Batch 3). Update the doc-comment (keep "frozen, never grows"; note Batch 2 graduated the 16 clean DI-seam routes → 8 remain).
- Flip pins `24`→`8`: `adminOutcomeBehavior.test.ts:1443` (Task 18a), `exemptions.test.ts:31` (`.length`), `:33` (Set size), `:37` (`routeRows.length`).
- Confirm the suite is **RED**: Task 18 coverage test names the 18 now-unproven `file::fn::code` rows (records the negative-regression baseline — the contract has teeth).

## Task 3 — GREEN: add the 16 inline behavioral proofs (18 code-rows)

One `test(...)` per route in the Batch-2 describe, each: success drive via `observeSuccessCodes` → assert code observed → `recordAdminOutcomeBehavior({ file, fn: "POST", code })`; paired failure drive via `observeCodes` → assert code absent. Per spec §3.1 recipe. Notes:

- **`context`** = `{ params: Promise.resolve({...}) }` for the 12 routes that take it; OMIT for #15 rescan / #18 scan (no-context signatures).
- **#14** records 3 codes under the one file key: `handleWizardPendingIngestionRetry` → `PENDING_INGESTION_RETRIED`; `handleWizardPendingIngestionAction(ctx, deps, "defer_until_modified"|"permanent_ignore")` → `PENDING_INGESTION_DEFERRED`/`PENDING_INGESTION_IGNORED`. Failure drives are **callback-invoking + DB-free** per spec §3.3 (faked tx → `requireCurrentWizardRow` 404, OR rollback + injected `upsertAdminAlert`/`readCurrentWizardSessionId` fakes). Never drive the sibling delegator routes.
- **#18 scan is streaming:** both success and failure drives wrap the handler in an `async` callback that `await drainNdjson(res)` before the observe helper returns (spec §3.3 / §4).
- **#20** failure makes `withRowTx` throw (→ `*_UNIGNORE_FAILED`); it has no no-op success branch.
- **#11/#12** both record `ADMIN_ALERT_RESOLVED` under distinct file keys — two separate tests, two records. **#4/#17** both record `STAGE_DISCARDED` under distinct file keys — same.

Confirm suite **GREEN**; grandfather = 8, all pins `8`.

## Task 4 — verify + commit

- `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts tests/log/mutationSurface/exemptions.test.ts tests/log/_metaMutationSurfaceObservability.test.ts` green.
- Negative-regression (spec §5), restore after each: (a) leave a pin at 24 → RED; (b) drop one `record` call → Task 18 RED naming the row; (c) delete a paired failure assertion / force an unconditional emit → the `observeCodes` absence assertion RED.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, then full `pnpm test`. Triage DB-touching failures as concurrent-worktree shared-Supabase contention (re-run ambiguous non-`tests/log` files in isolation to confirm) — `tests/log` MUST be fully green.
- One commit: `test(log): inline behavioral coverage for 16 clean DI-seam admin routes (grandfather 24→8)`.

## Failure-mode notes (per spec)

- Each success paired with a failure proving committed-success gating (the concrete failure mode: a handler that emits regardless of the mutation outcome would pass a success-only test but fail the paired negative).
- `observeSuccessCodes` rethrows any non-redirect throw → a handler that emits then throws cannot be falsely recorded.
- #18 without a body-drain would silently miss `ONBOARDING_SCAN_COMPLETED` (streamed after the handler promise resolves) — the drain is the load-bearing step, and its failure-drive drain prevents a trivially-true absence.
- #14 without a callback-invoking failure would give a hollow absence proof — the faked-tx refusal must run the real callback (spec §3.3).
- Values derived from each handler's real committed shape (mutation dep / faked tx), never hardcoded to force a pass.
