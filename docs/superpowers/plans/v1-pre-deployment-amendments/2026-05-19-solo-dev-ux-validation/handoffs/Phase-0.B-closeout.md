# Phase 0.B — Close-out + Escalations (2026-05-27)

**Status:** DONE. `validation_state` migration + atomic master-spec amendments + audit-registry update + test baselines all landed. §3.3.2 atomicity gate verified locally (X.3 / X.6 / admin-rls-runtime / x1 / x6 all green at HEAD).

**Executor:** Opus 4.7 / Claude Code (this session — same session that closed Phase 0.A Block 2 + the orchestrator-dispatched Block-1 follow-up + the Block-2 escalation triage at commit `027ccd2`).

**Dispatch context:** Phase 0.B per the orchestrator's resume dispatch following commit `7c58315` + the DEFERRED.md triage at `027ccd2`. Sub-tasks 0.B.1 → 0.B.13 with R10 F6 repair deletions for 0.B.7 + 0.B.10 (rls.test.ts + auth.test.ts do not exist).

## Commit chain (Phase 0.B)

| SHA | Type | Summary |
|---|---|---|
| `81d6c0c` | feat(db) | Task 0.B.2 — `validation_state` migration + TDD-first validation-state.test.ts + postgrest-dml-lockdown.test.ts (Layer 1 only — see escalation §1) |
| `df79516` | docs+test(master-spec,audit) | Tasks 0.B.3–0.B.10 atomic bundle — master spec §4.1/§4.3/AC-2.5 + 11-cross-cutting.md ADMIN_BOOTSTRAP_NAMES + lib/audit/admin-tables.generated.ts + admin-rls-runtime test/baseline + no-m9-5-surfaces allowlist |

## Sub-task closures

| Task | Outcome |
|---|---|
| **0.B.1** Pre-verify live state vs rebase-corrections table | ✓ All 5 live values match (§4.3 line 610, AC-2.5 line 3567, 4 refs of `17` at lines 4/21/111/112, missing rls.test.ts + auth.test.ts, zero ADMIN_TABLES literal-list hits). Verification-only; no commit. |
| **0.B.2** Migration + TDD-first tests | ✓ Migration `supabase/migrations/20260527204241_validation_state.sql`; TDD-red→green cycle on `tests/db/validation-state.test.ts`; structural meta-test `tests/db/postgrest-dml-lockdown.test.ts` (Layer 1 only — see escalation §1); migration applied to local + validation Supabase (`vzakgrxqwcalbmagufjh`); apply-twice idempotency verified |
| **0.B.3** Master spec §4.3 prose 21→22 + footnote | ✓ Added validation_state immediately before wizard_finalize_checkpoints in the §4.3 admin-only bullet list (the prose isn't strictly alphabetical so the plan's "alphabetical position" guidance was interpreted as "directly before wizard_finalize_checkpoints"); count 21→22; new footnote documents the α + γ-footnote hybrid for the live 22−4=18 track |
| **0.B.4** Master spec §4.1 CREATE TABLE block | ✓ `create table validation_state` block inserted before wizard_finalize_checkpoints block at master spec line ~486; mirrors M12 spec §3.3.2 DDL with the inline constraint shape; picked up by `scripts/generate-admin-tables.ts:31-34` CREATE-TABLE filter |
| **0.B.5** Master spec AC-2.5 21→22 / 84→88 | ✓ Added validation_state to per-table list; counts updated 21→22 tables / 84→88 assertions (prose track); inline cross-reference to the live 18 × 4 = 72 track per the §4.3 footnote |
| **0.B.6** Regen lib/audit/admin-tables.generated.ts | ✓ `pnpm gen:admin-tables` ran clean; live count = 18; validation_state present |
| **0.B.7** DELETED per R10 F6 (rls.test.ts does not exist) | ✓ Skipped as plan-directed |
| **0.B.8** admin-rls-runtime.test.ts 17→18 (4 refs) | ✓ sed swap on lines 4 / 21 / 111 / 112; typecheck + test pass |
| **0.B.9** admin-rls-runtime.baseline.json 17→18 entries | ✓ Added validation_state alphabetically between sync_log and wizard_finalize_checkpoints; captured_at_sha bumped to `m12-phase-0.B-validation-state` |
| **0.B.10** DELETED per R10 F6 (auth.test.ts does not exist) | ✓ Skipped as plan-directed |
| **0.B.11** Atomicity gate (X.3 / X.6 / admin-table) | ✓ All green pre-commit (see §Verification) |
| **0.B.12** Atomic Phase 0.B commit + push | ✓ `df79516` pushed to main; bundles spec + plan + generated artifacts + baselines together |
| **0.B.13** Validation Supabase close-out probes | ✓ See §Close-out probes below |

## Verification snapshot

- TypeScript: clean across Phase 0.B
- Full vitest run: **3992 passed / 5 skipped / 0 failed** (+7 from pre-Phase-0.B baseline of 3985 = 5 new tests in validation-state.test.ts + 2 new tests in postgrest-dml-lockdown.test.ts)
- x1 catalog parity: **13/13 ✓**
- x3 trust-domain: **23/23 ✓** (after no-m9-5-surfaces allowlist entry for the new meta-test)
- x6 pg-cron pivot: **35/35 ✓**
- X.6 traceability audit: **5/5 ✓** (after `ADMIN_BOOTSTRAP_NAMES` updated in 11-cross-cutting.md)
- admin-rls-runtime: **56/56 ✓**
- validation-state + postgrest-dml-lockdown: 2 + 2 = **4/4 ✓**

## Validation Supabase close-out probes (Task 0.B.13)

Executed via Supabase MCP `execute_sql` against project `vzakgrxqwcalbmagufjh`:

| Probe | Expected | Observed |
|---|---|---|
| `validation_state` table exists | 1 | 1 ✓ |
| `admin_only` policy exists | 1 | 1 ✓ |
| `has_table_privilege('anon', 'public.validation_state', 'INSERT')` | false | false ✓ |
| `has_table_privilege('anon', 'public.validation_state', 'SELECT')` | true | true ✓ |
| `has_table_privilege('authenticated', ..., 'DELETE')` | false | false ✓ |
| `has_table_privilege('service_role', ..., 'INSERT')` | true | true ✓ |
| Singleton CHECK (`key='not-the-singleton-key'` rejected) | check_violation | check_violation ✓ |

Validation Supabase is now aligned with the M12.1 baseline + the new `validation_state` table.

## Class-sweep correction worth noting

The new `tests/db/postgrest-dml-lockdown.test.ts` documents (in a comment) WHY `crew_member_auth` is NOT in the LOCKED_TABLES registry — the M11.5 G3 cutover dropped the table. That literal citation tripped the `tests/cross-cutting/no-m9-5-surfaces.test.ts` audit, which scans `app/lib/components/tests` for legacy signed-link strings.

Rather than rewording (the citation is load-bearing for future readers understanding the registry shape), I added the new meta-test to that audit's ALLOWED_FILES set with an explanatory comment matching the existing pattern (`tests/db/cutover-drop-m9-5.test.ts` was already allowlisted for the same reason). Bundled into the atomic commit `df79516`.

## Escalation 1: PostgREST DML lockdown Layers 2+3 require absent JWT harness

The M12 plan §0.B.2 Step 8 prescribes a **3-layer** defense in `tests/db/postgrest-dml-lockdown.test.ts`:

- **Layer 1:** `pg_catalog.has_table_privilege` via psql — catches REVOKE drift independent of RLS policy state
- **Layer 2:** Admin-authenticated PostgREST INSERT/UPDATE/DELETE probes — proves the REVOKE blocks even an admin session that admin_only RLS would otherwise pass
- **Layer 3:** Tightened anon + authenticated PostgREST probes — requires `"permission denied for table"` substring to distinguish table-grant denial from RLS denial

I landed **Layer 1 only**. Reason: Layers 2+3 require `SUPABASE_TEST_AUTHENTICATED_JWT` and `SUPABASE_TEST_ADMIN_JWT` env vars to be wired with signed JWTs whose canonical emails route to `public.is_admin() = true` and `= false` respectively. **This JWT-signing test infrastructure does not exist in this repo today** — no `jsonwebtoken` import anywhere under `tests/` / `lib/` / `scripts/`, no `SUPABASE_TEST_*` env var defined in `.env.local.example`, no setup in `.github/workflows/x-audits.yml`. The existing precedent (`tests/db/show_share_tokens.test.ts:62-98`) uses Layer 1 only via the same `has_table_privilege` psql pattern.

Layer 1 alone catches the **primary** regression class the structural defense targets — a future amendment drops the REVOKE block but leaves `admin_only` RLS in place. The Layers 2+3 belt-and-suspenders catch more exotic regressions (admin-specific RLS additions, future grant-by-role-attribute mechanisms) that aren't currently realized risks.

**Recommended dispatch:** sized standalone "Phase 0.B follow-up — JWT test harness + lockdown Layers 2+3" dispatch. Adds:

1. New dev dep (e.g., `jose` or `jsonwebtoken`)
2. JWT signing helper at `tests/helpers/signJwt.ts`
3. `.env.local.example` entries for `SUPABASE_TEST_ADMIN_JWT` + `SUPABASE_TEST_AUTHENTICATED_JWT` with documented generation procedure (sign with local-supabase JWT_SECRET; admin email in is_admin() allow-list)
4. CI workflow update at `.github/workflows/x-audits.yml` to provide the JWTs as GitHub Secrets (or generate them in-step from `JWT_SECRET` + a fixture email list)
5. Extend `tests/db/postgrest-dml-lockdown.test.ts` with the Layer 2 + Layer 3 probe matrices for `crew_members` + `validation_state`

Estimated 1-2hr focused work; non-blocking for Phase 0.C onward.

## Posture at handback

- HEAD: `df79516` on main, origin synced, working tree clean
- All Phase 0.B dispatched mechanical work landed
- One escalation surfaced (Layers 2+3 of the lockdown meta-test require JWT infrastructure not present in the harness)
- Validation Supabase aligned + close-out probes green

## Watchpoints for Phase 0.C dispatch (or the Layer-2+3 escalation)

- **`validation_state` writes flow through 2 SECURITY DEFINER RPCs landing in Phase 0.C** (`mint_validation_fixture_atomic`, `validation_finalize_all_atomic`). The REVOKE block plus admin_only RLS pin the contract today; the structural defense at `tests/db/postgrest-dml-lockdown.test.ts` will need a new row IF Phase 0.C introduces additional RPC-gated tables.
- **Singleton invariant currently has only ONE structural defense** — the CHECK `key = 'validation_seed'` PK. Phase 0.C's mint RPC body needs to be defensive against any future attempt to bypass via service_role + raw INSERT outside the RPC (the per-show advisory lock from AGENTS.md invariant 2 is the runtime defense). Worth adding a `tests/db/validation-state.test.ts` assertion that proves only one row can exist after multiple INSERT attempts.
- **AGENTS.md cross-cutting #6 (§12.4 catalog row 3-lockstep) did NOT fire on Phase 0.B** — no new error codes were added. If Phase 0.C / 0.D adds any §12.4 row (e.g., for `VALIDATION_MINT_LOCK_HELD`, `VALIDATION_FINALIZE_PROJECT_REF_DRIFT`), the 3-lockstep rule kicks in (master spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`).
- **Master spec line numbers will drift** further as Phase 0.C+ adds new §-anchored sections. The Phase 0.B amendments grew §4.3 by ~10 lines and AC-2.5 by ~3 lines; downstream plan files citing master-spec line numbers may need rebase-correction notes similar to the one at `02-phase0-validation-state.md:9-22`.
- **Validation Supabase DB password rotation** still pending from Phase 0.A (validation env is throwaway-class so contained).

## Memory references

No new memory writes this session. The orchestrator's standing memos governed all decisions:
- `feedback_deferral_discipline.md` — Layers 2+3 escalation framing
- `feedback_postgrest_dml_lockdown_for_rpc_gated_tables.md` — registry pattern
- `feedback_recurring_bug_response.md` — class-sweep on no-m9-5-surfaces audit (one offender → check whole class)
- `feedback_audit_derives_from_spec_not_handoff.md` — used the live `pnpm gen:traceability` output as the source of truth, not a snapshot in the plan body
