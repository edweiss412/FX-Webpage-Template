# Phase 0.E — close-out

> `validation:report-fixtures` band-F report-pipeline fault-injection harness. Per spec §4.2 band F + §9.0 task 0.E (R24 BLOCKING gate) + §9.1.2. Plan: `04-phase0-tooling-report.md`.

---

## 1. Final HEAD + commit chain

**HEAD:** `<PENDING — final SHA after adversarial APPROVE>` on `main`.

Implementation + repair chain (base `3bdf8e2` = Phase 0.C close-out):

| SHA | Task | Summary |
|---|---|---|
| `0fcfe3a` | 0.E.0 | MATRIX-INVENTORY band F slice (9 outcomes, all INCLUDED-via-harness) |
| `a2036b5` | 0.E.1 | report-fixtures harness + 27 TDD assertions |
| `ad63e45` | 0.E.2 | per-outcome rendering predicates (Groups A/B/C) + shared helper extraction |
| `8e21c06` | 0.E.3 | cleanup hardening — empty `--include-*` error + dual-refusal fix (E2E-surfaced) |
| `c919b37` | self-review | canonical `upsert_admin_alert` RPC switch + doc-guard cross-references |
| `19a8616` | adversarial R1 | admin_alerts clobber guard (refuse-rather-than-overwrite) |
| `0274641` | adversarial R2 | bot-login dual-write fidelity + DB-side rate-limit bucket RPC |

Citation-grep pass (plan Task 0.E.1 Step 3): all cited `lib/reports/*`, `lib/messages/catalog.ts`, `components/*`, `supabase/migrations/*` file:line refs verified against live code — **no drift**.

---

## 2. MATRIX-INVENTORY band F slice — final dispositions

All 9 report-pipeline outcomes **INCLUDED-via-harness** (deep outcomes 4/4, surface outcomes 5/5). The harness MUST ship (Phase 0.E.1–0.E.3 proceeded). EXCLUDED-rely-on-structural was considered for the surface outcomes and rejected (unit tests observe the contract pin, not the rendered UI surface — `feedback_mocked_only_tests_invite_tautological_approve`). See `MATRIX-INVENTORY.md` band F table.

---

## 3. Validation Supabase post-state (`vzakgrxqwcalbmagufjh`)

E2E (Task 0.E.3) seeded `lookup-inconclusive --alert-code inconclusive` + `rate-limit-admin` (identity = `canonicalize($VALIDATION_ADMIN_EMAIL)` per spec §9.1.2, count=11) + `rate-limit-crew --combo R1` (raw UUID `5cc1e481-…`, count=4) against the live project; all rows confirmed via MCP. Cleanup (`--include-admin-email` + `--include-crew-id`) restored — **zero `m12-fixture-%` residue across all 3 tables and all hour buckets**; both snapshot files unlinked. Re-verified after the RPC switch (`c919b37`) and the R2 DB-side-bucket RPC: seed + clean teardown, zero residue; the seeded `report_rate_limits` bucket equals Postgres `date_trunc('hour', now())` (handoff §9 R31 producer map).

| Table | post-cleanup `m12-fixture-%` rows | canonical-admin / crew-fixture buckets (any hour) |
|---|---|---|
| `reports` | 0 | — |
| `admin_alerts` | 0 | — |
| `report_rate_limits` | 0 (synthetic) | 0 (admin) / 0 (crew) |

---

## 4. Adversarial review verdict + triage

**Rounds:** R1 (needs-attention, 1 HIGH) → R2 (needs-attention, 1 HIGH + 1 MED) → R3 (needs-attention, 1 HIGH + 1 MED) → R4 `<PENDING>`.

| Round | Verdict | Finding | Disposition |
|---|---|---|---|
| R1 | needs-attention | [HIGH] admin_alerts clobber — `upsert_admin_alert` coalesces on unresolved `(show_id, code)` and replaces context; a pre-existing real alert would be overwritten then deleted by cleanup. | FIXED `19a8616` — `assertAdminAlertNoClobber` refuses before any writes; +3 regression tests. |
| R2 | needs-attention | [HIGH] bot-login-missing seeded a single show-scoped `GITHUB_BOT_LOGIN_MISSING` — production (`handleLookupInconclusive` submit.ts:703-704,731-732) writes a GLOBAL `GITHUB_BOT_LOGIN_MISSING` + a show-scoped `REPORT_LOOKUP_INCONCLUSIVE`. | FIXED `0274641` — dual-write with clobber guards on both scopes; variant + producer-state tests assert both rows. |
| R2 | needs-attention | [MED] rate-limit `hour_bucket` derived from the Supabase gateway `Date` header (client clock) — hour-boundary race vs live `enforceQuota`'s `date_trunc('hour', now())`. | FIXED `0274641` — new SECURITY DEFINER `validation_seed_rate_limit` RPC derives the bucket DB-side; applied local + validation Supabase. |
| R3 | needs-attention | [HIGH] `validation_seed_rate_limit` RPC did an unlocked SELECT-then-UPSERT; a concurrent live `enforceQuota` write on the same `(kind,identity,hour_bucket)` could be excluded from `snapshot_prior_count`, losing real quota state at cleanup. | FIXED `<R3 SHA>` — RPC takes `LOCK TABLE report_rate_limits IN SHARE ROW EXCLUSIVE MODE` (conflicts with `enforceQuota`'s ROW EXCLUSIVE INSERT), serializing snapshot+seed; applied local + validation Supabase. |
| R3 | needs-attention | [MED] `--force-overwrite-snapshot` only checked file existence, not identity — force-re-seeding a different crew combo would strand the first combo's quota row. | FIXED `<R3 SHA>` — force path now reads the existing snapshot and refuses if `(kind, identity)` differs; +1 regression test. |
| R4 | `<PENDING>` | `<PENDING>` | `<PENDING>` |

---

## 5. Real-CI

X audits workflow run `26552971387` (commit `c919b37`) — **success**. The full vitest suite is not a CI workflow on this repo (only `x-audits.yml` + `pages-build-deployment` run on push, per Phase 0.C precedent); local full-suite gate: **4216 passed / 5 skipped / 0 failed**. `<re-confirm CI on final HEAD after R2 APPROVE>`

---

## 6. Orchestrator-triage findings

1. **Plan Task 0.E.2 line 195 field-name inaccuracy (doc fix).** The rendering-predicate row for `rate-limit-crew` names `messageFor('REPORT_RATE_LIMITED_CREW').dougFacing` as non-null, but `lib/messages/catalog.ts:858` deliberately leaves `dougFacing` null and carries the crew copy in `crewFacing` (crew audience). The catalog citation `:856` is correct; only the field name is wrong. The rendering test uses the audience-agnostic `dougFacing ?? crewFacing` predicate. **Recommended:** correct plan line 195 to cite `crewFacing`. Not a code bug.

2. **`reports` / `admin_alerts` / `report_rate_limits` RPC-gating status (confirmed, documented).** None of the 3 producer tables is in `RPC_GATED_TABLES` (no table-level REVOKE). Service-role writes are the legitimate production path (`lib/reports/*` writes via service-role); the harness's service-role writes are consistent. No new RPC-gated-table registration needed.

3. **Harness writes `admin_alerts` via the canonical `upsert_admin_alert` RPC** (not raw insert) to satisfy `_metaAdminAlertProducer`. This coalescing RPC necessitated the R1 clobber guard (§4). No further action.

4. **Plan Task 0.E.1 line 71 prescribed an incomplete bot-login-missing mapping (doc fix).** The plan's producer-state map said `lookup-inconclusive` materializes a single `admin_alerts` row whose code is `lookupAlertCode(selector)` — for bot-login-missing that yields a single show-scoped `GITHUB_BOT_LOGIN_MISSING`. But live `handleLookupInconclusive` (`lib/reports/submit.ts:703-704,731-732`) for `BOT_LOGIN_MISSING` writes a GLOBAL `GITHUB_BOT_LOGIN_MISSING` (show_id=null) AND a show-scoped `REPORT_LOOKUP_INCONCLUSIVE`. R2 caught this; the harness now does the production dual-write. **Recommended:** correct plan line 71 to document the bot-login-missing dual-write (the other 3 variants' single-show-scoped mapping is correct as written).

5. **New SECURITY DEFINER RPC `validation_seed_rate_limit`** (migration `20260527210002`) added for the R2 DB-side bucket fix. service_role-only grant; takes no advisory lock (`report_rate_limits` not in the per-show lock set per invariant 2 — consistent with the harness's other writes). Applied to local + validation Supabase.

---

## 7. Watchpoints for Phase 0.F dispatch (`05-phase0-smokes.md`)

- **Smoke 7** (report-pipeline) consumes this harness's `lease-expired` producer state (plan F.7: the materialized expired-lease row is the prerequisite Phase 0.F.7 triggers via a real POST to exercise the `expired_pending_recovery` dispatch).
- The harness's `--combo` defaults to `R1` for non-rate-limit-crew outcomes; smokes targeting other fixture shows must pass `--combo` explicitly.
- Snapshot files live at `.validation-state/rate-limit-{admin,crew}-snapshot.json` (gitignored). Any smoke that seeds rate-limit outcomes must run seed + cleanup from the **same cwd** so the snapshot persists, and must pass `--include-admin-email` / `--include-crew-id` literally (the env var is NOT exported to the shell — see the empty-value guard).
