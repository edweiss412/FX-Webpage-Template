# M12 — Solo-Dev UX Validation Implementation Plan (Overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solo-dev gate where the developer personally exercises every surface in the FXAV crew-pages product before any real user (Doug, real crew) touches it. Phase 0 stands up the prod-equivalent stack + 6 validation CLIs + atomic master-spec/admin-table updates for the new `validation_state` table. Phase 1 walks the matrix (≈650-850 cells across 8 personas × 6 surface bands × 9 role variants × 10 R-combos × 6 SW-states), runs 4 cross-surface journeys, runs the cold-start /help-as-map pass, iterates fixes, runs final sweep, signs off. Exit gate: MUST-FIX list empty AND dev signs the one-paragraph subjective gate ("I'd be proud to show Doug").

**Architecture:** Prod-equivalent Vercel (production-target deployment, no custom domain) + real Supabase prod + real Drive service account. Validation tooling lives in `scripts/validation-*.ts` with a dedicated `validation_state` singleton table (admin-only, 116-leaf nested alias_map jsonb). Atomic master-spec amendments add `validation_state` to §4.3 admin-only list AND §4.1 CREATE TABLE block; regenerated `lib/audit/admin-tables.generated.ts` + updated test baselines land in the same Phase 0 PR. No exercise-output artifact required (per spec §8.1 + §11.3.1 trust-axis); SIGN-OFF.md paragraph is the only required exercise artifact.

**Tech Stack:**

- Next.js 16 App Router (existing) on Vercel production-target deployment without custom domain
- Supabase (existing) — new singleton table `validation_state`
- TypeScript scripts via `tsx` — 6 new CLIs: `validation:reseed`, `validation:check-seed`, `validation:resolve-alias`, `validation:mint-link`, `validation:revoke-link`, `validation:report-fixtures`
- Vitest for any plan-time tests (matches project convention from `tests/db/`)
- `lib/auth/jwt.ts` `signLinkJwt()` (existing, re-used) — validation tooling indirects three env vars (JWT_SIGNING_SECRET + SUPABASE_URL + SUPABASE_SECRET_KEY) from VALIDATION_-prefixed variants
- Master spec: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` (amended atomically in Phase 0)
- M12 canonical spec: `docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md` (25-round adversarial-reviewed)

---

## How to use this plan

1. **Spec is canonical** (AGENTS.md invariant #7). Every task references a spec section (`§3.3.2`) or smoke ID (`smoke 6`). When a task and the spec disagree, the spec wins — open a question, do not silently fix in the plan. The M12 spec has 25 rounds of adversarial review baked in; trust it.
2. **Work phase-by-phase, top-to-bottom within each file.** Phase order is strictly **0.A → 0.B → 0.C → 0.D → 0.E → 0.F → Phase 1 → Iteration → Final sweep → Sign-off**, per spec §9.0. No parallelization — Phase 0 builds the prerequisites for Phase 1; Phase 1's fixes feed back through targeted re-exercise.
3. **TDD per task** (AGENTS.md invariant #1) for every code-producing task. Each: failing test → minimal implementation → passing test → commit. Phase 1's walk-the-product tasks are NOT TDD — they're manual exercise; the dev keeps informal working notes but the only required output is SIGN-OFF.md per spec §8.1.
4. **Commit per task** (AGENTS.md invariant #6). Conventional-commits style `<type>(<scope>): <summary>`. Common scopes: `validation` (tooling scripts), `db` (validation_state migration), `master-spec` (master-spec amendments per §3.3.2), `signoff` (Phase 1/iteration/final sweep). The bare `m12:` form is acceptable for cross-cutting commits where no scope adds clarity.
5. **Routing.** Per `ROUTING.md`, M12 plan execution is Opus/Claude Code for UI-touching work AND for the validation tooling scripts. Master-spec amendments and migrations follow the same routing. Codex (cross-CLI) runs adversarial review on the plan (this document tree) per AGENTS.md mandatory step.

---

## Sequencing dependency on M11

**M12 starts only after M11 closes** (spec §10). M11 (`/help` docs at `docs/superpowers/plans/2026-05-12-user-facing-docs/`) ships 13 `/help` pages that are load-bearing on the cold-start pass (§6) AND part of the matrix's surface band D (§4.2). If M11 has not closed when M12 is ready to start, the dev WAITS — no soft-start.

If a /help page surfaces a bug during M12, the fix lands in M12's plan execution (per spec §10) — M11 stays closed. If the bug is severe enough that M11 should re-open, that's a separate user decision; the default is fix-here.

---

## File structure (created or modified by M12)

```
# Validation tooling — created in Phase 0
scripts/validation-reseed.ts                          # Phase 0.C — reseeds 16 fixture combos with crew_members + crew_member_auth + alias_map
scripts/validation-check-seed.ts                      # Phase 0.C — verifies seed freshness + target consistency
scripts/validation-resolve-alias.ts                   # Phase 0.C — combo+alias → crew_id lookup
scripts/validation-mint-link.ts                       # Phase 0.D — signs JWT directly via env-mapped signLinkJwt
scripts/validation-revoke-link.ts                     # Phase 0.D — verifies JWT, INSERTs revoked_links from payload
scripts/validation-report-fixtures.ts                 # Phase 0.E — service-role materializes report-pipeline outcome rows

# Migration + cross-document amendments — created/modified in Phase 0
supabase/migrations/<timestamp>_validation_state.sql  # Phase 0.B (create) — new admin-only table
docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md  # Phase 0.B (modify) — §4.3 line 605: 21→22 admin-only tables; §4.1 schema-section: CREATE TABLE validation_state; AC-2.5 line 3489: 21→22 / 84→88
lib/audit/admin-tables.generated.ts                   # Phase 0.B (regenerated) — adds validation_state to ADMIN_TABLES
tests/db/rls.test.ts                                  # Phase 0.B (modify) — line 163-164: 21→22
tests/db/admin-rls-runtime.test.ts                    # Phase 0.B (modify) — 7 references: 21→22
tests/db/admin-rls-runtime.baseline.json              # Phase 0.B (regenerated) — adds validation_state × 4 verbs
tests/cross-cutting/auth.test.ts                      # Phase 0.B (modify) — line 203: ADMIN_TABLES literal-list includes 'validation_state'

# package.json — modified in Phase 0
package.json                                          # Phase 0.C/D/E (modify) — adds 6 validation:* script entries

# Local env documentation — modified in Phase 0
.env.local.example                                    # Phase 0.A (modify) — documents 4 new VALIDATION_* env vars

# Plan-time artifact — created in Phase 1
docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md  # Phase 1 task 1 (create) — full matrix derivation per spec §4.1.1

# Exercise artifact — created in Sign-off
docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/SIGN-OFF.md  # Final sign-off (create) — single required exercise output per spec §8.1
```

**Plan-tree files:**

```
docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/
  00-overview.md                              # this file
  01-phase0-infra.md                          # Phase 0.A: Vercel + Supabase + Drive prod stand-up
  02-phase0-validation-state.md               # Phase 0.B: migration + master spec amendments + test baselines
  03-phase0-tooling-reseed.md                 # Phase 0.C: reseed + check-seed + resolve-alias scripts
  04-phase0-tooling-link.md                   # Phase 0.D: mint-link + revoke-link scripts
  05-phase0-tooling-report.md                 # Phase 0.E: report-fixtures harness (BLOCKING by default — see §9.0)
  06-phase0-smokes.md                         # Phase 0.F: 6+1 smoke tests
  07-phase1-matrix-walk.md                    # Phase 1: matrix walk + 4 journeys + cold-start pass
  08-iteration-and-final-sweep.md             # Iteration loop + final sweep + sign-off
  DEFERRED.md                                 # Per-plan deferred items (any SHOULD-FIX routed here)
  HANDOFF-TEMPLATE.md                         # Round-by-round audit trail template (for the plan's own adversarial review)
  README.md                                   # Plan catalog entry
  ROUTING.md                                  # Implementer assignment
  handoffs/                                   # Per-round handoff docs (empty at plan-write time)
```

---

## Plan-wide invariants (M12-specific, layered on AGENTS.md global)

These extend AGENTS.md's 9 plan-wide invariants. Violating any is a P0 bug regardless of test status.

1. **TDD per task** (AGENTS.md #1) — applies to every code-producing task. Exercise tasks (Phase 1 walk + iteration walks + final sweep) are NOT code-producing and are manual.
2. **Commit per task** (AGENTS.md #6) — `<type>(validation|db|master-spec|signoff): <summary>` format.
3. **Spec is canonical** (AGENTS.md #7) — M12 spec is at `docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md` after 25 rounds of adversarial review.
4. **No exercise-time per-cell artifact** (M12-specific, spec §8.1 + §11.3.1) — the plan must NOT add structural artifacts (per-cell check-marks, screenshots, recordings) for the exercise output. The dev's working notes are informal. The SIGN-OFF.md paragraph is the only required exercise artifact.
5. **MATRIX-INVENTORY.md is plan-time, not exercise-time** (spec §4.1.1 + §11.3.1) — this is the canonical exception to invariant 4. It's a one-shot derivation, frozen before Phase 1, not updated during the walk.
6. **Validation tooling target-consistency** (spec §3.3 step 5 + §5.3 + §9.1.2) — every validation CLI rejects localhost / 127.0.0.1 / ::1 (without `--allow-local-override`) and stamps `seeded_supabase_project_ref` so check-seed catches target drift.
7. **Three-env-var mapping for signing** (spec §5.3 R22 amendment) — `validation:mint-link` MUST map ALL THREE env vars (JWT_SIGNING_SECRET + SUPABASE_URL + SUPABASE_SECRET_KEY) from their VALIDATION_-prefixed variants. Mismatched secrets/URLs abort with diagnostic.
8. **Singleton + drift-safe DDL** (spec §3.3.2) — `validation_state` is keyed by `key = 'validation_seed'` (single row). Migration uses `CREATE TABLE IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT` (drift-safe CHECK enum) + `DROP POLICY IF EXISTS + CREATE POLICY` (idempotent policy) + `ADD COLUMN IF NOT EXISTS + ALTER COLUMN SET ... + DO $$ RAISE EXCEPTION on type drift END $$` (alias_map drift repair). Apply-twice safe AND enum-drift safe AND type-drift fail-loud.
9. **Atomic master-spec amendment with migration** (spec §3.3.2 step 3) — Phase 0.B is ONE PR (or commit series in a single PR) that includes: migration + script + master-spec §4.3 amendment + §4.1 CREATE TABLE + admin-tables generator regen + AC-2.5 update + test baseline updates (rls.test.ts, admin-rls-runtime.test.ts × 7 refs, baseline.json, auth.test.ts). Phase 0.B does NOT close until X.3 / X.6 / admin-table tests pass against the updated artifacts.
10. **Walk-session gate before every walk** (spec §3.3 step 5) — `pnpm validation:check-seed` must run before initial sweep, before each targeted re-exercise after a fix, and before final sweep. Stale fixtures block walks. The `validation_state.last_seed_date` stamp + `seeded_supabase_project_ref` are the gate predicates.
11. **Default-up triage** (spec §7.1) — borderline findings classify UP (MUST > SHOULD > NICE). When in doubt, MUST. Confidence-shake test is the rubric pivot, not surface-depth.
12. **Final sweep zero-MUST gate** (spec §7.2 step 7) — if the final full sweep surfaces any new MUST-FIX, return to step 3 (re-triage). Sign-off requires a CLEAN final sweep (zero new MUST-FIX), not arbitrary completion of step 7.

---

## Meta-test inventory (per AGENTS.md writing-plans additions)

This milestone EXTENDS the following existing structural meta-tests:

| Meta-test | Phase | Extended in task | Update |
| --- | --- | --- | --- |
| `tests/db/rls.test.ts` | 0.B | Task 0.B.6 | Lines 163-164: `21` → `22` (admin-only table count assertion) |
| `tests/db/admin-rls-runtime.test.ts` | 0.B | Task 0.B.7 | 7 references on lines 4 / 9 / 21 / 111 / 112 / 213 / 218: `21` → `22` |
| `tests/db/admin-rls-runtime.baseline.json` | 0.B | Task 0.B.8 | Regenerated to include `validation_state` × 4 verbs (4 new rows) |
| `tests/cross-cutting/auth.test.ts` | 0.B | Task 0.B.9 | Line 203 (`ADMIN_TABLES` literal expectation): extend the list to include `'validation_state'` in alphabetical position (between `recovery_drift_cooldowns` and `report_rate_limits`, or where the sort lands) |

This milestone does NOT CREATE new structural meta-tests — `validation_state`'s admin-only contract is enforced by EXISTING meta-tests once the registry is updated. Per AGENTS.md "Meta-test inventory (mandatory)" rule, this declaration is the formal statement.

---

## Disagreement-loop preempt (likely-relitigated contracts)

These are the contracts most likely to draw fresh-eyes review challenges; preempt them with explicit cites so adversarial-review rounds don't relitigate.

| Contract | Pre-resolved by | Cite |
| --- | --- | --- |
| Exercise output requires only the SIGN-OFF.md paragraph; no per-cell tracking | Spec brainstorming Q "Artifact shape" | M12 spec §8.1 + §11.3.1 + §15.1 (R1 trust-axis decision) |
| 4 journeys are deliberate; additional journeys are sub-paths or matrix-covered | Spec brainstorming Q "Shape" + R0 framing | M12 spec §5.6 |
| Solo-dev only; Doug/real-crew NOT in this milestone | R0 framing (relationship-protection rationale) | M12 spec §1.5 |
| Prod-equivalent without custom domain (production-target Vercel + *.vercel.app URL) | Spec brainstorming Q "Prod-readiness" + R3 Vercel-cron fix | M12 spec §2 + §9.1 |
| Two-token architecture: JWT (carried in URL fragment) ≠ link_sessions.token (opaque, minted on redemption) | R19 + R20 + R21 + R22 factual findings against live code | M12 spec §9.1.2 mint-link + revoke-link rows |
| LEAD unlocks ALL THREE scope tiles unconditionally | R20 factual finding (lib/visibility/scopeTiles.ts) | M12 spec §3.4.1 pairs 1, 2, 3, 11 |
| dateRestriction affects Right Now + Schedule only — NOT scope tiles and NOT pack-list | R19 + R24 factual findings against live code | M12 spec §3.3 R-combo R3 row + §3.4.1 pairs 4-7 |
| Pack-list visibility is gated by stage_restriction + day-phase (set/strike/travel-out per master spec line 2395) | R19 factual finding | M12 spec §3.3.1 + §3.4.1 |
| validation_state RLS is `admin_only FOR ALL TO anon, authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())` matching the canonical migration pattern | R9 + R10 + R14 + R15 corrections | M12 spec §3.3.2 DDL + R10 R14 R15 audit-trail rows |
| Three-env-var mapping for signing (JWT_SIGNING_SECRET + SUPABASE_URL + SUPABASE_SECRET_KEY all indirected) | R21 + R22 factual findings | M12 spec §5.3 signing-key contract row |
| crew_member_auth UPSERT is in the seed contract; redemption rejects LINK_VERSION_MISMATCH without it | R21 factual finding | M12 spec §3.3 owned-fixture-mappings R21 amendment paragraph |
| `alias_5a_lead_for_revoke` and `alias_5a_lead_for_query_compromise` are dedicated J3-isolation aliases (NOT the baseline 5a) | R22 + R23 fixture-poisoning fixes | M12 spec §3.3 + §5.3 J3 revoke/baseline rows |
| Re-seed cleans `revoked_links WHERE revoked_reason LIKE 'validation:%'` AND structurally resets query-compromise alias (DELETEs all revoked_links + bumps current_token_version + zeros revoked_below_version) | R22 + R23 cleanup-pattern fixes | M12 spec §3.3 cleanup contract |
| Phase 0 budget gate: dev-unilateral defer (option 1) vs user-approved split/re-scope (options 2/3) | R25 governance refinement | M12 spec §9.0 budget gate paragraph |
| Conditional Phase 0 closure: smokes 1-6 always + smoke 7 conditional on Band F harness disposition | R24 + R25 | M12 spec §9.2 closure paragraph |
| Spec has 25 rounds of cross-CLI adversarial review; proceeded to plan without formal APPROVE per user R0 authorization | R0 user authorization | M12 spec §15.25 |

---

## Same-vector recurrence policy

Per AGENTS.md "Same-vector recurrence triggers comprehensive re-analysis": if three adversarial-review rounds on the M12 PLAN identify findings on the same vector (e.g., env-var indirection, fixture isolation, master-spec cross-document amendment), the next round's preparation MUST include a comprehensive re-analysis of that vector before the next review fires. The spec went through several same-vector classes (auth contract, env vars, schema fidelity); the plan should expect similar classes if the vector goes 3 rounds.

---

## Phase summaries

### Phase 0 — Stand-up + tooling (3.5–6.5 days estimate; 10-day budget gate per spec §9.0)

| Phase file | Purpose | Estimate |
| --- | --- | --- |
| `01-phase0-infra.md` | Stand up Vercel project (prod-target, no domain), Supabase prod project, Drive service account + watched folder. Set 4 VALIDATION_* env vars locally + in Vercel. | 0.5–1 day |
| `02-phase0-validation-state.md` | Atomic PR: migration + master-spec §4.3 + §4.1 + AC-2.5 amendments + admin-tables generator regen + 4 test baseline updates. | 0.5–1 day |
| `03-phase0-tooling-reseed.md` | `scripts/validation-reseed.ts` + `validation:check-seed` + `validation:resolve-alias`. Run reseed --combo all + check-seed against prod-equivalent. | 1–2 days |
| `04-phase0-tooling-link.md` | `scripts/validation-mint-link.ts` + `validation:revoke-link`. Three-env-var mapping + JWT verify/decode + revoked_links INSERT. | 0.5–1 day |
| `05-phase0-tooling-report.md` | `scripts/validation-report-fixtures.ts` — BLOCKING by default per §9.0 task 0.E. | 0.5 day |
| `06-phase0-smokes.md` | Run smokes 1-6 (and 7 if Band F INCLUDED-via-harness). Per §9.2. | 0.5–1 day |

### Phase 1 — Matrix walk + journeys + cold-start (≈20-80 hours pure exercise per spec §3.4)

| Phase file | Purpose | Estimate |
| --- | --- | --- |
| `07-phase1-matrix-walk.md` | MATRIX-INVENTORY.md derivation (plan-time task 1, per spec §4.1.1). Initial matrix sweep. 4 journeys (J1 cold-start-via-/help, J2 pending-sync triage, J3 signed-link real-iPhone w/ revoke + query-compromise + expired legs, J4 preview-as-crew double-check). Cold-start pass after 24h cooldown. Triage all findings into MUST/SHOULD/NICE. | 10-30 hours |

### Iteration + Final sweep + Sign-off

| Phase file | Purpose | Estimate |
| --- | --- | --- |
| `08-iteration-and-final-sweep.md` | Fix-MUST-FIX loop: each fix runs §7.2.2 consumer-enumeration recipe → targeted re-exercise OR auto-escalate to full sweep if >25% MATRIX-INVENTORY rows match. Final full sweep after another 24h cooldown. SIGN-OFF.md paragraph. | 5-30 hours over multiple iterations |

---

## Adversarial review (cross-CLI)

Per AGENTS.md mandatory step + user R0 authorization ("Plan can get up to 40 rounds if necessary. Each round should be fresh eyes, not scoped."):

- After this plan tree (00-overview.md + phase files) is self-reviewed, run cross-CLI Codex adversarial review.
- Each round is fresh-eyes, anchored on the milestone-base (parent of this plan's first commit), not narrowed per-round.
- Up to 40 rounds. After 40 rounds (or earlier APPROVE), the plan proceeds to execution.
- Round audit trail lives in `handoffs/` per round.

---

## Routing

See `ROUTING.md`. Summary: Phase 0 tooling + Phase 1 walk + Iteration + Sign-off ALL Opus/Claude Code (per AGENTS.md "UI work always Opus" + the validation tooling counts as adjacent-to-UI scripting). Codex runs adversarial review on this plan tree only.

---

## Open questions

None at plan-write time. Spec is closed; plan derives directly from spec sections.
