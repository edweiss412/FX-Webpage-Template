# Plan — BL-ADMIN-OUTCOME-BEHAVIOR Batch 1 (6 grandfathered server actions)

Spec: `docs/superpowers/specs/2026-07-05-admin-outcome-behavioral-coverage-registry.md`. Test-only. One PR closes 6 of 30 grandfathered surfaces; pin 30 → 24.

**Meta-test inventory:** EXTENDS `tests/log/adminOutcomeBehavior.test.ts`; edits registry data in `tests/log/mutationSurface/exemptions.ts`. No new meta-test file. No `pg_advisory*` (test-only) → holder-topology N/A. No new §12.4 code, no Supabase call-boundary surface.

## Task 1 — add mock infra + imports to `adminOutcomeBehavior.test.ts`

- Extend the `next/cache` mock to also export `revalidateTag: vi.fn()` (additive; inert for Tasks 7–14).
- `vi.mock` the four lifecycle callers with swappable `vi.fn`s (default `{ ok: true }`): `@/lib/showLifecycle/archiveShow` (`archiveShow`), `@/lib/showLifecycle/unarchiveShow` (`unarchiveShow`), `@/lib/showLifecycle/publishShow` (`publishShow`), `@/lib/showLifecycle/unpublishShow` (`unpublishShow`).
- `vi.mock` the feed deps: `@/lib/sync/holds/mi11GateActions` (`approveMi11Hold`, `rejectMi11Hold`), `@/lib/sync/holds/undoChange` (`undoChange`), defaults `{ ok: true, showId: SHOW_ID }`.
- Import the 6 actions from their `_actions` modules (`archiveShowAction`, `unarchiveShowAction`, `setShowPublishedAction`, `mi11ApproveAction`, `mi11RejectAction`, `undoChangeAction`).
- Add `beforeEach` resets for the 7 new mocks (default success).

Verify: `pnpm typecheck` + the file still imports/loads (`pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` — still green, grandfather still 30).

## Task 2 — RED: remove 6 grandfather rows + flip pin

- Delete the 6 action rows from `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`exemptions.ts:167-172`: archiveShowAction, unarchiveShowAction, setShowPublishedAction, mi11ApproveAction, mi11RejectAction, undoChangeAction), leaving 24.
- Update the doc-comment (`exemptions.ts:118-123`): "…24 pre-existing admin route POSTs + 6 pre-existing admin action functions" → note the 6 action functions have graduated to inline proof; 24 route POSTs remain grandfathered; keep "frozen, never grows."
- Flip the pin `adminOutcomeBehavior.test.ts:953` `toBe(30)` → `toBe(24)`.
- Confirm the suite is **RED**: the Task-18 coverage test (`:965`) reports the 6 now-unproven `file::fn::code` rows as missing. (Records the negative-regression proof — the contract has teeth.)

## Task 3 — GREEN: add the 6 inline behavioral cases

One `test(...)` per surface (new `describe("Batch 1 — grandfathered server actions graduate to inline behavioral proof")`), each: success drive via `observeSuccessCodes` (NO `{redirect:true}` — these return values) → assert code observed → `recordAdminOutcomeBehavior({file, fn, code})`; paired failure via `observeCodes` → assert code absent. Per-surface details:

- **archiveShowAction** — `serverClientImpl.current` resolves `from("shows")…maybeSingle()` → `{ data: {id, drive_file_id}, error:null }`; `archiveShow` → `{ok:true}`; observe `SHOW_ARCHIVED`. Fail: `archiveShow` → `{ok:false, code:"ARCHIVE_BLOCKED"}` → absent.
- **unarchiveShowAction** — resolve `{id, drive_file_id}`; `unarchiveShow` → `{ok:true}`; observe `SHOW_UNARCHIVED_BY_ADMIN`. Fail: `{ok:false}` → absent.
- **setShowPublishedAction** — resolve `{id, drive_file_id}`; `publishShow`/`unpublishShow` → `{ok:true}`. Drive `(slug,true)` → observe+record `SHOW_PUBLISHED`; drive `(slug,false)` → observe+record `SHOW_UNPUBLISHED_BY_ADMIN` (BOTH codes recorded). Fail: `unpublishShow` → `{ok:false, code:"FINALIZE_OWNED_SHOW"}` → absent.
- **mi11ApproveAction** — `approveMi11Hold` → `{ok:true, showId}`; `FormData{holdId}`; observe `MI11_HOLD_APPROVED`. Fail: `{ok:false, code:"IDENTITY_WOULD_COLLIDE"}` → absent.
- **mi11RejectAction** — `rejectMi11Hold` → `{ok:true}`; observe `MI11_HOLD_REJECTED`. Fail: `{ok:false, code:"MI11_HOLD_GONE"}` → absent.
- **undoChangeAction** — `undoChange` → `{ok:true, showId}`; `FormData{changeLogId}`; observe `CHANGE_UNDONE`. Fail: `{ok:false, code:"CHANGE_ALREADY_UNDONE"}` → absent.

Confirm suite **GREEN**; grandfather = 24, pin `toBe(24)`.

## Task 4 — verify + commit

- `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts tests/log/_metaMutationSurfaceObservability.test.ts` green.
- Negative-regression checks (spec §5): momentarily (a) leave pin at 30 → RED, (b) drop one `record` call → RED; restore.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, then full `pnpm test`.
- One commit: `test(log): inline behavioral coverage for 6 grandfathered admin actions (grandfather 30→24)`.

## Anti-tautology / failure-mode notes

- Each success case is paired with a failure case asserting the code is ABSENT → proves the record is committed-success-gated, not unconditional (the concrete failure mode: an action that emits regardless of outcome would pass a success-only test but fail the paired negative).
- `observeSuccessCodes` (no redirect) rethrows any throw → a surface that emits then throws cannot be falsely recorded.
- Values derived from each action's real success shape (resolve row + `{ok:true}` caller), not hardcoded to force a pass.
