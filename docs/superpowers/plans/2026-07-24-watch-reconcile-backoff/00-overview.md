# Plan — Watch reconcile backoff + real renewal slack

**Spec:** `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md` (canonical; every task body cites it by section)
**Branch:** `feat/watch-reconcile-backoff` off `origin/main` @ `7ed193dde`
**Closes:** `BL-WATCH-RECONCILE-BACKOFF`
**Mode:** autonomous ship (spec + plan user-review gates waived per the AGENTS.md brainstorming gate; cross-model APPROVE required at each stage)

---

## 1. Pre-draft code-verification pass

Run before drafting task bodies (writing-plans mandate). Completed 2026-07-24/25; results are cited inline in the task bodies rather than re-derived.

| Claim verified | Result |
|---|---|
| `activateWithTx` is the single path to `status='active'` | `grep -rn "set status = 'active'"` over `lib/` + `supabase/migrations/` → **exactly one hit**, `lib/drive/watch.ts:166` |
| Raise/resolve lock ordering cannot deadlock | both paths take the `drive_watch_channels` row lock before the `admin_alerts` row lock (`lib/drive/watch.ts:402-414` vs `activateWithTx`) |
| `WatchTx` already writes `admin_alerts` | `tx.upsertAdminAlert` (`lib/drive/watch.ts:408`), so the resolve method is symmetric with an existing capability |
| `resolveAdminAlert` is scope-wide, not row-targeted | `lib/adminAlerts/resolveAdminAlert.ts:29-39` — filters only code + null show + unresolved |
| Union consumers are trivial | `WatchErrorClass` / `ReconcileOutcome` have 3 references total outside their definitions |
| `tests/drive/**` and `tests/cron/**` are the **DB-free** vitest project | `vitest.projects.ts:92-95`; `unit-suite-nodb` runs them with no Supabase and no psql |
| Latest migration timestamp on main | `20260723090000` — this branch uses `20260724000000` / `20260724000001`; re-check for sibling-merge collision at implementation time |
| `admin_alerts.raised_at` survives dedup bumps | the RPC's `do update set` does not touch it (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:48-70`) |
| Cron minutes 7/22/37/52 are free | every multiple of 5 is claimed by the two `*/5` jobs; minute 15 gc-watch, minute 30 diagram-gc |

## 2. Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/sync/_metaInfraContract.test.ts` — rows for the two `WatchTx` state-write methods and the in-transaction alert resolve. Contract wording follows the pg-port precedent (`DriveWatchInfraError`), not the PostgREST `{ data, error }` precedent (spec §3.3).
- **EXTENDS** `tests/admin/_metaInfraContract.test.ts` — row for `readWatchSurfaceState`, because its consumers (bell + Settings loaders) are registered there, not in the sync registry (spec §3.7, R3 finding 10).
- **EXTENDS** `tests/db/postgrest-dml-lockdown.test.ts` — `RPC_GATED_TABLES` row for `drive_watch_reconcile_state` with `selectAnon: false, selectAuthenticated: false`. Bidirectional discovery (`tests/db/postgrest-dml-lockdown.test.ts:805-815`) fails CI without it.
- **CREATES** a CHECK ↔ union parity meta-test (spec §6.5), which requires the `as const` prerequisite refactor in the same task.
- **CREATES** a `watch_backoff_ms` ↔ `BACKOFF_LADDER_MS` parity test (spec §6.19).
- **VERIFIES UNTOUCHED (by running them, not by assertion):** `tests/messages/_metaAdminAlertCatalog.test.ts`, `tests/messages/_metaAdminAlertProducer` (the resolve is a tx-port write, and that port already writes `admin_alerts`), `tests/log/_metaMutationSurfaceObservability.test.ts` (new route is GET → out of scope by contract), `tests/cross-cutting/vitest-projects-partition.test.ts`.
- **Advisory-lock topology: N/A.** Zero holders on every surface touched; no `pg_advisory*` in the diff. Declared explicitly per the mandate.

## 3. Task list

Ordering: constants and DB first (everything reads them), then library surfaces, then routes, then registration fan-out, then UI, then the copy lockstep, then the validation apply. The copy lockstep lands late so §12.4 prose describes shipped behavior.

| # | Task | Type | Vitest project |
|---|---|---|---|
| 1 | Constants + §2.1a timing invariants + `as const` union refactor | `feat(drive)` | parallel |
| 2 | Migration: table, CHECKs, full-private lockdown, `watch_backoff_ms`, registry row | `feat(db)` | serial |
| 3 | CHECK ↔ union parity + ladder parity meta-tests | `test(db)` | serial |
| 4 | `WatchTx` state-write methods (A) + (B) + infra registry rows | `feat(drive)` | serial |
| 5 | `files.watch` expiration request + short-grant anomaly log | `feat(drive)` | parallel |
| 6 | Renewal predicate → proportional with floor (+`created_at` in SELECT) | `feat(drive)` | both |
| 7 | In-transaction alert resolve in `activateWithTx` | `feat(drive)` | both |
| 8 | `reconcileWatchChannels`: drop `refresh` param, classification table, backoff gate, attempt recording | `feat(drive)` | parallel |
| 9 | Escalation: duration trigger; retire `ESCALATION_THRESHOLD`; source-scan guard | `feat(drive)` | parallel |
| 10 | New `reconcile-watch` route + refresh route slimming | `feat(routing)` | parallel |
| 11 | Cron registration fan-out (migration + the surfaces in spec §4.3) | `feat(infra)` | mixed |
| 12 | Admin retry: shared state statements, stop calling `resolveAdminAlert` | `feat(admin)` | serial |
| 13 | `readWatchSurfaceState` + bell feed transport | `feat(admin)` | serial |
| 14 | BellPanel next-attempt line + developer deep link | `feat(admin)` | parallel |
| 15 | DriveConnectionPanel next-attempt line | `feat(admin)` | parallel |
| 16 | `pnpm observe watch` state columns | `feat(observe)` | parallel |
| 17 | Copy lockstep: master spec, phase-2 observability spec, `gen:spec-codes`, catalog, email copy | `docs` + `feat(messages)` | — |
| 18 | Schema manifest regen + surgical validation apply + live probe | `chore(infra)` | — |

## 4. Close-out gates

1. impeccable `critique` **and** `audit` on the UI diff (tasks 14, 15) — invariant 8; findings + dispositions recorded in the PR body (this feature has no milestone handoff doc).
2. Whole-diff Codex review to APPROVE.
3. Full local suite + `typecheck` + `eslint` + `format:check` before push — scoped gates miss regressions.
4. Real CI green (not just local), then `gh pr merge --merge`, then fast-forward local main until `git rev-list --left-right --count main...origin/main` reports `0	0`.

## 5. Traps carried into task bodies

- `TEST_DATABASE_URL` in this worktree is **non-loopback** (preflight warned). Loopback-guarded DB tests skip unless overridden — override for tasks 2, 3, 6, 7.
- `pnpm test` excludes env-bound and e2e suites; run those explicitly.
- Never `git add -A` while a dev-build e2e is running.
- Commit before mutation-testing: `git checkout --` to revert an injected mutation wipes uncommitted work in that file.
- Re-check the migration timestamp against `origin/main` immediately before pushing — a sibling merge can collide.
