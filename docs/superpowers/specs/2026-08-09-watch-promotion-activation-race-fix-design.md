# Watch promotion/activation race — settings-row serialization (closes BL-WATCH-PROMOTION-ACTIVATION-RACE)

**Date:** 2026-08-09 · **Branch:** `fix/watch-promotion-activation-race` · **Status:** draft
**Closes:** `BL-WATCH-PROMOTION-ACTIVATION-RACE` (BACKLOG.md, `## BL-WATCH-PROMOTION-ACTIVATION-RACE` heading)
<!-- spec-lint: not-ui — DB serialization + lib change; app/admin/actions.ts is cited as a caller, no rendered UI surface changes -->
**Probe:** `docs/superpowers/specs/probes/2026-08-09-watch-race-forshare-probe.mjs` (5/5 schedules PASS, §2)

## 1. The defect

A folder switch (`promoteSettings`, `app/api/admin/onboarding/finalize-cas/route.ts`, symbol `promoteSettings`) supersedes the prior folder's `active` channels and orphans its `pending` ones inside the settings-swap transaction. That catches every channel row that EXISTS when promotion runs. It does not catch a subscriber that read the old configured folder before promotion committed and inserts + activates its row afterwards: `activatePending` (`lib/drive/watch.ts`, symbol `activatePending`) takes no lock and reads nothing from `app_settings`, and `sql.begin` runs at READ COMMITTED (`lib/drive/watch.ts`, comment at symbol `refreshWatchSubscriptions`, "each statement takes its own"). Result: one stale `active` channel delivering webhooks for an unwatched folder for up to 24h (`WATCH_TTL_MS`), self-healing at lease expiry.

Three entry points funnel into the one unguarded chokepoint (audit 2026-08-09, two independent sweeps — code + ledger):

| entry point | site |
| --- | --- |
| renewal cron | `refreshWatchSubscriptions` folder read → `subscribeToWatchedFolder` (`lib/drive/watch.ts:1140`, `lib/drive/watch.ts:1194`) |
| reconcile recovery subscribe | `reconcileWatchChannels` (`lib/drive/watch.ts:1433`) |
| admin retry button | `retryWatchSubscriptionFormAction` (`app/admin/actions.ts:309-333`) |

The audit found **zero peer races** anywhere else in code or ledger, and established that isolation-level fixes (SERIALIZABLE) cannot work here: the folder read (`getActiveWatchedFolder`, PostgREST HTTP client, `lib/appSettings/getWatchedFolderId.ts`) and the acting transaction (postgres.js, `withDefaultTx`, `lib/drive/watch.ts:680`) never share a transaction, so no isolation level relates them. The fix must pull a settings read INTO the acting transaction.

## 1.1 Resolved scope — do not relitigate

1. **Approach ratified by the user 2026-08-09: settings-row lock (`for share`) inside the activation transaction.** Alternatives (advisory-lock topology; SERIALIZABLE) were presented with trade-offs and audit evidence and declined. SERIALIZABLE is additionally *structurally ineffective* (read and act never share a tx, §1) and collides with the repo's hand-raised use of SQLSTATE 40001 as a 409 `stale_review` signal (`app/api/admin/onboarding/pull-sheet-override/route.ts:63-65`).
2. **No advisory locks on any watch surface** — ratified at `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md:376` (§1.1a item 6). This design **honors** that constraint: a row-level `for share` is not an advisory lock and introduces no advisory hashkey. The M5-R20 nested-holder class is not touched.
3. **Full close, ratified by the user:** restore AC-6.18 to absolute, update `docs/superpowers/plans/coverage.md` (AC-6.18 row), correct the code comments that assert the gap, graduate the ledger entry. Not a "serialize only" narrow fix.
4. **Implementation is routed to a separate Opus session** (user directive 2026-08-09); this spec + its plan are the handoff artifacts.
5. **`insertPending` gets no guard.** Activation is the sole point where a stale row becomes `active`; a pending row that never activates is already handled (promotion orphans it, or the stale-pending sweep does). Guarding insert would add a second lock site without closing anything the activation guard doesn't. YAGNI, deliberate.
6. **The 2026-08-04 screen ruling on the ledger entry** ("PARKED for its own lock-topology design session") is satisfied by this document — this IS that session.

## 2. Probe evidence (draft-time, per the empirical-spike rule)

Probe: `docs/superpowers/specs/probes/2026-08-09-watch-race-forshare-probe.mjs`, run 2026-08-09 against the local stack (loopback-guarded; dedicated probe tables mirroring the two-column shape — row-lock semantics are table-independent). Statement timeout 5s per connection, 60s hard kill, PASS/FAIL asserted per schedule, exit 1 on any FAIL. Output:

```
PASS  S1 current shape reproduces race: expected 1 stale active row; got 1
PASS  S2 promo-first: FOR SHARE blocks then sees B, aborts: expected blocked >=700ms, folderSeen=B, activated=false, 0 stale; got blocked 704ms, folderSeen=B, activated=false, 0 stale
PASS  S3 sub-first: promotion supersede catches committed row: expected activated=true then 0 stale; got activated=true, 0 stale
PASS  S4 overlap: promotion waits (no deadlock), supersedes after: expected folderSeen=A, 0 stale, both txs complete; got folderSeen=A, 0 stale
PASS  S5 fast path: no promotion, FOR SHARE is immediate: expected folderSeen=A, activated=true, 4ms
summary: 5/5 schedules PASS
```

What each schedule proves:

- **S1** — the race is real on the current statement shape (not hypothetical).
- **S2** — the load-bearing claim: a `for share` that blocks on promotion's uncommitted `app_settings` UPDATE re-evaluates against the NEWEST committed row version on wake (READ COMMITTED locking-clause re-check), returning the promoted folder, so the guard sees the truth and aborts. This is the exact semantics three prior review rounds' subquery attempts lacked.
- **S3/S4** — both orders of the residual interleavings leave zero stale rows; promotion's existing in-tx supersede is the partner for the subscriber-first order. No deadlock: both transactions acquire the settings row before touching channel rows (§3.4).
- **S5** — the uncontended cost is one indexed single-row select (4ms measured).

## 3. Design

### 3.1 Mechanism

`activatePending` (`lib/drive/watch.ts`, symbol `activatePending`; interface `WatchTx` at symbol `WatchTx`) gains a guard as its FIRST statement, inside the same transaction that runs its two UPDATEs:

```sql
select watched_folder_id from public.app_settings where id = 'default' for share
```

Guard rule — activation ABORTS iff:

> the settings row exists AND `watched_folder_id` is NOT NULL AND `watched_folder_id <> ` the folder being activated.

It proceeds in every other case:

| settings read result | behavior | why |
| --- | --- | --- |
| row absent | proceed | first-boot: no settings row means no promotion can be in flight (`promoteSettings` UPDATEs `where id = 'default'`); folder came from the env fallback (`lib/appSettings/getWatchedFolderId.ts:78-79`) |
| `watched_folder_id` NULL | proceed | nothing configured; an uncommitted promotion is impossible to observe here (the `for share` would have blocked until its commit and then read the promoted non-null value — promotion requires `pending_folder_id is not null`, `app/api/admin/onboarding/finalize-cas/route.ts` symbol `promoteSettings`) |
| value = folder being activated | proceed | the normal case |
| value ≠ folder being activated | abort | the race, caught |

`activatePending` signature changes from `Promise<number>` to a discriminated result so the two failure modes stay distinct (invariant 9 — no silent conflation): `{ promoted: number; abortedFolderMismatch: false } | { promoted: 0; abortedFolderMismatch: true; configuredFolderId: string | null }`. `activateWithTx` (`lib/drive/watch.ts`, symbol `activateWithTx`) maps:

- `abortedFolderMismatch: true` → throw a NEW typed error `WatchFolderChangedDuringActivationError` (module-level class in `lib/drive/watch.ts`), carrying `configuredFolderId`.
- `promoted === 0` (row vanished) → existing `DriveWatchInfraError("drive_watch_channels.activate_pending", ...)` path, unchanged.

`subscribeToWatchedFolder`'s existing catch around activation (the `activate_failed_after_watch_created` arm, `lib/drive/watch.ts`, symbol `subscribeToWatchedFolder`) handles the new error class the same way mechanically — attempt record, `markWatchOrphanedWithTx` (Drive DID create the channel, so the `resourceId` is passed and GC can stop it), log — but with reason `"folder_changed_during_activation"` in the orphan payload instead of `"activate_failed_after_watch_created"`, and log severity `warn` not `error`: this outcome is the guard WORKING, not a fault.

### 3.2 Reason string, alerting, and instrumentation

- `"folder_changed_during_activation"` is a payload/reason string, not a §12.4 error-code row — same category as the existing `"watch_create_failed"` / `"activate_failed_after_watch_created"` strings (`lib/drive/watch.ts:910`, `lib/drive/watch.ts:1028`). No §12.4 / catalog / gen:spec-codes change.
- Reason-string consumers to update (enumerated; the class-sweep for this change): `refreshWatchSubscriptions`'s failure classification (`lib/drive/watch.ts:1230`) and `reconcileWatchChannels`'s (`lib/drive/watch.ts:1632`). A folder-mismatch abort is NOT counted as a renewal failure (it is not retryable against that folder and resolves itself — the next cycle reads the new folder). It must not feed `watchEscalation` failure streaks.
- Invariant 10: no new mutation surface — activation already lives under the instrumented cron route / server action / finalize-cas callers. The abort emits a `log.warn` WITH a durable `code:` field (new non-§12.4 log code `DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED`, same class as `DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER` at `lib/drive/watch.ts:1184`), so the occurrence is observable.
- Secrets: the emit carries folder ids and channel id only — never `webhookSecret` (existing redaction discipline, `redactWatchError`).

### 3.3 Why `for share`, not `for update`

Concurrent subscribers for the SAME folder may hold the share lock simultaneously (they don't mutate `app_settings`); only promotion's row-exclusive UPDATE conflicts. `for update` would serialize subscribers against each other for no correctness gain. (Two same-folder activations racing each other are already handled by `activatePending`'s own supersede-others statement.)

### 3.4 Lock-ordering invariant (deadlock freedom)

Both transactions acquire the `app_settings` row BEFORE any `drive_watch_channels` row:

- Promotion: outer finalize tx takes `app_settings ... for update` at preflight (`app/api/admin/onboarding/finalize-cas/route.ts:265`), long before `promoteSettings`'s channel UPDATEs.
- Activation: the new guard select is the first statement of `activatePending`, before its two channel UPDATEs.

One direction of acquisition = no cycle. Probe S4 exercises the overlap empirically. This ordering is stated as a comment at the guard site and pinned by the interleave test (§5).

### 3.5 Single-holder rule (invariant 2) — not applicable, stated anyway

No advisory lock is added or moved; the per-show `show:` and `finalize:` hashkeys are untouched. The advisory-lock single-holder analysis is therefore vacuous for this change; recorded here so review does not re-derive it.

## 4. Documentation + ledger updates (the "full close" half)

| artifact | change |
| --- | --- |
| master spec AC-6.18 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3863`) | replace the 2026-07-26 amendment sentence ("this holds EXCEPT under a narrow concurrent-promotion schedule … tracked as `BL-WATCH-PROMOTION-ACTIVATION-RACE`") with an absolute statement + a dated note that the race was closed by this design (cite this file) |
| `docs/superpowers/plans/coverage.md:148` (AC-6.18 row) | same amendment removal, row note points at this design |
| finalize-cas NOTE comment (`app/api/admin/onboarding/finalize-cas/route.ts`, symbol `promoteSettings`, "A subscriber that inserts AFTER promotion commits is not covered") | rewrite: that window is now closed by the activation guard (cite `activatePending`) |
| `lib/drive/watch.ts` comments asserting the gap | sweep every comment in the file naming the race or "deliberately lacks serialization"; update each |
| `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md` §3.2.4 descope paragraph (`docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md:376`) | add a dated pointer: the descoped vector was closed 2026-08-09 by this design (do NOT rewrite the historical ratification) |
| BACKLOG.md entry | graduate to the archive in the PR's last commit, same commit that removes the `IN PROGRESS` marker (invariant 12 — archives reject in-flight entries) |
| AC-6.18 amendment cross-refs | `grep -rn "BL-WATCH-PROMOTION-ACTIVATION-RACE" docs/ BACKLOG*.md` at plan time; every hit gets a disposition (update, dated pointer, or deliberate historical-record keep) |

## 5. Tests

1. **Interleave test (the probe, productionized — TDD red first).** Real-DB two-connection test driving the REAL code paths: `promoteSettings`'s statement shape vs `subscribeToWatchedFolder` with an injected `watchFolder` stub and a gate between Drive-call return and activation. Asserts S1 (red on current code: stale row exists), then green after the guard: S2 (block + abort + orphaned outcome with reason `folder_changed_during_activation`), S3, S4 (no deadlock, bounded by test timeout). Loopback-guarded like every DB test; premise guard per `tests/_shared/premise.ts` (the test FAILS if the fixture folder ids are equal — the discriminating condition must hold, AGENTS.md `BL-GUARD-PREMISE-REACHABILITY`).
2. **Guard-rule unit rows** (fake tx): row absent → proceed; NULL → proceed; match → proceed; mismatch → abort result with `configuredFolderId`. Derived from §3.1's table — one assertion per row, values from the fixture, never hardcoded duplicates.
3. **Reason-classification rows:** a `folder_changed_during_activation` orphan is not counted in `refreshWatchSubscriptions` `failures[]` and not fed to escalation; assert against the injected fake's recorded calls, not log text.
4. **Anti-tautology:** the interleave test's stale-row assertion selects via the SAME predicate the probe used (`status='active' and folder is distinct from settings`) against the DB, not against any in-process return value the guard itself produced.
5. Existing suites: every fake `WatchTx` gains the new read (enumerated at plan time via `grep -rn "activatePending" tests/`); `tests/auth/advisoryLockRpcDeadlock.test.ts` unaffected (no advisory lock added) — stated so review does not ask.

## 6. Documented limits (consequence bound)

- **Webhook deliveries between promotion commit and Drive-side stop:** a superseded channel keeps delivering until GC stops it at Drive or the lease expires. Pre-existing, out of scope, unchanged by this design (the webhook route drops deliveries for non-active channels).
- **The guard defends against interleaving of the app's own promotion and subscriber paths** — the threat model is accidental concurrency among this app's three entry points, not adversarial DB access or out-of-band writes to `app_settings`. Out-of-band writes that bypass `promoteSettings` are handled conservatively (mismatch → orphan, surfaced via the warn code) — never silently wrong.
- **Convergence criterion for review:** each interleaving in §2 handled correctly or signaled; a conservative abort-plus-surfaced-warning is a documented limit, not a finding. No enumeration over hypothetical schedules beyond the four interleaving classes (S2, S3, S4, S5 in §2), which are exhaustive for two transactions over one row-lock: the accept-set is keyed on structure (who holds the settings row first), not on spelling.

## 7. Invariant compliance summary

| invariant | disposition |
| --- | --- |
| 2 (advisory lock single-holder) | N/A — no advisory lock touched (§3.5) |
| 5 (no raw codes in UI) | no UI surface; new code is log-only |
| 8 (impeccable gate) | `impeccable-gate: N/A — no UI surface` |
| 9 (call-boundary discipline) | new guard read is raw SQL on the enclosing tx (postgres.js), same `not-subject-to-meta` posture as `lib/drive/watch.ts:342`; mismatch vs infra-fault are distinct typed outcomes (§3.1) |
| 10 (mutation observability) | no new surface; abort emits durable `code:` (§3.2) |
| 11 (worktree) | `../FX-worktrees/watch-promotion-race` |
| 12 (ledger claim) | marked + pushed at `75e0c7663`; comes off in the PR's last commit with the archive graduation |
