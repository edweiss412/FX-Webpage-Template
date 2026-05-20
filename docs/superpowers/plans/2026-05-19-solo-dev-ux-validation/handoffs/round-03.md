# Plan R3 Handoff

**Date:** 2026-05-20
**Codex thread ID:** captured from companion `bz5nfiihj` output
**Diff base:** 09cfd70^
**Verdict:** needs-attention

## Findings (and dispositions)

| # | Severity | Phase file | Disposition |
|---|---|---|---|
| F1 | P1 / high | `03-phase0-tooling-reseed.md` Task 0.C.4 RPC sketch + 0.C.3 fixture contract | `crew_members.role` populated from `payload->>'displayRole'` but fixture mapping didn't define displayRole. **Fixed:** RPC derives role inside the function from role_flags (master spec §6.6 compound convention: `array_to_string(role_flags, ' / ')`; empty flags → `'Validation Crew'`). No fixture-side change needed. |
| F2 | P1 / high | `03-phase0-tooling-reseed.md` Task 0.C.4 + 0.C.5 | Partial `--combo all` reseed could falsify check-seed: per-combo mint stamped last_seed_date=today even if later combos failed. **Fixed:** validation_state schema extended with `combos_seeded_dates jsonb NOT NULL DEFAULT '{}'::jsonb`. mint RPC stamps `combos_seeded_dates[combo] = current_date::text` per combo, NOT last_seed_date. New `validation_finalize_all_atomic(p_required_combos)` RPC verifies every required combo is today's-date-aligned, THEN updates last_seed_date. Reseed script calls finalize-atomic only after every per-combo mint succeeds. check-seed gains predicate (i) — fails if any required combo's seeded date != current_date. |
| F3 | P2 / medium | `03-phase0-tooling-reseed.md` validation_cleanup_atomic | Cleanup bumped `current_token_version` but left `max_issued_version` unchanged; live auth invariant `current ≤ max` could be violated. **Fixed:** SET `current_token_version = max_issued_version + 1, max_issued_version = max_issued_version + 1, revoked_below_version = 0, last_changed_at = now()`. Both fields step in lockstep; invariant preserved. |

## Class-sweep additions

- **Schema-mismatch class** — R1 caught `idempotency_key uuid`; R2 caught `shows.title` not `show_name`; R3 caught `displayRole` missing + `max_issued_version` ignored. EVERY new SQL sketch must grep the live initial-schema migration FIRST (`grep -A 30 "create table public.<table>" supabase/migrations/20260501000000_initial_public_schema.sql`).
- **Partial-run gating class** — multi-step writes that ALL stamp a top-level "freshness" indicator should instead stamp per-step state AND have a finalizer that promotes to top-level only after the full run succeeds. R3 instantiates this pattern for reseed.
- **Auth-invariant pairing class** — `current_token_version ≤ max_issued_version` is a live invariant; cleanup or version-bump paths must update BOTH fields in lockstep, not just current. R3 instantiates this for query-compromise reset.

## Repair commit

(Pending — single repair commit for plan R3.)

## Next round

R4 fires after the repair commit.
