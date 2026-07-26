# Watch-Channel Renewal Lifecycle: Reap Expired, Scope to the Configured Folder, Bound the Drive Call, Commit the Alert Atomically

**Date:** 2026-07-26
**Status:** Design ratified by the user 2026-07-26 during brainstorming. Ship mode: autonomous through merged PR.
**Branch:** `fix/watch-renewal-lifecycle` off `origin/main` @ `839eed829`
**Closes:** `BL-WATCH-EXPIRED-ACTIVE-ROW`, `BL-WATCH-DRIVE-CALL-TIMEOUT`, `BL-WATCH-ALERT-RAISE-NOT-ATOMIC`, `BL-WATCH-ALERT-FOLDER-SCOPE` (BACKLOG.md, entries `BL-WATCH-DRIVE-CALL-TIMEOUT` through `BL-WATCH-ALERT-FOLDER-SCOPE`).
**Unblocks but does NOT close:** `BL-WATCH-RECONCILE-BACKOFF` (BACKLOG.md, entry `BL-WATCH-RECONCILE-BACKOFF`), which stays OPEN. Its retained design input is `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md` (status DEFERRED); §8.6 below records what this diff changes about that document's premises.

---

## 1. Problem

Four shipped defects in the Drive watch renew-and-repair loop. All four were surfaced by the five adversarial rounds that shelved the backoff work, and all four are re-verified against the live tree below rather than taken from the backlog text. Two of the four are worse than the backlog records; §1.2 and §1.3 state the corrections.

### 1.1 The four defects, verified

| # | Backlog entry | Verified mechanism |
|---|---|---|
| D-A | `BL-WATCH-EXPIRED-ACTIVE-ROW` | On renewal failure only the NEW pending row is orphaned: `markOrphaned` filters `status = 'pending'` (`lib/drive/watch.ts:188-198`). The old row keeps `status='active'` past `expires_at`, and `listRenewalDue` selects on `status = 'active'` with a predicate that stays true forever once expiry has passed (`lib/drive/watch.ts:236-251`). `listGcCandidates` collects only `superseded`/`orphaned` (`lib/drive/watch.ts:266-270`), so nothing ever removes it. |
| D-B | `BL-WATCH-ALERT-FOLDER-SCOPE` | `refreshWatchSubscriptions` iterates every row `listRenewalDue` returns with no reference to `app_settings` (`lib/drive/watch.ts:666-696`), and `activatePending` supersedes only rows with the SAME `watched_folder_id` (`lib/drive/watch.ts:163-173`). Folder promotion rewrites `app_settings` and touches no channel row (`promoteSettings`, `app/api/admin/onboarding/finalize-cas/route.ts:779-805`). `WATCH_CHANNEL_ORPHANED` is one global unresolved row — the dedup index is on `(coalesce(show_id::text, ''), code)` (`supabase/migrations/20260501001000_internal_and_admin.sql:279-280`) — and escalation reports the CONFIGURED folder's name (`input.folderName`, `lib/drive/watchEscalation.ts:156`) for a failure that may have happened on a different folder. |
| D-C | `BL-WATCH-DRIVE-CALL-TIMEOUT` | `getDriveClient()` sets no timeout (`lib/drive/client.ts:35-39`) and `files.watch` is called with no second argument, so no `MethodOptions` (`lib/drive/watch.ts:383-403`). Renewals run sequentially (`lib/drive/watch.ts:666`), so one stalled call holds every folder behind it for as long as the platform allows. `channels.stop` has the same shape (`lib/drive/watch.ts:420-425`) inside GC's sequential loop (`lib/drive/watch.ts:708-727`). |
| D-D | `BL-WATCH-ALERT-RAISE-NOT-ATOMIC` | `PostgresWatchTx.upsertAdminAlert` is a transaction-port method whose body calls the standalone service-role helper (`lib/drive/watch.ts:200-205`), which constructs its own Supabase client and issues the RPC over a different connection (`lib/adminAlerts/upsertAdminAlert.ts:47-53`) — outside the `sql.begin` the port is running inside (`lib/drive/watch.ts:356-365`). The status flip and the alert can commit independently. |

### 1.2 Correction to D-A: the waste is 48 calls/day, not 24

BACKLOG.md's `BL-WATCH-EXPIRED-ACTIVE-ROW` entry states "24 futile `files.watch` calls/day per stuck folder". Reading the two consumers together gives twice that, because a stuck folder is attempted on BOTH surfaces of the same tick:

1. `refreshWatchSubscriptions` finds the expired-but-active row in `due` and calls `subscribe` — attempt 1 (`lib/drive/watch.ts:666-668`).
2. `reconcileWatchChannels` then computes `live` via `hasLiveActiveChannel`, which requires `expires_at > now` (`lib/drive/watch.ts:314`), so `live` is **false**, and the `!live` branch calls `subscribeToWatchedFolder` again — attempt 2 (`lib/drive/watch.ts:877-881`).

The comment at `lib/drive/watch.ts:873-875` says reconcile subscribes only when there is no live channel because "renewal-failing already had its attempt via refresh". That reasoning is correct for a channel that is still inside its lease and sound; it does not hold for an EXPIRED active row, which is simultaneously renewal-due and not-live. At the hourly `fxav_cron_refresh_watch` cadence (`'0 * * * *'`, `supabase/migrations/20260527000003_schedule_cron_jobs.sql:106`) that is 48 `files.watch` calls a day, indefinitely.

After §3.1 the expired row is reaped before `listRenewalDue` runs, so refresh no longer attempts it and reconcile becomes the single retry surface: **24 calls/day, one per tick, on one gateable code path.** That single-surface property is what §8.6 hands to the deferred backoff work.

### 1.3 Correction to D-B: the old folder is renewed *successfully*, forever

BACKLOG.md's `BL-WATCH-ALERT-FOLDER-SCOPE` entry frames D-B as an attribution defect — the alert "cannot describe which folder failed". The attribution defect is real, but it is a symptom of a larger one that the entry does not state: after a folder switch, the old folder's channel is **renewed successfully on every tick, forever.**

The service account still has access to the old folder and the folder still exists, so `files.watch` against it returns 200. Nothing errors, so nothing is logged, so the condition is invisible in telemetry. The observable consequences:

- Google traffic doubles permanently per abandoned folder (24 successful renewals/day each).
- The webhook ingress keeps receiving pings for the abandoned folder, and the handler reads the folder from the CHANNEL row, not from `app_settings` (`app/api/drive/webhook/route.ts:82`), so work is genuinely performed against a folder nobody watches.
- Only when the old folder's renewal eventually DOES fail does the alert appear, naming the current folder (D-B as written).

§3.2 fixes the renewal loop, which fixes the attribution as a consequence. Scoping only the alert (the other option the backlog names) would have left every bullet above in place; the user was shown both and chose the renewal fix (§1.1a item 3).

### 1.4 What is NOT wrong

Shows continue to sync on the scheduled path (`fxav_cron_sync`, `*/5`) whenever the watch connection is down, so no defect here loses data. Zero watch failures were observed in the 7-day validation window that grounded the backoff design (`docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:30`). This work removes unbounded waste and an inconsistency window; it is not an outage fix.

---

## 1.1a Resolved scope — do not relitigate

Ratified by the user on 2026-07-26 during brainstorming, from a rendered side-by-side comparison of each option below. Cite these rather than re-deriving them.

1. **A new `expired` status is ratified over reusing `orphaned`.** Both were presented with their costs — reuse needs no migration; a new value costs a CHECK migration, a surgical validation-project apply, and a `pnpm gen:schema-manifest` run. The user chose the new value for two stated reasons: "aged out" must stay distinguishable from "we failed to create it" in the only durable channel-lifecycle record (`lib/observe/query/watch.ts:9-10` projects `status` straight through), and GC can then skip the pointless `channels.stop` on an already-dead channel by reading the status rather than by inferring it from `expires_at`. **Do not propose reusing `orphaned` to avoid the migration.**
2. **`expired` is a NEW value, not a rename.** `orphaned`, `superseded`, `stopping`, `stopped` and `pending` all keep their current meanings and their current producers. No existing status transition changes.
3. **Refresh renews only the configured folder; the alert dedup key is NOT changed.** The alternative — putting folder identity in the dedup key — was presented and declined because it fixes only the alert text, leaves §1.3 entirely unfixed, and would require altering `admin_alerts_one_unresolved_idx`, an index shared by all 36 `AdminAlertCode` values (`lib/adminAlerts/upsertAdminAlert.ts:3-39`). **Do not propose per-folder alert scoping.**
4. **`WATCH_CHANNEL_ORPHANED` stays one global unresolved row and stays `audience: "doug"`.** Ratified D3 of `docs/superpowers/specs/observability/2026-07-01-watch-channel-health-design.md`; restated as item 4 of `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:53`. Unchanged here.
5. **No backoff ladder, no `drive_watch_reconcile_state` table, no cadence change.** This diff is the four prerequisites only. `fxav_cron_refresh_watch` keeps `'0 * * * *'` and `SAMPLING_PERIOD_MS` keeps `3_600_000` (`lib/drive/watchErrors.ts:24`). **Do not propose folding any part of the deferred backoff design into this diff**; §8.6 states what it hands over.
6. **No advisory locks on any watch surface.** Zero holders today (`lib/drive/watch.ts` contains no `pg_advisory`/`hashtext`), and AGENTS.md invariant 2 does not apply — none of `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions` is mutated. Adding one would create the M5-R20 nested-holder class. Concurrency defence remains the partial unique index `drive_watch_channels_one_active_per_folder_idx` (`supabase/migrations/20260501001000_internal_and_admin.sql:302-303`) plus same-transaction supersession. Ratified in the 2026-07-01 design §3.2/§6 and as item 5 of the deferred design (`docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:54`).
7. **Fail-open posture is unchanged.** `subscribeToWatchedFolder` returns `orphaned` rather than throwing; a Drive-call timeout (§3.3) is a subscribe failure on that same path and therefore degrades to scheduled sync, never fail-closed.
8. **`drive_watch_channels`' pre-existing PostgREST grants are out of scope.** `supabase/migrations/20260501002000_rls_policies.sql:163` grants `insert, update, delete` to `anon, authenticated`. That exposure predates this diff and is tracked as `BL-ADMIN-POSTGREST-DML-LOCKDOWN`. This diff neither creates nor widens it and adds no new table. **Do not expand scope to remediate it** (ratified as item 8 of the deferred design, `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:57`).
9. **One branch, four TDD commits, one PR.** Ratified over two-PR and four-PR splits because §3.1 and §3.2 interact at a single ordering point (the reap must run before the renewal read) and shipping them apart means designing that interaction twice.
10. **Inverting `tests/db/watchRenewalDue.test.ts:122-131` is intended, not collateral.** That test pins D-A deliberately and names the backlog entry in its own comment. §5 is the full inventory of shipped tested contracts this diff changes, with the replacement assertion for each.
11. **The three new codes are forensic-only and are NOT §12.4 catalog rows.** They live inside `log.*` spans, which `stripLogEmissionCalls` removes before the producer scan (`tests/cross-cutting/codes.test.ts:41-45`), exactly like the four watch codes already shipped — none of `DRIVE_WATCH_ACTIVATED`, `DRIVE_WATCH_RENEWAL_FAILED`, `DRIVE_WATCH_STOP_FAILED`, `DRIVE_WATCH_STALE_PENDING_SWEPT` appears in `lib/messages/catalog.ts`. **Do not require a §12.4 lockstep for them**; §4.3 is the registry fan-out that DOES apply.

---

## 2. Resolved decisions

| # | Decision | Choice |
|---|---|---|
| D1 | How an expired channel leaves the renewal query | A new `expired` status, set by a sweep that runs inside `refreshWatchSubscriptions` immediately before the renewal read, in the same transaction (§3.1). |
| D2 | Reap predicate | `status = 'active' and expires_at <= now` — actual expiry, never renewal failure. A renewal failure against a channel that is still inside its lease must NOT retire that channel; it is still delivering (§3.1.2). |
| D3 | Where the reap runs | `refreshWatchSubscriptions`, not `gcWatchChannels`. Refresh owns the query the stale row pollutes, and the reap must be ordered against that query within one snapshot. |
| D4 | GC treatment of `expired` | Collected like `superseded`/`orphaned`, but with `channels.stop` SKIPPED — Google has already dropped an expired channel. The skip reads `status`, not an `expires_at` comparison (§3.1.4). |
| D5 | Folder filter source | `getActiveWatchedFolder()`, read ONCE per run, already imported at `lib/drive/watch.ts:15`. Injectable through `RefreshDeps` for tests. |
| D6 | Folder-read failure posture | `infra_error` or a thrown read → renew EVERYTHING (today's behaviour, fail-open) and report it in a new `folderScope` field. `no_folder_configured` → renew NOTHING (§3.2.2). |
| D7 | How the folder-read fault is reported | A new `RefreshResult.folderScope` discriminant, NOT a `failures` row with the `'*'` sentinel — `'*'` already means "renewal state for every folder is unknown", which reconcile reads to suppress auto-resolve (`lib/drive/watch.ts:846-852`), and a fail-open run in which every folder WAS renewed must not suppress it (§3.2.3). |
| D8 | Drive-call bound | Both a `MethodOptions` `timeout` + `signal` on the call AND an outer race deadline, because `MethodOptions.timeout` reaches only the API request and not the credential fetch that precedes it (§3.3.1). |
| D9 | Loop bound | A per-row budget and a per-run budget, the latter reusing the existing `T_EXEC_BUDGET_MS`. Its doc comment, which currently says nothing enforces it, is corrected to state exactly what now does and what still does not (§3.3.3). |
| D10 | Atomic alert transport | `PostgresWatchTx.upsertAdminAlert` calls `public.upsert_admin_alert` over its own `sql` connection. The RPC is `security definer` and `language sql` (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:18-27`), so it is reachable from the pg connection with no signature change (§3.4). |
| D11 | `lib/adminAlerts/upsertAdminAlert.ts` | Unchanged. It keeps its other 24 importing modules; only the watch port stops routing through it, and its import is removed from `lib/drive/watch.ts:3` (§3.4.3). |

### 2.1 Named constants

New, in `lib/drive/watchErrors.ts` alongside the existing lease constants (`lib/drive/watchErrors.ts:8-30`). Every later section references these NAMES, never the literals.

- `DRIVE_CALL_TIMEOUT_MS` = **15_000** (15s) — the per-Drive-call bound, applied to `files.watch` and `channels.stop`. The value is the one the master spec claimed for years while nothing implemented it (BACKLOG.md, entry `BL-WATCH-DRIVE-CALL-TIMEOUT`); implementing it at the promised number rather than a new one keeps the corrected spec wording and the code in agreement.
- `REFRESH_ROW_BUDGET_MS` = **30_000** (30s) — the bound on ONE folder's whole renewal attempt: pending insert, `files.watch`, activation. Strictly greater than `DRIVE_CALL_TIMEOUT_MS` so a Drive timeout is attributed to the Drive call rather than to the row budget; the 15s of headroom covers the two DB round-trips either side of it.
- `REFRESH_RUN_BUDGET_MS` = **`T_EXEC_BUDGET_MS`** — not a new literal. Defined as an alias so the run budget and the value `isGrantTooShort` reasons from cannot drift apart, and asserted equal by a unit test rather than written twice.

Unchanged and explicitly NOT touched: `WATCH_TTL_MS` (86_400_000), `RENEWAL_LIFE_FRACTION` (0.75), `RENEWAL_MIN_LEAD_MS` (7_200_000), `SAMPLING_PERIOD_MS` (3_600_000), `T_EXEC_BUDGET_MS` (300_000), `STALE_PENDING_MAX_AGE_MS` (3_600_000), `ESCALATION_THRESHOLD` (3).

### 2.2 New forensic codes

Three, all emitted inside `log.*` spans and therefore NOT §12.4 rows (§1.1a item 11). Each is emitted at most once per run.

| Code | Level | Emitted when | Fields |
|---|---|---|---|
| `DRIVE_WATCH_EXPIRED_REAPED` | `info` | the reap returned ≥ 1 row | `reapedIds` (capped, §3.1.3), `reapedCount` |
| `DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER` | `info` | ≥ 1 due row was skipped by the folder filter | `skippedFolderIds` (capped), `skippedCount`, `configuredFolderId`, `reason` (`"not_configured_folder"` \| `"no_folder_configured"`) |
| `DRIVE_WATCH_RUN_BUDGET_EXHAUSTED` | `warn` | the run budget stopped the loop with rows unprocessed | `processedCount`, `remainingCount`, `elapsedMs`, `budgetMs` |

A Drive-call timeout emits NO new code: it surfaces through the existing `DRIVE_WATCH_RENEWAL_FAILED` warn (`lib/drive/watch.ts:675-680`) and the existing `drive watch subscribe failed` error (`lib/drive/watch.ts:512-518`), with `error_class = "drive_api"` (§3.3.4).

---

## 3. Design

### 3.1 Reap expired channels into a new `expired` status

#### 3.1.1 Migration

New migration, supabase/migrations/20260726000000_drive_watch_expired_status.sql:

```sql
alter table public.drive_watch_channels
  drop constraint if exists drive_watch_channels_status_check;
alter table public.drive_watch_channels
  add constraint drive_watch_channels_status_check check (
    status in ('pending', 'active', 'superseded', 'stopping', 'stopped', 'orphaned', 'expired')
  );
```

`drop … if exists` + `add` makes it apply-twice idempotent. The existing value list is copied verbatim from `supabase/migrations/20260501001000_internal_and_admin.sql:295-297`, including `'stopping'`, which the DB accepts and the TypeScript union does not (§8.2).

The sibling CHECK `drive_watch_channels_active_requires_drive_state` — `status <> 'active' or (resource_id is not null and expires_at is not null)` (`supabase/migrations/20260501001000_internal_and_admin.sql:298-300`) — is untouched and stays satisfied: `active` → `expired` only relaxes it.

The partial unique index `drive_watch_channels_one_active_per_folder_idx` (`supabase/migrations/20260501001000_internal_and_admin.sql:302-303`) is untouched and is the reason the reap is safe to run before the renewal read: reaping frees the per-folder active slot, so a later re-subscribe for the same folder cannot collide with the row it replaces.

#### 3.1.2 The predicate is expiry, never failure

The reap selects `status = 'active' and expires_at <= now`. It deliberately does NOT trigger on renewal failure.

This is the load-bearing correctness point of §3.1. BACKLOG.md's `BL-WATCH-EXPIRED-ACTIVE-ROW` entry offers "on renewal failure, transition the old row out of `active`" as the fix direction. Taken literally that is a regression: with `WATCH_TTL_MS` at 24h and `RENEWAL_MIN_LEAD_MS` at 2h, a renewal fires with hours of lease remaining, and the old channel is still delivering webhooks for all of it. Retiring it on a transient Drive 500 would hand those hours to GC and call `channels.stop` on a working channel. Expiry is the only condition under which the old row is provably dead, because Google stops delivering at `expires_at` whatever our table says.

`expires_at` is NOT NULL for any `active` row — guaranteed by `drive_watch_channels_active_requires_drive_state` — so the predicate needs no null arm. A NULL would evaluate to NULL and not be selected in any case.

#### 3.1.3 Port method and placement

New `WatchTx` member (`lib/drive/watch.ts:46-70`):

```ts
expireDeadActive(nowIso: string): Promise<string[]>;   // returns reaped ids
```

`PostgresWatchTx` implementation:

```sql
update public.drive_watch_channels
   set status = 'expired'
 where status = 'active'
   and expires_at <= $1::timestamptz
 returning id
```

In `refreshWatchSubscriptions`, the reap and the renewal read move into ONE `runTx` callback so both observe a single snapshot and the ordering is structural rather than incidental:

```
runTx(tx => { const reaped = await tx.expireDeadActive(nowIso);
              const due    = await tx.listRenewalDue({…});
              return { reaped, due }; })
```

Consequences, all intended:

- A folder whose channel has already expired no longer appears in `due`, so refresh does not attempt it. Recovery moves entirely to reconcile's `!live` branch (`lib/drive/watch.ts:877-881`), which was already attempting it. Net effect is §1.2: 48 → 24 calls/day, on one code path.
- If the renewal read throws, the reap rolls back with it and the existing infra-fault path runs unchanged (`lib/drive/watch.ts:647-662`). The next tick redoes both. No new failure mode.
- `DRIVE_WATCH_EXPIRED_REAPED` is emitted AFTER the transaction returns, never inside it, matching AGENTS.md invariant 10's post-commit emit rule.

**Cap:** `reapedIds` and `skippedFolderIds` (§3.2) are each capped at **20** entries, with the true total always carried in the sibling `*Count` field. A run that reaps more than 20 rows logs the first 20 by table order plus the count; the ids are forensic aids, the count is the signal. Unbounded id lists in a log field are the failure this cap prevents.

#### 3.1.4 GC collects `expired` but does not call Drive

`listGcCandidates` gains `'expired'`:

```sql
where status in ('superseded', 'orphaned', 'expired')
```

`gcWatchChannels` skips `stopChannel` when `channel.status === 'expired'` and otherwise proceeds unchanged (`lib/drive/watch.ts:708-727`). `WatchChannelRow` already carries `status` (`lib/drive/watch.ts:37-44`) so nothing new has to be plumbed.

The skip reads the status, not `expires_at` — D4. An `expires_at`-based skip would also have to decide what a NULL means and would silently start skipping `orphaned` rows that were never activated, which today reach `defaultStopChannel` and exit early on the `!channel.resourceId` guard (`lib/drive/watch.ts:419`). Reading the status keeps those two populations distinct.

The row still reaches `markStopped` and is therefore still deleted by `deleteOldStopped` after 7 days (`lib/drive/watch.ts:287-295`), and is still counted in the returned `stopped` array. Only the Drive call is skipped.

### 3.2 Renew only the configured folder

#### 3.2.1 Mechanism

`RefreshDeps` (`lib/drive/watch.ts:93-98`) gains `getActiveWatchedFolder?: typeof defaultGetActiveWatchedFolder`. `refreshWatchSubscriptions` reads it ONCE, before the loop, and filters `due`.

The helper is already imported (`lib/drive/watch.ts:15`) and already used by `reconcileWatchChannels` (`lib/drive/watch.ts:806`), returning `{folderId, folderName} | {kind:'no_folder_configured'} | {kind:'infra_error', …}` (`lib/appSettings/getWatchedFolderId.ts:39-44`).

#### 3.2.2 The three outcomes

| Read result | Renewed | `folderScope` | Emit |
|---|---|---|---|
| `{folderId}` | rows where `watchedFolderId === folderId` | `"configured"` | `DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER` if any row was filtered out |
| `{kind:'no_folder_configured'}` | none | `"none_configured"` | same code, `reason: "no_folder_configured"`, if `due` was non-empty |
| `{kind:'infra_error'}` **or** a thrown read | ALL rows (today's behaviour) | `"unfiltered_folder_read_failed"` | no skip emit — nothing was skipped |

`no_folder_configured` renewing nothing is the deliberate reading of "nothing is configured, so nothing should be watched". The existing channel is then reaped by §3.1 within its remaining lease and GC'd — the same natural-expiry path an abandoned folder takes. Reconcile's `no_folder_configured` branch already treats this state as vacuous-healthy and resolves the alert (`lib/drive/watch.ts:815-832`), so the two surfaces agree.

A thrown read is caught and mapped to the same fail-open branch as `infra_error`: an unhandled throw out of `refreshWatchSubscriptions` would reach the cron route handler, and recorded-not-thrown is the established contract on this surface (`lib/drive/watch.ts:804-810` does exactly this for the same helper inside reconcile).

#### 3.2.3 Why a new field and not a `failures` row

`RefreshResult` (`lib/drive/watch.ts:623-627`) gains:

```ts
folderScope: "configured" | "none_configured" | "unfiltered_folder_read_failed";
```

The alternative — pushing `{folderId: '*', operation: 'folder_read'}` — is wrong, and the reason is worth stating because it is not obvious. Reconcile reads `'*'` as "renewal state for EVERY folder is unknown this cycle" and uses it to refuse auto-resolving `WATCH_CHANNEL_ORPHANED` (`lib/drive/watch.ts:846-852`). But in the fail-open branch renewal state is NOT unknown: every folder was attempted and its result recorded. Emitting `'*'` there would suppress a legitimate auto-resolve on a cycle in which the channel demonstrably renewed, leaving Doug an alert for a healthy watch. The `'*'` sentinel keeps its one meaning and the new condition gets its own field.

Reconcile does not read `folderScope`; it performs its own `getActiveWatchedFolder` call (`lib/drive/watch.ts:806`). Two independent reads in one tick can in principle disagree — if the first fails and the second succeeds, refresh renewed everything while reconcile scoped to one folder. **This is accepted, not overlooked:** both branches are fail-open, both record their own fault, and the disagreement window is one tick. Coupling them would mean threading refresh's read into reconcile, which re-creates the durable-transport problem that R4 of the deferred design removed (`docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:70`).

`folderScope` is additive to a returned object. Consumers: `app/api/cron/refresh-watch/route.ts:10-11` passes the value to reconcile and serialises it into the cron response. §4.3 covers the response-shape assertion that has to move.

### 3.3 Bound every Drive call and the loop around it

#### 3.3.1 Two layers, because one is not enough

New module, lib/drive/callDeadline.ts, exporting:

```ts
export class DriveCallTimeoutError extends Error { readonly operation: string; readonly timeoutMs: number; }
export function withDriveCallDeadline<T>(
  operation: string, timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T>;
```

`timeoutMs` must be `> 0`; a non-positive value throws immediately as a programming error rather than aborting every call on arm, so a mis-wired constant fails loudly instead of silently disabling every Drive call (pinned in §6.1). It creates an `AbortController`, arms an **unref'd** timer (so it never holds the event loop open on its own — the same discipline as `createStallGuard`, `lib/drive/stallGuard.ts:41-42`), races `fn(signal)` against a rejection with `DriveCallTimeoutError`, and clears the timer in a `finally`.

`defaultWatchFolder` then passes BOTH the signal and the option:

```ts
withDriveCallDeadline("files.watch", DRIVE_CALL_TIMEOUT_MS, (signal) =>
  getDriveClient().files.watch({ fileId, requestBody: {…} }, { timeout: DRIVE_CALL_TIMEOUT_MS, signal }),
)
```

Both layers are required and neither is redundant:

- **`MethodOptions` alone is insufficient.** `MethodOptions extends GaxiosOptions` (googleapis-common 8.0.1, reached via `googleapis@^171.4.0` in `package.json`), so `timeout` and `signal` are typed and reach the API request. They do NOT reach the credential fetch that precedes it: `getDriveClient()` hands `google.drive` a `GoogleAuth` instance (`lib/drive/client.ts:35-39, 41-46`) which performs its own token request, on its own transport, before the API call is issued. A hung token endpoint is exactly the stall D-C describes and `MethodOptions.timeout` cannot see it.
- **The race alone is insufficient.** Rejecting the promise leaves the underlying socket open and the request in flight. The `signal` is what actually aborts it, and `timeout` is what gaxios itself enforces.

`defaultStopChannel` gets the same treatment with `operation: "channels.stop"` — the same shape in the same kind of sequential loop, fixed in the same commit rather than left as the next round's finding.

#### 3.3.2 Per-row budget

Each iteration of the renewal loop wraps its whole `subscribe(row.watchedFolderId)` call in `withDriveCallDeadline("refresh.row", REFRESH_ROW_BUDGET_MS, …)`. This bounds the DB round-trips either side of the Drive call, which `DRIVE_CALL_TIMEOUT_MS` does not cover. A row-budget expiry is recorded as `failures.push({folderId, operation: "subscribe"})` on the existing catch path (`lib/drive/watch.ts:684-695`) — no new branch.

#### 3.3.3 Per-run budget, and the comment it makes true

Before each iteration the loop checks elapsed time against `REFRESH_RUN_BUDGET_MS`. On exhaustion it stops, records `{folderId, operation: "run_budget"}` for each unprocessed row, and emits `DRIVE_WATCH_RUN_BUDGET_EXHAUSTED`.

`T_EXEC_BUDGET_MS`'s current doc comment says it is "A margin, NOT an enforceable bound … nothing reserves this much time for reaching any particular row" (`lib/drive/watchErrors.ts:25-30`). That becomes partly false and must be rewritten in the same commit, to exactly what is now true and no further:

- **Now enforced:** the JS-side renewal loop will not spend longer than `REFRESH_RUN_BUDGET_MS` before abandoning the remaining rows, and no single row will occupy more than `REFRESH_ROW_BUDGET_MS` of it.
- **Still NOT enforced:** the platform's willingness to keep the invocation alive, and `pg_net`'s `timeout_milliseconds`, which may be ignored outright (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:15-22`). A run can still be killed mid-loop from outside.

`isGrantTooShort`'s `P + 2T` heuristic (`lib/drive/watchErrors.ts:82-84`) therefore stays a heuristic. Its doc comment's central claim — that any timing guarantee is parameterised by a budget nothing enforces — is now half-retired, and the honest replacement is that the budget is enforced *within the process* and not *around it*. **Do not upgrade the heuristic to a guarantee in this diff** (§8.4).

#### 3.3.4 Classification

A `DriveCallTimeoutError` reaches `classifyWatchError` (`lib/drive/watchErrors.ts:103-108`), which returns `"drive_api"`: it is not a `DriveWatchInfraError` and its message matches no `CONFIG_PATTERNS` entry. That is the correct class — a Drive call that did not answer is a Drive-API fault, not a config or DB fault — and it is reached by the existing default rather than by a new pattern. §6 pins it with an assertion, because "correct by default" is exactly the kind of claim that silently stops being true when someone adds a pattern.

### 3.4 Commit the alert in the transaction it appears to be in

#### 3.4.1 Mechanism

`PostgresWatchTx.upsertAdminAlert` (`lib/drive/watch.ts:200-205`) stops calling the service-role helper and issues the RPC over its own connection:

```ts
// not-subject-to-meta: raw pg call on the enclosing sql.begin connection, not a
// Supabase client boundary; AGENTS.md invariant 9 covers `supabase.*` call sites.
await this.rows(`select public.upsert_admin_alert($1::uuid, $2::text, $3::jsonb)`, [
  null,
  input.code,
  JSON.stringify(input.context),
]);
```

`public.upsert_admin_alert(p_show_id uuid, p_code text, p_context jsonb) returns uuid` is `language sql` / `security definer` / `set search_path = public, pg_temp` (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:18-27`). No signature change, no new migration, and its whole `on conflict … do update` body — including the `failedKeys` normalisation and the `lastCountedAt` occurrence-count damping — runs identically. `show_id` is `null` on this path unconditionally, exactly as the current call passes it (`lib/drive/watch.ts:204`).

#### 3.4.2 The jsonb parameter is stringified deliberately

`JSON.stringify(input.context)` with an explicit `jsonb` cast in the SQL, NOT the raw object. Handing postgres.js a JS object for a `jsonb` parameter risks a double-encoded value — a jsonb STRING containing JSON rather than a jsonb OBJECT — which would make every `context->>'…'` read in the alert consumers return NULL while nothing errors. Two readers would break silently: `readUnresolvedWatchAlert`'s `alert.context?.error_class` and `error_message` (`lib/drive/watchEscalation.ts:101, 155`) and the RPC's own `p_context ? 'failedKeys'` test. §6 pins `jsonb_typeof(context) = 'object'` and a key read against the real DB, which is the only assertion shape that can observe this.

#### 3.4.3 What changes for callers — and what does not

`markWatchOrphanedWithTx` (`lib/drive/watch.ts:456-468`) is unchanged: it still calls `tx.markOrphaned` then `tx.upsertAdminAlert`, both wrapped in `callWatchTx`. What changes is that the second now shares the first's transaction, so either both commit or neither does.

The throw path is **unchanged in shape**. Today a failed RPC throws from the helper (`lib/adminAlerts/upsertAdminAlert.ts:55-57`) and `callWatchTx` wraps it as `DriveWatchInfraError("admin_alerts.upsert_watch_orphaned", …)` (`lib/drive/watch.ts:462-467`); the `await runTx(…)` inside `subscribeToWatchedFolder`'s catch is not itself guarded (`lib/drive/watch.ts:503-511`), so `subscribeToWatchedFolder` already rejects rather than returning `orphaned` in that case. After the change a pg error takes the same route to the same wrapper. What is new is only that `markOrphaned` rolls back with it instead of persisting — which is the defect being fixed.

`lib/adminAlerts/upsertAdminAlert.ts` is untouched and keeps all 24 of its other importing modules (`grep -rl adminAlerts/upsertAdminAlert lib/ app/`, excluding itself). Its import at `lib/drive/watch.ts:3` becomes unused and is removed in the same commit; leaving it would raise a fresh ESLint `no-unused-vars` warning, and a new warning is signal that a wiring edit half-landed.

The `WatchTx` port signature does not change, so the DB-free fake and every existing injected-`tx` test keep working — only the Postgres implementation moves.

---

## 4. Completeness matrices

### 4.1 Tier × layer

| Layer | Action |
|---|---|
| Table DDL | None. No column added, no table created. |
| Inline CHECK | `drive_watch_channels_status_check` recreated with `'expired'` (§3.1.1). `drive_watch_channels_active_requires_drive_state` — N/A, unaffected by an `active` → `expired` move. |
| Indexes | None changed. `drive_watch_channels_one_active_per_folder_idx`, `drive_watch_channels_lookup_idx`, `drive_watch_channels_renewal_due_idx` are all `where status = 'active'` (`supabase/migrations/20260501001000_internal_and_admin.sql:302-307`); a reaped row simply leaves all three, which is the point. |
| RPC read path | None. |
| RPC write path | `public.upsert_admin_alert` gains a second CALLER (the pg connection) and no change to its body or signature (§3.4.1). |
| Triggers | N/A — `drive_watch_channels` has none. `supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql` is an event trigger on DDL naming, unaffected by a CHECK recreation on an existing table. |
| Cleanup function | `listGcCandidates` + `gcWatchChannels` (§3.1.4). `deleteOldStopped` unchanged. |
| PostgREST grants | N/A — no new table; pre-existing grants explicitly out of scope (§1.1a item 8). |
| RLS policies | None. `supabase/migrations/20260501002000_rls_policies.sql:163` untouched. |
| `dev.*` shadow schema | **N/A, verified:** `drive_watch_channels` is deliberately NOT cloned (`supabase/migrations/20260502000000_dev_schema_clone.sql:25`). |
| Schema manifest | `pnpm gen:schema-manifest` is run and the result committed. Expected diff: **none** — the manifest stores a column-name array per table (`supabase/__generated__/schema-manifest.json`, `drive_watch_channels` → 10 column names) and records no CHECK constraints. §4.2 states why this makes the validation apply un-guarded and what compensates. |
| Frontend | N/A. No UI surface; AGENTS.md invariant 8 (impeccable dual-gate) does not apply — nothing under `app/` except `app/api/**`, nothing under `components/`, no token or `DESIGN.md` change. |
| Telemetry read surface | `lib/observe/query/watch.ts` — **no change needed, verified:** it projects `status` as a bare `string` (`lib/observe/query/watch.ts:9-10`) into `WatchRow.status: string` (`lib/observe/query/types.ts:168`). No enum, no filter, no sanitizer (its header comment classifies `status` as CHECK-constrained class B). `expired` renders as itself. |

### 4.2 CHECK / enum migration matrix

| Concern | Resolution |
|---|---|
| Every status value × what the CHECK must accept | `pending`, `active`, `superseded`, `stopping`, `stopped`, `orphaned` (all pre-existing, all preserved verbatim) + `expired` (new). `'stopping'` is accepted by the DB and absent from the TS union — pre-existing, preserved, §8.2. |
| NULL rows | `status` is `not null default 'pending'` (`supabase/migrations/20260501001000_internal_and_admin.sql:286`). No NULL case exists. |
| Transitional window (migration not yet applied, new code deployed) | The reap's `update … set status = 'expired'` would violate the old CHECK and throw. It runs inside the refresh transaction, so the reap AND the renewal read roll back together and the existing infra-fault path reports it (`lib/drive/watch.ts:647-662`) — renewals are skipped for that tick, no row is corrupted, and scheduled sync is unaffected. **Mitigation is ordering, not tolerance:** the migration is applied to the validation project BEFORE the PR merges, as its own plan task with the verification query in §4.4. |
| Reverse window (migration applied, old code still deployed) | Harmless. Nothing in the old code writes or reads `'expired'`. |
| Apply-twice idempotency | `drop constraint if exists` + `add constraint` (§3.1.1). |
| One-shot lifecycle | None — this is a permanent constraint definition, not a data migration. No backfill: pre-existing expired-but-active rows are reaped by the first run of the new code, which is the intended path and is what §6's real-DB test exercises. |

### 4.3 Registry / gate fan-out

Every registry this diff touches, each verified against the live tree.

| Registry | Required action |
|---|---|
| `tests/db/_metaLocalDbUrlGuard.test.ts:396-402` | **Bump the scanned-file count from 56.** It asserts an exact count of files that read `LOCAL_TEST_DATABASE_URL`. §6's new real-DB suite adds one, so the expected value becomes 57. Missing this fails the meta-test. |
| `tests/log/_auditableMutations.ts` `NEW_FORENSIC_CODES` | Add the three §2.2 codes. Verified safe: the set is consumed as an allowlist (`tests/log/_metaAdminOutcomeContract.test.ts:71` checks none leaked into catalog producers) and **no test asserts its size** (`grep -rn "NEW_FORENSIC_CODES.size" tests/` → no matches). |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | **N/A, verified:** the only route in scope is `app/api/cron/refresh-watch/route.ts`, whose sole export is `GET` (`app/api/cron/refresh-watch/route.ts:6`). The meta-test discovers mutating handlers (`POST`/`PUT`/`PATCH`/`DELETE`) and `"use server"` actions; this diff adds neither. No `AUDITABLE_MUTATIONS` row, no `ADMIN_SURFACE_EXEMPTIONS` row, no `KNOWN_UNINSTRUMENTED` row. |
| `tests/cross-cutting/codes.test.ts` (x1-catalog-parity) | **N/A, verified:** §1.1a item 11. The three codes sit inside `log.*` spans, which `stripLogEmissionCalls` removes before the producer scan (`tests/cross-cutting/codes.test.ts:41-45`). No §12.4 prose edit, no `pnpm gen:spec-codes`, no `lib/messages/catalog.ts` row. The AGENTS.md three-lockstep rule is not engaged. |
| `tests/log/_metaAdminOutcomeContract.test.ts:345` (`NULLCODE_BATCH2_STAMPS`, "33 rows") | **N/A, verified:** a closed historical batch registry. New codes do not join it, so the count is unchanged. |
| `tests/auth/_metaInfraContract.test.ts` / `tests/sync/_metaInfraContract.test.ts` | **N/A** for the new call site: §3.4.1 is a raw pg query on the enclosing transaction, not a Supabase client boundary. Carries the inline `// not-subject-to-meta:` comment invariant 9 prescribes. |
| `tests/db/validation-schema-parity.test.ts` | Runs unchanged and, per §4.1, is expected to see no manifest diff. It therefore does NOT protect the validation apply — §4.4. |
| `tests/cron/refreshWatchRoute.test.ts` | Audited for an exact-shape assertion on the `RefreshResult` serialised into the cron response; `folderScope` is additive and any deep-equality assertion needs the new field. |
| `lib/audit/watermark-symbols.generated.ts` | **N/A, verified:** it lists `drive_watch_channels.superseded_at` (`lib/audit/watermark-symbols.generated.ts:17`) — a column symbol. No column is added or removed. |

### 4.4 The validation-project apply is un-guarded, and this is how it is closed

Normally the `validation-schema-parity` gate catches a forgotten validation apply. It cannot here: the manifest is a per-table column-name array with no constraint data (§4.1), so a CHECK-only migration produces no manifest diff and both of the gate's layers stay green whether or not the migration reached validation.

If it is forgotten, the failure is silent and delayed: `expired` is rejected by the live CHECK, the reap throws, the whole refresh transaction rolls back every tick, and renewals stop entirely on the only deployed environment — reported only as a `DRIVE_WATCH_INFRA_FAULT`.

So the apply is a first-class plan task with an explicit verification, not a checklist line:

```sh
supabase db query --linked "<contents of the migration>"
supabase db query --linked "select pg_get_constraintdef(oid) from pg_constraint \
  where conname = 'drive_watch_channels_status_check'"
```

The second command's output must contain `'expired'`. That output is pasted into the PR body as evidence. `notify pgrst, 'reload schema'` is not required — a CHECK change alters no column, function, or relationship in PostgREST's schema cache — and is not run, so the PR does not imply it was needed.

### 4.5 Flag lifecycle

No boolean config field, feature flag, or toggle is added. All four fixes are unconditional. **N/A — no zombie-flag risk.**

---

## 5. Shipped tested contracts this diff deliberately changes

Ratified as §1.1a item 10. Each row is a currently-passing assertion that must change, with its replacement. A reviewer should check this list is complete rather than re-deriving whether each change is intended.

| Location | Current assertion | Replacement |
|---|---|---|
| `tests/db/watchRenewalDue.test.ts:122-131` "a lease already past expiry is still due (it never leaves the query)" | An expired-but-active row IS renewed by the production path. Its own comment names `BL-WATCH-EXPIRED-ACTIVE-ROW` and pins the defect deliberately. | Inverted: the row is reaped to `expired`, is NOT renewed, and DOES appear in `listGcCandidates`. This is the primary proof of §3.1 and it must fail before the fix. |
| `tests/db/watchRenewalDue.test.ts:50-61` `foldersProductionWouldRenew()` harness | Calls `refreshWatchSubscriptions` with `now` and `subscribeToWatchedFolder` injected but NOT `getActiveWatchedFolder`, so after §3.2 it would hit the real service-role read and be filtered by whatever `app_settings` holds locally. All eight tests in the suite would break. | The harness takes the configured folder id and injects `getActiveWatchedFolder: async () => ({folderId, folderName: null})`. |
| `tests/db/watchRenewalDue.test.ts:89-102` "renews only rows inside their own renewal window" | Inserts two rows on two DIFFERENT folders and asserts only the due one is renewed. Under §3.2 only one folder can be configured, so the filter — not the renewal predicate — would exclude the other, and the test would pass for the wrong reason. | Run the harness twice against the same two rows, configuring each folder in turn: due-folder configured → renewed; not-yet-folder configured → not renewed. The original property is preserved and the filter is proved as well. Strictly stronger than what it replaces. |
| `tests/db/watchRenewalDue.test.ts:104-156` remaining single-folder timing tests | Same harness dependency. | Each passes its own folder id to the harness. Assertions otherwise unchanged. |
| `lib/drive/watchErrors.ts:25-30` `T_EXEC_BUDGET_MS` doc comment | "A margin, NOT an enforceable bound … nothing reserves this much time for reaching any particular row." | Rewritten per §3.3.3 to state what the loop now enforces and what remains outside the process. |
| `lib/drive/watch.ts:873-875` reconcile's "renewal-failing already had its attempt via refresh" comment | States the invariant that justifies not double-subscribing. True for a live channel, false for an expired-active row (§1.2). | Amended to record that the expired-active case, which was the exception, no longer exists because refresh no longer returns those rows. |

Per the amendment discipline, each of these is a DELETION and replacement of the superseded text, not a note appended beside it.

---

## 6. Testing

TDD per AGENTS.md invariant 1: every test below is written failing first. Each row states the concrete failure mode it catches; a test that only proves "the function was called" is not in this list.

### 6.1 DB-free (`tests/drive/watch.test.ts`, extending the existing `FakeWatchTx`)

| Test | Failure mode it catches |
|---|---|
| The reap runs BEFORE the renewal read | `tx.operations` equals `["expireDeadActive", "listRenewalDue", …]`. Catches a reap ordered after the read, which would leave the stale row in `due` for one more tick — the entire fix silently reduced to a no-op. Order, not mere presence. |
| An expired-and-due row produces **zero** subscribe attempts from refresh | The executable form of §3.1.3. Asserts the spy's call COUNT is 0, not that some other row was renewed. |
| Folder filter passes the configured folder and drops the rest | Asserts the subscribe spy's ARGUMENT is the configured folder id, and that a stale-folder row yields no call. Catches a filter that counts right and selects wrong. |
| `no_folder_configured` → zero subscribes, `folderScope === "none_configured"` | Catches a fail-open default leaking into the not-configured branch. |
| Folder read returns `infra_error` → ALL rows renewed, `folderScope === "unfiltered_folder_read_failed"`, and `failures` contains **no** `'*'` row | D7. Catches a regression to the `'*'` sentinel, which would suppress reconcile's auto-resolve on a healthy cycle. |
| Folder read THROWS → same as `infra_error` | Catches recorded-not-thrown being lost, i.e. a throw escaping `refreshWatchSubscriptions` into the route handler. |
| `withDriveCallDeadline` rejects at the budget and aborts the signal | Asserts both the rejection AND that the signal the callback received is aborted. A race that leaves the socket open passes the first half only. |
| `withDriveCallDeadline` clears its timer on the success path | Catches a leaked timer; verified by asserting the returned value and that no unref'd handle remains armed. |
| A never-settling `watchFolder` yields `{outcome: "orphaned", reason: "watch_create_failed"}` within the budget | Fake timers. Catches the timeout not being wired into the subscribe path at all. |
| A timeout classifies as `error_class: "drive_api"` | §3.3.4. Catches a future `CONFIG_PATTERNS` addition silently re-classifying timeouts as `config`, which escalates immediately (`lib/drive/watchEscalation.ts:102`). |
| Run-budget exhaustion stops the loop and records the remainder | Asserts processed count, `failures` rows for unprocessed folders, and the warn emit. Catches a budget check that logs but keeps iterating. |
| GC skips `channels.stop` for `expired`, calls it for `orphaned` with a `resourceId`, and marks BOTH stopped | Asserts the stop spy's call list by channel id. A count-only assertion would pass if it skipped the wrong one. |
| `REFRESH_RUN_BUDGET_MS === T_EXEC_BUDGET_MS` | Catches the alias drifting into a second literal. |
| `withDriveCallDeadline` throws on a non-positive `timeoutMs` | Catches a mis-wired constant turning every Drive call into an instant abort, which would look like a total Drive outage. |

### 6.2 Real DB (`tests/db/watchRenewalDue.test.ts` extended, plus one new suite)

Both resolve their connection through `assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL ?? …)` (`tests/db/_localDbUrl.ts`), matching the existing suite's local-only contract (`tests/db/watchRenewalDue.test.ts:25-27`). The new file bumps the §4.3 scan count.

| Test | Failure mode it catches |
|---|---|
| The CHECK accepts `'expired'` and still rejects an unknown value | Catches a migration that was written but never applied locally, and one that widened the constraint to anything. |
| Through the real `refreshWatchSubscriptions`: an expired-active row ends as `status='expired'`, is absent from `listRenewalDue`, present in `listGcCandidates` | The §5 inversion. Runs the production `PostgresWatchTx` SQL, so it catches SQL that a fake would let pass. |
| A row still INSIDE its lease whose renewal fails is NOT reaped | §3.1.2 — the regression that "retire on failure" would have shipped. Kills a live channel if it fails. |
| Reaping frees the per-folder active slot: a re-subscribe for the same folder succeeds after a reap | Catches a `drive_watch_channels_one_active_per_folder_idx` violation, which would surface only under the reap-then-resubscribe sequence. |
| `markWatchOrphanedWithTx` inside a transaction that then throws leaves **no** `admin_alerts` row and an unchanged channel status | The direct proof of §3.4. Fails today: the alert commits over its own connection. Nothing weaker can observe this. |
| The raised alert's `context` satisfies `jsonb_typeof(context) = 'object'` and `context->>'watched_folder_id'` equals the folder id | §3.4.2 double-encoding. A jsonb STRING passes a naive "a row exists" assertion and breaks every consumer. |
| The alert's `occurrence_count` increments on a second raise | Proves the RPC's real `on conflict … do update` body ran over the pg connection, not just that an insert happened. |

### 6.3 Class sweep

Before implementing §3.3, `rg -n 'getDriveClient\(\)' lib/ app/` enumerates every Drive call site, and the plan records for each whether it is already bounded (the `files.get`/`files.list` total-time guards and the `stallGuard` idle timer described at `lib/drive/stallGuard.ts:1-23`) or newly bounded here. Per AGENTS.md class-sweep discipline this happens at round 1, not after a reviewer names the second instance.

---

## 7. Out of scope

- Backoff, `drive_watch_reconcile_state`, escalation-by-duration, any cadence change (§1.1a item 5).
- `BL-ADMIN-POSTGREST-DML-LOCKDOWN` on `drive_watch_channels` (§1.1a item 8).
- `BL-PG-CRON-COVERAGE-UNRUN` and `BL-CRON-REGISTRY-MIGRATION-PARITY` (BACKLOG.md). Adjacent to the same cron job, unrelated to these four defects.
- The webhook handler's folder resolution (`app/api/drive/webhook/route.ts:82`). §1.3 notes that an abandoned folder's pings become bounded at ≤ 24h instead of permanent; making the handler itself folder-aware is a separate change and is not made here.
- Retiring `'stopping'` from the CHECK (§8.2).

---

## 8. Watchpoints (reviewer preempts)

**8.1 "The reap should trigger on renewal failure, as the backlog says."** Refuted in §3.1.2. Renewal fires with hours of lease left; retiring on failure would destroy a channel that is still delivering. Expiry is the only provably-dead condition.

**8.2 "`'stopping'` is in the CHECK but not in `WatchChannelStatus`."** Pre-existing (`supabase/migrations/20260501001000_internal_and_admin.sql:296` vs `lib/drive/watch.ts:21`). Preserved verbatim because dropping a value from a CHECK is a separate, riskier change than adding one, and no code writes it. Out of scope (§7), noted so it is not read as introduced here.

**8.3 "`folderScope` duplicates `failures`."** Refuted in §3.2.3 with the concrete harm: the `'*'` sentinel suppresses reconcile's auto-resolve, and a fail-open run that renewed everything must not suppress it.

**8.4 "The run budget makes the renewal-timing guarantee defensible now."** Only partly, and deliberately not claimed. §3.3.3 states exactly what is enforced inside the process and what is not enforced around it. `isGrantTooShort` stays a heuristic in this diff.

**8.5 "Two `getActiveWatchedFolder` reads per tick can disagree."** Correct, accepted, and reasoned in §3.2.3: both branches fail open, both record their own fault, the window is one tick, and coupling them re-creates the durable-transport problem R4 of the deferred design removed.

**8.6 What this hands to `BL-WATCH-RECONCILE-BACKOFF`.** The blocking premise of the deferred design was "refresh, not reconcile, is the dominant retry path, and it is ungated" (BACKLOG.md, entry `BL-WATCH-RECONCILE-BACKOFF`). After §3.1 refresh does not retry an expired folder at all, and after §3.2 it does not touch a non-configured one, so reconcile's `!live` branch (`lib/drive/watch.ts:877-881`) becomes the **single** retry surface — which is precisely where the deferred ladder attaches. That entry stays OPEN; its constants and cadence prescriptions were falsified across five rounds and must be re-derived, not resumed (`docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:10`).

**8.7 "The manifest should show a diff for a CHECK change."** It does not — the manifest is a column-name array per table. That is why §4.4 makes the validation apply an explicit task with a `pg_get_constraintdef` verification pasted into the PR body, instead of relying on the parity gate.

**8.8 "No impeccable gate was run."** Correctly so: AGENTS.md invariant 8 scopes the dual-gate to files under app/ except app/api/**, files under components/, an app/globals.css @theme block, DESIGN.md, and the Tailwind config. This diff touches none of them (§4.1).
