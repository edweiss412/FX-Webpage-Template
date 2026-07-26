# Watch renewal lifecycle — Implementation Plan

**Spec:** `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` (canonical; every §-reference below is to it)
**Branch:** `fix/watch-renewal-lifecycle` off `origin/main` @ `839eed829`
**Closes:** `BL-WATCH-EXPIRED-ACTIVE-ROW`, `BL-WATCH-DRIVE-CALL-TIMEOUT`, `BL-WATCH-ALERT-RAISE-NOT-ATOMIC`, `BL-WATCH-ALERT-FOLDER-SCOPE`
**Ship mode:** autonomous through merged PR (user-ratified 2026-07-26); both user review gates waived.

---

## Global Constraints

1. **TDD per task** (AGENTS.md invariant 1). Failing test → minimal implementation → passing test → commit. Task 1's failing test is a real-DB CHECK assertion, so the migration is written second even though it is listed first.
2. **One commit per task**, conventional-commits. Scope is `db` for the migration task, `drive` for the rest (matching the existing `lib/drive/watch.ts` history).
3. **No advisory locks** anywhere in this diff (§1.1a item 6). Zero holders today; adding one creates the M5-R20 nested-holder class.
4. **`refreshWatchSubscriptions` never rejects.** Registered executable contract at `tests/sync/_metaInfraContract.test.ts:46-51`, exercised at `tests/sync/_metaInfraContract.test.ts:869-883`. Every task that adds a statement or a branch to that function preserves it.
5. **No UI surface** — AGENTS.md invariant 8 (impeccable dual-gate) does not apply; verified in §4.1 and §8.8.
6. **Post-commit emits only.** Every new `log.*` call fires after its transaction returns, never inside it (AGENTS.md invariant 10).
7. **Task 6 is not optional.** The migration must reach the validation project, and `validation-schema-parity` cannot detect its absence (§4.4). Skipping it degrades the only deployed environment silently.

## Meta-test inventory (declared per the writing-plans rule)

Settled at spec time in §4.3; each row was verified with a live grep. Summary of what this plan CHANGES:

| Registry | Action |
| --- | --- |
| `tests/db/_metaLocalDbUrlGuard.test.ts:396-402` | **BUMP** the exact scanned-file count `toBe(56)` → `toBe(57)`. Task 2 adds one file that reads `LOCAL_TEST_DATABASE_URL`. |
| `tests/log/_auditableMutations.ts` `NEW_FORENSIC_CODES` | **ADD** the four §2.2 codes. Verified no size assertion exists (`grep -rn "NEW_FORENSIC_CODES.size" tests/` → no matches). |
| `tests/drive/watchExpiration.test.ts:46-63` | **MUST edit.** A SECOND `WatchTx` fake, returned `as unknown as WatchTx` — the cast means a missing `expireDeadActive` is NOT a compile error, only a runtime failure. Its own header comment says the compiler will not catch it. |
| `tests/drive/watchExpiration.test.ts:15-35` | **MUST extend.** One-parameter `driveMock.watch`; Task 4's option-pair assertion is unwritable until it records a second argument. |
| `tests/sync/_metaInfraContract.test.ts` | **No row change.** Two existing rows are load-bearing and are preserved, not edited (constraint 4 above). |
| `tests/messages/_metaAdminAlertCatalog.test.ts:111-113` | **No change**, verified: the pinned regex matches `markWatchOrphanedWithTx`, which this diff does not touch. |
| `tests/messages/_metaAdminAlertProducer.test.ts` | **No change**, verified: detector is Supabase-client-scoped; the raw pg RPC call is what it exists to require. |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | **N/A**: the only route in scope exports `GET` only. |
| `tests/cross-cutting/codes.test.ts` (x1-catalog-parity) | **N/A**: the four codes sit inside `log.*` spans, which `stripLogEmissionCalls` strips before the producer scan. No §12.4 lockstep. |
| `tests/cross-cutting/vitest-projects-partition.test.ts:222-242` | **N/A**: samples rather than registers; a new `tests/db/*.db.test.ts` is admitted by directory glob. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | **N/A**: no `pg_advisory`/`hashtext` added (constraint 3). Declared positively as the rule requires. |

## Pre-draft code-verification pass (run 2026-07-26, before this plan body)

Every command below was actually run in this worktree; the output is the finding, not a description of a check to perform later.

| Check | Command | Result |
| --- | --- | --- |
| Local CHECK baseline lacks `expired` | `psql … -tAc "select pg_get_constraintdef(oid) from pg_constraint where conname='drive_watch_channels_status_check'"` | `CHECK ((status = ANY (ARRAY['pending','active','superseded','stopping','stopped','orphaned'])))` — no `expired`, so Task 1's test is meaningful and starts red. |
| Status values have no other consumer | `grep -rn "'orphaned'\|superseded\|'stopping'" lib/ app/ supabase/ tests/ components/` | Only `lib/drive/watch.ts` (producer) and `lib/observe/query/watch.ts:9-10` (projects `status` as a bare `string`). No enum, no filter, no sanitizer. |
| `dev.*` clone excludes the table | `grep -n "drive_watch_channels" supabase/migrations/20260502000000_dev_schema_clone.sql` | `supabase/migrations/20260502000000_dev_schema_clone.sql:25` — explicitly NOT cloned. No shadow-schema fan-out. |
| Manifest is column-names-only | `node -e "…schema-manifest.json…['drive_watch_channels']"` | `["activated_at","created_at","expires_at","id","resource_id","status","stopped_at","superseded_at","watched_folder_id","webhook_secret"]` — no constraint data, hence §4.4. |
| `retry: false` typechecks on `MethodOptions` | `grep -n "retry?:" …/gaxios@7.1.4/…/common.d.ts` | `:189 retry?: boolean;` in `GaxiosOptions`, which `MethodOptions` extends. |
| The repo's canonical bound already exists | `grep -n "timeout: timeoutMs, retry: false" lib/drive/fetch.ts` | `lib/drive/fetch.ts:359` on the real `files.get` call — the idiom Task 4 copies. |
| `RefreshResult` deep-equality sites | `grep -rn "refreshed:\s*\[" tests/` | 5 files, ~18 sites. This is why §3.2.3 keeps the type unchanged. |
| `'*'` failure-entry assertions | `grep -rn "list_expiring" tests/` | `tests/drive/watch.test.ts:698`, `tests/drive/watch.test.ts:1045`, `tests/drive/watch.test.ts:1439`, `tests/sync/_metaInfraContract.test.ts:882`, `tests/cron/refreshWatchRoute.test.ts:139`; plus `tests/drive/watch.test.ts:1447` asserts the LOG's `operation`. Drives §3.1.3a. |
| Infra-fault log message is unasserted | `grep -rn "refresh-watch list_expiring failed" tests/` | no matches — safe to neutralise. |
| `not-subject-to-meta` marker shape | `grep -n "EXEMPT_MARKER" tests/notify/_metaInfraContract.test.ts` | `:63 /^\s*\/\/\s*not-subject-to-meta:\s+\S/m` — must start its own line, colon, then non-space. |
| Existing real-DB watch suite | `grep -c "^  test(" tests/db/watchRenewalDue.test.ts` | 8 tests; harness `foldersProductionWouldRenew()` at `tests/db/watchRenewalDue.test.ts:50-61` injects `now` + `subscribeToWatchedFolder` but NOT `getActiveWatchedFolder`. Task 3 must redesign it. |
| Class sweep: every Drive call site | `grep -rn "getDriveClient()\|getDriveAuth()" lib/ app/` | 24 sites. Already bounded: all of `lib/drive/fetch.ts` (per-call `timeout` + `withDriveRetry`), stream reads via `createStallGuard`. **Unbounded and IN scope:** `lib/drive/watch.ts:383` (`files.watch`), `lib/drive/watch.ts:420` (`channels.stop`). **Unbounded and OUT of scope** (pre-existing, not touched by this diff, no backlog entry claims them): `lib/sync/assetRecovery.ts:273` and `lib/sync/assetRecovery.ts:791`, `lib/sync/applyStaged.ts:999`, `lib/sync/defaultSnapshotAssetsForApply.ts:90` and `lib/sync/defaultSnapshotAssetsForApply.ts:131`, `lib/sync/runScheduledCronSync.ts:2101` and `lib/sync/runScheduledCronSync.ts:2125`, `lib/sync/verifyReelOnApply.ts:73`, `lib/drive/sheetGids.ts:16`, `lib/drive/list.ts:77`, `lib/drive/agendaDrive.ts:94` and `lib/drive/agendaDrive.ts:170`, `app/api/asset/reel/[show]/route.ts:394` and `app/api/asset/reel/[show]/route.ts:524`, `app/api/asset/agenda/[show]/[id]/route.ts:295` and `app/api/asset/agenda/[show]/[id]/route.ts:457`, `app/api/admin/onboarding/scan/route.ts:107`. Task 6 files these as a new backlog entry rather than silently leaving the class half-swept. |

**Snippet typecheck.** Every code block in a task body below is either copied verbatim from the live tree or is SQL. The two new TypeScript surfaces (lib/drive/callDeadline.ts, the `expireDeadActive` port member) are written test-first in their tasks and typechecked by `pnpm typecheck` in Task 6; no snippet here is a paste-and-hope.

---

## Task 1: Add `expired` to the status CHECK

**Failing test first** — new tests/db/watchLifecycle.db.test.ts, resolving its URL through `assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres")` (mirroring `tests/db/watchRenewalDue.test.ts:25-27`):

- inserting a row with `status = 'expired'` succeeds;
- inserting `status = 'not-a-status'` is rejected.

Both fail today against the verified baseline (the CHECK has no `expired`). The second assertion is what stops the fix from being "widen the constraint to anything".

**Implementation** — supabase/migrations/20260726000000_drive_watch_expired_status.sql, per §3.1.1: `drop constraint if exists` + `add constraint` with the existing six values copied verbatim from `supabase/migrations/20260501001000_internal_and_admin.sql:295-297` plus `'expired'`. Apply-twice idempotent. `'stopping'` is preserved deliberately (§8.2). No `notify pgrst` (§4.4 — a CHECK alters nothing in PostgREST's cache).

Also: `WatchChannelStatus` (`lib/drive/watch.ts:21`) gains `"expired"`.

**Registry:** bump `tests/db/_metaLocalDbUrlGuard.test.ts` `toBe(56)` → `toBe(57)` — the new file is the 57th reader.

**Extend the executable validation gate** (spec §4.4). Add a parallel block to `tests/db/validation-schema-parity.test.ts` (alongside the existing CHECK layer at `tests/db/validation-schema-parity.test.ts:216-290`) that parses the new migration for its constraint name and asserts the validation database's `drive_watch_channels_status_check` **definition contains `'expired'`**. Assert the definition, not just the name: the name already exists in validation today carrying the OLD six-value list, so a name-only superset check passes whether or not the migration was applied. Add it as its own parsed block, NOT by appending to `NONBLANK_MIGRATIONS` — that array's `expect(expected.size).toBe(17)` non-vacuity guard is scoped to the `*_drive_file_id_nonblank` family.

**Apply locally:** `psql "$LOCAL_TEST_DATABASE_URL" -f supabase/migrations/20260726000000_drive_watch_expired_status.sql`, then re-run the test green. Then `pnpm gen:schema-manifest` and commit the result — expected to be a no-op diff (§4.1), and a NON-empty diff is a signal to stop and read it.

**Commit:** `feat(db): add an expired status to drive_watch_channels`

## Task 2: Reap expired channels, and let GC collect them

**Failing tests first.**

DB-free (`tests/drive/watch.test.ts`, extending `FakeWatchTx`):

- `tx.operations` starts `["expireDeadActive", "listRenewalDue", …]` — **order**, not presence. A reap ordered after the read leaves the stale row in `due` and reduces the whole fix to a no-op.
- an expired-and-due row yields **zero** `subscribe` calls (assert the spy's call count is 0).
- a failing reap returns `{refreshed: [], orphaned: [], failures: [{folderId: "*", operation: "list_expiring"}]}` and does **not** reject (constraint 4).
- a failing reap emits `operation: "drive_watch_channels.expire_dead_active"`; a failing renewal read still emits `operation: "drive_watch_channels.list_renewal_due"` (both directions — §3.1.3a).
- GC: an `expired` candidate does NOT reach `stopChannel` but IS marked stopped; an `orphaned` candidate with a `resourceId` DOES reach it. Assert the spy's call list by channel id, not its length.

Real DB (tests/db/watchLifecycle.db.test.ts):

- through the real `refreshWatchSubscriptions`: an expired-active row ends `status='expired'`, is absent from `listRenewalDue`, present in `listGcCandidates`.
- a row still INSIDE its lease whose renewal fails is NOT reaped (§3.1.2 — the regression "retire on failure" would have shipped).
- reaping frees the per-folder active slot: a re-subscribe for the same folder succeeds afterwards (catches a `drive_watch_channels_one_active_per_folder_idx` violation, which only appears in the reap-then-resubscribe sequence).

Invert `tests/db/watchRenewalDue.test.ts:122-131` ("a lease already past expiry is still due") to the new contract, per §5. Its current comment names the backlog entry; replace the comment too, do not leave it beside the new assertion.

**Implementation** — §3.1.3 and §3.1.4:

- `WatchTx` gains `expireDeadActive(nowIso: string): Promise<string[]>`; `PostgresWatchTx` implements it with the §3.1.3 `update … returning id`.
- `FakeWatchTx` mirrors it EXACTLY (`status === "active" && expiresAt <= nowIso`). While here, tighten `FakeWatchTx.markOrphaned` to production's `status === "pending"` filter — today it orphans any row, which is the exact filter D-A is about, and a permissive fake can mask that class. This is a test-fidelity fix, not a behaviour change.
- `refreshWatchSubscriptions`: reap and `listRenewalDue` in ONE `runTx` callback, reap first, reap wrapped in `callWatchTx("drive_watch_channels.expire_dead_active", …)`; catch reads `operation` off the typed error with the old string as fallback; message neutralised to `"refresh-watch renewal read failed"`.
- `listGcCandidates` adds `'expired'`; `gcWatchChannels` skips `stopChannel` when `channel.status === "expired"`.
- `DRIVE_WATCH_EXPIRED_REAPED` emitted post-commit when ≥1 row was reaped, `reapedIds` capped at 20 with `reapedCount` carrying the true total (§3.1.3).

**Commit:** `fix(drive): reap expired watch channels into an expired status`

## Task 3: Renew only the configured folder

**Failing tests first** (DB-free):

- two due rows on two folders, one configured → exactly one `subscribe` call, and assert its **argument** is the configured folder id (a count-only assertion passes on the wrong folder).
- `no_folder_configured` → zero `subscribe` calls.
- folder read returns `infra_error` → ALL rows renewed, `DRIVE_WATCH_FOLDER_READ_FAILED` emitted, and the returned object `toEqual`s the pre-change shape with an **empty** `failures` array. Three independent failure modes in one test: fail-open renewal, the durable record, and no `'*'` row (which would suppress reconcile's auto-resolve on a healthy cycle). The `toEqual` is what pins §3.2.3's promise that the result type did not change.
- folder read **throws** → identical to `infra_error` (catches recorded-not-thrown being lost).
- a skipped stale folder emits `DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER` with the skipped id.

**Harness redesign** (`tests/db/watchRenewalDue.test.ts`, §5): `foldersProductionWouldRenew()` takes the configured folder id and injects `getActiveWatchedFolder: async () => ({ folderId, folderName: null })`. The two-row window test at `tests/db/watchRenewalDue.test.ts:89-102` runs twice — once per configured folder — so the renewal predicate is still what excludes `notYet`, rather than the new filter excluding it for the wrong reason. The remaining single-folder tests pass their own folder id. All 8 tests keep their assertions.

**Implementation** — §3.2: `RefreshDeps` gains `getActiveWatchedFolder?: typeof defaultGetActiveWatchedFolder` (already imported at `lib/drive/watch.ts:15`); one read before the loop; the three §3.2.2 outcomes; `skippedFolderIds` capped at 20. `RefreshResult` is **unchanged**.

**Commit:** `fix(drive): renew only the configured watched folder`

## Task 3b: Supersede the prior folder's channels at promotion (AC-6.18)

**Failing test first:** after `promoteSettings` swaps the watched folder, no `drive_watch_channels` row for a non-promoted folder remains `status='active'`. This fails today — `promoteSettings` (`app/api/admin/onboarding/finalize-cas/route.ts:779-805`) touches no channel row — and it is the executable form of a shipped acceptance criterion, AC-6.18 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3846`), that has never been satisfied.

**Implementation** — spec §3.2.4: one `update … set status='superseded', superseded_at=now() where status='active' and watched_folder_id is distinct from <newly promoted id>`, inside the SAME transaction as the settings swap so a rolled-back promotion cannot orphan the previous folder's channel.

**Registry:** none. The route is already a registered admin mutation (`tests/log/_auditableMutations.ts:35`, `POST` → `SHOW_FINALIZED`), so this adds behaviour to a registered surface rather than creating an unregistered one.

**Commit:** `fix(onboarding): supersede the prior folder's watch channels on promotion`

## Task 4: Bound every Drive call and the loop around it

**Failing tests first** (DB-free):

- `defaultWatchFolder` passes `{ timeout: DRIVE_CALL_TIMEOUT_MS, retry: false }` as the **second** argument to `files.watch`; `defaultStopChannel` the same to `channels.stop`. Assert both fields by value. **This requires extending the drive mock first:** `tests/drive/watchExpiration.test.ts:15-35` declares `watch: async (args) => …`, a one-parameter mock that cannot observe a second argument at all. Give it an options parameter and record it. `retry: false` is the half that matters — without it gaxios's internal retry multiplies the budget and the timeout bounds nothing, which no timing test would notice.
- `files.watch` rejecting with a `TimeoutError`-shaped `GaxiosError` yields `{outcome: "orphaned", reason: "watch_create_failed"}` and an alert whose `error_class` is `drive_api`. Drive the REAL `defaultWatchFolder` against the mock — injecting `deps.watchFolder` bypasses it and would prove only that a rejecting function rejects (spec R1 finding 8).
- Run-budget exhaustion stops the loop, records `failures` rows for the unprocessed folders, and emits `DRIVE_WATCH_RUN_BUDGET_EXHAUSTED` (catches a budget check that logs but keeps iterating).
- `REFRESH_RUN_BUDGET_MS === T_EXEC_BUDGET_MS`.

**Implementation** — spec §3.3: the two `MethodOptions` pairs, the per-run budget, and `DRIVE_CALL_TIMEOUT_MS` in `lib/drive/watchErrors.ts`.

**There is NO deadline-wrapper module and NO per-row budget.** An earlier revision of this plan created a deadline-wrapper module under lib/drive/ and a `REFRESH_ROW_BUDGET_MS`; spec §3.3.1a withdrew both, because the wrapper could not cancel `subscribeToWatchedFolder` (no `AbortSignal` in its signature) and its rejection let an activation commit after the loop had recorded the row as failed. Do not reintroduce either.

Rewrite the `T_EXEC_BUDGET_MS` doc comment per spec §3.3.3 — state that the loop stops STARTING rows at the budget, and that the in-flight iteration, the credential fetch, the platform, and `pg_net` remain unbounded. Do NOT upgrade `isGrantTooShort` to a guarantee.

**Commit:** `fix(drive): bound files.watch and channels.stop, and cap the renewal loop`

## Task 5: Commit the alert in the transaction it appears to be in

**Failing test first** (real DB, tests/db/watchLifecycle.db.test.ts): `markWatchOrphanedWithTx` inside a transaction that then throws leaves **no** `admin_alerts` row and an unchanged channel status. This fails today — the alert commits over its own connection — and nothing weaker can observe it.

Plus, same file: the raised alert satisfies `jsonb_typeof(context) = 'object'` and `context->>'watched_folder_id'` equals the folder id (a double-encoded jsonb STRING passes a naive "a row exists" assertion and silently breaks `lib/drive/watchEscalation.ts:101` and `lib/drive/watchEscalation.ts:155`); and `occurrence_count` increments on a second raise, proving the RPC's real `on conflict … do update` body ran over the pg connection.

**Implementation** — §3.4: `PostgresWatchTx.upsertAdminAlert` issues `select public.upsert_admin_alert($1::uuid, $2::text, $3::jsonb)` with `JSON.stringify(input.context)`, carrying the inline `// not-subject-to-meta: <reason>` marker in the verified form. Remove the now-unused `defaultUpsertAdminAlert` import at `lib/drive/watch.ts:3` — leaving it raises a fresh ESLint `no-unused-vars`, and a new warning means a wiring edit half-landed.

**Commit:** `fix(drive): raise the watch alert inside the channel transaction`

## Task 6: Validation apply, registries, gates, and the residual class

1. **Apply the migration to the validation project** and paste the evidence into the PR body (§4.4):
   `supabase db query --linked "<migration SQL>"` then
   `supabase db query --linked "select pg_get_constraintdef(oid) from pg_constraint where conname = 'drive_watch_channels_status_check'"` — output must contain `'expired'`.
2. **`NEW_FORENSIC_CODES`**: add all four §2.2 codes.
3. **Amend the two stale comments** §5 lists: `lib/drive/watch.ts:873-875` (reconcile's "already had its attempt via refresh" — the expired-active exception no longer exists) and the `T_EXEC_BUDGET_MS` doc block if Task 4 left anything. Deletions and replacements, not notes appended beside the superseded text.
4. **Apply the three master-spec amendments** specified in spec §4.6, each a DELETION and replacement tagged `**Amended 2026-07-26**`: the "No client-side timeout is applied" clause (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1320`), the unscoped renewal rule (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1330`), and the status set (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1299` plus the §5.5.6 GC per-status list). AC-6.18 is NOT amended — Task 3b implements it. **This engages the §12.4 three-way lockstep only if a catalog row changes; it does not, so no `pnpm gen:spec-codes` run is needed** — but re-run `pnpm spec:lint` on the master spec after editing.
5. **File the credential-fetch residual** as a backlog entry (spec §3.3.1a, §7): the `GoogleAuth` token request is unbounded and no supported per-call knob was found.
6. **File the residual Drive-call class** as a new `BACKLOG.md` entry naming the 20 out-of-scope unbounded call sites enumerated in the pre-draft pass, so the sweep is recorded rather than silently half-done.
7. **Update `BACKLOG.md`**: mark the four entries closed with this PR; leave `BL-WATCH-RECONCILE-BACKOFF` OPEN and add the §8.6 note that its decisive blocker is cleared and reconcile is now the single retry surface.
8. **Add the plan row** to `docs/superpowers/plans/observability/README.md`.
9. **Gates, in this order:** `pnpm typecheck` (vitest AND playwright configs) → `pnpm exec eslint` → `pnpm format:check` → `pnpm test` (full suite; scoped runs miss registry suites) → `pnpm spec:lint` on both the spec and this plan.

**Commit:** `chore(drive): close the four watch backlog entries and record the residual class`

---

## Adversarial review (cross-model)

After plan self-review, dispatch `scripts/codex-guard.mjs review` on this plan and iterate to APPROVE before any implementation commit. Brief carries: REVIEWER ONLY, fresh-eyes posture, the §1.1a do-not-relitigate list, and the exhaust-the-vector-per-round instruction. A second whole-diff review runs after Task 6, before push.

## Self-review notes (writing-plans)

- **Anti-tautology, per task:** every test row above names the concrete failure mode it catches. The three that would otherwise have been weak are strengthened deliberately — the reap-ordering test asserts ORDER (presence passes trivially), the folder-filter test asserts the subscribe ARGUMENT (a count passes on the wrong folder), and the GC test asserts the stop spy's call LIST (a length passes if it skips the wrong row).
- **Values derived, not hardcoded:** the real-DB timing rows compute leases from `RENEWAL_LIFE_FRACTION` / `RENEWAL_MIN_LEAD_MS` through the implementation's own `renewalLeadMs`, as the existing suite already does (`tests/db/watchRenewalDue.test.ts:118-121`).
- **Ordering risk:** Task 1 must land before Task 2, because the reap writes a value the local CHECK would otherwise reject. Task 2 must land before Task 3, because both edit `tests/db/watchRenewalDue.test.ts` and Task 3's harness redesign subsumes the file Task 2 leaves. Tasks 3b, 4 and 5 are independent of each other and of that pair.
- **Fix-round regression budget:** if any review round patches the reap or the folder filter, re-grep the `'*'` sentinel assertions and re-run `tests/sync/_metaInfraContract.test.ts` before the next dispatch — constraint 4 is the contract most likely to be broken by a well-meaning repair.
- **No e2e, no layout, no transition tasks:** no Playwright surface, no fixed-dimension parent, no multi-state component. Declared positively as the rules require.
