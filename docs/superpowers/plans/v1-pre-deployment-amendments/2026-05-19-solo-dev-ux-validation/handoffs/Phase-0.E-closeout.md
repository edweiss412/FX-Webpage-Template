# Phase 0.E — close-out

> `validation:report-fixtures` band-F report-pipeline fault-injection harness. Per spec §4.2 band F + §9.0 task 0.E (R24 BLOCKING gate) + §9.1.2. Plan: `04-phase0-tooling-report.md`.

---

## 1. Final HEAD + commit chain

**HEAD:** `a9253ec` on `main` (33 commits past the Phase 0.C base `3bdf8e2`: 5 implementation/self-review + 15 adversarial-repair rounds + 1 structural-defense + closeout updates).

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

**Rounds: 16 total — R1–R15 needs-attention (all fixed + hosted-verified), R16 APPROVE.** R1 (1H) → R2 (1H+1M) → R3 (1H+1M) → R4 (1H) → struct-defense → R5 (1H) → R6 (1H) → R7 (2H) → R8 (1M) → R9 (1H) → R10 (1H) → R11 (1H+1M) → R12 (1M) → R13 (1M) → R14 (1M) → R15 (1M) → **R16 APPROVE**. The severity/scope trend declined steadily: the early rounds (R1–R7) closed the load-bearing concurrency/durability/fidelity meta-classes on the snapshot+seed vector; the later rounds (R8–R15) were single MED/HIGH polish on cleanup-path guards, ownership sentinels, and banner ordering.

**Convergence note:** R1/R3/R5 are one meta-class — non-atomic *check-then-act* (or unlocked snapshot) on a producer-table row a concurrent live writer can mutate. Each was closed by moving the check+write DB-side under a `SHARE ROW EXCLUSIVE` lock: `validation_seed_rate_limit` (rate-limit; R3/R4) and `validation_seed_admin_alert` (admin_alerts; R5). `reports` is immune (fresh unique `idempotency_key` per seed — INSERT can't coalesce/overwrite). The class is now closed across all three producer tables and pinned by the structural meta-test.

| Round | Verdict | Finding | Disposition |
|---|---|---|---|
| R1 | needs-attention | [HIGH] admin_alerts clobber — `upsert_admin_alert` coalesces on unresolved `(show_id, code)` and replaces context; a pre-existing real alert would be overwritten then deleted by cleanup. | FIXED `19a8616` — `assertAdminAlertNoClobber` refuses before any writes; +3 regression tests. |
| R2 | needs-attention | [HIGH] bot-login-missing seeded a single show-scoped `GITHUB_BOT_LOGIN_MISSING` — production (`handleLookupInconclusive` submit.ts:703-704,731-732) writes a GLOBAL `GITHUB_BOT_LOGIN_MISSING` + a show-scoped `REPORT_LOOKUP_INCONCLUSIVE`. | FIXED `0274641` — dual-write with clobber guards on both scopes; variant + producer-state tests assert both rows. |
| R2 | needs-attention | [MED] rate-limit `hour_bucket` derived from the Supabase gateway `Date` header (client clock) — hour-boundary race vs live `enforceQuota`'s `date_trunc('hour', now())`. | FIXED `0274641` — new SECURITY DEFINER `validation_seed_rate_limit` RPC derives the bucket DB-side; applied local + validation Supabase. |
| R3 | needs-attention | [HIGH] `validation_seed_rate_limit` RPC did an unlocked SELECT-then-UPSERT; a concurrent live `enforceQuota` write on the same `(kind,identity,hour_bucket)` could be excluded from `snapshot_prior_count`, losing real quota state at cleanup. | FIXED `bbb11a5` — RPC takes `LOCK TABLE report_rate_limits IN SHARE ROW EXCLUSIVE MODE` (conflicts with `enforceQuota`'s ROW EXCLUSIVE INSERT), serializing snapshot+seed; applied local + validation Supabase. |
| R3 | needs-attention | [MED] `--force-overwrite-snapshot` only checked file existence, not identity — force-re-seeding a different crew combo would strand the first combo's quota row. | FIXED `bbb11a5` — force path now reads the existing snapshot and refuses if `(kind, identity)` differs; +1 regression test. |
| R4 | needs-attention | [HIGH] `--force-overwrite-snapshot` guarded identity but not the hour bucket; force-re-seeding after an hour rollover stranded the prior bucket's seeded row (no restore path). | FIXED `e9a26ca` — RPC `p_expected_prev_bucket` param; the harness passes the existing snapshot's bucket under force; the RPC (DB-clock authoritative) refuses cross-hour before seeding, leaving the snapshot intact for cleanup. +1 regression test. |
| (post-R4) | structural | Same-vector recurrence (R2→R3→R4 all on the rate-limit snapshot vector). Per AGENTS.md structural-defense calibration, convergence shifts from adversarial rounds to a CI-time guard. | SHIPPED `3a34053` — `tests/cross-cutting/validation-seed-rate-limit-defenses.test.ts` pins the DB-side lock, cross-hour guard, service_role-only grant, clobber guard, and harness wiring so a future edit cannot silently drop them. |
| R5 | needs-attention | [HIGH] the R1 admin_alerts clobber guard was a TOCTOU (preflight SELECT + later RPC); a concurrent real producer could insert between them and be overwritten/deleted — same non-atomic class as R3, on admin_alerts. | FIXED `6f0285d` — new atomic `validation_seed_admin_alert` RPC (SHARE ROW EXCLUSIVE lock → refuse-non-fixture → delegate to canonical `upsert_admin_alert`); harness writes alerts before reports (no orphan); preflight removed; structural meta-test extended to pin it. |
| R6 | needs-attention | [HIGH] the rate-limit seed committed the destructive mutation before the snapshot restore-record was durable; a crash between RPC and `writeFileSync` stranded the bucket unrecoverably. A durability/write-ahead class (distinct from R3/R5 concurrency). | FIXED `b1a6e5f` — `p_dry_run` peek phase; harness PEEKs (capture prior+bucket, no mutation) → persists snapshot → SEEDs. Restore record durable before mutation; crash between persist and seed is a safe no-op. Structural meta-test pins the peek→persist→seed order. |
| R7 | needs-attention | [HIGH] rate-limit-crew trusted alias_map without binding the UUID to the combo's show (stale/poisoned map → wrong identity seeded). [HIGH] write-ahead peek/seed not one critical section — a `[peek,seed]` enforceQuota increment could be lost. | FIXED `19e9dde` — (1) `resolveCrewMemberId` binds the UUID to `validation_<combo>` + 'M12 Validation' sentinel (crew ⨝ shows!inner), refuses otherwise; (2) harness rewrites the snapshot with the SEED RPC's authoritative prior (re-read under its own lock — includes any `[peek,seed]` increment); peek snapshot remains the durable fallback. +2 regression tests. |
| R8 | needs-attention | [MED] `--cleanup --force-overwrite-snapshot` ran cleanup immediately; the seed-only-flag scope check was in the unreachable seed branch, so a malformed command deleted tagged rows + exited 0. (Off the rate-limit vector — arg-validation completeness.) | FIXED `020063e` — cleanup branch rejects seed-only flags (`--force-overwrite-snapshot` / `--outcome` / `--alert-code` / `--combo`) BEFORE any delete. +3 regression tests (refuse-before-delete proven). |
| R9 | needs-attention | [HIGH] crash between seed-commit and snapshot rewrite leaves the peek-time snapshot → cleanup could restore a stale prior, erasing a `[peek,seed]` increment. | FIXED-as-bounded `dac20b7` — snapshot `pending`/`committed` status marker; cleanup WARNS on `pending` (crash detected) rather than silently restoring. Residual crash window is structurally bounded by file-backed-only (zero realistic impact in single-user validation; full closure = DB snapshot table, out-of-scope). Declared structurally converged. |
| R10 | needs-attention | [HIGH] `--force-cleanup-without-snapshot` never checked its "no snapshot exists" precondition; it deleted the named bucket then unconditionally unlinked any snapshot file, so invoking it while a valid snapshot existed destroyed the only restore record. (Emergency-cleanup precondition — off the converged vector.) | FIXED `f82dc61` — refuses if a snapshot file exists (directs to normal `--cleanup --include-*`); unconditional unlink removed. +1 regression test. |
| R11 | needs-attention | [HIGH] `resolveShowId` matched `drive_file_id` without the `client_label='M12 Validation'` sentinel — a colliding real/imported show could receive non-rate writes. [MED] re-seeded fixture alerts didn't refresh `raised_at`, so they stayed behind newer alerts and never rendered (AlertBanner orders by `raised_at DESC`). | FIXED `edfaf4e` — `resolveShowId` requires the sentinel; `validation_seed_admin_alert` refreshes `raised_at=now()` for the fixture row after the upsert. +2 regression tests. |
| R12 | needs-attention | [MED] bot-login dual-write was two separate guarded calls — a show-scoped refusal after the global write left a stray global fixture alert. | FIXED `2b02e45` — `validation_seed_bot_login_alerts` RPC does both-or-neither under one lock (check both scopes → write both or raise). +1 regression test. |
| R13 | needs-attention | [MED] `forceCleanupWithoutSnapshot` reported success without checking the deleted-row count — a typo'd bucket / empty crew-id deleted zero rows but printed "deleted". | FIXED `7bfe5be` — delete requests `count:"exact"`; fails on zero-match with a diagnostic; reports the real count; rejects empty `--include-crew-id` on the force path. +1 regression test. |
| R14 | needs-attention | [MED] horizon-expired fixture left `processing_lease_until` NULL; the §13.2.3 reaper (8.3f) only reaps rows where `processing_lease_until < now()`, so the fixture was non-reapable/unrepresentative of a real 25h-old stale report. | FIXED `7ca9749` — `processing_lease_until = created_at + 90s` (expired, matches the reaper predicate); +reaper-predicate assertion. |
| R15 | needs-attention | [MED] bot-login dual-write set both alerts' `raised_at=now()` in one txn (transaction-scoped → tie); AlertBanner's `raised_at DESC LIMIT 1` then rendered a nondeterministic alert. | FIXED `949a2b3` — stagger `raised_at` (global = now()-1s, show-scoped = now()) so the show-scoped `REPORT_LOOKUP_INCONCLUSIVE` is deterministically topmost, matching production's separate-autocommit write order. +ordering assertion. |
| R16 | **APPROVE** | No ship-blocking defect found in the full diff (harness + RPC migrations + cleanup/restore + rendering predicates re-reviewed; no new material finding). | — converged. |

---

### 4a. Snapshot / quota-state-correctness vector — comprehensive re-analysis

R2 (bucket clock) + R3 (seed race) + R4 (force cross-hour) all landed on the rate-limit snapshot+restore vector — three consecutive rounds. The post-R3 re-analysis below missed the cross-hour force case (R4), so per AGENTS.md structural-defense calibration the convergence path shifted from adversarial rounds to a CI-time guard: `tests/cross-cutting/validation-seed-rate-limit-defenses.test.ts` pins every DB-side + harness defense below so a future edit cannot silently re-open the class. Full-surface audit:

- **Seed snapshot capture** — DB-side RPC under `SHARE ROW EXCLUSIVE` table lock; `snapshot_prior_count` is the true pre-seed count (serialized against `enforceQuota`). ✓
- **Bucket authority** — `recorded_hour_bucket` = Postgres `date_trunc('hour', now())`, identical to live `enforceQuota`; the snapshot file keys restore on it. ✓
- **Cross-hour** — restore/delete is `.eq(hour_bucket = recorded)`; never spans buckets. ✓
- **Snapshot file lifecycle** — F39 refuse-existing (file-presence) + force-overwrite (now identity-matched, R3) + unlink-on-cleanup. ✓
- **admin_alerts clobber** — `assertAdminAlertNoClobber` on both global + show scopes (R1, R2). ✓
- **reports** — fresh `idempotency_key` per seed → no coalescing/clobber. ✓
- **Write-ahead + crash window (R6/R7/R9).** Seed is `PEEK (dry-run, capture prior+bucket, snapshot "pending") → persist → SEED → rewrite snapshot "committed" with the seed-time authoritative prior`. The seed RPC re-reads the prior under its own lock, so a `[peek,seed]` increment is preserved in the no-crash case (R7). The ONE residual: a crash between the seed commit and the "committed" rewrite leaves a "pending" snapshot; cleanup then restores the peek-time prior and WARNS (R9 marker). Under the **ratified file-backed-only** snapshot strategy (a DB-transactional snapshot store is explicitly out-of-scope per plan R41 F37) this crash window is structurally uncloseable; its realistic impact is **zero** in single-user validation (no concurrent real POST hits the fixture identity during a manual seed, and the bucket is never left unrecoverable — only a single concurrent increment in a crash coincidence could be missed, and it is warned). **Orchestrator note:** fully closing it would require authorizing a DB snapshot table (scope expansion beyond file-backed-only); deferred as not worth the scope change for a zero-impact single-user residual.
- **Documented boundary (not a defect):** during the seed→cleanup window (starting at the PEEK) the harness OWNS the fixture identity's current-hour bucket. The fixture seed sets an absolute `count`, and cleanup restores the pre-seed `count`; a *real* `enforceQuota` write to that exact identity+bucket *during the window* is overwritten by teardown. This is inherent to the absolute-set fixture model and acceptable in the single-user validation environment (the dev is the sole actor and does not POST real reports while a seed is live). Cleanup's restore is an atomic row UPDATE/DELETE (row-lock-serialized), so no torn write occurs — only the documented "fixture owns the bucket" overwrite.

## 5. Real-CI

X audits workflow run `26560689550` (commit `8212d2b`, the closeout-finalize commit) — **success**. Intermediate pushes also green (e.g. `26559566270` on the R13 chain). The full vitest suite is not a CI workflow on this repo (only `x-audits.yml` + `pages-build-deployment` run on push, per Phase 0.C precedent); local full-suite gate at HEAD: **4244 passed / 5 skipped / 0 failed** (incl. ~63 Phase 0.E assertions across the harness, rendering, and structural-defense suites).

---

## 6. Orchestrator-triage findings

1. **Plan Task 0.E.2 line 195 field-name inaccuracy (doc fix).** The rendering-predicate row for `rate-limit-crew` names `messageFor('REPORT_RATE_LIMITED_CREW').dougFacing` as non-null, but `lib/messages/catalog.ts:858` deliberately leaves `dougFacing` null and carries the crew copy in `crewFacing` (crew audience). The catalog citation `:856` is correct; only the field name is wrong. The rendering test uses the audience-agnostic `dougFacing ?? crewFacing` predicate. **Recommended:** correct plan line 195 to cite `crewFacing`. Not a code bug.

2. **`reports` / `admin_alerts` / `report_rate_limits` RPC-gating status (confirmed, documented).** None of the 3 producer tables is in `RPC_GATED_TABLES` (no table-level REVOKE). Service-role writes are the legitimate production path (`lib/reports/*` writes via service-role); the harness's service-role writes are consistent. No new RPC-gated-table registration needed.

3. **Harness writes `admin_alerts` via the canonical `upsert_admin_alert` RPC** (not raw insert) to satisfy `_metaAdminAlertProducer`. This coalescing RPC necessitated the R1 clobber guard (§4). No further action.

4. **Plan Task 0.E.1 line 71 prescribed an incomplete bot-login-missing mapping (doc fix).** The plan's producer-state map said `lookup-inconclusive` materializes a single `admin_alerts` row whose code is `lookupAlertCode(selector)` — for bot-login-missing that yields a single show-scoped `GITHUB_BOT_LOGIN_MISSING`. But live `handleLookupInconclusive` (`lib/reports/submit.ts:703-704,731-732`) for `BOT_LOGIN_MISSING` writes a GLOBAL `GITHUB_BOT_LOGIN_MISSING` (show_id=null) AND a show-scoped `REPORT_LOOKUP_INCONCLUSIVE`. R2 caught this; the harness now does the production dual-write. **Recommended:** correct plan line 71 to document the bot-login-missing dual-write (the other 3 variants' single-show-scoped mapping is correct as written).

5. **Two new SECURITY DEFINER RPCs** — `validation_seed_rate_limit` (`20260527210002`; R2 DB-side bucket + R3 lock + R4 cross-hour + R6 dry-run peek) and `validation_seed_admin_alert` (`20260527210003`; R5 atomic clobber guard). Both service_role-only; neither takes a per-show advisory lock (`report_rate_limits` / `admin_alerts` are not in the lock set per invariant 2). Both apply `SHARE ROW EXCLUSIVE` table locks to serialize against live producers. Applied to local + validation Supabase.

6. **Pre-existing date-rollover flake in `validation-check-seed.test.ts` (observation, not Phase 0.E).** A full-suite run that crosses the midnight-UTC boundary can transiently fail a predicate-(o) date-derived assertion (fixtures built at `TODAY` vs the post-rollover date). Re-running after the boundary passes. This is a Phase 0.C check-seed test, surfaced incidentally here; worth a future `TODAY`-pinning fix but out of Phase 0.E scope.

---

## 7. Watchpoints for Phase 0.F dispatch (`05-phase0-smokes.md`)

- **Smoke 7** (report-pipeline) consumes this harness's `lease-expired` producer state (plan F.7: the materialized expired-lease row is the prerequisite Phase 0.F.7 triggers via a real POST to exercise the `expired_pending_recovery` dispatch).
- The harness's `--combo` defaults to `R1` for non-rate-limit-crew outcomes; smokes targeting other fixture shows must pass `--combo` explicitly.
- Snapshot files live at `.validation-state/rate-limit-{admin,crew}-snapshot.json` (gitignored). Any smoke that seeds rate-limit outcomes must run seed + cleanup from the **same cwd** so the snapshot persists, and must pass `--include-admin-email` / `--include-crew-id` literally (the env var is NOT exported to the shell — see the empty-value guard).
