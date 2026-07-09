# Spec — Admin-Outcome Behavioral Coverage, Batch 3 (final): pin 8 → 0, delete the grandfather

**Date:** 2026-07-09
**Slug:** admin-outcome-behavior-batch3
**Backlog:** closes `BL-ADMIN-OUTCOME-BEHAVIOR` (AGENTS.md invariant #10; registry landed PR #306).
**Type:** test-only (no production source changes; see §9 for the one deliberately-considered-and-rejected production-DI alternative).
**Predecessors:** Batch 1 ✅ PR #365 (6 per-show actions, pin 30→24). Batch 2 ✅ PR #368 (16 clean DI-seam route POSTs, pin 24→8). This batch graduates the final **8** rows and then **removes the grandfather mechanism entirely**.

---

## 1. Goal

Every admin mutation surface listed in `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`tests/log/mutationSurface/exemptions.ts:112`) still lacks an executable success-branch behavioral proof; membership in the grandfather array is the only thing keeping the observability meta-suite green for these 8 (invariant #10 admits a grandfather row **in lieu of** a proof). This batch:

1. Adds an inline `proveAdminOutcomeBehavior(...)` case for each of the **8 remaining surfaces**, driving the committed-success branch DB-free so the real `logAdminOutcome` emit is captured by `setLogSink`, paired with a failure-branch leg proving the emit is success-gated.
2. Removes all 8 rows from `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` → the array becomes empty.
3. **Deletes the grandfather mechanism** — the now-empty array, its consuming pin logic in `tests/log/adminOutcomeBehavior.test.ts`, and its dedicated pin test in `tests/log/mutationSurface/exemptions.test.ts` — so the completeness assertion (Task 18, `adminOutcomeBehavior.test.ts`) covers **every** admin `AUDITABLE_MUTATIONS` row strictly, with no escape hatch. Any future admin surface fails-by-default until it carries a real proof.

**Non-goal:** No change to production route behavior, to `AUDITABLE_MUTATIONS`, to `lib/log`, or to any `§12.4` catalog row. No new admin surface. This is coverage backfill + mechanism retirement.

---

## 2. The 8 surfaces (frozen scope)

From `tests/log/mutationSurface/exemptions.ts:112-129`, verbatim. Success codes from `tests/log/_auditableMutations.ts` (AM:line). Two difficulty classes.

### Class A — heavy DI-seam routes (inject via `routeDeps`, no module `vi.mock`)

| # | Route file (`app/api/admin/…`) | `fn` | Success code (AM:line) | Entry | Committed-success seam | Feasibility |
|---|---|---|---|---|---|---|
| A1 | `onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts` | POST | `STAGE_APPROVED` (AM:22) | `handleWizardStagedApprove(req, ctx, routeDeps)` | inject `requireAdminIdentity` + `withRowTx` (hand-faked 3-branch `queryOne`) | GREEN |
| A2 | `onboarding/finalize/route.ts` | POST | `SHOW_FINALIZED` (AM:34) | `handleOnboardingFinalize(req, deps)` | `_finalizeFake.deps(db)` (zero-finishable-row branch) | GREEN |
| A3 | `onboarding/finalize-cas/route.ts` | POST | `SHOW_FINALIZED` (AM:35) | `handleOnboardingFinalizeCas(req, routeDeps)` | `_finalizeCasFake.deps(db)` + 1 shadow row | GREEN |
| A4 | `onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` | POST | `AGENDA_EXTRACT_COMPLETED` (AM:166) | `handleExtractAgenda(req, ctx, routeDeps)` | inject `sql` = **new in-memory tagged-template `fakeLeasePool`** + `slotStore`/`fetchMeta`/`enrichAgenda`/`driveClient`/`requireAdminIdentity` | YELLOW (hard row — §4) |

### Class B — plain-POST routes (no `routeDeps` seam; module `vi.mock` their `@/lib/sync/*` deps)

| # | Route file (`app/api/admin/…`) | `fn` | Success code (AM:line) | Emit site | New module `vi.mock` | Failure status |
|---|---|---|---|---|---|---|
| B1 | `staged/[fileId]/apply/route.ts` | POST | `SHOW_APPLIED` (AM:37) | route.ts:174 | `@/lib/sync/applyStaged`, `@/lib/sync/promoteSnapshot` | 404 |
| B2 | `sync/[slug]/route.ts` | POST | `SHOW_SYNCED_MANUAL` (AM:43) | route.ts:133 | `@/lib/sync/runManualSyncForShow` | 409 |
| B3 | `snapshot-rollback/[id]/repair/route.ts` | POST | `SNAPSHOT_ROLLBACK_REPAIRED` (AM:52) | route.ts:74 | `@/lib/sync/promoteSnapshot` (shared with B1) | 409 |
| B4 | `staged/[fileId]/discard/route.ts` | POST | `STAGE_DISCARDED` (AM:172) | route.ts:161 | `@/lib/sync/discardStaged` | 404 |

> A2 and A3 both emit `SHOW_FINALIZED` but are distinct `{file, fn}` registry rows. B1's `SHOW_APPLIED` at AM:37 is the live `[fileId]` route, distinct from the wizard-`[wizardSessionId]` apply already proven in Batch 2 (AM:17).

---

## 3. Reused infrastructure (from Batch 2, verbatim)

All of the following already exist in `tests/log/adminOutcomeBehavior.test.ts` and are reused unchanged:

- **`proveAdminOutcomeBehavior({file, fn, code, success, failure, failureExpect})`** (`:463`) — the SOLE recording path. Records the surface as behaviorally-covered only after **both**: (a) `success()` runs and the real logger emits `code` (captured via `setLogSink`); (b) `failure()` runs and `code` is ABSENT **and** the injected refusal seam was reached (`mark.hit === true`, set inside the seam) **and** no throw escaped (`observeFailure` is non-swallowing) **and** `result instanceof Response` **and** `result.status === failureExpect.status` **and** (optional) `failureExpect.code` matches a log-sink code **and** (optional) `failureExpect.bodyCode` matches `(await result.clone().json()).code`.
- **Non-swallowing `observeFailure(run) → {codes, thrown, result}`** (`:439`), **`fakeTx(overrides)`** (`:498`, `queryOne: async () => null` default), **`drainNdjson(res)`** (streaming).
- **3-channel env-poison** (Batch-2 `beforeAll`/`afterAll` + nested `beforeEach`): `TEST_DATABASE_URL`/`DATABASE_URL` → `postgresql://poison:poison@127.0.0.1:1/none` (unreachable); `delete GOOGLE_SERVICE_ACCOUNT_JSON`; `serverClientImpl.current`/`serviceRoleClientImpl.current` → throwing stubs. Any un-injected default DB / Drive / Supabase-client seam **throws**, so a row can never go green by accidentally reaching real infra. Rationale (do NOT relitigate — §8): `databaseUrl()` does **not** throw on unset env (falls back to local Supabase `127.0.0.1:54322` — confirmed `extractAgendaLease` route `databaseUrl()` at `route.ts` `defaultSql`), and CI `unit-suite.yml` BOOTS local Supabase, so the poison — not "CI has no DB" — is the DB-free guarantee.

### 3.1 Batch-3 extension of the poison (already covered, verify only)

The Batch-2 poison already throws on the default `sql` pool for extract-agenda (A4) because `defaultSql()` calls `databaseUrl()` → poison DSN → `postgres(...)` connect → ECONNREFUSED `127.0.0.1:1`. A4's success leg injects `sql` (§4) so the default is never reached; A4's failure leg also injects `sql`. No new poison channel is required. **Batch-3 acceptance re-runs the Batch-2 "poison has teeth" negative check** (drop any one injected seam → row goes RED) for at least A1 (`withRowTx`) and A4 (`sql`), documented in the plan's verification task.

---

## 4. The hard row: A4 extract-agenda `fakeLeasePool` (test-only tagged-template fake)

A4 is the only surface with no in-memory `sql` fake in the repo — every existing `tests/app/admin/extractAgenda.test.ts` case uses a **real local postgres pool** (DB-gated). Reaching the `AGENDA_EXTRACT_COMPLETED` emit (`route.ts:473`, fires only after the tx#2 owner-scoped `UPDATE … RETURNING` commits and the lease is released) DB-free requires a bespoke in-memory `RoutePool`.

### 4.1 Contract to satisfy

`RoutePool` = `LeasePool` (`lib/agenda/extractAgendaLease.ts:34`): a callable tagged-template `LeaseTx` (`<T>(strings, ...values) => Promise<T[]>`) that ALSO has `.begin(fn: (tx: LeaseTx) => Promise<void|T>): Promise<...>`. The committed-success path issues **three** `sql.begin(...)` calls (`route.ts:240`, `:260`, `:393`):

1. **tx#1a — `claimExtractLease(tx, key)`** (`extractAgendaLease.ts`): issues, in order, `SELECT pg_advisory_xact_lock(...)` → `[]`; GC `DELETE … expired` → `[]`; this-row live-lease `SELECT` → `[]` (no live lease); global-cap `SELECT count(*)` → `[{ count: 0 }]` (or shape the real query returns); `INSERT … ON CONFLICT … RETURNING owner` → `[{ owner }]` (1 row = ok). Returns `{ ok: true }`.
2. **tx#1b — staged read** (`route.ts:260`): `SELECT …` returning one valid staged row (parse_result / settings shape the route reads).
3. **tx#2 — persist** (`route.ts:393`): settings re-read; `pg_advisory_xact_lock`; parse_result re-read; owner-scoped `UPDATE … RETURNING true` → truthy 1 row; `releaseExtractLease` `DELETE`. Yields `leaseReleased = true` → emit at `:473`.

### 4.2 Design

Add a test-only helper `fakeLeasePool(script)` in `adminOutcomeBehavior.test.ts` (NOT a production file). It returns a `RoutePool`-shaped object:

- The callable form `pool\`SQL\`` and the `tx` passed into `.begin` both dispatch on the **first meaningful token(s)** of `strings.join(" ? ")` (regex branch, mirroring the proven `fakeTx.queryOne` regex pattern already in the file and in `tests/api/wizard-approve-route.test.ts`). Each branch returns canned rows keyed to the statement.
- `.begin(fn)` constructs a per-transaction `tx` (same dispatcher) and returns `await fn(tx)`.
- Unmatched statement → **throw** `Error("fakeLeasePool: unmapped SQL: <first 80 chars>")`, so an incomplete fake fails loudly (never silently returns `[]` and masks a missing branch).

The exact statement inventory (all SQL the three tx callbacks issue, with return shapes) is enumerated in the **plan's A4 task body** after a per-statement grep of `extractAgendaLease.ts` + `route.ts:240-470`; the spec fixes the approach, the plan fixes the strings. If, during TDD, the statement set proves intractable to fake faithfully (e.g. a dynamic query the dispatcher can't disambiguate), the fallback is §9 — flagged to the user, not silently taken.

### 4.3 A4 failure leg (cheap)

Inject `sql` whose **first** `.begin` sets `mark.hit = true` and returns `{ ok: false, reason: "queued" }` (ignoring `fn`) → `claimExtractLease` short-circuits → `pendingResponse("queued")` = **202** (`route.ts:245`; body `{ status: "pending", reason }`, **no `code` key**). `failureExpect: { status: 202 }` only (no `bodyCode`). No emit.

---

## 5. Class B recipe: plain-POST module mocks + Batch-3 sentinel block

The 4 plain-POST routes have no `routeDeps` seam — their mutation deps are module imports (`@/lib/sync/*`). Batch 3 adds **module `vi.mock`s** for those deps (hoisted to file top, alongside the existing `@/lib/auth/requireAdmin`, `@/lib/supabase/server`, `@/lib/data/showCacheTag` mocks). This does **not** violate the Batch-2 "no `vi.mock` inside the proof block" rule (that rule is scoped to the *proof block body* and specifically forbids mocking `@/lib/log`); mocking `@/lib/sync/*` is orthogonal and unavoidable for seamless routes.

**Never mocked:** `@/lib/log`, `@/lib/log/logAdminOutcome` (invariant — the real logger + `setLogSink` is the capture mechanism). Every copy-source driver test (`admin-staged-apply-route.test.ts` etc.) mocks `logAdminOutcome`; Batch 3 **drops** that mock and asserts via the sink instead — this is exactly what `proveAdminOutcomeBehavior` does.

### 5.1 New module `vi.mock`s (file top)

| Module | Exports the mock must provide | Consumed by |
|---|---|---|
| `@/lib/sync/applyStaged` | `applyStaged` (+ any named exports the route imports — verify at plan time) | B1 |
| `@/lib/sync/promoteSnapshot` | `promoteSnapshotUpload`, `repairSnapshotRollback` (ONE shared mock) | B1, B3 |
| `@/lib/sync/runManualSyncForShow` | `runManualSyncForShow`, `FINALIZE_OWNED_SHOW` | B2 |
| `@/lib/sync/discardStaged` | `discardStaged` (+ variant const if imported) | B4 |

Each success leg configures the mock to return the committed-success shape (see per-route detail in the plan) and swaps `serverClientImpl.current` / `serviceRoleClientImpl.current` to a working `makeClient({...})`. Each failure leg sets the mock to return a refusal code AND sets `mark.hit = true` inside the mock impl. `mock.mockReset()` in the proof block's own scope (NOT relying on the file-level `clearAllMocks`, which does not restore implementations — see [[reference_single_file_contract_shared_mock_rebase_dedup]]).

### 5.2 New sentinel block + structural guard extension

Add `// >>> BATCH-3 PROOF BLOCK START` / `// <<< BATCH-3 PROOF BLOCK END` around the 8 new proof cases. **Extend** the existing source-scan guard test (`adminOutcomeBehavior.test.ts:2408`, currently slicing the Batch-2 block) to ALSO slice the Batch-3 block and assert: it contains `proveAdminOutcomeBehavior(`, and contains NO direct `recordAdminOutcomeBehavior(` / `observeSuccessCodes(` / `observeCodes(` / `observeFailure(` call (the sole-recording invariant). The guard is generalized to iterate over both sentinel pairs so a Batch-N block cannot be added later without a matching guard.

---

## 6. Pin-0 and grandfather deletion (mechanism retirement)

After the 8 proofs land and the 8 rows are removed, `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` is empty. Rather than pin it at `toBe(0)`, **delete the mechanism** so there is no dormant escape hatch. Enumerated sites (from `grep -rn ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER`):

| Site | Action |
|---|---|
| `tests/log/mutationSurface/exemptions.ts:112` | Delete the `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` export (and the `GrandfatherUnit` type **iff** unused elsewhere — verify at plan time). |
| `tests/log/mutationSurface/exemptions.test.ts:6,29-45` | Delete the import and the entire `describe("ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER …")` block. |
| `tests/log/adminOutcomeBehavior.test.ts:14` | Delete the import. |
| `tests/log/adminOutcomeBehavior.test.ts:2430-2436` | Delete the grandfather-pin `it(...)` (the `new Set(...)` + `toBe(8)` + stale-entry check). |
| `tests/log/adminOutcomeBehavior.test.ts:1428` (comment) | Update the block comment to state the grandfather is fully retired (all admin surfaces proven). |
| Task 18 completeness assertion | Verify it no longer subtracts the grandfather set (it iterated `AUDITABLE_MUTATIONS` minus grandfather). After deletion it must assert **every** admin row has a `recorded` entry with **no exclusion**. This is the load-bearing strictness gain; the plan's final task re-reads Task 18 and removes any grandfather-subtraction term. |

**Ordering constraint (TDD):** the grandfather rows must be removed and the proofs added in the **same commit per surface** (removing a row without its proof reddens Task 18; adding a proof without removing the row is harmless but leaves the row). The mechanism-deletion (empty-array removal + pin-test deletion) is the **final** task, after all 8 proofs are green.

---

## 7. Acceptance criteria

- **AC-1** All 8 surfaces have an inline `proveAdminOutcomeBehavior` case inside the Batch-3 sentinel block; `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` green.
- **AC-2** `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` and all its consuming pin logic/tests are deleted; `grep -rn ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER tests/ lib/` returns nothing.
- **AC-3** Task 18 (completeness) asserts every admin `AUDITABLE_MUTATIONS` row has a `recorded` entry with no grandfather exclusion; green.
- **AC-4** `_metaMutationSurfaceObservability.test.ts` green (static discovery unaffected — no new/removed surfaces).
- **AC-5** The structural source-scan guard slices BOTH sentinel blocks and passes (each contains `proveAdminOutcomeBehavior(`, none contains a direct `record`/`observe*` call).
- **AC-6** "Poison has teeth" negative check documented for A1 + A4: dropping one injected seam turns the row RED with a connect/throw error (proves DB-free enforcement is real, not incidental).
- **AC-7** `@/lib/log` / `@/lib/log/logAdminOutcome` are NOT mocked anywhere in `adminOutcomeBehavior.test.ts`.
- **AC-8** Full `pnpm test` green modulo the four known env-dependent live-integration tests (`email-canonicalization`, `pg-cron-coverage`, `validation-schema-parity`, `test-auth-gate` Layer-2) — verified pre-existing at merge-base, not regressions.
- **AC-9** Real GitHub Actions CI green on the PR (`unit-suite` required check + both shards); `mergeStateStatus == CLEAN`.

---

## 8. Watchpoints / EXPLICITLY DO NOT RELITIGATE

Pre-loaded for the adversarial reviewer (cite the ratification, don't re-derive):

1. **Env-poison, not "CI has no DB," is the DB-free guarantee.** `databaseUrl()` falls back to `127.0.0.1:54322`; `unit-suite.yml` boots local Supabase. Ratified Batch-2 plan R5. The poison DSN `127.0.0.1:1` is unreachable by construction.
2. **`@/lib/log` is never mocked.** Ratified across the whole arc + invariant #10. The real logger + `setLogSink` is the capture mechanism; mocking it would make the proof tautological.
3. **Module `vi.mock` of `@/lib/sync/*` for Class B is NOT a rule violation.** The Batch-2 "no vi.mock" guard is scoped to the proof-block body and targets `@/lib/log`; seamless routes have no DI alternative. Ratified here (§5).
4. **A4's `fakeLeasePool` is test-only.** No production DI seam is added (the §9 alternative was considered and rejected to keep the arc test-only). If the fake proves intractable, that is the one genuine escalation point — flag to user, do not silently add production code.
5. **`clearAllMocks` does not restore implementations.** Success-leg mock impls are set inline per-case; shared mocks (`promoteSnapshot` for B1+B3) are `mockReset` + re-implemented in each leg. Ratified Batch-1 rebase ([[reference_single_file_contract_shared_mock_rebase_dedup]]).
6. **Single-file contract.** All proofs stay in the one `adminOutcomeBehavior.test.ts` (cross-file in-memory recorders are unreliable under Vitest per-file isolation — spec R11 F2, ratified). Do not propose splitting.
7. **Failure-status specificity.** Each failure leg pins an exact HTTP status (A1 409, A2 409, A3 409, A4 202, B1 404, B2 409, B3 409, B4 404) and, where the route emits a typed body `code`, `failureExpect.bodyCode`. Where the body key is `error` (not `code`) or absent (A4 202), only `status` is asserted — this is deliberate (the body-code assertion is opportunistic, the status is mandatory).

---

## 9. Rejected alternative (recorded so the reviewer does not propose it)

**Add a production DI seam to extract-agenda** (an injectable `claimLease`/`persistMerge` port so the committed path is reachable without emulating raw SQL). Rejected because: (a) the whole arc is test-only and batches 1–2 shipped zero production changes; (b) an in-memory tagged-template fake (§4) is feasible and keeps production untouched; (c) adding a production seam purely for testability expands blast radius and would itself need review of the seam's default wiring. This alternative is the **fallback of last resort** only if §4.2's fake proves genuinely intractable during TDD, and taking it requires flagging the user (§8.4).

---

## 10. Self-review additions applied

- **Guard conditions:** each proof's failure leg specifies the exact refusal (null read → 409, mock refusal code → 4xx, claim `queued` → 202). No prop is unbounded.
- **Numeric sweep:** the count **8** appears in §1, §2, §6, §7, AC-1; single-sourced from `exemptions.ts:112-129` (verified 8 entries). Failure statuses single-sourced in §8.7.
- **Existing-code citations:** every route file, `handle*` entry, emit line, AM:line, and grandfather site cited against the live tree (grep-verified this session — §2–§6). The A4 SQL-statement strings are the one deferred-to-plan set (per-statement grep is a plan pre-draft task, §4.2).
- **Tier×domain / CHECK / flag-lifecycle / dimensional-invariants / transition-inventory:** N/A — test-only, no DB DDL, no UI, no enum/CHECK, no config flag, no rendered component.
- **Disagreement-loop preempt:** §8 + §9.
