# Plan — BL-ADMIN-OUTCOME-BEHAVIOR Batch 2 (16 clean DI-seam route POSTs)

Spec: `docs/superpowers/specs/2026-07-09-admin-outcome-behavior-batch2.md`. **Test-only.** One PR graduates 16 of the 24 grandfathered route POSTs to inline behavioral proof; pin **24 → 8**. All edits in `tests/log/adminOutcomeBehavior.test.ts` + registry data in `tests/log/mutationSurface/exemptions.ts` (+ its `exemptions.test.ts`).

**Meta-test inventory:** EXTENDS `tests/log/adminOutcomeBehavior.test.ts` (executable admin behavioral contract) — adds the 16 proof rows PLUS an in-file **structural-guard `test`** (Codex plan-R3) that pins the Batch-2 block to the paired-proof helper as its sole recording path (see Task 1 Substep A). Also EXTENDS `tests/log/_metaMutationSurfaceObservability.test.ts` (static discovery — passes unchanged since the 16 surfaces stay registered, just move grandfather→proven). Edits registry data in `exemptions.ts`. **No new meta-test FILE** (the guard is a `test` within the existing contract file). No `pg_advisory*` (test-only) → holder-topology N/A. No new §12.4 code, no Supabase call-boundary surface, no UI.

**Anti-tautology posture:** every one of the 18 code-rows is proven by a `observeSuccessCodes` success drive (code observed on the committed branch) **paired** with an `observeCodes` failure drive (same code ABSENT) — so no record can pass unconditionally. The recorded value is keyed `${file}::${fn}::${code}` and asserted by Task 18 against `AUDITABLE_MUTATIONS`, not against any self-rendered container.

## Commit structure (invariant 6: commit-per-task, green-per-commit)

This is a **single atomic TDD task** → **exactly one commit**. Removing a grandfather row while its inline proof does not yet exist leaves the suite RED, so the RED state is a **transient in-development checkpoint that is NEVER committed** — a mid-way commit would violate green-per-commit. The one commit lands only after the full green verification below. (This mirrors Batch 1 / PR #365, which shipped its RED→GREEN as one commit for the same reason.) The substeps A–E below are the ordered work WITHIN that one task, not separate commits.

## Task 1 (the only task) — graduate the 16 routes, single commit after green

### Substep A — scaffolding (transient state stays GREEN)

- Add a local **`observeFailure(run) → { codes, thrown, result }`** helper (NON-swallowing: sets sink, runs, captures any throw in `thrown` + the return in `result`, resets sink) and the **`proveAdminOutcomeBehavior({ file, fn, code, success, failure, failureExpect })`** helper (Codex plan-R2/R6/R7 — full contract in spec §3.3): `success: () => Promise<unknown>`; `failure: (mark:{hit:boolean}) => Promise<unknown>` (returns the handler Response); `failureExpect: { status:number, code?:string }` (exact intended refusal per §3.1/driver). It (1) success → `expect(ok).toContain(code)`; (2) `const mark={hit:false}; const {codes,thrown,result}=await observeFailure(()=>failure(mark))`; (3) `expect(codes).not.toContain(code)`; (4) **`expect(mark.hit).toBe(true)`** (anti-hollow — set inside the driven refusal seam); (5) **`expect(thrown).toBeUndefined()`** (no escaped infra throw); (6) **`expect(result).toBeInstanceOf(Response); expect(result.status).toBe(failureExpect.status)`** + optional `expect(codes).toContain(failureExpect.code)` (pins the INTENDED refusal, not a swallowed-into-500 infra error); (7) ONLY then `recordAdminOutcomeBehavior`. The helper/observers are the ONLY callers of `observeSuccessCodes`/`observeCodes`/`observeFailure`/`recordAdminOutcomeBehavior`; no Batch-2 test body calls them directly. **#20** uses `failureExpect={status:500,code:"IGNORED_SHEET_UNIGNORE_FAILED"}` (its only non-emit path is the caught-throw → 500).
- **Deterministic DB/Drive-free enforcement (Codex plan-R8):** add a Batch-2-scoped `beforeAll` that poisons `process.env.TEST_DATABASE_URL`/`DATABASE_URL` to an unreachable DSN `postgresql://poison:poison@127.0.0.1:1/none` (port 1) and `delete`s `process.env.GOOGLE_SERVICE_ACCOUNT_JSON` (saving prior values), with an `afterAll` that restores. Any un-injected default DB seam then throws ECONNREFUSED and any un-injected Drive seam throws on the missing cred — deterministically, regardless of CI booting local Supabase (`unit-suite.yml:80`). Scoped to Batch-2 (restore in `afterAll`) so Batch-1/Task-14 tests are unaffected. This IS the DB-free guarantee (not the earlier false "CI has no DB" claim).
- **Structural guard (Codex plan-R3, CI-enforced):** wrap the Batch-2 block in sentinel comments `// >>> BATCH-2 PROOF BLOCK START` / `// <<< BATCH-2 PROOF BLOCK END`, and add a `test("Batch 2 rows record only via the paired-proof helper")` that reads this test file's own source (repo-relative path via `fs.readFileSync`), slices between the sentinels, and asserts the slice matches none of `/\brecordAdminOutcomeBehavior\s*\(/`, `/\bobserveSuccessCodes\s*\(/`, `/\bobserveCodes\s*\(/`, `/\bobserveFailure\s*\(/` (only `proveAdminOutcomeBehavior(` allowed; the helper+observers live OUTSIDE the sentinels). Batch-2-scoped — Batch-1's direct-`record` rows (outside the sentinels) are untouched. This makes "record directly / skip the failure drive" a CI failure, not a convention.
- Add a local `fakeTx(overrides)` helper in the Batch-2 region: returns a `tx` object whose `queryOne`/`run` (and the specific reads each route uses — `readLockedPendingIngestion`, alert-row select, etc.) resolve the per-route committed/refusal shapes from spec §3.1. Scoped to the Batch-2 block; touches no existing test.
- Add a local `drainNdjson(res)` helper (read `res.body` to EOF, mirror `tests/onboarding/scanRoute.test.ts:143`) for route #18.
- Import the 16 handlers (+ `handleWizardPendingIngestionAction` for #14) from their route modules.
- Add the `describe("Batch 2 — clean DI-seam admin route POSTs observe success only")` shell with the per-route `routeDeps` builders (default `requireAdminIdentity: async () => ({ email: "admin@example.com" })`; #15 rescan uses the existing module `requireAdmin` mock — no identity dep).

Verify (transient): `pnpm typecheck` + `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` green, grandfather still 24. (No proofs recorded yet — the describe has no `test()`s or only skipped placeholders, so Task 18 is unaffected.)

### Substep B — RED (transient, NOT committed): remove 16 grandfather rows + flip pins

- Delete the 16 route rows from `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`exemptions.ts`), leaving **8** (4 heavy DI-seam + 4 plain-POST for Batch 3). Update the doc-comment (keep "frozen, never grows"; note Batch 2 graduated the 16 clean DI-seam routes → 8 remain).
- Flip pins `24`→`8`: `adminOutcomeBehavior.test.ts:1443` (Task 18a), `exemptions.test.ts:31` (`.length`), `:33` (Set size), `:37` (`routeRows.length`).
- Confirm the suite is **RED**: Task 18 coverage test names the 18 now-unproven `file::fn::code` rows (records the negative-regression baseline — the contract has teeth). This RED state is transient and stays in the working tree only; do NOT commit here.

### Substep C — GREEN: add the 16 inline behavioral proofs (18 code-rows)

One `test(...)` per route in the Batch-2 describe, each calling **`proveAdminOutcomeBehavior({ file, fn: "POST", code, success, failure })`** (never `recordAdminOutcomeBehavior` directly) — the helper runs the success drive (asserts code observed), runs the failure drive (asserts code absent), then records. `success`/`failure` build the per-route `routeDeps`/`context` per spec §3.1.

**Inject EVERY DB/Drive/lock seam per spec §3.5 (Codex plan-R4).** Each `routeDeps` MUST inject every seam in the §3.5 inventory — all `withTx`/`withRowTx`/`withRowTryLock` as callback-invoking passthroughs `(…, fn) => fn(fakeTx)`, plus every `read*`/`verifyFolder`/`upsertAdminAlert`/mutation dep — so no default Postgres/advisory-lock/Drive impl is reached. **Enforcement:** the Batch-2 `beforeAll` env-poison (Substep A) makes any missed seam throw deterministically (ECONNREFUSED / missing Drive cred) on BOTH the success and failure drives → RED, on any runner (spec §3.5). Copy each cited driver's deps-builder verbatim. Notes:

- **`context`** = `{ params: Promise.resolve({...}) }` for the 12 routes that take it; OMIT for #15 rescan / #18 scan (no-context signatures).
- **#14** records 3 codes under the one file key: `handleWizardPendingIngestionRetry` → `PENDING_INGESTION_RETRIED`; `handleWizardPendingIngestionAction(ctx, deps, "defer_until_modified"|"permanent_ignore")` → `PENDING_INGESTION_DEFERRED`/`PENDING_INGESTION_IGNORED`. Failure drives are **callback-invoking + DB-free** per spec §3.3 (faked tx → `requireCurrentWizardRow` 404, OR rollback + injected `upsertAdminAlert`/`readCurrentWizardSessionId` fakes). Never drive the sibling delegator routes.
- **#18 scan is streaming:** both success and failure drives wrap the handler in an `async` callback that `await drainNdjson(res)` before the observe helper returns (spec §3.3 / §4).
- **#20** failure makes `withRowTx` throw (→ `*_UNIGNORE_FAILED`); it has no no-op success branch.
- **#11/#12** both record `ADMIN_ALERT_RESOLVED` under distinct file keys — two separate tests, two records. **#4/#17** both record `STAGE_DISCARDED` under distinct file keys — same.

Confirm suite **GREEN**; grandfather = 8, all pins `8`.

### Substep D — verify (green gate before the single commit)

- `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts tests/log/mutationSurface/exemptions.test.ts tests/log/_metaMutationSurfaceObservability.test.ts` green.
- Negative-regression (spec §5) — each mutation leaves an EXECUTABLE assertion in place that must fail (no "delete the assertion" checks); restore after each:
  - (a) leave a pin at 24 → the Task-18a pin assertion RED.
  - (b) drop one `proveAdminOutcomeBehavior` call for a route → Task 18 coverage RED naming the now-unproven `file::fn::code`.
  - (c) **make one row's `failure` callback drive the committed-SUCCESS branch (so it emits the code)** → `proveAdminOutcomeBehavior`'s internal `expect(bad).not.toContain(code)` RED. This proves the paired failure guard is real and structurally enforced (the helper aborts before `record`), replacing the old vacuous "delete the assertion" check.
  - (d) **insert a bare `recordAdminOutcomeBehavior(...)` (or `observeSuccessCodes(...)`) call inside the sentinel block** → the structural-guard `test` RED. Proves the CI-enforced sole-recording-path guard has teeth.
  - (e) **replace one row's `failure` with a no-op `async () => {}` (never sets `mark.hit`)** → `proveAdminOutcomeBehavior`'s `expect(mark.hit).toBe(true)` RED. Proves the anti-hollow branch-hit guard rejects a failure drive that doesn't actually reach the route's refusal seam (Codex plan-R6).
  - (f) **omit one seam injection from a row (success or failure)** → with the `beforeAll` env-poison in place the default seam hits `127.0.0.1:1` → ECONNREFUSED throw → success drive rethrows via `observeSuccessCodes` (RED) / failure drive `thrown` defined → `expect(thrown).toBeUndefined()` RED. Proves the deterministic DB/Drive-free enforcement works on any runner (Codex plan-R7/R8). (Also confirm the poison itself is active: temporarily drop the `beforeAll` and re-run — a missed seam would then silently pass, demonstrating the poison is load-bearing; restore.)
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, then full `pnpm test`. Triage DB-touching failures as concurrent-worktree shared-Supabase contention (re-run ambiguous non-`tests/log` files in isolation to confirm) — `tests/log` MUST be fully green.

### Substep E — the single commit (only after Substep D is green)

- Exactly one commit for the whole task: `test(log): inline behavioral coverage for 16 clean DI-seam admin routes (grandfather 24→8)`. Nothing is committed before this point (the Substep-B RED never reaches history).

## Failure-mode notes (per spec)

- Each success paired with a failure proving committed-success gating (the concrete failure mode: a handler that emits regardless of the mutation outcome would pass a success-only test but fail the paired negative).
- `observeSuccessCodes` rethrows any non-redirect throw → a handler that emits then throws cannot be falsely recorded.
- #18 without a body-drain would silently miss `ONBOARDING_SCAN_COMPLETED` (streamed after the handler promise resolves) — the drain is the load-bearing step, and its failure-drive drain prevents a trivially-true absence.
- #14 without a callback-invoking failure would give a hollow absence proof — the faked-tx refusal must run the real callback (spec §3.3).
- Values derived from each handler's real committed shape (mutation dep / faked tx), never hardcoded to force a pass.
