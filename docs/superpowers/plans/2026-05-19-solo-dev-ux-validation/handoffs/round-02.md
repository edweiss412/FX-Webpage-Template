# Plan R2 Handoff

**Date:** 2026-05-20
**Codex thread ID:** captured from companion `ba1esq9zo` output
**Diff base:** 09cfd70^
**Verdict:** needs-attention

## Findings (and dispositions)

| # | Severity | Phase file | Disposition |
|---|---|---|---|
| F1 | P1 / high | `03-phase0-tooling-reseed.md` Task 0.C.4 RPC sketch | RPC sketch used `shows.show_name` but live `public.shows` table has `title` (not show_name) + NOT NULL `client_label` + NOT NULL `template_version`; crew_members has NOT NULL `role`. **Fixed:** SQL sketch verified against `supabase/migrations/20260501000000_initial_public_schema.sql:3-47`. Rewrote with correct column names: `title`, `client_label='M12 Validation'`, `template_version='v4'`, `crew_members.role = payload.displayRole`, `email = lower(trim(...))` per the canonicalization CHECK. |
| F2 | P1 / high | `07-phase1-matrix-walk.md` Task 1.0 | Task 1.0 said "Create" MATRIX-INVENTORY.md but Phase 0.E.0 (R1 fix) already committed it with band F. Risk of overwrite. **Fixed:** Task 1.0 retitled to "EXTEND" with bands A-E only. Band F derivation source (step 6) now says "ALREADY DONE in Phase 0.E.0 — skip". Pre-flight grep check before commit. Updated commit message to reflect extension not creation. |
| F3 | P1 / high | `03-phase0-tooling-reseed.md` Task 0.C.4 step 4 (cleanup) | Cleanup RPC was both "pseudo-combo on mint_validation_fixture_atomic" AND "separate validation_cleanup_atomic" — dual-entry-point ambiguity. **Fixed:** explicit SQL sketch for `validation_cleanup_atomic(p_validation_project_ref text)` — single entry point. Per-show advisory lock acquired for EACH validation show (drive_file_id LIKE 'validation_%'). Validation-only predicate: `revoked_reason LIKE 'validation:%'`. Structural-reset path for query-compromise aliases (DELETE all revoked_links matching identity + bump current_token_version + zero revoked_below_version). Project-ref safety check at function start. Step 5 explicitly RETRACTS the `__cleanup__` pseudo-combo from the mint RPC. |

## Class-sweep additions

- **Live-schema verification rule for every SQL sketch** — R2's F1 caught a column-name mismatch the spec review didn't see. Future plan additions with SQL sketches must verify against the live initial-schema migration BEFORE landing.
- **Plan-time artifact merge-not-overwrite rule** — when Phase N task creates an artifact AND Phase M (M > N) extends it, the extension task MUST say "modify/merge" and include a pre-flight invariant check (`grep -c "..."`).
- **Single-entry-point rule for cleanup RPCs** — multiple entry points into the same cleanup logic invite ambiguity. One RPC, one signature, one set of side effects.

## Repair commit

(Pending — single repair commit for plan R2.)

## Next round

R3 fires after the repair commit lands.
