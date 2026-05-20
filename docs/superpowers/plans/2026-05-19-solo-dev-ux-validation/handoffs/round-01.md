# Plan R1 Handoff

**Date:** 2026-05-20
**Codex thread ID:** captured from companion `bb9wdrz5x` output
**Diff base:** 09cfd70^ (parent of plan-tree first commit)
**Verdict:** needs-attention

## Findings (and dispositions)

| # | Severity | Phase file | Disposition |
|---|---|---|---|
| F1 | P0 / critical | `03-phase0-tooling-reseed.md` Task 0.C.4 | Advisory-lock topology violation — script acquired lock AFTER show UPSERT and used PostgREST (can't span lock + writes in one transaction). **Fixed:** Task 0.C.4 rewritten to create a `mint_validation_fixture_atomic` SECURITY DEFINER RPC matching `mint_link_session_atomic` + `revoke_leaked_link_atomic` pattern. ALL show/crew/auth/alias_map mutations land inside one transaction holding `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`. Companion `validation_cleanup_atomic` RPC for `--combo all` cleanup. Advisory-lock topology test (`tests/auth/advisoryLockRpcDeadlock.test.ts`) extended to register the new RPCs. |
| F2 | P1 / high | `05-phase0-tooling-report.md` Task 0.E.1 step 5 | Cleanup tag suggested `idempotency_key = 'validation:...'` but live `reports.idempotency_key` is `uuid`. **Fixed:** tagging moved to `reports.context jsonb` column — set `context.validation_tag = 'm12-fixture-<outcome>'`; cleanup query uses `WHERE context->>'validation_tag' LIKE 'm12-fixture-%'`. |
| F3 | P1 / high | `05-phase0-tooling-report.md` Task 0.E.0 | EXCLUDED path referenced MATRIX-INVENTORY.md which is created in Phase 1 — chicken-and-egg. **Fixed:** Phase 1 Task 1.0 splits — its band F slice is created HERE in new Task 0.E.0 (before disposition decision). Rest of MATRIX-INVENTORY is filled in Phase 1 Task 1.0 (just expands the file with bands A–E). Phase 0.E.1 is the disposition decision; works against the band F slice authored in 0.E.0. |
| F4 | P2 / medium | `02-phase0-validation-state.md` Tasks 0.B.6 + 0.B.11 | Placeholder script names. **Fixed:** updated to actual `package.json` script names — `pnpm gen:admin-tables`, `pnpm test:audit:traceability`, `pnpm test:audit:x3-trust-domain`. Baseline-regen step (0.B.9) reworded to acknowledge the exact procedure is project-local and the dev confirms before mass-editing JSON.

## Class-sweep additions

- **Live-package.json verification rule** — for any task that names a `pnpm` script, the script's exact name must be verified against the live `package.json`. R1 caught this for audit commands; future task additions referencing pnpm scripts should grep `package.json` first.
- **RPC-or-PostgREST contract for show-scoped mutations** — any future validation-tooling script that mutates show-scoped tables MUST go through a SECURITY DEFINER RPC (not PostgREST direct calls) because the advisory lock + writes need to share a single transaction.
- **Plan-time-artifact gating rule** — if a Phase N task references a plan-time artifact, that artifact must be created at or before Phase N's start, not later. MATRIX-INVENTORY's band F slice now lives in Phase 0.E.0 to satisfy this for the harness disposition gate.

## Repair commit

(Pending — committed together with the R1 patches as a single repair commit per the round-handoff convention.)

## Next round

R2 fires after the repair commit lands. Same fresh-eyes anchor on plan-base (current 09cfd70^ or whatever the milestone-base resolves to after the R1 repair commit lands).
