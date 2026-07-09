# Spec — Close BL-ADMIN-OUTCOME-BEHAVIOR: backfill grandfathered admin behavioral coverage (batched)

**Date:** 2026-07-05
**Slug:** `admin-outcome-behavioral-coverage-registry`
**Backlog item:** BL-ADMIN-OUTCOME-BEHAVIOR (orchestrator-tracked)
**This PR = Batch 1 of a sequenced series** (user chose batched ratchet). Blast radius (Batch 1): **test-only** — extends `tests/log/adminOutcomeBehavior.test.ts` and shrinks the grandfather list in `tests/log/mutationSurface/exemptions.ts`. No production code, no UI, no DB, no advisory-locks.

---

## 1. Background (corrected)

PR #306 ("invariant-10-mutation-observability") landed AGENTS.md **invariant #10**: every admin mutation surface must have registry membership **plus executable success-branch behavioral proof** — "a sink-spy that records only after observing the code on the committed-success branch." It is enforced by `tests/log/adminOutcomeBehavior.test.ts` (executable) and `tests/log/_metaMutationSurfaceObservability.test.ts` (static discovery).

`adminOutcomeBehavior.test.ts` is a **single-file** executable contract (deliberately — spec R11 F2: a cross-file in-memory recorder is unreliable under Vitest per-file isolation, `adminOutcomeBehavior.test.ts:1-4`). It:

- discovers admin surfaces via `collectSurfaceUnits(["app","lib","components"]).filter(u => u.admin)` (`:948`);
- drives each surface's success branch through `observeSuccessCodes` (`:280-311`) — which asserts the action actually reached committed-success (rethrows any non-`NEXT_REDIRECT` throw, so emit-then-throw ≠ success) — and records `${file}::${fn}::${code}` into a **file-local** `recorded` set via `recordAdminOutcomeBehavior` (`:244-246`);
- **Task 18** (`:947-978`) asserts every registered admin `AUDITABLE_MUTATIONS` row that is **not** in `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` has a `recorded` entry — i.e. behavioral proof is mandatory for every non-grandfathered admin surface.

`ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`exemptions.ts:124-173`) is a **frozen 30-row** baseline (24 pre-existing admin route POSTs + 6 pre-existing admin action functions) that already emit a success outcome but lack an **inline** `observeSuccessCodes` record. Task 18a (`:952-963`) pins `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.length === 30`.

**Correction note:** an earlier draft of this spec (commit 55f1ed42) mis-scoped the work after auditing a stale pre-#306 tree; Codex adversarial review round 1 caught it. This is the corrected spec.

## 2. Goal & closure strategy

Close BL-ADMIN-OUTCOME-BEHAVIOR by moving all 30 grandfathered surfaces from `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` into the proven `recorded` set — writing one inline `observeSuccessCodes` behavioral case per surface in `adminOutcomeBehavior.test.ts` (success emit observed + a paired failure/refusal case emitting nothing), then deleting the grandfather rows and decrementing the `.length` pin. When the list reaches 0, Task 18 covers **every** admin surface and the contract is strict.

**Batched delivery** (each batch = one PR; the pin ratchets down; every PR keeps the suite green because a removed grandfather row is simultaneously proven):

| Batch | Surfaces | Difficulty | Pin after |
| --- | --- | --- | --- |
| **1 (this PR)** | 6 server actions (archive, unarchive, setPublished, feed×3) | Low — actions delegate to a mockable caller; existing cross-file tests give the recipe | 30 → **24** |
| 2 | Admin route POSTs that already export a `handle*(req, ctx, deps)` DI seam (e.g. finalize, staged apply, extract-agenda) | Medium — adapt the Task-14 injected-deps pattern | 24 → N |
| 3 | Plain-POST admin routes with no DI seam (e.g. `sync/[slug]`, `snapshot-rollback/repair`) | High — module-mock deps, or add a production DI seam | N → 0 |

Batches 2 and 3 get their own specs/plans/PRs. This spec details **Batch 1** only.

## 3. Batch 1 — the 6 grandfathered server actions

Each is an admin-gated `"use server"` action that already calls `logAdminOutcome` on its committed-success branch (proven today by a **cross-file** test that this batch does not touch). The batch replicates that proof **inline** in `adminOutcomeBehavior.test.ts`, using the **real** logger (the file forbids mocking `@/lib/log` / `logAdminOutcome`, `:15-16`).

### 3.1 Surfaces, codes, and registry rows (`_auditableMutations.ts:57-155`)

| Grandfather unit (`file::fn`) | Code(s) recorded | Success-emit source (existing cross-file proof) |
| --- | --- | --- |
| `app/admin/show/[slug]/_actions/archive.ts::archiveShowAction` | `SHOW_ARCHIVED` | `tests/app/admin/show-lifecycle-actions.test.ts:176` |
| `app/admin/show/[slug]/_actions/unarchive.ts::unarchiveShowAction` | `SHOW_UNARCHIVED_BY_ADMIN` | `show-lifecycle-actions.test.ts:145` |
| `app/admin/show/[slug]/_actions/setPublished.ts::setShowPublishedAction` | `SHOW_PUBLISHED` **and** `SHOW_UNPUBLISHED_BY_ADMIN` (two registry rows, `_auditableMutations.ts:69-75`) | `tests/app/admin/set-published-action.test.ts:100` |
| `app/admin/show/[slug]/_actions/feed.ts::mi11ApproveAction` | `MI11_HOLD_APPROVED` | `tests/admin/feedTelemetry.test.tsx:47` |
| `app/admin/show/[slug]/_actions/feed.ts::mi11RejectAction` | `MI11_HOLD_REJECTED` | `feedTelemetry.test.tsx:77` |
| `app/admin/show/[slug]/_actions/feed.ts::undoChangeAction` | `CHANGE_UNDONE` | `feedTelemetry.test.tsx:101` |

**7 `recorded` rows** across **6 grandfather units**. All 7 codes are already SHOUTY producers in `_auditableMutations.ts` (`:305-324`) — no new codes, no §12.4 touch.

### 3.2 Inline mock recipe (added to `adminOutcomeBehavior.test.ts`)

The file already mocks `@/lib/auth/requireAdmin` (`requireAdmin`/`requireAdminIdentity`), `@/lib/supabase/server` (swappable `serverClientImpl.current`), `next/cache` (`revalidatePath` only), and `next/navigation`. Batch 1 adds:

1. **`next/cache` gains `revalidateTag`.** setPublished/archive/unarchive call `revalidateTag` (via `revalidateShow`) on success; the current mock omits it. Add `revalidateTag: vi.fn()`. Safe for existing tests (additive).
2. **Lifecycle caller mocks** (`vi.mock`, per-test swappable via a `.current` ref or `mockResolvedValue`): `@/lib/showLifecycle/archiveShow` → `archiveShow`; `@/lib/showLifecycle/unarchiveShow` → `unarchiveShow`; `@/lib/showLifecycle/publishShow` → `publishShow`; `@/lib/showLifecycle/unpublishShow` → `unpublishShow`. Default `{ ok: true }`.
3. **Feed dependency mocks:** `@/lib/sync/holds/mi11GateActions` → `approveMi11Hold`/`rejectMi11Hold`; `@/lib/sync/holds/undoChange` → `undoChange`. Default `{ ok: true, showId }`.
4. **Imports:** the 6 actions from their `_actions` modules.

None of these modules is imported/mocked elsewhere in the file (verified), so the additions are inert for existing Tasks 7–14.

### 3.3 Per-surface test shape

For each surface, one `test(...)`:

- **Success:** set the caller mock to `{ ok: true, ... }` and (for archive/unarchive/setPublished) `serverClientImpl.current` so `from("shows")…maybeSingle()` resolves the show row (`{ data: { id, drive_file_id }, error: null }`); drive via `observeSuccessCodes(() => action(...))` (no `redirect` — these return a value); assert the code is observed; call `recordAdminOutcomeBehavior({ file, fn, code })`.
- **Failure/refusal (paired, non-tautology):** caller mock returns `{ ok: false, code }` (or resolve returns a missing/`error` row); drive via `observeCodes`; assert the code is **absent**. This proves the recording is committed-success-gated, not unconditional.

setPublished gets **two** success drives — `next=true` → `SHOW_PUBLISHED`, `next=false` → `SHOW_UNPUBLISHED_BY_ADMIN` — each recorded.

### 3.4 Grandfather removal + pin

Delete the 6 batch-1 rows from `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`exemptions.ts:167-172`), leaving **24**. Update the pin assertion `adminOutcomeBehavior.test.ts:953` from `toBe(30)` to `toBe(24)`. Update the doc-comment count at `exemptions.ts:118-123` (currently "exactly …30… 24 pre-existing admin route POSTs + 6 pre-existing admin action functions") to reflect that the 6 action functions have graduated to inline proof (now 24 route POSTs remain grandfathered) — keep the "frozen, never grows" framing.

## 4. Guard conditions / edge cases

- **`observeSuccessCodes` rethrow semantics** (`:280-311`): these 6 actions return values (no redirect), so any thrown error must fail the test — correct, `observeSuccessCodes` without `{redirect:true}` rethrows every throw. Do NOT pass `{redirect:true}`.
- **Real logger, not a mock** (`:15-16`): the batch must NOT add a `vi.mock("@/lib/log/logAdminOutcome")`. The existing cross-file recipes (show-lifecycle, set-published) mock it — that recipe is for the caller/order assertions, NOT copied here; here the sink observes the real emit.
- **`beforeEach` reset:** the file's `beforeEach` (`:372-410`) resets the existing mocks; add resets for the 4 lifecycle + 3 feed mocks so cross-test bleed can't manufacture a false success.
- **Task 18 pin test** (`:952`, `expect(...length).toBe(30)`) stays exact (`toBe`), not `<=` — the frozen baseline only ever shrinks; a stale/duplicated grandfather row must fail. This batch changes it to `toBe(24)`.
- **Task 18 stale-entry guard** (same test, `:955-962`): each remaining grandfather row must still resolve to a live admin surface — untouched by removing rows.

## 5. TDD / non-tautology proof (negative-regression)

1. Removing a batch-1 grandfather row WITHOUT its inline recording test → **the Task 18 coverage test (`:965`) must go red** (surface registered, not grandfathered, not recorded). This is the natural TDD order: delete the grandfather row + flip the pin FIRST (red), then add the recording test (green).
2. Point one success case's caller mock at `{ ok: false }` while keeping the `record` call → the paired failure assertion / a deliberate check must catch that the emit is committed-success-gated. (Executed during implementation, then reverted.)
3. `toBe(24)` pin: temporarily leave it at `30` after deleting 6 rows → **the Task 18 pin test (`:952`) must go red** (proves the pin tracks the real length).

## 6. Meta-test inventory

**EXTENDS** `tests/log/adminOutcomeBehavior.test.ts` (adds 6 inline behavioral tests + mocks) and edits the registry data in `tests/log/mutationSurface/exemptions.ts` (removes 6 grandfather rows). No new meta-test file. No advisory-lock (`pg_advisory*`) surface (test-only) → holder-topology declaration N/A. No new §12.4 code, no new Supabase call-boundary surface.

## 7. Watchpoints (disagreement-loop preempts)

- **Batching is user-chosen**, not a scope dodge — this PR closes 6 of 30; batches 2–3 (routes) follow in their own PRs. The pin goes 30 → 24 here, not 30 → 0.
- **Do NOT mock `logAdminOutcome`** inline (`:15-16`) — the whole point is the real sink-spy. The cross-file tests' `logAdminOutcome` mock is a different (caller-assertion) technique and is intentionally not reused.
- **setPublished is ONE grandfather unit but TWO recorded rows** (`file::fn` grandfather key vs `file::fn::code` recorded key) — both codes must be recorded or Task 18 fails for the unrecorded direction.
- **`revalidateTag` added to the shared `next/cache` mock** is additive and inert for Tasks 7–14 (none assert the mock's exact shape).

## 8. Verification

- `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` — green (Task 18 now requires + proves the 6; pin `toBe(24)`).
- `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts` — green (static discovery unaffected; the 6 surfaces remain registered).
- Negative-regression §5 each observed red then restored.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- Full `pnpm test` before push (shared test-infra edit; scoped gates miss cross-file regressions).
