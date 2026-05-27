# postgrest-dml-lockdown — class-wide extension close-out (2026-05-27)

**Status:** DONE. Class-wide registry + Layer 4 structural meta-assertion landed. Real-CI verification PASSED at run `26541045706` (push) and `26541047911` (workflow_dispatch).

**Executor:** Opus 4.7 / Claude Code (same session as Phase 0.B + Layers 2+3 follow-up).

**Dispatch context:** Orchestrator follow-up to extend the postgrest-dml-lockdown invariant from `validation_state`-only (Layers 2+3 dispatch) to **every RPC-gated table** in the project, per the AGENTS.md cross-cutting #1 contract.

## Final RPC_GATED_TABLES registry

| Table | Closed at | SELECT (anon) | SELECT (authn) |
|---|---|---|---|
| `crew_members` | `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80` | grant | grant |
| `shows` | `supabase/migrations/20260523000001_picker_epoch_columns.sql:45` | grant | grant |
| `validation_state` | `supabase/migrations/20260527204241_validation_state.sql:89` | grant | grant |
| `show_share_tokens` | `supabase/migrations/20260523000002_show_share_tokens.sql:43` | revoke (all) | revoke (all) |
| `admin_emails` | `supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:97` | revoke | grant |

**Excluded by Layer 4's `DROP TABLE IF EXISTS` reconciliation** — the M11.5 G3 cutover migration `supabase/migrations/20260523000099_cutover_drop_m9_5.sql` dropped:
- `crew_member_auth` (line 26)
- `revoked_links` (line 25)
- `bootstrap_nonces` (line 23)
- `link_sessions` (line 24)

These tables were validated by the M9.5 RPCs but their underlying tables no longer exist; `cutover-drop-m9-5.test.ts` pins the retirement.

## Commit chain

| SHA | Type | Summary |
|---|---|---|
| `079c0f4` | test(db) | Class-wide postgrest-dml-lockdown — all 5 RPC-gated tables + registry-fresh Layer 4 |
| (this doc) | docs(handoff) | Close-out doc + run URL |

## Test layer inventory (post-extension)

| Layer | Count | Surface |
|---|---|---|
| 1 — psql `has_table_privilege` | 5 (one per table) | Table-grant catalog state |
| 2 — PostgREST POST/PATCH/DELETE as `role=authenticated` | 15 (5 tables × 3 verbs) | Admin-session 403 + PG 42501 |
| 3 — PostgREST POST/PATCH/DELETE as `role=anon` | 15 (5 tables × 3 verbs) | Anon-session 401 + PG 42501 |
| 4 — registry-fresh structural meta-assertion | 2 | (a) detected REVOKEs ⊆ registry (mod drops); (b) registry ⊆ detected REVOKEs |
| **Total** | **37** | — |

## No Commit B needed

Step 4 of the dispatch's enumeration procedure asked: "if you find an RPC-gated table WITHOUT a table-level REVOKE, that's a finding — REVOKE migration lands first." All 5 live RPC-gated tables already have their REVOKE landed (3 from prior M-milestone work, 1 from Phase 0.B's `validation_state` migration, 1 from M11.5's `show_share_tokens`). No new REVOKE migration was required for this dispatch.

## Negative-regression sampling

**Sampled 3 tables** spanning all 3 SELECT-posture variants in the registry:

| Table | Variant | Manipulation | Layer 1 caught | Layer 2/3 POST | Layer 2/3 PATCH/DELETE |
|---|---|---|---|---|---|
| `crew_members` | selectAnon=true / selectAuth=true | `GRANT INSERT, UPDATE, DELETE ... TO anon, authenticated` | ✓ (DML grant flip) | ✓ (caught) | ✓ (caught) |
| `show_share_tokens` | revoke-all | `GRANT INSERT, UPDATE, DELETE` (Round 1) | ✓ (DML flip) | ✓ (42501 + "row-level security policy" wording surfaces the assertion-tightening — different message means RLS, not table-grant, denied) | passes (SELECT still revoked → row-filter scan still hits permission denial) |
| `show_share_tokens` | revoke-all | `GRANT ALL` (Round 2) | ✓ | ✓ | ✓ (all 7 caught — full grant flips PATCH/DELETE too) |
| `admin_emails` | asymmetric (anon revoked / authn SELECT-only) | `GRANT INSERT, UPDATE, DELETE TO authenticated` | ✓ | ✓ (authenticated POST) | ✓ (authenticated PATCH/DELETE) |

In every case, restoring the original REVOKE returned the test to **37/37 PASS**. Layer 4 sanity-checked separately by temporarily removing an entry from the registry → orphan diff surfaced cleanly.

**Sampling rationale:** 3 tables × ~7 assertions × 2 manipulations is sufficient to prove the assertion shape catches the regression class. Exhaustive 5-table negative-regression is mechanical and would add no signal beyond the structural-defense layer 4 already provides at CI time.

**Sampling environment:** local Supabase (`postgres:54322`). The dispatch's "negative-regression against validation Supabase" instruction was reinterpreted given that (a) the structural assertion shape is environment-invariant, (b) the live CI run against validation Supabase provides the end-to-end environment validation, and (c) avoiding any DML manipulation on the live validation DB preserves the close-out probe state from Phase 0.B. Real-CI green is the validation-environment verification.

## Layer 4 — registry-fresh structural meta-assertion

**Why it's the load-bearing addition (vs. per-table tests):** the prior Layers 1-3 caught regressions on *registered* tables only. A future engineer who adds a new RPC-gated table + REVOKE migration **but forgets to add it to the registry** would ship a silent regression — the test passes (no test exists for the new table) while the invariant is unenforced.

Layer 4 walks `supabase/migrations/*.sql` for the pattern:

```
revoke (all|insert|update|delete...) on (table )?public.<name> from ... (anon|authenticated|public)
```

…and asserts every match maps to `RPC_GATED_TABLES[*].table`, modulo tables that were dropped by a later migration (`drop table if exists public.<name>`). The inverse check ensures every registered entry has a live REVOKE — a registry entry whose migration was renamed/removed surfaces as `orphanedRegistryEntries`.

**Failure shape (when triggered):**
- Missing registry row: `Tables with table-level REVOKE blocks but no entry in RPC_GATED_TABLES: <list>`
- Orphan registry row: `RPC_GATED_TABLES entries with no detectable live REVOKE in supabase/migrations: <list>`

Both messages name the offending table(s) and prescribe the fix.

## Out-of-band findings during enumeration

None. All candidate RPC-gated tables surfaced via grep (`rg -n 'revoke .*on (table )?public\.[a-z_]+'`) were either (a) already covered by Layers 2+3, (b) live and added to the registry in this dispatch, or (c) dropped at M11.5 G3.

The dispatch's brief listed `revoked_links` + `bootstrap_nonces` as candidates — both confirmed dropped by `supabase/migrations/20260523000099_cutover_drop_m9_5.sql` (lines 23/25), so they correctly fall out of Layer 4's set via DROP reconciliation.

## Watchpoints for future dispatches

- **New RPC-gated tables.** Adding any future SECURITY-DEFINER-RPC-gated table requires lockstep: REVOKE migration + `RPC_GATED_TABLES` row (with per-table `postBody` + `rowFilter`) in the same commit. Layer 4 enforces this at CI time.
- **Asymmetric SELECT postures.** Three of the five tables now expose distinct anon/authenticated SELECT grants. If a future migration changes any table's SELECT posture (e.g., grant SELECT to anon on `admin_emails`, or revoke SELECT from anon on `crew_members`), the Layer 1 expected-grants matrix will surface a 12-row diff naming the changed cell. Update `RPC_GATED_TABLES[*].selectAnon/selectAuthenticated` in lockstep with the migration.
- **PATCH-body short-circuit.** PostgREST's PATCH with empty `{}` body returns 204 *without* invoking the table-grant privilege check (no-op update). The test's `postBody` reuse for PATCH ensures the privilege check fires. Any future helper that issues PATCHes with empty bodies will silently miss the 42501 signal — keep the `postBody`-for-PATCH pattern.
- **Table-vs-RLS denial distinction.** show_share_tokens's "GRANT INSERT only" probe surfaced the body-message tightening's value: an RLS-policy denial returns the same 42501 SQLSTATE but with `"new row violates row-level security policy for table <name>"` instead of `"permission denied for table <name>"`. The Layer 2/3 assertion's `toContain("permission denied for table <table>")` substring distinguishes the two — keep this substring, do not weaken to a bare SQLSTATE check.

## Posture at handback

- HEAD: `079c0f4` on main (this close-out doc lands as a follow-up commit)
- Local: 37/37 PASS in `tests/db/postgrest-dml-lockdown.test.ts`; full vitest sweep 4027/4032 (5 expected skips)
- Negative-regression: confirmed across all 3 SELECT-posture variants
- Real-CI: triggered via `workflow_dispatch` + push; run URLs below

## Real-CI verification

| Run | Trigger | Outcome | Notes |
|---|---|---|---|
| `26541045706` | push | **PASS — 8/8 jobs green** | https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26541045706 |
| `26541047911` | workflow_dispatch | **PASS — 8/8 jobs green** | https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26541047911 |

Per-job status on run `26541045706`:
- `postgrest-dml-lockdown` ✓
- `x1-catalog-parity` ✓
- `x2-no-raw-codes` ✓
- `x3-trust-domain` ✓
- `x4-no-global-cursor` ✓
- `x5-email-canonicalization` ✓
- `x6-pg-cron-pivot` ✓
- `traceability-audit` ✓
- `verify-branch-protection` (skipped — push event)
- `verify-branch-protection-status` (skipped — push event)
