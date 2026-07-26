# Watch renewal lifecycle — Implementation Plan

**Spec:** `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` (canonical; every §-reference below is to it)
**Branch:** `fix/watch-renewal-lifecycle` off `origin/main` @ `839eed829`
**Closes:** `BL-WATCH-EXPIRED-ACTIVE-ROW`, `BL-WATCH-DRIVE-CALL-TIMEOUT`, `BL-WATCH-ALERT-RAISE-NOT-ATOMIC`, `BL-WATCH-ALERT-FOLDER-SCOPE`
**Ship mode:** autonomous through merged PR (user-ratified 2026-07-26); both user review gates waived.

---

## Normative source rule (structural fix, after three rounds on one vector)

Every review round so far has found at least one defect of the SAME shape: this plan restated something the spec defines, the spec was then repaired, and the restatement drifted. R1b caught a stale deadline-module entry in the file inventory; R2 caught merged telemetry field names, mis-pinned master-spec anchors, and a tautology already recorded as accepted; R3 caught the same class again. Patching each instance has not converged, so the rule changes rather than the wording:

**The spec is the only normative source for WHAT is built. This plan is normative only for ORDER, and for facts about the existing tree that the spec does not carry.**

Concretely, this plan does NOT restate — it references:

| Thing | Normative home |
| --- | --- |
| Telemetry code names and their payload fields | spec §2.2 |
| The reap predicate, its two arms and two target statuses | spec §3.1.2, §3.1.3 |
| GC's per-status stop-and-transition table | spec §3.1.4 |
| The admin health tier change | spec §3.1.5 |
| The three folder-read outcomes | spec §3.2.2 |
| The three-part promotion/activation fix | spec §3.2.4 |
| The Drive-call option pair and the loop bound | spec §3.3 |
| The jsonb parameter form | spec §3.4.2 |
| Master-spec amendment sites and their anchors | spec §4.6 |
| Every test's failure mode | spec §6 |

Where a task below names one of these, it names it as a POINTER plus whatever execution detail is genuinely plan-only (which file, which fake, what order). If a task and the spec disagree, the spec wins and the task is wrong — that is now a one-line fix instead of a judgement call.

## Global Constraints

1. **TDD per task** (AGENTS.md invariant 1). Failing test → minimal implementation → passing test → commit. Task 1's failing test is a real-DB CHECK assertion, so the migration is written second even though it is listed first.
2. **One commit per task**, conventional-commits (AGENTS.md invariant 6). Scope is `db` for the migration task, `onboarding` for the promotion task, `drive` for the rest.

   **On "four TDD commits"** (plan review R1b finding 8): the user's ratified choice was a PR-SHAPE decision — one branch and one PR, chosen against two-PR and four-PR alternatives — and "four" named the four backlog items, not a commit budget. Reading it as a cap would contradict invariant 6, which requires a commit per task, and the task count grew during review (the migration, the AC-6.18 promotion fix, and the close-out gates are each their own task). The ratified decision that binds is one branch / one PR; that is unchanged. Spec §1.1a item 9 is reworded to say so rather than leaving two documents disagreeing.
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
| `tests/adminAlerts/alertProducerScope.registry.ts:214` | **MUST update — line-pinned, and a guaranteed suite failure if missed.** It pins the producer as `site: "lib/drive/watch.ts:463"`, and line 463 is currently the `tx.upsertAdminAlert({` call. Tasks 2 and 5 both insert code above it, so the anchor moves. `tests/adminAlerts/_metaAlertProducerScope.test.ts:148-157` requires exact discovered/registered equality and rejects a stale anchor as loudly as an unregistered one. Re-derive the line AFTER the last task that shifts it, not per-task. |
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
| Status values: OTHER CONSUMERS | `grep -rn "'orphaned'\|superseded\|'stopping'" lib/ app/ supabase/ tests/ components/` | **This row was WRONG** (plan review R2 finding 7). The grep looked for status string LITERALS, so it missed `lib/admin/driveConnectionHealth.ts:162-169`, which reads the latest watch row at ANY status, compares only against `active`, and branches generically. It is a real production consumer and the new value changes which tier it lands in: see spec §3.1.5, which is why Task 2 also edits that file. `lib/observe/query/watch.ts:9-10` projects `status` as a bare `string` and needs nothing. |
| `dev.*` clone excludes the table | `grep -n "drive_watch_channels" supabase/migrations/20260502000000_dev_schema_clone.sql` | `supabase/migrations/20260502000000_dev_schema_clone.sql:25` — explicitly NOT cloned. No shadow-schema fan-out. |
| Manifest is column-names-only | `node -e "…schema-manifest.json…['drive_watch_channels']"` | `["activated_at","created_at","expires_at","id","resource_id","status","stopped_at","superseded_at","watched_folder_id","webhook_secret"]` — no constraint data, hence §4.4. |
| `retry: false` typechecks on `MethodOptions` | `grep -n "retry?:" …/gaxios@7.1.4/…/common.d.ts` | `:189 retry?: boolean;` in `GaxiosOptions`, which `MethodOptions` extends. |
| The repo's canonical bound already exists | `grep -n "timeout: timeoutMs, retry: false" lib/drive/fetch.ts` | `lib/drive/fetch.ts:359` on the real `files.get` call — the idiom Task 4 copies. |
| `RefreshResult` deep-equality sites | `grep -rn "refreshed:\s*\[" tests/` | 5 files, ~18 sites. This is why §3.2.3 keeps the type unchanged. |
| `'*'` failure-entry assertions | `grep -rn "list_expiring" tests/` | `tests/drive/watch.test.ts:698`, `tests/drive/watch.test.ts:1045`, `tests/drive/watch.test.ts:1439`, `tests/sync/_metaInfraContract.test.ts:882`, `tests/cron/refreshWatchRoute.test.ts:139`; plus `tests/drive/watch.test.ts:1447` asserts the LOG's `operation`. Drives §3.1.3a. |
| Infra-fault log message is unasserted | `grep -rn "refresh-watch list_expiring failed" tests/` | no matches — safe to neutralise. |
| `not-subject-to-meta` marker shape | `grep -n "EXEMPT_MARKER" tests/notify/_metaInfraContract.test.ts` | `:63 /^\s*\/\/\s*not-subject-to-meta:\s+\S/m` — must start its own line, colon, then non-space. |
| Existing real-DB watch suite | `grep -c "^  test(" tests/db/watchRenewalDue.test.ts` | 8 tests; harness `foldersProductionWouldRenew()` at `tests/db/watchRenewalDue.test.ts:50-61` injects `now` + `subscribeToWatchedFolder` but NOT `getActiveWatchedFolder`. Task 3 must redesign it. |
| Class sweep: every Drive/Sheets API CALL SITE | `grep -rnE "\.(files\|channels\|revisions\|spreadsheets)\.[a-zA-Z]+\(" lib/ app/`, then inspect each call's second argument | **The first revision of this sweep was methodologically wrong** (plan review R1b finding 6): it grepped `getDriveClient()`/`getDriveAuth()` — client CONSTRUCTION — and inferred boundedness from that, so it misclassified `lib/drive/list.ts:102`, `lib/drive/sheetGids.ts:21`, `lib/sync/applyStaged.ts:1005` and `lib/sync/runScheduledCronSync.ts:2106` as unbounded when all four already pass `{timeout, retry: false}`, and its count (17 listed vs 20 promised) did not even agree with itself. Re-run against actual call sites: **everything under `lib/` is already bounded.** The unbounded set is exactly ten — the two this diff fixes (`lib/drive/watch.ts:383`, `lib/drive/watch.ts:420`) and eight out of scope, all under `app/api/`: `app/api/admin/onboarding/scan/route.ts:109`, `app/api/asset/agenda/[show]/[id]/route.ts:320`, `app/api/asset/agenda/[show]/[id]/route.ts:481`, `app/api/asset/agenda/[show]/[id]/route.ts:524`, `app/api/asset/reel/[show]/route.ts:397`, `app/api/asset/reel/[show]/route.ts:527`, `app/api/asset/reel/[show]/route.ts:568`, `app/api/asset/reel/[show]/route.ts:661`. Task 6's ledger entry names those eight. |

**Snippet typecheck.** Every code block in a task body below is either copied verbatim from the live tree or is SQL. The new TypeScript surface is the `expireDeadActive` port member plus the two exports Task 5 needs; both are written test-first in their tasks and typechecked by `pnpm typecheck` in Task 6. **There is no deadline-wrapper module** — an earlier revision listed one here while Task 4 already said it would not be created (plan review R1b finding 8); spec §3.3.1a withdrew it.

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
- **Same-transaction proof, not just ordering** (plan review R1b finding 4): the ordering assertion alone passes against two SEPARATE successful transactions in the right order. Add a real-DB case where the renewal READ fails and assert the reap rolled back with it — the row is still `active` afterwards. That is the only assertion that distinguishes one transaction from two.
- an expired row **whose folder IS the configured one** yields zero `subscribe` calls.
- a reap of MORE than 20 rows emits 20 sorted ids plus the true count in `expiredCount`/`supersededCount` — the cap has no coverage otherwise, and the sorted-before-capped rule exists because `RETURNING` has no ordering contract.
- `DRIVE_WATCH_EXPIRED_REAPED` is observed through a sink spy on the success branch, reporting the two populations separately — allowlist membership in `NEW_FORENSIC_CODES` is static and proves only that the string is permitted, never that the branch emits it.
- a failing reap returns `{refreshed: [], orphaned: [], failures: [{folderId: "*", operation: "list_expiring"}]}` and does **not** reject (constraint 4).
- a failing reap emits `operation: "drive_watch_channels.expire_dead_active"`; a failing renewal read still emits `operation: "drive_watch_channels.list_renewal_due"` (both directions — §3.1.3a).
- GC: an `expired` candidate does NOT reach `stopChannel` but IS marked stopped; an `orphaned` candidate with a `resourceId` DOES reach it. Assert the spy's call list by channel id, not its length.

Real DB (tests/db/watchLifecycle.db.test.ts):

- **DB-clock regression — REAL DB, not the fake** (spec R5 finding 4): set the injected JS clock hours ahead of the database's and assert an unexpired row is NOT reaped. In the DB-free suite this is tautological — `FakeWatchTx`'s clock is a mutable in-memory `Date` (`tests/drive/watch.test.ts:40-44`), so it can only prove the fake ignores the injected clock, never that production SQL still reads `now()`.

- through the real `refreshWatchSubscriptions`: a genuinely expired row ends `status='expired'`, is absent from `listRenewalDue`, present in `listGcCandidates`, and GC does NOT call `channels.stop` on it.
- an inverted lease whose `expires_at` is 24h in the FUTURE (mirroring `tests/db/watchRenewalDue.test.ts:141-155`) ends `status='superseded'` — NOT `expired` — and GC DOES call `channels.stop` on it. Assert the status, not merely that the row left `active`: a status-blind assertion passes while a possibly-live Drive channel is abandoned with nothing left to stop it.
- a row still INSIDE its lease, **and demonstrably renewal-due** (derive its lease through `renewalLeadMs` so it is due by construction, not by a hardcoded date), whose renewal fails is NOT reaped (§3.1.2 — the regression "retire on failure" would have shipped).

**Three groups of existing assertions are invalidated, not one** (plan review R1b finding 3). The previous revision listed only the first:

1. `tests/db/watchRenewalDue.test.ts:122-131` — "a lease already past expiry is still due". Inverted: the row is reaped to `expired` and is NOT renewed. Its comment names the backlog entry; replace the comment too rather than leaving it beside the new assertion.
2. `tests/db/watchRenewalDue.test.ts:133-140` and `tests/db/watchRenewalDue.test.ts:141-155` — the zero-length/inverted and future-inverted lease tests, both of which currently expect RENEWAL. Under the two-arm reap both leave `due`; the first is reaped to `expired`, the future-dated one to `superseded`. Both become reap assertions that pin the resulting STATUS.
3. `seedActiveExpiring` (`tests/drive/watch.test.ts:205-219`) seeds already-expired rows and feeds the multi-row isolation test at `tests/drive/watch.test.ts:657`, whose call site is `tests/drive/watch.test.ts:671` and which expects FOUR subscription attempts at `tests/drive/watch.test.ts:677`. **Re-dating the rows is necessary but not sufficient** (plan review R2 finding 2): once §3.2 filters to the configured folder, at most ONE of four folders can be renewed, so a four-attempt expectation is unreachable by any injection. The test's premise — that the renewal loop iterates several folders independently — is what this diff removes. Rewrite it as the folder-filter contract it now describes: four active in-lease rows on four folders, one configured, exactly one subscribe call, and assert its ARGUMENT is the configured folder. That is strictly stronger than the count it replaces.

**Implementation** — §3.1.3 and §3.1.4:

- `WatchTx` gains `expireDeadActive(): Promise<Array<{id: string; status: "expired" | "superseded"}>>` — no clock parameter, and it returns what each row BECAME. `PostgresWatchTx` implements it with the §3.1.3 `update … case … returning id, status`.
- `FakeWatchTx` mirrors it EXACTLY, including the two-status split: `expiresAt <= now` → `expired`; `expiresAt <= createdAt` → `superseded`. A fake that collapses them hides the leak §3.1.2 describes. While here, tighten `FakeWatchTx.markOrphaned` to production's `status === "pending"` filter — today it orphans any row, which is the exact filter D-A is about, and a permissive fake can mask that class. This is a test-fidelity fix, not a behaviour change.
- `refreshWatchSubscriptions`: reap and `listRenewalDue` in ONE `runTx` callback, reap first, reap wrapped in `callWatchTx("drive_watch_channels.expire_dead_active", …)`; catch reads `operation` off the typed error with the old string as fallback; message neutralised to `"refresh-watch renewal read failed"`.
- `listGcCandidates` adds `'expired'`; `gcWatchChannels` skips `stopChannel` when `channel.status === "expired"`.
- **Both halves of the GC 404 branch get tests** (plan R3 finding 3): a `superseded` row whose stop fails with a real Gaxios-shaped 404 reaches `stopped`; one that fails with anything else stays `superseded`. Either assertion alone is satisfiable by a constant, and the 404 half had no coverage at all — an implementation treating every failed superseded stop as non-404 would have passed the suite while retrying already-gone channels forever.
- **GC's post-stop transition becomes status-aware** (spec §3.1.4): a `superseded` row whose stop fails with anything other than a 404 is LEFT `superseded` for the next pass, instead of being marked `stopped` regardless as it is today (`lib/drive/watch.ts:711-726`, whose comment says "control flow UNCHANGED"). `orphaned` keeps its "either way" behaviour. Without this, Task 4's timeout silently retires the possibly-live channels Task 2 deliberately routes to `superseded`.
- Also edit `lib/admin/driveConnectionHealth.ts` per spec §3.1.5 so tier 3 admits `expired` and tier 2 excludes it — otherwise the admin panel downgrades "expired" to "inactive" and tier 3 becomes dead code.
- `DRIVE_WATCH_EXPIRED_REAPED` emitted post-commit when at least one row was reaped, carrying the two populations SEPARATELY: `expiredIds` / `supersededIds` (each sorted, then capped at 20) plus `expiredCount` / `supersededCount`. A merged `reapedIds`/`reapedCount` pair contradicts both the test above and spec §2.2, and would file a future-dated invalid lease as "expired" (plan review R2 finding 3).

**Commit:** `fix(drive): reap expired watch channels into an expired status`

## Task 3: Renew only the configured folder

**Failing tests first** (DB-free):

- two due rows on two folders, one configured → exactly one `subscribe` call, and assert its **argument** is the configured folder id (a count-only assertion passes on the wrong folder).
- `no_folder_configured` → zero `subscribe` calls.
- folder read returns `infra_error` → ALL rows renewed, `DRIVE_WATCH_FOLDER_READ_FAILED` emitted, and the returned object `toEqual`s the pre-change shape with an **empty** `failures` array. Three independent failure modes in one test: fail-open renewal, the durable record, and no `'*'` row (which would suppress reconcile's auto-resolve on a healthy cycle). The `toEqual` is what pins §3.2.3's promise that the result type did not change.
- folder read **throws** → identical to `infra_error` (catches recorded-not-thrown being lost).
- a skipped stale folder emits `DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER` with the skipped id.

**Harness redesign** (`tests/db/watchRenewalDue.test.ts`, §5): `foldersProductionWouldRenew()` takes the configured folder id and injects `getActiveWatchedFolder: async () => ({ folderId, folderName: null })`. The two-row window test at `tests/db/watchRenewalDue.test.ts:89-102` runs twice — once per configured folder — so the renewal predicate is still what excludes `notYet`, rather than the new filter excluding it for the wrong reason. The remaining single-folder tests pass their own folder id. All 8 tests keep their assertions.

**Every existing refresh call site needs an injected folder read — SEVEN, not six.** Without it each performs the real service-role settings read and DB-free unit behaviour starts depending on ambient environment: `tests/drive/watch.test.ts:487`, `tests/drive/watch.test.ts:549`, `tests/drive/watch.test.ts:671`, `tests/drive/watch.test.ts:723`, `tests/drive/watch.test.ts:757`, `tests/drive/watch.test.ts:1360`, `tests/drive/watch.test.ts:1391`.

`tests/drive/watch.test.ts:671` is the multi-row isolation test, and it needs more than an injection (plan review R2 finding 2). Task 2 re-dates its four fixture rows inside their leases, after which all four are due — but a single configured folder admits at most ONE, so its four-attempt assertion at `tests/drive/watch.test.ts:677` is unreachable by any injection. Its premise, that the renewal loop iterates several folders independently, is what this diff removes. Rewrite it as the folder-filter contract: four in-lease rows on four folders, one configured, exactly one subscribe call, asserting its ARGUMENT is the configured folder. Strictly stronger than the count it replaces.

**Implementation** — §3.2: `RefreshDeps` gains `getActiveWatchedFolder?: typeof defaultGetActiveWatchedFolder` (already imported at `lib/drive/watch.ts:15`); one read before the loop; the three §3.2.2 outcomes; `skippedFolderIds` capped at 20. `RefreshResult` is **unchanged**.

**Commit:** `fix(drive): renew only the configured watched folder`

## Task 3b: Supersede the prior folder's channels at promotion (AC-6.18, partially)

**Failing tests first** — three, because the obvious single assertion is satisfied by at least two wrong implementations (plan review R1b finding 4):

1. after `promoteSettings` swaps the watched folder, no row for a NON-promoted folder remains `status='active'`;
2. **preservation:** the newly promoted folder's own active row is still `active` — assertion (1) alone passes if every channel is superseded indiscriminately;
3. **same-transaction:** when the promotion transaction rolls back, the old folder's row is still `active` — assertion (1) alone passes if the supersession commits outside the promotion transaction, which is exactly the atomicity this task claims.

Plus the late-activation pair from spec §3.2.4 (the two mechanisms that DO ship; the third was descoped): a pending old-folder row is orphaned by promotion, and `activatePending` then refuses to promote it (zero rows matched → the existing `activate_failed_after_watch_created` path, not a silent success). This fails today — `promoteSettings` (`app/api/admin/onboarding/finalize-cas/route.ts:779-805`) touches no channel row — and it is the executable form of a shipped acceptance criterion, AC-6.18 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3846`), that has never been satisfied.

**Implementation** — spec §3.2.4, THREE parts, all required (the first two alone leave the race open):

1. promotion supersedes old-folder `active` rows and orphans old-folder `pending` rows, both inside the SAME transaction as the settings swap;
2. `activatePending` returns its affected-row count and `activateWithTx` throws on zero, routing into the existing `activate_failed_after_watch_created` path — today the count is discarded (`lib/drive/watch.ts:174-185`) and activation reports success unconditionally (`lib/drive/watch.ts:445-453`).

**There is NO third part.** An earlier revision added an `app_settings` revalidation inside `activatePending`; spec §3.2.4 descoped it after three review rounds, because its subquery reads a READ COMMITTED snapshot and cannot close the window, and because its fallback arm mis-modelled `no_folder_configured`. Do not reintroduce it. AC-6.18 moves from "never satisfied" to "satisfied except under a narrow concurrent-promotion schedule"; the residual is filed as a backlog entry in Task 6.

**Signature fan-out for (2):** the port type (`lib/drive/watch.ts:48-53`) returns `Promise<void>` today. Changing it touches the principal fake (`tests/drive/watch.test.ts:63-84`) and the cast-disabled fake plus its overrides (`tests/drive/watchExpiration.test.ts:52`, `tests/drive/watchExpiration.test.ts:138-160`) — and the cast means the compiler will NOT flag the stale members.

**Rollback harness:** the two promotion fakes are not rollback-capable (`tests/onboarding/_finalizeCasFake.ts:389`, `tests/onboarding/finalizeRevalidate.test.ts:509-512`), so the same-transaction assertion is a REAL-DB test in tests/db/watchLifecycle.db.test.ts, not a fake-based one.

**Two SQL fakes must learn the new statement** (plan review R1b finding 5). The promotion transaction runs against a shared fake whose dispatcher recognises only the statements it already knows and throws on anything else (`tests/onboarding/_finalizeCasFake.ts:267-283`), and a second inline fake has the same closed shape (`tests/onboarding/finalizeRevalidate.test.ts:430-469`). Without teaching both, existing finalize-CAS tests fail before reaching their assertions.

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

**Constructibility first — the seam is currently private.** `markWatchOrphanedWithTx`, `withDefaultTx` and `PostgresWatchTx` are all module-private (`lib/drive/watch.ts:456`, `lib/drive/watch.ts:356`, `lib/drive/watch.ts:140`), and the public subscribe paths call the helper as their FINAL transactional act, so there is no way to inject a post-alert failure from outside. The test the previous revision of this plan described could not be written (plan review R1b finding 1).

So this task begins by exporting exactly two things, and no more: `markWatchOrphanedWithTx`, and a `createPostgresWatchTx(sql)` factory. Both are already the real production code paths; exporting them makes the atomicity CONTRACT testable rather than adding a test-only branch to it. Nothing else in the module's surface changes. **Verified safe:** the export-binding guard at `tests/drive/no-unpinned-export.test.ts:5` scans `lib/sync`, `app/api/cron`, `app/api/drive` and `app/api/admin` — not `lib/drive` — and no other test pins this module's export surface.

**Failing test first** (real DB, tests/db/watchLifecycle.db.test.ts): open a real transaction, build the port with `createPostgresWatchTx`, call `markWatchOrphanedWithTx`, then throw — and assert `admin_alerts` has **no** row and the channel status is unchanged. Fails today: the alert commits over its own connection and survives the rollback.

Plus, same file: the raised alert satisfies `jsonb_typeof(context) = 'object'` and `context->>'watched_folder_id'` equals the folder id (both halves load-bearing: the broken stringified form still writes a row and still increments `occurrence_count`, so only `jsonb_typeof` plus a key read can see it — spec §3.4.2, measured); and `occurrence_count` increments on a second raise, proving the RPC's real `on conflict … do update` body ran over the pg connection.

**Implementation** — §3.4: `PostgresWatchTx.upsertAdminAlert` issues `select public.upsert_admin_alert($1::uuid, $2::text, $3::jsonb)` passing `input.context` as the RAW OBJECT — `JSON.stringify` stores a jsonb STRING and silently breaks every `context->>` read, measured in spec §3.4.2 — carrying the inline `// not-subject-to-meta: <reason>` marker in the verified form. Remove the now-unused `defaultUpsertAdminAlert` import at `lib/drive/watch.ts:3` — leaving it raises a fresh ESLint `no-unused-vars`, and a new warning means a wiring edit half-landed.

**Commit:** `fix(drive): raise the watch alert inside the channel transaction`

## Task 6: Validation apply, registries, gates, and the residual class

1. **Apply the migration to the validation project** and paste the evidence into the PR body (§4.4):
   `supabase db query --linked "<migration SQL>"` then
   `supabase db query --linked "select pg_get_constraintdef(oid) from pg_constraint where conname = 'drive_watch_channels_status_check'"` — output must contain `'expired'`.
2. **`NEW_FORENSIC_CODES`**: add all four §2.2 codes.
3. **Amend the two stale comments** §5 lists: `lib/drive/watch.ts:873-875` (reconcile's "already had its attempt via refresh" — the expired-active exception no longer exists) and the `T_EXEC_BUDGET_MS` doc block if Task 4 left anything. Deletions and replacements, not notes appended beside the superseded text.
4. **Apply the three master-spec amendments** specified in spec §4.6, each a DELETION and replacement tagged `**Amended 2026-07-26**`: the "No client-side timeout is applied" clause (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1303`, inside the Create bullet), the unscoped renewal rule (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1320`), the status set (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1294-1299` plus the GC per-status list at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1327-1329`), and **the canonical DDL CHECK at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1287-1289`, which still lists only the original statuses** and was missed by the first amendment inventory. AC-6.18 is NOT amended — Task 3b implements it. **This engages the §12.4 three-way lockstep only if a catalog row changes; it does not, so no `pnpm gen:spec-codes` run is needed** — but re-run `pnpm spec:lint` on the master spec after editing.
5. **File the credential-fetch residual** as a backlog entry (spec §3.3.1a, §7): the `GoogleAuth` token request is unbounded and no supported per-call knob was found.
6. **File the residual Drive-call class** as a new `BACKLOG.md` entry naming the EIGHT out-of-scope unbounded call sites enumerated in the pre-draft pass (all under `app/api/`; everything in `lib/` is already bounded), so the sweep is recorded rather than silently half-done.
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
