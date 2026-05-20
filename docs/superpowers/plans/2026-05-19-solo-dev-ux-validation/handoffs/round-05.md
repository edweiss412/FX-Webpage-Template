# Plan R5 Handoff — **VECTOR DECLARED UNRESOLVED + STRUCTURAL DEFENSES ADDED**

**Date:** 2026-05-20
**Codex thread ID:** captured from companion `blbuf44e0` output
**Diff base:** 09cfd70^
**Verdict:** needs-attention

## Same-vector recurrence declaration (per AGENTS.md + memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis`)

R1, R2, R3, R4, R5 all surfaced findings on the **live-code fidelity / schema-invariant** vector. A comprehensive re-analysis ran before R4 fired. R4 still surfaced 2 P0 findings on the vector (restriction columns + email canonicalization). R5 surfaced 1 P0 + 1 P1 still on the vector.

**Per the project rule:** when comprehensive re-analysis fails to converge AND the same vector keeps surfacing in subsequent rounds, the analysis was incomplete. **The vector is hereby declared UNRESOLVED for per-instance patching.** R5's resolution replaces per-instance patches with STRUCTURAL DEFENSES:

1. **New meta-test `tests/cross-cutting/validation-tooling-tz-pin.test.ts`** (created by Task 0.C.4 per R5 amendment to 00-overview's meta-test inventory): greps every `.sql` migration + `scripts/validation-*.ts` for `current_date`. Each match MUST be inside the bounded-skew sanity check OR carry an inline `// not-validation-today-iso: <reason>` waiver. Catches future TZ-pin drift at CI time.

2. **Extended meta-test `tests/cross-cutting/email-canonicalization.test.ts`** (existing meta-test registry extended): adds `scripts/validation-*.ts` to the audit scope. Flags any `lower(...)` / `trim(...)` not adjacent to a `canonicalize()` call from `lib/email/canonicalize.ts`. Catches future canonicalization-boundary leaks at CI time.

These structural defenses replace adversarial-review-round whack-a-mole. The PER-INSTANCE issues R5 named are STILL fixed in this commit (F1: validationTodayIso wired into all RPCs + check-seed; F2: corrected `canonicalize` helper name); but the recurrence is closed by the meta-tests, not by hoping the next review round catches the next instance.

## Findings (and dispositions)

| # | Severity | Phase file | Disposition |
|---|---|---|---|
| F1 | P0 / critical | `03-phase0-tooling-reseed.md` Task 0.C.4 SQL sketches | R4 said use `validationTodayIso` but the SQL sketches still wrote `current_date`. Finalizer signature only took p_required_combos. **Fixed (per-instance):** Mint RPC + finalize RPC + check-seed all rewritten to use `p_validation_today_iso` (text, YYYY-MM-DD UTC) from payload/args. RPCs validate within ±1 day of server current_date as a skew-sanity check only (not for stamping). **Fixed (structural):** new `validation-tooling-tz-pin.test.ts` meta-test catches future `current_date` drift in seed/finalize paths. |
| F2 | P1 / high | `03-phase0-tooling-reseed.md` Task 0.C.4 TS canonicalization snippet + `00-overview.md` meta-test inventory | Plan imported `canonicalizeEmail` but live helper is `canonicalize` (verified at `lib/email/canonicalize.ts:2`). No structural defense against the recurring canonicalization-boundary class. **Fixed (per-instance):** TS snippet now imports `canonicalize` (correct name). null-return check added: throws if a fixture email cannot be canonicalized. **Fixed (structural):** existing `email-canonicalization.test.ts` extended to audit `scripts/validation-*.ts`; flags any `lower()`/`trim()` not adjacent to a `canonicalize()` call. |

## Class-sweep additions

- **Structural defense over per-instance patching** — after 5 rounds on the same vector, structural meta-tests are the convergence path. Per-instance patches by themselves cannot converge a recurring vector.
- **Meta-test inventory must be live for the milestone, not retrospective** — R5 added the new meta-test to the inventory in 00-overview.md NOW (plan-time), so the milestone's CREATE/EXTEND list is honest.

## Repair commit

(Pending — single repair commit for plan R5 with both per-instance fixes AND the structural-defense meta-test additions.)

## Next round

R6 fires after the repair commit lands.

**Convergence expectation:** with the structural defenses in place, R6+ should NOT find any new live-code-fidelity drift unless the structural meta-tests themselves are misspecified. If R6 surfaces a finding on the same recurring vector despite the meta-tests, the meta-tests need refinement (a new vector inside the same class), not another per-instance patch.

**If R6 surfaces NO same-vector findings AND no other significant findings,** we can declare the recurring vector closed and proceed toward execution handoff. The user's 40-round budget permits continuing iteration, but the structural-defense pattern means fewer rounds should be needed.
