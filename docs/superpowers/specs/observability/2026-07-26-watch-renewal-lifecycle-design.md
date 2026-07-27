# Watch-Channel Renewal Lifecycle: Reap Expired, Scope to the Configured Folder, Bound the Drive Call, Commit the Alert Atomically

**Date:** 2026-07-26
**Status:** Design ratified by the user 2026-07-26 during brainstorming. Ship mode: autonomous through merged PR.
**Branch:** `fix/watch-renewal-lifecycle` off `origin/main` @ `839eed829`
**Closes:** `BL-WATCH-EXPIRED-ACTIVE-ROW`, `BL-WATCH-ALERT-RAISE-NOT-ATOMIC`, `BL-WATCH-ALERT-FOLDER-SCOPE`. **Partially closes `BL-WATCH-DRIVE-CALL-TIMEOUT`** — see §3.3.1a: the `files.watch`/`channels.stop` requests are bounded, but the credential fetch inside the same awaited operation is not, so that entry's caller-visible symptom (one stalled call holding the sequential loop) remains reproducible via the auth path. Claiming full closure while §3.3.1a documents the reproduction would be false (spec R9 finding 4). The entry stays OPEN, narrowed, and cross-references `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED` (BACKLOG.md, entries `BL-WATCH-DRIVE-CALL-TIMEOUT` through `BL-WATCH-ALERT-FOLDER-SCOPE`).
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

- Google traffic grows permanently per abandoned folder. **The rate is ~1.3 renewals/day, not 24** (spec R9 finding 3): the lease is `WATCH_TTL_MS` (24h) and a row becomes due once `RENEWAL_LIFE_FRACTION` (75%) of it is burned, so a SUCCEEDING renewal re-arms the clock and the folder comes due again ~18h later. An earlier revision said "24 successful renewals/day", conflating this path with D-A's expired row — that one IS retried every tick, because a FAILING renewal never installs a new expiry. The waste here is permanent but slow; D-A's is permanent and fast.
- The webhook ingress keeps receiving pings for the abandoned folder, and the handler reads the folder from the CHANNEL row, not from `app_settings` (`app/api/drive/webhook/route.ts:82`), so work is genuinely performed against a folder nobody watches.
- Only when the old folder's renewal eventually DOES fail does the alert appear, naming the current folder (D-B as written).

Worth stating plainly, because it reframes D-B: **the canonical spec already required the prior folder's channels to be superseded on promotion** (AC-6.18 and §5.5.5's Revoke clause), so this is an unimplemented acceptance criterion rather than an undesigned case. §3.2.4 implements it; §3.2 fixes the renewal loop, which fixes the attribution as a consequence. Scoping only the alert (the other option the backlog names) would have left every bullet above in place; the user was shown both and chose the renewal fix (§1.1a item 3).

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
9. **One branch, one PR, a commit per task.** Ratified over two-PR and four-PR splits because §3.1 and §3.2 interact at a single ordering point (the reap must run before the renewal read) and shipping them apart means designing that interaction twice. The option the user chose was labelled "four TDD commits", where **four named the four backlog items, not a commit budget** — the alternatives on offer were two PRs and four PRs, so the decision was about PR shape. Reading it as a commit cap would contradict AGENTS.md invariant 6 (a commit per task), and the task count grew during review as the migration, the AC-6.18 promotion fix, and the close-out gates each became their own task. What is ratified and unchanged: one branch, one PR.
10. **Inverting `tests/db/watchRenewalDue.test.ts:122-131` is intended, not collateral.** That test pins D-A deliberately and names the backlog entry in its own comment. §5 is the full inventory of shipped tested contracts this diff changes, with the replacement assertion for each.
11. **The four new codes are forensic-only and are NOT §12.4 catalog rows.** They live inside `log.*` spans, which `stripLogEmissionCalls` removes before the producer scan (`tests/cross-cutting/codes.test.ts:41-45`), exactly like the four watch codes already shipped — none of `DRIVE_WATCH_ACTIVATED`, `DRIVE_WATCH_RENEWAL_FAILED`, `DRIVE_WATCH_STOP_FAILED`, `DRIVE_WATCH_STALE_PENDING_SWEPT` appears in `lib/messages/catalog.ts`. **Do not require a §12.4 lockstep for them**; §4.3 is the registry fan-out that DOES apply.

---

## 2. Resolved decisions

| # | Decision | Choice |
|---|---|---|
| D1 | How an expired channel leaves the renewal query | A new `expired` status, set by a sweep that runs inside `refreshWatchSubscriptions` immediately before the renewal read, in the same transaction (§3.1). |
| D2 | Reap predicate | TWO arms, both reading the DATABASE clock: `expires_at <= now()` retires to `expired`; `expires_at <= created_at` (an invalid lease, possibly FUTURE-dated) retires to `superseded`, because its Drive-side channel may still be live and must still be stopped. Never renewal failure — a channel inside its lease is still delivering (§3.1.2). |
| D3 | Where the reap runs | `refreshWatchSubscriptions`, not `gcWatchChannels`. Refresh owns the query the stale row pollutes, and the reap is ordered BEFORE it inside one transaction — atomicity and ordering, NOT one snapshot (READ COMMITTED gives each statement its own; §3.1.3). |
| D4 | GC treatment of `expired` | Collected like `superseded`/`orphaned`, but with `channels.stop` SKIPPED — Google has already dropped an expired channel. The skip reads `status`, not an `expires_at` comparison (§3.1.4). |
| D5 | Folder filter source | `getActiveWatchedFolder()`, read ONCE per run, already imported at `lib/drive/watch.ts:15`. Injectable through `RefreshDeps` for tests. |
| D6 | Folder-read failure posture | **Per the §3.2.2 table** — not restated here. |
| D7 | How the folder-read fault is reported | **Per the §3.2.2 table** — not restated here. `RefreshResult`'s TYPE is unchanged either way (§3.2.3). |
| D8 | Drive-call bound | The per-call `{timeout, retry: false}` pair ONLY. The outer race an earlier draft proposed is withdrawn: it could not cancel what it abandoned, and its rejection let an activation commit after the caller recorded the row as failed (§3.3.1a). |
| D9 | Loop bound | A per-run budget only, reusing the existing `T_EXEC_BUDGET_MS`, and stated as `budget + one worst-case iteration` because a pre-iteration check cannot bound the iteration it admits (§3.3.2). |
| D10 | Atomic alert transport | `PostgresWatchTx.upsertAdminAlert` calls `public.upsert_admin_alert` over its own `sql` connection. The RPC is `security definer` and `language sql` (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:18-27`), so it is reachable from the pg connection with no signature change (§3.4). |
| D11 | `lib/adminAlerts/upsertAdminAlert.ts` | Unchanged. It keeps its other 23 importing modules; only the watch port stops routing through it, and its import is removed from `lib/drive/watch.ts:3` (§3.4.3). |

### 2.1 Named constants

New, in `lib/drive/watchErrors.ts` alongside the existing lease constants (`lib/drive/watchErrors.ts:8-30`). Every later section references these NAMES, never the literals.

- `DRIVE_CALL_TIMEOUT_MS` = **15_000** (15s) — the per-Drive-call bound, applied to `files.watch` and `channels.stop`. The value is the one the master spec claimed for years while nothing implemented it (BACKLOG.md, entry `BL-WATCH-DRIVE-CALL-TIMEOUT`); implementing it at the promised number rather than a new one keeps the corrected spec wording and the code in agreement.
- `REFRESH_RUN_BUDGET_MS` = **`T_EXEC_BUDGET_MS`** — not a new literal. Defined as an alias so the run budget and the value `isGrantTooShort` reasons from cannot drift apart, and asserted equal by a unit test rather than written twice.

Unchanged and explicitly NOT touched: `WATCH_TTL_MS` (86_400_000), `RENEWAL_LIFE_FRACTION` (0.75), `RENEWAL_MIN_LEAD_MS` (7_200_000), `SAMPLING_PERIOD_MS` (3_600_000), `T_EXEC_BUDGET_MS` (300_000), `STALE_PENDING_MAX_AGE_MS` (3_600_000), `ESCALATION_THRESHOLD` (3).

### 2.2 New forensic codes

Four, all emitted inside `log.*` spans and therefore NOT §12.4 rows (§1.1a item 11). Each is emitted at most once per run.

| Code | Level | Emitted when | Fields |
|---|---|---|---|
| `DRIVE_WATCH_EXPIRED_REAPED` | `info` | the reap returned ≥ 1 row | `expiredIds` and `supersededIds` (each capped and sorted, §3.1.3), `expiredCount`, `supersededCount` — the two populations are reported SEPARATELY. A single merged id list would file a future-dated invalid lease under "expired", which is the misattribution §3.1.2 exists to prevent, and would leave no forensic trace of the class that still needs stopping at Drive. |
| `DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER` | `info` | ≥ 1 due row was skipped by the folder filter | `skippedFolderIds` (sorted, capped), `skippedCount`, `reason` (`"not_configured_folder"` \| `"no_folder_configured"`), and `configuredFolderId` — **`null` on the `no_folder_configured` branch**, where there is no folder to name. The field is always PRESENT and never omitted, so a consumer never has to distinguish absent from null (spec R6 finding 4). |
| `DRIVE_WATCH_RUN_BUDGET_EXHAUSTED` | `warn` | the run budget stopped the loop with rows unprocessed | `processedCount`, `remainingCount`, `elapsedMs`, `budgetMs` |
| `DRIVE_WATCH_FOLDER_READ_FAILED` | `warn` | the configured-folder read returned `infra_error` or threw (see the §3.2.2 table for what the run then does) | `errorMessage` (through `redactWatchError`), `dueCount` |

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

**The predicate has two arms, not one, and it reads the DATABASE's clock.**

The first arm is expiry: `expires_at <= now()`. The second is the invalid-lease class: `expires_at <= created_at`. Both are required, and the second is not optional tidiness — `listRenewalDue` deliberately selects invalid leases through its own explicit disjunct (`lib/drive/watch.ts:239-247`, whose comment warns against deleting it), and `tests/db/watchRenewalDue.test.ts:141-155` pins the case of an inverted lease whose `expires_at` is in the FUTURE. An expiry-only reap would leave exactly that row `active` and renewal-due, so refresh would retry it forever — the very condition §3.1 exists to end, surviving inside the fix (spec R1 finding 2). Reaping it is also what routes it to recovery: `hasLiveActiveChannel` tests `expires_at > now` (`lib/drive/watch.ts:314`), so a future-dated inverted lease reads as LIVE to reconcile and would otherwise be recovered by nobody.

**The two arms retire to DIFFERENT statuses, and conflating them would leak a live Drive channel.**

The arms differ in what they let us conclude about Drive's side:

| Arm | What we know | Retired to | GC calls `channels.stop`? |
| --- | --- | --- | --- |
| `expires_at <= now()` | Google stopped delivering at `expires_at`, whatever our table says. The channel is dead. | `expired` | **No** — §3.1.4, there is nothing to stop. |
| `expires_at <= created_at` (may be FUTURE-dated) | Only that our stored timestamps are nonsense. Drive granted *something*, and the channel may well be live. | `superseded` | **Yes** — the existing GC path for `superseded` stops it at Drive. |

An earlier revision of this predicate retired both arms to `expired`. That would have taken a row whose `expires_at` is 24 hours in the FUTURE — the exact fixture at `tests/db/watchRenewalDue.test.ts:141-155`, `created_at` 30h out and `expires_at` 24h out — and routed it to a status whose GC treatment deliberately skips `channels.stop`, **leaking a possibly-live channel at Drive with no record that would ever stop it**. `superseded` is the correct destination: it means "we no longer treat this channel as authoritative", which is exactly true of a corrupt-timestamp row, and its GC path already stops the channel.

`superseded_at` is set only on that arm, matching what `activatePending` does when it supersedes (`lib/drive/watch.ts:163-173`).

**`now()` is evaluated in SQL, not passed in from JavaScript.** A JS timestamp would make the "provably dead" claim rest on the app and database clocks agreeing: a fast app clock retires a channel Google is still delivering on — and because the webhook handler matches `status = 'active'` only (`app/api/drive/webhook/route.ts:79-102`) while GC deliberately skips `channels.stop` for `expired` (§3.1.4), those deliveries would be dropped with no cleanup to explain it. Using the database's own clock removes the premise rather than documenting the risk. The renewal read keeps its injected clock, which is an existing tested contract; only the reap is DB-timed.

`expires_at` is NOT NULL for any `active` row — guaranteed by `drive_watch_channels_active_requires_drive_state` — so neither arm needs a null guard. A NULL would evaluate to NULL and not be selected in any case.

#### 3.1.3 Port method and placement

New `WatchTx` member (`lib/drive/watch.ts:46-70`):

```ts
// returns the reaped rows AND what each became. The caller's emit distinguishes
// the two populations, and a test that cannot see the status cannot catch the
// leak described in 3.1.2. Takes NO clock; the predicate reads the DB's now().
expireDeadActive(): Promise<Array<{ id: string; status: "expired" | "superseded" }>>;
```

`PostgresWatchTx` implementation:

```sql
update public.drive_watch_channels
   set status       = case when expires_at <= now() then 'expired' else 'superseded' end,
       superseded_at = case when expires_at <= now() then superseded_at else now() end
 where status = 'active'
   and (expires_at <= now() or expires_at <= created_at)
 returning id, status
```

In `refreshWatchSubscriptions`, the reap and the renewal read move into ONE `runTx` callback, reap first:

```
runTx(tx => { const reaped = await tx.expireDeadActive();
              const due    = await tx.listRenewalDue({…});
              return { reaped, due }; })
```

**The statement is measured, not just prescribed.** Run against the real local database on 2026-07-26 with the migration applied, over three rows — genuinely expired, inverted-lease with a FUTURE `expires_at`, and healthy in-lease — inside a rolled-back transaction:

| Row | `created_at` / `expires_at` | Result | `superseded_at` |
| --- | --- | --- | --- |
| `p-dead` | -30h / -6h | `expired` | not set |
| `p-inverted` | +30h / +24h | `superseded` | set |
| `p-healthy` | -1h / +23h | untouched, still `active` | not set |

`UPDATE 2` — the healthy row is not touched, which is the §3.1.2 guarantee that a renewal failure must never retire a channel that is still delivering.

**What that transaction buys is atomicity and ordering — NOT a single snapshot.** `sql.begin` runs at PostgreSQL's default READ COMMITTED isolation (`lib/drive/watch.ts:356-365`), where every statement takes its own snapshot, so the renewal read can observe rows committed after the reap (spec R1 finding 9). An earlier draft claimed one snapshot; that was a stronger guarantee than the primitive provides, and the design does not need it. What it needs is that the reap is committed-or-not together with the read, and that no reaped row can appear in `due` — both of which ordering inside one transaction does deliver.

Consequences, all intended:

- A folder whose channel has already expired no longer appears in `due`, so refresh does not attempt it. Recovery moves entirely to reconcile's `!live` branch (`lib/drive/watch.ts:877-881`), which was already attempting it. Net effect is §1.2: 48 → 24 calls/day, on one code path.
- If either statement throws, both roll back and the existing infra-fault path runs (`lib/drive/watch.ts:647-662`). The next tick redoes both. **`refreshWatchSubscriptions` still never rejects** — that is a registered executable contract (`tests/sync/_metaInfraContract.test.ts:46-51`, "watch renewal transaction-port faults become a typed `failures` entry (never rejects)"), and §3.1.3a is how it is preserved.
- `DRIVE_WATCH_EXPIRED_REAPED` is emitted AFTER the transaction returns, never inside it, matching AGENTS.md invariant 10's post-commit emit rule.

#### 3.1.3a Attributing a reap failure without breaking the `'*'` contract

Putting a second statement inside that transaction creates an attribution problem the current code cannot express: its infra-fault emit hardcodes `operation: "drive_watch_channels.list_renewal_due"` (`lib/drive/watch.ts:654`) and its message names `list_expiring`, so a REAP failure would be logged as a renewal-read failure. Splitting the difference wrongly in either direction is a shipped defect, so both halves are specified:

- **The returned `failures` entry is unchanged in both cases:** `{folderId: '*', operation: 'list_expiring'}`. The `'*'` sentinel means "renewal state for every folder is unknown this cycle", which is exactly true whether the reap or the read failed — neither completed, and no folder was renewed. Keeping it preserves four existing assertions (`tests/drive/watch.test.ts:698`, `tests/drive/watch.test.ts:1045`, `tests/drive/watch.test.ts:1439`, `tests/sync/_metaInfraContract.test.ts:882`) and one route assertion (`tests/cron/refreshWatchRoute.test.ts:139`), none of which this diff should touch.
- **The emitted `operation` becomes the real one.** The reap is wrapped in `callWatchTx("drive_watch_channels.expire_dead_active", …)`, and the catch reads the operation off the typed error rather than hardcoding it: `err instanceof DriveWatchInfraError ? err.operation : "drive_watch_channels.list_renewal_due"`. The fallback keeps the existing hardcoded assertion at `tests/drive/watch.test.ts:1447` green for a genuine read failure, because that test injects a failing read and therefore still gets `drive_watch_channels.list_renewal_due`.
- The log MESSAGE changes from `"refresh-watch list_expiring failed"` to a neutral `"refresh-watch renewal read failed"`, verified unasserted (`grep -rn "refresh-watch list_expiring failed" tests/` → no matches), so forensics are not told the wrong statement failed.

**Cap:** `expiredIds`, `supersededIds` and `skippedFolderIds` (§3.2) are each SORTED and then capped at **20** entries, with the true total always carried in the sibling `*Count` field. A run that reaps more than 20 rows logs 20 of them plus the true count. **No ordering is claimed:** `UPDATE … RETURNING` has no ordering contract and which rows come back can change with the execution plan, so the caller sorts the ids before capping to make the emitted set deterministic. The ids are forensic aids; the count is the signal. Unbounded id lists in a log field are the failure this cap prevents.

#### 3.1.4 GC collects `expired` but does not call Drive

`listGcCandidates` gains `'expired'`:

```sql
where status in ('superseded', 'orphaned', 'expired')
```

`gcWatchChannels` skips `stopChannel` when `channel.status === 'expired'` and otherwise proceeds unchanged (`lib/drive/watch.ts:708-727`). `WatchChannelRow` already carries `status` (`lib/drive/watch.ts:37-44`), so no new FIELD has to be plumbed — but the `WatchChannelStatus` union itself must gain `"expired"` (`lib/drive/watch.ts:21`), and so must the principal fake's local status union (`tests/drive/watch.test.ts:30-32`). Without both, the `channel.status === "expired"` comparison is either a type error or an invitation to cast around the checker. §4.2 carries these as rows.

The skip reads the status, not `expires_at` — D4. An `expires_at`-based skip would also have to decide what a NULL means and would silently start skipping `orphaned` rows that were never activated, which today reach `defaultStopChannel` and exit early on the `!channel.resourceId` guard (`lib/drive/watch.ts:419`). Reading the status keeps those two populations distinct.

The row still reaches `markStopped` and is therefore still deleted by `deleteOldStopped` after 7 days (`lib/drive/watch.ts:287-295`), and is still counted in the returned `stopped` array. Only the Drive call is skipped.

**A FAILED stop must no longer consume the cleanup obligation** (spec R3 finding 2). GC currently catches every `channels.stop` error, logs `DRIVE_WATCH_STOP_FAILED`, and marks the row `stopped` regardless — its own comment says "control flow UNCHANGED" (`lib/drive/watch.ts:711-726`). That already contradicts the canonical contract, which says a `superseded` row whose stop fails with anything other than a 404 is left `superseded` and retried next pass (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1327`).

§3.3.1's 15-second timeout turns that from a rare path into a routine one, and §3.1.2 routes possibly-live channels to `superseded` **specifically so they get stopped**. Leaving the current behaviour would mean a timed-out stop silently retires the row and deletes it seven days later while Drive still delivers to a channel nobody will ever stop again — the exact leak the two-status split exists to prevent, reintroduced one layer down.

So GC's post-stop transition becomes status-aware, matching the canonical contract exactly:

| Candidate status | Stop call | Outcome |
| --- | --- | --- |
| `expired` | skipped (§3.1.4) | → `stopped` |
| `superseded` | succeeded, or failed with 404 | → `stopped` |
| `superseded` | failed with anything else, timeout included | **left `superseded`**, retried next pass |
| | | **How 404 is detected: reuse the STATUS-SHAPE READER from a leaf module — do not reimplement it, and do not import `driveErrorStatus` from `lib/drive/fetch.ts`.** (`driveErrorStatus` itself STAYS in `fetch.ts`; only the shape reader moves. An earlier revision's wording ordered the whole function extracted, contradicting the paragraph below — spec R8 finding 3.)

The logic is right and already proven: it reads every shape googleapis uses — `response.status`, a top-level `status`, or a numeric `code` (`lib/drive/fetch.ts:192-196`) — plus the gaxios-7 timeout codes and the undici double-wrap. But importing it from `fetch.ts` would drag the spreadsheet-export stack into the hourly watch cron (spec R7 finding 4): `lib/drive/fetch.ts:3-6` imports `synthesizeMarkdownFromXlsx`, and `lib/drive/exportSheetToMarkdown.ts:2` does `import * as XLSX from "xlsx"`. Absence of an import CYCLE does not make that free — it is cold-start and bundle cost paid on every tick to classify one error.

**What moves is the SHAPE READER, not the whole function.** `lib/drive/fetch.ts`'s `driveErrorStatus` is not a pure helper: it first special-cases `DriveFetchError`, a class defined in that same module (`lib/drive/fetch.ts:176-178`), and maps the gaxios-7 timeout codes to a transient 504 so `withDriveRetry` retries — behaviour that belongs to the fetch path, not to a leaf. A naive extraction would drag `DriveFetchError` along and reintroduce the coupling it was meant to remove.

So: a leaf module under lib/drive/ (errorStatus.ts) exports only the generic status-shape reader — `response.status`, top-level `status`, numeric `code` — with no imports.

**Three things stay in `fetch.ts`, and they are all retry POLICY rather than status reading:** the `DriveFetchError` special case; the gaxios-7 timeout codes mapped to a transient 504; and the undici `.cause`-chain walk mapped to 503 (`lib/drive/fetch.ts:199-217`). Each exists to make `withDriveRetry` retry, which is a contract the watch path does not have and must not inherit — there, anything that is not a definite 404 is already a retry-next-pass. `lib/drive/fetch.ts`'s `driveErrorStatus` keeps its `DriveFetchError` and timeout-to-504 handling and DELEGATES the shape reading to the leaf, so its callers see no change. `lib/drive/watch.ts` imports the leaf directly, which is all it needs: a `channels.stop` rejection is not a `DriveFetchError`, and the 504 mapping is irrelevant where anything non-404 is already a retry.

`lib/sync/applyStaged.ts:833` keeps its own private copy — it is a THIRD, simpler variant (no `DriveFetchError`, no timeout mapping, different precedence order), so folding it in is a behaviour change, not a refactor, and is out of scope here. Only a definite `404` counts as "already gone"; every other value, and `null`, is a non-404 and therefore a retry. Defaulting ambiguity to retry is the safe direction — retrying an already-gone channel wastes one call, whereas mis-reading a live failure as 404 abandons the channel permanently, which is the leak this table exists to prevent (spec R4 finding 5). |
| `orphaned` | any outcome | → `stopped` (canonical: "Either way", `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1329`) |

**GC must be bounded, or persistent failures starve it** (spec R9 finding 7). `listGcCandidates` reads every candidate with no `ORDER BY` and no `LIMIT` (`lib/drive/watch.ts:266-270`), and the GC cron's request carries a 300-second `timeout_milliseconds` (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:94`). At `DRIVE_CALL_TIMEOUT_MS` per failed stop, ~20 persistently failing rows consume the whole window, and because the read has no deterministic order the SAME failing rows can be served first on every pass — so `expired` and `orphaned` candidates behind them are never reached, indefinitely. That converts one stuck channel into a stalled cleanup queue.

Two changes, both small: `listGcCandidates` gains an `ORDER BY` and a `LIMIT` (`GC_CANDIDATES_PER_PASS`, `lib/drive/watchErrors.ts`), and the GC loop checks a run budget (`GC_RUN_BUDGET_MS`), stopping cleanly rather than being cut off mid-row. `expired` rows cost no Drive call at all (§3.1.4), so they are never the bottleneck — it is the retrying `superseded` rows that need the ordering.

**SUPERSEDED — the ordering is not `created_at`, and the budget is not renewal's.** This paragraph originally specified a deterministic `order by created_at`. That does not solve the problem it was written for: a poisoned prefix of persistently failing `superseded` rows is, by construction, the OLDEST, so `created_at` serves the identical starving prefix on every pass — the very failure the ordering exists to prevent (whole-diff R2 finding 2). The shipped ordering is two-level: status tier first, so rows needing no Drive call (`expired`) or resolving either way (`orphaned`) drain ahead of `superseded`; then `random()` WITHIN each tier, which gives every row in the poisoned tier a pass-independent chance of being reached. That is fairness in expectation, not a guarantee for any single pass. The run budget is `GC_RUN_BUDGET_MS`, sized to the GC cron's own 300-second window, not `REFRESH_RUN_BUDGET_MS` — the two loops run under different cron entries with different windows, so sharing one constant would bound each by the other's schedule. Both values, and the pass cap, are pinned by behavioural tests in `tests/drive/watch.test.ts` and `tests/db/watchLifecycle.db.test.ts`; a later change that restores `created_at` from the superseded text above will fail them.

A permanently failing stop therefore retries indefinitely, but bounded per pass and behind a fair queue. That is the canonical contract's deliberate choice, it is observable through the existing `DRIVE_WATCH_STOP_FAILED` warn, and it is strictly better than silently abandoning a live channel. The returned `stopped` array only counts rows that actually reached `stopped`.

#### 3.1.5 The admin health panel must keep saying "expired"

`lib/admin/driveConnectionHealth.ts` reads `drive_watch_channels.status` for the folder at ANY status and classifies in tiers:

- **tier 2, `watch_inactive`** - any non-`active` status (`lib/admin/driveConnectionHealth.ts:162-165`)
- **tier 3, `watch_expired`** - `active` but `expires_at <= now` (`lib/admin/driveConnectionHealth.ts:166-169`)

Today an expired-but-active row lands in tier 3 and the panel says the watch EXPIRED. After §3.1 that row's status becomes `expired`, so it matches tier 2 first and the panel would say the watch is INACTIVE, losing the distinction for exactly the condition tier 3 was written to name. Worse, tier 3 becomes unreachable: after the reap no row stays `active` past its expiry long enough to be observed.

**So tier 2 excludes the new value and tier 3 admits it:** a status of `expired`, or `active` with `expires_at <= now`, yields `watch_expired`; every other non-`active` status still yields `watch_inactive`.

**This preserves the diagnosis only until GC runs, and that is the honest ceiling** (spec R4 finding 2). GC transitions `expired` rows to `stopped` (§3.1.4), and `stopped` is not `expired`, so from the next `15 * * * *` pass the panel reports `watch_inactive` again. That is **correct, not a downgrade**: once the channel is stopped and the row retired, the folder genuinely has no watch, and reconcile re-subscribes on its own tick. What is true and worth stating plainly is that **tier 3 becomes rare by design** — it was previously reachable only because expired rows lingered as `active` forever, which is the very defect D-A describes. Its rarity after this diff is the bug's symptom disappearing, not a new blind spot.

Do NOT "fix" this by routing `stopped` to `watch_expired`: `stopped` covers superseded and orphaned rows too, and the panel would then report an expired watch for a channel that was deliberately replaced.

No new message code and no §12.4 change: `watch_expired` already exists and this only routes a status to it. The file is under `lib/admin/`, not `app/` or `components/`, so AGENTS.md invariant 8 is still not engaged.

This consumer was **missed by the original status-consumer sweep**, which concluded "no other consumer" (plan review R2 finding 7). That sweep grepped for status string LITERALS; this file compares against one value and branches on everything else generically, so it matched nothing.

### 3.2 Renew only the configured folder

#### 3.2.1 Mechanism

`RefreshDeps` (`lib/drive/watch.ts:93-98`) gains `getActiveWatchedFolder?: typeof defaultGetActiveWatchedFolder`. `refreshWatchSubscriptions` reads it ONCE, before the loop, and filters `due`.

The helper is already imported (`lib/drive/watch.ts:15`) and already used by `reconcileWatchChannels` (`lib/drive/watch.ts:806`), returning `{folderId, folderName} | {kind:'no_folder_configured'} | {kind:'infra_error', …}` (`lib/appSettings/getWatchedFolderId.ts:39-44`).

#### 3.2.2 The folder-read contract — stated ONCE, here

This contract has now drifted three times (fail-open → fail-closed; then the failure row; then the zero-due gate), each time because it was restated in five or six places and only the primary one was repaired. **This table is the only normative statement of it. Every other mention in this document, the plan, and any review brief is a POINTER to §3.2.2 and must not restate the behaviour.** If another passage disagrees with this table, that passage is wrong.

| Read result | Rows renewed | `failures` entry | Forensic emit |
| --- | --- | --- | --- |
| `{folderId}` | rows whose `watchedFolderId` matches | none | `DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER` if any row was filtered out |
| `{kind:'no_folder_configured'}` | **none** | none | same code, `reason: "no_folder_configured"`, if `due` was non-empty |
| `{kind:'infra_error'}` **or** a thrown read, **and `due` is non-empty** | **none** | `{folderId: '*', operation: 'folder_read'}` | `DRIVE_WATCH_FOLDER_READ_FAILED` |
| `{kind:'infra_error'}` **or** a thrown read, **and `due` is EMPTY** | none (there were none) | **none** | `DRIVE_WATCH_FOLDER_READ_FAILED` |

Three rules follow from the table, and each has a reason that is easy to lose:

1. **A failed read renews nothing.** Fail-open is what unbounded the §3.2.4 residual, and the lease already absorbs a transient blip (a channel is due 6h before expiry against an hourly cron, so ~6 opportunities).
2. **When something WAS due, the failure is recorded.** Otherwise a run that renewed nothing returns 200 (`app/api/cron/refresh-watch/route.ts:12-27`) and reconcile can auto-resolve `WATCH_CHANNEL_ORPHANED` on a cycle where renewal never ran (`lib/drive/watch.ts:846-861`), contradicting the registered typed-failure contract and AGENTS.md invariant 9.
3. **When nothing was due, it is NOT recorded.** The renewal query already established that no row needed renewing, so nothing was skipped; recording a wildcard there manufactures a false 500 and marks a live channel renewal-dirty.




`no_folder_configured` renewing nothing is the deliberate reading of "nothing is configured, so nothing should be watched". The existing channel is then reaped by §3.1 within its remaining lease and GC'd — the same natural-expiry path an abandoned folder takes. Reconcile's `no_folder_configured` branch already treats this state as vacuous-healthy and resolves the alert (`lib/drive/watch.ts:815-832`), so the two surfaces agree.

The history behind each rule, for anyone tempted to "simplify" one of them, is in the review log rather than here.

Renewing nothing is also the safer branch on its own merits, because the lease provides the slack:

- A channel becomes renewal-due at `RENEWAL_MIN_LEAD_MS` (2h) or 25% of its granted life, whichever is larger — for a 24h lease, 6h before expiry.
- `fxav_cron_refresh_watch` runs hourly, so a due channel gets roughly **six** renewal opportunities before it actually expires.
- A settings read would therefore have to fail for ~6 consecutive hours to cost a single channel its lease, and an outage that long also disables reconcile (which performs its own read, `lib/drive/watch.ts:806`), so the system is degraded regardless and scheduled sync still carries the data (§1.4).

Fail-open bought nothing against a transient blip that the lease already absorbs, and cost the only bound the descoped residual had.

A thrown read is caught and mapped to the same branch as `infra_error`: an unhandled throw out of `refreshWatchSubscriptions` would reach the cron route handler, and recorded-not-thrown is the established contract on this surface (`lib/drive/watch.ts:804-810` does exactly this for the same helper inside reconcile).

#### 3.2.3 `RefreshResult`'s TYPE does not change; the `'*'` sentinel IS used

**`RefreshResult` (`lib/drive/watch.ts:623-627`) keeps its exact current shape.** An earlier draft of this spec added a `folderScope` discriminant to it and called the addition "additive". That was wrong on two counts, and the correction is the reason this section exists:

- It is not additive to the **tests**. `RefreshResult` is deep-equality asserted with `toEqual` in five files — `tests/drive/watch.test.ts` (twelve sites, including the `NO_REFRESH` fixture at `tests/drive/watch.test.ts:233`), `tests/sync/_metaInfraContract.test.ts:879-883`, `tests/cron/refreshWatchRoute.test.ts:20`, `tests/api/cron-sync.test.ts:9`, `tests/cron/cronRouteSummaries.test.ts:98`. A required new field breaks every one of them, for no behavioural gain.
- It is not additive to the **public cron response**. `tests/cron/refreshWatchRoute.test.ts:69-71` asserts the route's serialised JSON body with `toEqual`, so the field would become part of that response's contract.

How the fault is reported is the §3.2.2 table's third and fourth rows; the emit's payload is §2.2. The emit is the record `pnpm observe events --source drive.watch` reads, and nothing programmatic needs the value — the route only reads `failures` for its 500 decision (`app/api/cron/refresh-watch/route.ts:12`; lines 3-4 there are imports), and reconcile performs its own folder read.

**A failed folder read records `{folderId: '*', operation: 'folder_read'}` — but ONLY when `due` is non-empty.**

The qualifier matters (spec R7 finding 2). The folder read happens before the loop, so it also runs on a tick where the renewal query returned nothing. On such a tick the read's failure is harmless: the renewal query already established that no row needed renewing, so nothing was skipped and nothing is unknown. Recording the wildcard there would manufacture a failure — forcing the cron route to 500 (`app/api/cron/refresh-watch/route.ts:10-27`) and, if reconcile's own read succeeds, marking a live channel renewal-dirty (`lib/drive/watch.ts:846-852`). A healthy no-op cycle would report as `renewal_failing`. So: `due.length > 0` gates the failure row. The forensic emit still fires either way, because a failing settings read is worth recording even when it cost nothing.

**With that qualifier, recording it reverses an earlier revision** (spec R6 finding 1, BLOCKING). That revision recorded nothing, on the reasoning that renewal state was NOT unknown because every folder had been attempted. **That reasoning was sound only while the branch was fail-open.** Once D6 became fail-closed the opposite holds: nothing was attempted, so "renewal state for every folder is unknown this cycle" — the `'*'` sentinel's exact meaning — is now literally true.

Recording nothing would have made a run that renewed NOTHING report success:

- the cron route returns 200, because it derives its status from `failures` (`app/api/cron/refresh-watch/route.ts:12-27`), so an infrastructure fault that suspended all renewal would look like a healthy cycle;
- reconcile's `renewalFailed` stays false (`lib/drive/watch.ts:846-861`), so it could auto-resolve `WATCH_CHANNEL_ORPHANED` on a cycle where renewal never ran;
- and it would contradict the registered typed-failure contract at `tests/sync/_metaInfraContract.test.ts:47-50` and AGENTS.md invariant 9, both of which require an infra fault to surface as a discriminable typed result rather than a silent skip.

So the two halves move together: **renew nothing, and say so.** Fail-closed without the failure row is strictly worse than either fail-open or fail-closed done properly, because it hides the fault it creates.

Reconcile performs its own `getActiveWatchedFolder` call (`lib/drive/watch.ts:806`). Two independent reads in one tick can in principle disagree — if the first fails and the second succeeds, refresh renewed NOTHING and recorded a `'*'` failure while reconcile scoped to one folder. **This is accepted, not overlooked:** neither branch can renew a stale folder, both record their own diagnostic, and the disagreement window is one tick. Coupling them is not worth it: both surfaces now refuse to renew a non-configured folder, so a disagreement cannot produce a wrong write — only a redundant read. (An earlier revision justified this by citing `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:70` as a durable-transport problem. That line says the opposite — the transport is same-cycle and in-process, and splitting the PROCESSES was the only thing that ever required durability. The citation is withdrawn; spec R7 finding 1.)

#### 3.2.4 Supersede the prior folder's channels at promotion — the master spec already requires this

Spec R1 finding 4 established that this design contradicted the canonical spec, and the sharpest instance is not a wording drift: **AC-6.18 already mandates that after a folder change the prior folder's rows are `status = 'superseded'`** (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3846`), and §5.5.5's Revoke clause states it as behaviour — "mark all `active` rows for the prior folder `superseded` (DB-only)" (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1321`).

`promoteSettings` does not do it (`app/api/admin/onboarding/finalize-cas/route.ts:779-805`). This is not a gap in the design, it is an unimplemented shipped acceptance criterion — and `BL-WATCH-ALERT-FOLDER-SCOPE` names the exact site in its own text ("folder promotion supersedes nothing"). Leaving old-folder rows `active` until natural expiry, as an earlier draft of §3.2 proposed, would have shipped a design that violates AC-6.18 while claiming to close the entry that cites it.

**So the promotion path supersedes, in the same transaction as the settings swap:**

```sql
update public.drive_watch_channels
   set status = 'superseded', superseded_at = now()
 where status = 'active'
   and watched_folder_id is distinct from <the newly promoted folder id>
```

Scoped by `is distinct from` the new folder rather than by naming the old one: `promoteSettings` returns the new `watched_folder_id` and the old value is already overwritten by the time the statement runs, and any OTHER stale active row deserves the same treatment. Same transaction as the `app_settings` update, so a rolled-back promotion cannot orphan the previous folder's channel.

**Supersession alone does not satisfy AC-6.18 under concurrency, and this design stops trying.**

Three consecutive review rounds found a race here, and each repair introduced the next round's defect:

- **R2** — a pending row that already exists when promotion runs is invisible to a sweep of `active` rows. Repair: also orphan old-folder `pending` rows, and make `activatePending` throw when it matches zero rows.
- **R3** — a pending row created AFTER promotion commits is not covered by either. Repair: have `activatePending` revalidate the folder against `app_settings` in the same statement.
- **R4** — that subquery reads a READ COMMITTED snapshot, so a subscriber can still activate against the pre-promotion value and commit before promotion commits. Separately, the guard's fallback arm was wrong: `getActiveWatchedFolder` consults the environment only when the settings row is ABSENT (`lib/appSettings/getWatchedFolderId.ts:77-80`), so a present row holding NULL yields `no_folder_configured` — and the arm would have authorized any folder in exactly that case. The probe recorded below as "env fallback" was measuring that mislabeled state, not the env path.

Per the writing-plans same-vector rule, three rounds on one vector means the vector is descoped or spiked, not patched a fourth time. **It is descoped, deliberately and with its reason:** closing it needs serialization between the promotion transaction and concurrent subscribers — an advisory lock or a `select … for update` on the settings row — and this design is ratified as adding **no advisory locks to any watch surface** (§1.1a item 6), because a second holder on this hashkey is the M5-R20 nested-holder class. A correct fix is a lock-topology change, which is its own piece of work with its own review.

**What ships, and what does not:**

| | |
| --- | --- |
| **Ships** | Promotion supersedes old-folder `active` rows and orphans old-folder `pending` rows, in the settings-swap transaction. `activatePending` returns its affected-row count and `activateWithTx` throws on zero, routing into the existing orphan-and-alert path — the canonical spec has prescribed that zero-row rollback since v1 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1318`) and it was never implemented. |
| **Does NOT ship** | The `app_settings` revalidation inside `activatePending`. It cannot be made correct without serialization, and a half-correct guard is worse than none: it reads as a closed race in review while leaving the window open. |
| **Residual, filed** | A subscriber that begins before promotion and commits its activation around it can still leave one stale `active` row for the old folder. Bounded: that row is never renewed (§3.2 filters by configured folder on every tick), so it dies at its own expiry within `WATCH_TTL_MS` and is then reaped and GC'd. The exposure is up to 24h of webhook deliveries for a folder nobody watches — the same class §1.3 measured as PERMANENT before this diff, now bounded to one lease. Filed as its own backlog entry (§7). |

**AC-6.18 therefore moves from "never satisfied" to "satisfied except under a narrow concurrent-promotion schedule", not to "satisfied".** Saying otherwise would be the third consecutive round of claiming a race closed that is not.

**The §3.2 folder filter is still required, and is not redundant with this.** Promotion is one way a non-configured folder can hold an `active` row; it is not the only one. The env-var fallback (`firstBootEnvFolderId`, `lib/appSettings/getWatchedFolderId.ts:20-22`) can change under a running deployment, a promotion can fail after its Drive subscribe, and rows can be edited directly. Supersession fixes the wizard path at its root; the filter is the standing guarantee that refresh never renews a folder nobody watches. Both, not either.

**Registry impact is contained:** the route is already a registered admin mutation (`tests/log/_auditableMutations.ts:35`, `POST` → `SHOW_FINALIZED`), so this adds behaviour to a registered surface rather than creating an unregistered one. No new `AUDITABLE_MUTATIONS` row.

### 3.3 Bound the Drive REQUESTS, and the loop around them

#### 3.3.1 The per-call bound is the repo's existing idiom, verbatim

This project already solved this exact problem on the onboarding hot path and documented gaxios-7's behaviour while doing it. The watch fix reuses that idiom rather than inventing one; the reasoning below is taken from `lib/drive/fetch.ts:81-99` and the call it describes at `lib/drive/fetch.ts:359`, not from general knowledge of gaxios.

```ts
getDriveClient().files.watch({ fileId, requestBody: {…} }, { timeout: DRIVE_CALL_TIMEOUT_MS, retry: false })
```

Both options are load-bearing:

- **`timeout`** is a gaxios-7 per-call budget that fires via `AbortSignal.timeout` and throws a `GaxiosError` with `code === "TimeoutError"` (a string, not the gaxios-6/axios `ECONNABORTED`/`ETIMEDOUT` shape) — `lib/drive/fetch.ts:90-92`. Because gaxios derives its own abort signal from it, **it aborts the socket by itself**, so no separate `signal` is needed. (A caller-supplied signal would NOT displace it — gaxios combines the two with `AbortSignal.any`, per gaxios 7.1.4's request path. An earlier draft claimed displacement; that was wrong, and the reason for passing only `timeout` is that a second signal adds nothing here, not that it would break anything.) `MethodOptions extends GaxiosOptions` (googleapis-common 8.0.1 via `googleapis@^171.4.0` in `package.json`), so both fields are typed.
- **`retry: false`** is not decoration. gaxios has its own internal retry layer, and without this the per-call budget is **multiplied by that layer's attempts** — so a `timeout` alone would not actually bound the call. `lib/drive/fetch.ts:342-344` states this for `files.get`, where `withDriveRetry` is the single retry layer. The watch path has **no** retry wrapper and deliberately gains none: one attempt per cron tick, with the next tick as the retry, which is the existing fail-open posture (§1.1a item 7). Adding `withDriveRetry` here would change how a 429 behaves and is out of scope.

`defaultStopChannel` takes the same two options with the same values — the same shape in the same kind of sequential loop, fixed in the same commit rather than left as the next round's finding.

`DRIVE_CALL_TIMEOUT_MS` at 15s sits inside the existing family: `DRIVE_FILES_GET_TIMEOUT_MS` = 8_000 (`lib/drive/fetch.ts:109`) and `DRIVE_EXPORT_TIMEOUT_MS` = 45_000 (`lib/drive/fetch.ts:79`).

#### 3.3.1a There is no outer deadline, and why

An earlier draft of this spec wrapped each renewal row in an outer race (`withDriveCallDeadline`, in a new module under lib/drive/) on the reasoning that the per-call `timeout` cannot reach the credential fetch. **That design is withdrawn.** It was refuted on three counts, and the third is a correctness hazard rather than a shortfall:

1. **It cannot cancel what it abandons.** The wrapper surrounded `subscribeToWatchedFolder`, whose signature accepts no `AbortSignal` (`lib/drive/watch.ts:470-473`). A fired deadline rejects the outer promise while the underlying work continues — so an activation can COMMIT after refresh has already recorded that row as failed and moved on (`activatePending`, `lib/drive/watch.ts:157-186`). That produces a live channel the caller believes does not exist, and a second subscribe attempt against the same folder from reconcile in the same tick. A bound that manufactures duplicate channels is worse than no bound.
2. **It does not close the gap it was justified by.** The credential fetch happens inside `GoogleAuth`'s own transport before the API request is issued, and neither the outer race nor `MethodOptions` reaches it — rejecting the race leaves that socket live exactly as before.
3. **It bounded nothing the per-call option does not already bound.** `timeout` cancels the Drive request itself (§3.3.1).

So this design has exactly one Drive-call bound — the per-call option pair — plus the loop bound in §3.3.2.

**Named residual, not a silent gap.** A stalled `GoogleAuth` credential fetch remains unbounded. Nothing in this diff bounds it and nothing in it claims to. It is filed as its own backlog entry (§7) rather than left implicit, because the previous draft's error was precisely that it *claimed* to have closed this.

#### 3.3.2 The loop bound, stated as what it actually is

Before each iteration the loop compares elapsed time against `REFRESH_RUN_BUDGET_MS`. On exhaustion it stops, records `{folderId, operation: "run_budget"}` for each unprocessed row, and emits `DRIVE_WATCH_RUN_BUDGET_EXHAUSTED`.

**The bound is `REFRESH_RUN_BUDGET_MS + one worst-case iteration`, not `REFRESH_RUN_BUDGET_MS`.** A check placed before an iteration cannot bound that iteration: a row entering the loop one millisecond under budget still runs to completion. Stating the loop bound as the budget alone would be false, and this spec has already had one timing claim refuted for exactly that kind of imprecision (§3.3.1a). A worst-case iteration is ONE bounded Drive call — `files.watch`; `channels.stop` belongs to the separate GC loop, not to a renewal iteration — plus the DB round-trips and the unbounded credential fetch above — which is why the residual matters and is named rather than hidden.

`REFRESH_ROW_BUDGET_MS` is **retired from §2.1** along with the wrapper it parameterised. There is no per-row bound in this design.

#### 3.3.3 The `T_EXEC_BUDGET_MS` comment, corrected but not upgraded

`T_EXEC_BUDGET_MS`'s doc comment says it is "A margin, NOT an enforceable bound … nothing reserves this much time for reaching any particular row" (`lib/drive/watchErrors.ts:25-30`). That becomes partly false and is rewritten to exactly what is now true:

- **Now enforced:** the renewal loop stops starting new rows once `REFRESH_RUN_BUDGET_MS` has elapsed.
- **Still NOT enforced:** the in-flight iteration when the budget expires (§3.3.2); the credential fetch; the platform's willingness to keep the invocation alive; and `pg_net`'s `timeout_milliseconds`, which may be ignored outright (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:15-22`).

`isGrantTooShort`'s `P + 2T` heuristic (`lib/drive/watchErrors.ts:82-84`) therefore stays a heuristic. **Do not upgrade it to a guarantee in this diff** (§8.4).
#### 3.3.4 Classification

A per-call timeout surfaces as a gaxios `GaxiosError` with `code === "TimeoutError"` (`lib/drive/fetch.ts:90-92`). It reaches `classifyWatchError` (`lib/drive/watchErrors.ts:103-108`) and returns `"drive_api"`: it is not a `DriveWatchInfraError`, and its message matches no `CONFIG_PATTERNS` entry. With §3.3.1a's wrapper withdrawn this is the only timeout shape the watch path produces. That is the correct class — a Drive call that did not answer is a Drive-API fault, not a config or DB fault — and it is reached by the existing default rather than by a new pattern. §6 pins it with an assertion, because "correct by default" is exactly the kind of claim that silently stops being true when someone adds a pattern.

### 3.4 Commit the alert in the transaction it appears to be in

#### 3.4.1 Mechanism

`PostgresWatchTx.upsertAdminAlert` (`lib/drive/watch.ts:200-205`) stops calling the service-role helper and issues the RPC over its own connection:

```ts
// not-subject-to-meta: raw pg call on the enclosing sql.begin connection, not a
// Supabase client boundary; AGENTS.md invariant 9 covers `supabase.*` call sites.
await this.rows(`select public.upsert_admin_alert($1::uuid, $2::text, $3::jsonb)`, [
  null,
  input.code,
  input.context, // the OBJECT, not JSON.stringify. See 3.4.2; measured, not reasoned
]);
```

`public.upsert_admin_alert(p_show_id uuid, p_code text, p_context jsonb) returns uuid` is `language sql` / `security definer` / `set search_path = public, pg_temp` (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:18-27`). No signature change, no new migration, and its whole `on conflict … do update` body — including the `failedKeys` normalisation and the `lastCountedAt` occurrence-count damping — runs identically. `show_id` is `null` on this path unconditionally, exactly as the current call passes it (`lib/drive/watch.ts:204`).

#### 3.4.2 The jsonb parameter is the raw object — measured, not reasoned

Pass `input.context` **as the object**. Do NOT `JSON.stringify` it.

Two earlier drafts of this section got this backwards, and so did spec review R1 finding 10, which asserted that stringify was correct and that a raw object would fail loudly. Both claims were wrong, and the disagreement is settled by measurement rather than by argument. Probed against the real local database and the real `public.upsert_admin_alert` RPC on 2026-07-26, each form inserted and then read back with `jsonb_typeof(context)` and `context->>'watched_folder_id'`:

| Parameter form | `jsonb_typeof` | `context->>'watched_folder_id'` | Verdict |
| --- | --- | --- | --- |
| `input.context` (raw object) | `object` | `"probe-folder"` | **correct** |
| `sql.json(input.context)` | `object` | `"probe-folder"` | correct (equivalent; needs `json` exposed on the `PostgresConnection` type) |
| `JSON.stringify(input.context)` | `string` | `null` | **broken, and silent** |

So the double-encoding hazard is real — it is exactly what `JSON.stringify` produces here — but the remedy is the opposite of what both drafts prescribed. The stringified form does not throw: the RPC accepts it, the row is written, `occurrence_count` increments normally, and every `context->>'…'` read returns NULL forever after. That would have silently blinded `readUnresolvedWatchAlert`'s `alert.context?.error_class` and `error_message` (`lib/drive/watchEscalation.ts:101` and `lib/drive/watchEscalation.ts:155`), so escalation emails would have reported `drive_api` and `(no detail captured)` for every watch failure, with nothing anywhere indicating a fault.

`this.rows()` forwards to `sql.unsafe(query, params)` whose parameter type is already `unknown[]` (`lib/drive/watch.ts:106-108`), so passing the object needs no type change.

**§6 pins this with `jsonb_typeof(context) = 'object'` AND a key read.** Both halves are load-bearing: a test that only checks a row exists, or only that the statement did not throw, passes against the broken form — which is how this survived two drafts and one review round.

#### 3.4.3 What changes for callers — and what does not

`markWatchOrphanedWithTx` (`lib/drive/watch.ts:456-468`) is unchanged: it still calls `tx.markOrphaned` then `tx.upsertAdminAlert`, both wrapped in `callWatchTx`. What changes is that the second now shares the first's transaction, so either both commit or neither does.

The throw path is **unchanged in shape**. Today a failed RPC throws from the helper (`lib/adminAlerts/upsertAdminAlert.ts:55-57`) and `callWatchTx` wraps it as `DriveWatchInfraError("admin_alerts.upsert_watch_orphaned", …)` (`lib/drive/watch.ts:462-467`); the `await runTx(…)` inside `subscribeToWatchedFolder`'s catch is not itself guarded (`lib/drive/watch.ts:503-511`), so `subscribeToWatchedFolder` already rejects rather than returning `orphaned` in that case. After the change a pg error takes the same route to the same wrapper. What is new is only that `markOrphaned` rolls back with it instead of persisting — which is the defect being fixed.

`lib/adminAlerts/upsertAdminAlert.ts` is untouched and keeps all 23 of its other importing modules (`grep -rl adminAlerts/upsertAdminAlert lib/ app/` returns 24 including `lib/drive/watch.ts`, which this diff removes). Its import at `lib/drive/watch.ts:3` becomes unused and is removed in the same commit; leaving it would raise a fresh ESLint `no-unused-vars` warning, and a new warning is signal that a wiring edit half-landed.

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
| Admin health classification | `lib/admin/driveConnectionHealth.ts` - **MUST change** (§3.1.5): tier 2 excludes `expired`, tier 3 admits it, so the panel keeps reporting an expired watch as expired rather than merely inactive, and tier 3 does not become dead code. Covered by `tests/admin/driveConnectionHealth.test.ts`. |
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
| `tests/log/_auditableMutations.ts` `NEW_FORENSIC_CODES` | Add the four §2.2 codes. Verified safe: the set is consumed as an allowlist (`tests/log/_metaAdminOutcomeContract.test.ts:71` checks none leaked into catalog producers) and **no test asserts its size** (`grep -rn "NEW_FORENSIC_CODES.size" tests/` → no matches). |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | **N/A, verified:** the only route in scope is `app/api/cron/refresh-watch/route.ts`, whose sole export is `GET` (`app/api/cron/refresh-watch/route.ts:6`). The meta-test discovers mutating handlers (`POST`/`PUT`/`PATCH`/`DELETE`) and `"use server"` actions; this diff adds neither. No `AUDITABLE_MUTATIONS` row, no `ADMIN_SURFACE_EXEMPTIONS` row, no `KNOWN_UNINSTRUMENTED` row. |
| `tests/cross-cutting/codes.test.ts` (x1-catalog-parity) | **N/A, verified:** §1.1a item 11. The four codes sit inside `log.*` spans, which `stripLogEmissionCalls` removes before the producer scan (`tests/cross-cutting/codes.test.ts:41-45`). No §12.4 prose edit, no `pnpm gen:spec-codes`, no `lib/messages/catalog.ts` row. The AGENTS.md three-lockstep rule is not engaged. |
| `tests/log/_metaAdminOutcomeContract.test.ts:345` (`NULLCODE_BATCH2_STAMPS`, "33 rows") | **N/A, verified:** a closed historical batch registry. New codes do not join it, so the count is unchanged. |
| `tests/sync/_metaInfraContract.test.ts:868-883` fixture | **MUST be extended.** It supplies only `listRenewalDue`. Once `expireDeadActive` runs first, the fixture fails on the MISSING member before reaching the injected read fault, and because both paths return the same generic `failures` shape the test still passes while proving the wrong operation (spec R3 finding 4). Add the member. |
| `tests/sync/_metaInfraContract.test.ts` | **No registry row is added or removed, but two of its existing rows are load-bearing here and are re-verified rather than assumed.** It already registers all three watch entrypoints (`tests/sync/_metaInfraContract.test.ts:41-56`): `subscribeToWatchedFolder` and `gcWatchChannels` ("faults become `DriveWatchInfraError`") and `refreshWatchSubscriptions` ("faults become a typed `failures` entry (never rejects)"). The reap adds a statement inside the transaction that contract covers, so §3.1.3a is written to preserve it; the executable half lives at `tests/sync/_metaInfraContract.test.ts:869-883`. Separately, the §3.4.1 call site needs no row: it is a raw pg query on the enclosing transaction, not a Supabase client boundary, and it carries the inline `// not-subject-to-meta: <reason>` marker, whose exact recognised form is `/^\s*\/\/\s*not-subject-to-meta:\s+\S/m` (`tests/notify/_metaInfraContract.test.ts:63`). |
| `tests/adminAlerts/alertProducerScope.registry.ts:212-220` | **MUST update — line-pinned, guaranteed suite failure if missed.** It pins the producer as `site: "lib/drive/watch.ts:463"`, which is the `tx.upsertAdminAlert({` call today, and `tests/adminAlerts/_metaAlertProducerScope.test.ts:148-157` demands exact bidirectional equality. §3.1.3 and §3.4 both insert code above that line. Re-derive the anchor in EVERY commit that edits `lib/drive/watch.ts` above that call; deferring it leaves earlier commits red. Omitted from an earlier revision of this table despite the table claiming completeness (spec R6 finding 5). |
| `tests/messages/_metaAdminAlertCatalog.test.ts:111-113` | **N/A, verified:** it pins `WATCH_CHANNEL_ORPHANED`'s producer as `path: "lib/drive/watch.ts"` matching `/upsertAdminAlert\(\{[\s\S]*code:\s*WATCH_CHANNEL_ORPHANED/`. §3.4 changes only the BODY of `PostgresWatchTx.upsertAdminAlert`; the matched call site is `markWatchOrphanedWithTx`'s `tx.upsertAdminAlert({ code: WATCH_CHANNEL_ORPHANED, … })` (`lib/drive/watch.ts:462-467`), which is untouched and still matches. |
| `tests/messages/_metaAdminAlertProducer.test.ts` | **N/A, verified:** its detector is Supabase-client-scoped — `/\.from\(\s*["']admin_alerts["']\s*\)[\s\S]{0,400}?\.(?:insert|upsert)\s*\(/` (`tests/messages/_metaAdminAlertProducer.test.ts:42-43`). §3.4.1 writes through the canonical `upsert_admin_alert` RPC, which is what that guard exists to require, and does so over a pg connection that matches no part of the pattern. The precedent is already in this file: `resolveStaleWebhookTokenInvalid` issues a raw `update public.admin_alerts` (`lib/drive/watch.ts:322-335`) and passes today. |
| `tests/cross-cutting/vitest-projects-partition.test.ts:222-242` | **N/A, verified:** it asserts a representative sample of DB/FS-heavy files resolve to the SERIAL project, not an exhaustive registry. A new `tests/db/*.db.test.ts` is admitted by directory glob, exactly as the existing `tests/db/watchRenewalDue.test.ts` is, so no wiring entry is added. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | **N/A, verified:** this diff adds no `pg_advisory`/`hashtext` call and the watch surface has zero holders today (§1.1a item 6), so there is no lock topology to pin. Declared explicitly because the writing-plans rules require a positive statement either way. |
| `tests/drive/watch.test.ts` refresh call sites — including the ZERO-due-row calls at `tests/drive/watch.test.ts:580` and `tests/drive/watch.test.ts:611`, which still reach the helper because §3.2 reads the folder BEFORE the loop — at `tests/drive/watch.test.ts:671` and `tests/drive/watch.test.ts:487`, `tests/drive/watch.test.ts:549`, `tests/drive/watch.test.ts:723`, `tests/drive/watch.test.ts:757`, `tests/drive/watch.test.ts:1360`, `tests/drive/watch.test.ts:1391` | **MUST be edited.** Each calls `refreshWatchSubscriptions` with due rows but injects neither `getActiveWatchedFolder` nor a module mock. Under §3.2 they would perform the REAL service-role settings read, making DB-free unit behaviour depend on ambient environment state — the same missing-injected-dependency class already identified for the real-DB harness, which §5 repaired only there (spec R2 finding 4). Every one gets an injected folder read. |
| `tests/drive/watchExpiration.test.ts:46-63` | **MUST be edited, and the compiler will NOT tell you.** This is a SECOND `WatchTx` fake, and it returns its object literal `as unknown as WatchTx` — a cast that disables excess/missing-property checking, so adding `expireDeadActive` to the port produces no type error here and the omission surfaces only as a runtime `undefined is not a function`. The file's own header comment says exactly this: "When the port changes, grep this file explicitly; the compiler will not do it for you." Add `expireDeadActive: unexpected("expireDeadActive")`, matching how every other unused member is declared. |
| `tests/drive/watchExpiration.test.ts:15-35` | **MUST be extended.** Its `driveMock` declares `watch: async (args) => …` — a ONE-parameter mock that never observes a second argument. The §6.1 assertion that `files.watch` receives `{timeout, retry: false}` cannot be written against it as-is; the mock gains an options parameter and records it. Without this the option-pair test is unwritable, not merely weak (spec R1 finding 8). |
| `tests/drive/watch.test.ts:654-683` multi-row isolation test | **MUST be rewritten, not merely re-dated** (spec R4 finding 4). Its fixture seeds already-expired rows, which the reap now consumes; re-dating them inside their leases makes all four due, but §3.2 admits only the configured folder, so its four-subscription assertion at `tests/drive/watch.test.ts:677` is unreachable by ANY injection. Its premise — that the renewal loop iterates several folders independently — is what this diff removes. Rewrite as the folder-filter contract: four in-lease rows on four folders, one configured, exactly one subscribe call, asserting its ARGUMENT. Strictly stronger than the count it replaces. | Fixtures that seed already-expired `active` rows are now CONSUMED by the reap before `listRenewalDue` runs, so a test whose subject is renewal isolation can pass while exercising no renewal at all — a silent vacuity, not a failure. Every fixture row with an `expiresAt` in the past is re-dated to sit inside its lease unless the test's subject IS expiry. |
| `tests/db/validation-schema-parity.test.ts` | **EXTENDED** (§4.4) with a status-CHECK parity block carrying its own non-vacuity guard. An earlier draft of this row said it "runs unchanged" and does not protect the apply; that contradicted the rewritten §4.4 and is corrected here (spec R2 finding 5). Its columns-only layers still see no manifest diff, per §4.1. |
| `RefreshResult` deep-equality assertions (`tests/drive/watch.test.ts`, `tests/sync/_metaInfraContract.test.ts`, `tests/cron/refreshWatchRoute.test.ts`, `tests/api/cron-sync.test.ts`, `tests/cron/cronRouteSummaries.test.ts`) | **N/A, by design:** §3.2.3 keeps `RefreshResult` and the cron response body byte-identical, so none of the five files changes. This row exists because an earlier draft added a field here and wrongly called it additive. |
| `lib/audit/watermark-symbols.generated.ts` | **N/A, verified:** it lists `drive_watch_channels.superseded_at` (`lib/audit/watermark-symbols.generated.ts:17`) — a column symbol. No column is added or removed. |

### 4.4 The validation-project apply IS guardable — extend the gate that already exists

An earlier draft of this section asserted that no gate could catch a forgotten validation apply, because the schema manifest stores only column names per table (§4.1), and compensated with a manual `pg_get_constraintdef` paste into the PR body. **That assertion was false** (spec R1 finding 3).

`tests/db/validation-schema-parity.test.ts:216-290` already carries a CHECK-constraint parity layer, added for precisely this blind spot — its own comment says Layers 1-2 "are COLUMNS-only … so a CHECK-only migration … that never reached validation would slip past them silently. This layer closes that blind spot." It derives the expected constraint-name set FROM the migration text and asserts the validation database contains all of them, so a skipped surgical apply is red CI rather than a stale note in a merged PR.

**This diff extends that layer** with a parallel block for the status CHECK: parse the new migration supabase/migrations/20260726000000_drive_watch_expired_status.sql for `alter table public.<t> add constraint <name> check`, and assert the validation database has `drive_watch_channels_status_check` **with `'expired'` in its definition**. The definition check matters and the name check alone does not, and this is **measured, not assumed**. Queried against the validation project on 2026-07-26:

```
select pg_get_constraintdef(oid) from pg_constraint
 where conname = 'drive_watch_channels_status_check';
-- CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'superseded'::text,
--                             'stopping'::text, 'stopped'::text, 'orphaned'::text])))
```

The name is already present, carrying the OLD six-value list and no `expired`, so a name-only superset assertion passes today — before the migration exists, let alone is applied. That is the same vacuity the existing layer guards against with its `toBe(17)` count.

**The extended block carries its own non-vacuity guard.** Parsing the migration and then looping over whatever came back is vacuous if the regex yields zero matches — the loop body never runs and the test passes green having asserted nothing. The existing layer guards this explicitly with `expect(expected.size).toBe(17)` (`tests/db/validation-schema-parity.test.ts:240-243`); the new block asserts it parsed **exactly one** constraint name and that the name is `drive_watch_channels_status_check`, before it checks the definition (spec R2 finding 5).

It is added as its own parsed block rather than by appending the migration to `NONBLANK_MIGRATIONS`, whose `expect(expected.size).toBe(17)` non-vacuity guard is scoped to the `*_drive_file_id_nonblank` family and would have to move for an unrelated reason.

The manual apply is still performed — `supabase db query --linked "<migration SQL>"` — but it is now verified by CI instead of by a pasted claim. Without the apply, the extended layer fails. `notify pgrst, 'reload schema'` remains unnecessary and unrun: a CHECK alters no column, function, or relationship in PostgREST's schema cache.

### 4.6 Master-spec amendments (AGENTS.md invariant 7)

The canonical spec is `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`. Ten of its statements become false when this diff lands, and invariant 7 requires amending it rather than letting two authoritative documents demand incompatible behaviour. Each amendment is a DELETION and replacement of the superseded sentence, tagged `**Amended 2026-07-26**` with a pointer to this spec, matching how the 2026-07-25 lease-slack amendments are recorded in the same sections.

| Canonical statement | Location | Amendment |
| --- | --- | --- |
| "**No client-side timeout is applied** (amended 2026-07-25) … Adding a real timeout is tracked as `BL-WATCH-DRIVE-CALL-TIMEOUT`." | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1303` (inside the Create bullet, step 2) | Replaced by the per-call `{timeout: DRIVE_CALL_TIMEOUT_MS, retry: false}` pair (§3.3.1), with the residual credential-fetch stall named (§3.3.1a). The `BL-WATCH-DRIVE-CALL-TIMEOUT` reference is removed because the entry is closed by this diff. |
| Renew "for any `active` row that has burned …" — no folder scoping. | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1320` | Scoped to the configured folder (§3.2), with the three read outcomes stated. |
| The canonical DDL CHECK, which lists only the original statuses. | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1287-1289` | `expired` added, so the spec's own DDL matches the migration. Missed by the first amendment inventory (plan review R2 finding 5). |
| The channel status set, which lists `pending`/`active`/`superseded`/`stopped`/`orphaned`. | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1294-1299`, plus the §5.5.6 GC per-status list at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1327-1329` | `expired` added, with its meaning (aged out, distinct from `orphaned` = we failed to create it) and its GC treatment (collected, but no `channels.stop` — §3.1.4). |

| For each `superseded` row, "On other error → leave as `superseded`; retry next pass". | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1327` | **No amendment — the SPEC was right and the code was wrong.** Listed here so the inventory is complete: §3.1.4 brings `gcWatchChannels` into line with this sentence rather than changing it. |
| The `create table` CHECK, a SECOND definition of the status set. | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1242` | `expired` added. An earlier inventory caught only the "effective" `alter table` CHECK at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1287-1289`; both exist and both reject `expired` (spec R8 finding 2). |
| AC-6.13, which mandates renewing EVERY due active row and says explicitly that an inverted or zero-length lease is due immediately. | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3841` | **Amended on two counts:** renewal is now scoped to the configured folder (§3.2), and an inverted lease is no longer renewed at all — §3.1.2 reaps it out of the query to `expired` or `superseded`. Left alone, this AC mandates precisely the behaviour the reap removes. |
| `stopped_at`'s column comment, "set when status transitioned to 'stopped' (after `channels.stop`…)". | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1253` | Amended: the `expired` path reaches `stopped` WITHOUT a `channels.stop` call (§3.1.4), so the parenthetical is false for it. |
| The `stopped` status definition, "`channels.stop` succeeded; safe to delete the row". | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1298` | Same: true for `superseded`/`orphaned`, false for `expired`, where the call is deliberately skipped because the channel is already dead. |
| The webhook channel-lookup description and AC-6.25's enumeration of non-active statuses. | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1353` and `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3853` | `expired` added to both. The strict-active behaviour itself does not change — an `expired` row is non-active and correctly returns 410 — but an enumeration that omits the value reads as exhaustive and is not. |
| AC-6.18, which states absolutely that after a folder change the prior folder's rows are `superseded` and old deliveries return 410, with no concurrency exception. | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3846` | **Amended.** An earlier revision of this section said AC-6.18 was "NOT amended" because the diff implemented it. After the §3.2.4 descope that is false: the AC holds except under a narrow concurrent-promotion schedule, and leaving it absolute keeps two canonical documents in conflict under AGENTS.md invariant 7 (spec R5 finding 2). The amendment states the exception and points at the filed residual. |

### 4.5 Flag lifecycle

No boolean config field, feature flag, or toggle is added. All four fixes are unconditional. **N/A — no zombie-flag risk.**

---

## 5. Shipped tested contracts this diff deliberately changes

Ratified as §1.1a item 10. Each row is a currently-passing assertion that must change, with its replacement. A reviewer should check this list is complete rather than re-deriving whether each change is intended.

| Location | Current assertion | Replacement |
|---|---|---|
| `tests/db/watchRenewalDue.test.ts:122-131` "a lease already past expiry is still due (it never leaves the query)" | An expired-but-active row IS renewed by the production path. Its own comment names `BL-WATCH-EXPIRED-ACTIVE-ROW` and pins the defect deliberately. | Inverted: the row is reaped to `expired`, is NOT renewed, and DOES appear in `listGcCandidates`. This is the primary proof of §3.1 and it must fail before the fix. |
| `tests/db/watchRenewalDue.test.ts:50-61` `foldersProductionWouldRenew()` harness | Calls `refreshWatchSubscriptions` with `now` and `subscribeToWatchedFolder` injected but NOT `getActiveWatchedFolder`, so after §3.2 it would hit the real service-role read and be filtered by whatever `app_settings` holds locally. Seven of the eight tests in the suite would break — the eighth compares constants only (`tests/db/watchRenewalDue.test.ts:180-185`) and does not call the harness. | The harness takes the configured folder id and injects `getActiveWatchedFolder: async () => ({folderId, folderName: null})`. |
| `tests/db/watchRenewalDue.test.ts:89-102` "renews only rows inside their own renewal window" | Inserts two rows on two DIFFERENT folders and asserts only the due one is renewed. Under §3.2 only one folder can be configured, so the filter — not the renewal predicate — would exclude the other, and the test would pass for the wrong reason. | Run the harness twice against the same two rows, configuring each folder in turn: due-folder configured → renewed; not-yet-folder configured → not renewed. The original property is preserved and the filter is proved as well. Strictly stronger than what it replaces. |
| `tests/db/watchRenewalDue.test.ts:104-120` absolute-floor test | Harness dependency only. | Passes its own folder id. Assertion unchanged. |
| `tests/db/watchRenewalDue.test.ts:133-140` and `tests/db/watchRenewalDue.test.ts:141-155` invalid-lease tests | Both currently assert the row IS RENEWED. | **Both invert.** §3.1.2 reaps them out of the renewal query before it runs: the zero-length/inverted row to `expired`, the future-dated one to `superseded`. Each becomes a reap assertion pinning the resulting STATUS. An earlier revision said these assertions survive unchanged; that was false (spec R6 finding 3). |
| **The whole suite's CLOCK, `tests/db/watchRenewalDue.test.ts:31`** | `NOW` is pinned at `2026-07-25T12:00:00Z` and every fixture is dated relative to it, while the renewal predicate is driven by that same injected JS clock. | **This breaks the moment the reap starts reading SQL `now()`** (spec R5 finding 3): measured against real database time every one of those fixtures is already expired, so the reap consumes them BEFORE `listRenewalDue` runs — and the "future" inverted lease at `tests/db/watchRenewalDue.test.ts:141-155` is reaped to `expired` rather than the intended `superseded`, inverting the very case §3.1.2 added it for. Five tests are affected (`tests/db/watchRenewalDue.test.ts:89-102`, `tests/db/watchRenewalDue.test.ts:104-120`, `tests/db/watchRenewalDue.test.ts:133-140`, `tests/db/watchRenewalDue.test.ts:141-155`, `tests/db/watchRenewalDue.test.ts:165-177`), not the one the earlier inventory listed. **Repair:** read the database's clock once at suite start (`select now()`), inject THAT as the JS clock, and date every fixture relative to SQL `now()` rather than to a literal. Both clocks then agree by construction, which is what the production code now requires of them. |
| `lib/drive/watchErrors.ts:25-30` `T_EXEC_BUDGET_MS` doc comment | "A margin, NOT an enforceable bound … nothing reserves this much time for reaching any particular row." | Rewritten per §3.3.3 to state what the loop now enforces and what remains outside the process. |
| `lib/drive/watch.ts:654` infra-fault emit | Hardcodes `operation: "drive_watch_channels.list_renewal_due"`, and its message names `list_expiring`. | Operation read off the typed error; message neutralised to `"refresh-watch renewal read failed"` (§3.1.3a). The returned `failures` entry is deliberately NOT changed. |
| `tests/drive/watch.test.ts:1517-1543` "gcWatchChannels logs DRIVE_WATCH_STOP_FAILED but still marks the channel stopped (control flow unchanged)" | Asserts a failed stop still marks the row `stopped`. | **Its assertions SURVIVE unchanged** — it exercises an `orphaned` row, and §3.1.4 keeps `orphaned` at "either way". What no longer holds is its NAME and its "control flow unchanged" comment, which now overgeneralize: the same input with `status: "superseded"` must leave the row `superseded`. Rename to say `orphaned`, and add the `superseded` sibling as a NEW test rather than editing this one. |
| `lib/drive/watch.ts:873-875` reconcile's "renewal-failing already had its attempt via refresh" comment | States the invariant that justifies not double-subscribing. True for a live channel, false for an expired-active row (§1.2). | Amended to record that the expired-active case, which was the exception, no longer exists because refresh no longer returns those rows. |

Per the amendment discipline, each of these is a DELETION and replacement of the superseded text, not a note appended beside it.

---

## 6. Testing

TDD per AGENTS.md invariant 1: every test below is written failing first. Each row states the concrete failure mode it catches; a test that only proves "the function was called" is not in this list.

### 6.1 DB-free (`tests/drive/watch.test.ts`, extending the existing `FakeWatchTx`)

| Test | Failure mode it catches |
|---|---|
| A failing REAP still returns `{refreshed: [], orphaned: [], failures: [{folderId: '*', operation: 'list_expiring'}]}` and does NOT reject | §3.1.3a plus the registered never-rejects contract. Catches the reap escaping as a rejection into the cron route, and catches someone "improving" the failure label and breaking five existing assertions. |
| A failing reap emits `operation: "drive_watch_channels.expire_dead_active"`; a failing renewal read still emits `operation: "drive_watch_channels.list_renewal_due"` | Both directions, because a hardcoded operation misattributes the reap and a naively dynamic one breaks `tests/drive/watch.test.ts:1447`. |
| An inverted lease whose `expires_at` is in the FUTURE is reaped to **`superseded`**, not `expired`, and GC therefore DOES call `channels.stop` on it | The leak described in §3.1.2. Assert the resulting STATUS, not merely that the row left `active` — a status-blind assertion passes while a possibly-live Drive channel is abandoned with nothing left to stop it. Fixture mirrors `tests/db/watchRenewalDue.test.ts:141-155`. |
| A genuinely expired row is reaped to **`expired`**, and GC does NOT call `channels.stop` on it | The other half of the same discrimination. Together these two fail any single-status implementation in one direction or the other. |

| `DRIVE_WATCH_EXPIRED_REAPED` carries `expiredIds`/`supersededIds` as SEPARATE sorted arrays with independent `expiredCount`/`supersededCount`, each id list capped at 20 | Field-level, not just code-level: every payload in §2.2 can be malformed while a code-emission assertion stays green (spec R3 finding 6). |
| `DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER` carries `skippedFolderIds` **in sorted order** and capped, plus `skippedCount`, `configuredFolderId`, and the right `reason` on each of the two branches | Same, and the sortedness is asserted explicitly: feeding folders in reverse order must still emit them sorted (spec R4 finding 7). A test that only checks the array's length and membership passes while the telemetry preserves nondeterministic database order, which is what the cap rule exists to prevent. |
| `DRIVE_WATCH_RUN_BUDGET_EXHAUSTED` carries `processedCount`, `remainingCount`, `elapsedMs`, `budgetMs` | Same. |
| `DRIVE_WATCH_FOLDER_READ_FAILED` carries `dueCount`, and an `errorMessage` whose SECRET-BEARING input was redacted while a non-secret marker survived | Same, and the redaction is a secrets contract rather than a formatting preference. Feed an error whose message contains both a `Bearer <token>` run and a distinctive benign substring, then assert the token is gone AND the benign substring remains: asserting only that the payload looks clean passes an implementation that skipped redaction on this branch, and equally one that discarded the message entirely (`lib/drive/watchErrors.ts:112-120`). |
| Each of the four forensic codes is emitted on its intended branch, observed through a sink spy | Spec R1 finding 8: allowlist membership in `NEW_FORENSIC_CODES` is static and proves only that a string is permitted, never that the branch emits it. |
| A renewal read that fails AFTER a successful reap leaves the reaped rows STILL `active` (real DB) | §3.1.3's atomicity claim. The ordering assertion below passes against two separate transactions in the right order; only a rollback observation distinguishes one transaction from two. |
| Committed promotion: the prior folder's `active` rows become `superseded`, its `pending` rows become `orphaned`, and the NEWLY promoted folder's rows are untouched (real DB) | The success path of everything §3.2.4 retained after the descope. The rollback row below proves atomicity; without this one, an implementation that supersedes nothing — or supersedes everything including the new folder — passes (spec R5 finding 6). |
| A zero-row activation throws and lands in the orphan-and-alert path, raising `WATCH_CHANNEL_ORPHANED` **for THIS activation** | The other retained mechanism, and today's silent-success bug. Assert the alert, not just the throw — and assert it is THIS one: the alert is a single global unresolved row under the dedup model, so a bare existence check passes on a pre-existing row even when the tested path never ran (plan R5 finding 6). Pin it by asserting the row's `context.channel_id`, or by observing `occurrence_count` advance. |
| Promotion that rolls back leaves the prior folder's `active` row still `active` **AND its `pending` row still `pending`** (real DB) | The same proof for §3.2.4. Observing only the active row lets the pending-orphaning commit in a separate transaction while the assertion passes — and promotion mutates both. |
| The reap runs BEFORE the renewal read | `tx.operations` equals `["expireDeadActive", "listRenewalDue", …]`. Catches a reap ordered after the read, which would leave the stale row in `due` for one more tick — the entire fix silently reduced to a no-op. Order, not mere presence. |
| An expired row **whose folder IS the configured one** produces zero subscribe attempts from refresh | The executable form of §3.1.3. Asserts the spy's call COUNT is 0. The configured-folder qualifier is load-bearing (spec R1 finding 8): without it the §3.2 folder filter alone yields zero calls, and the test passes whether or not the reap works. |
| `getActiveWatchedFolder` is called EXACTLY ONCE per run, asserted on the injected spy's call count | §3.2.1 says the read happens once, before the loop. Every other folder-filter assertion is satisfied by a per-row read, which would additionally admit MORE than one folder if the configuration changed mid-loop. Only a call-count assertion pins it. |
| Folder filter passes the configured folder and drops the rest | Asserts the subscribe spy's ARGUMENT is the configured folder id, and that a stale-folder row yields no call. Catches a filter that counts right and selects wrong. |
| `no_folder_configured` → zero subscribe calls **with at least one DUE row present** | Catches a default leaking into the not-configured branch. The due-row precondition is load-bearing: with an empty renewal query the assertion holds no matter how the branch behaves (plan R5 finding 6). |
| Folder read fails on a tick with **`due` EMPTY** → `failures` is empty AND `DRIVE_WATCH_FOLDER_READ_FAILED` is still emitted | §3.2.2's fourth row, which has no other coverage. TWO regressions hide here and the assertion must catch both: an implementation that always records `'*'` recreates the false 500 / `renewal_failing` defect, and one that returns BEFORE the folder read on a zero-due tick suppresses the forensic emit the row requires. |
| Folder read returns `infra_error` with `due` NON-empty → **ZERO** rows renewed, `DRIVE_WATCH_FOLDER_READ_FAILED` emitted, and `failures` contains exactly `{folderId: '*', operation: 'folder_read'}` | D6/D7 under fail-closed, and three assertions in one because they fail independently: no renewal, the durable record, and the typed failure. The last is what stops a run that renewed nothing from reporting 200 and letting reconcile auto-resolve the alert (spec R6 finding 1). |
| Folder read THROWS → same as `infra_error` | Catches recorded-not-thrown being lost, i.e. a throw escaping `refreshWatchSubscriptions` into the route handler. |
| `defaultWatchFolder` passes `{ timeout: DRIVE_CALL_TIMEOUT_MS, retry: false }` as the SECOND argument to `files.watch`, and `defaultStopChannel` the same to `channels.stop` | Asserts both fields by value on a mock drive client. `retry: false` is the half that matters: without it gaxios's internal retry multiplies the budget and the timeout bounds nothing, which no timing test would notice. |
| A `files.watch` that rejects with a `TimeoutError`-shaped `GaxiosError` yields `{outcome: "orphaned", reason: "watch_create_failed"}` and an alert whose `error_class` is `drive_api` | R1-8: the earlier version injected `deps.watchFolder`, which BYPASSES `defaultWatchFolder` and therefore never exercised the option pair or the timeout at all — it proved only that a rejecting function rejects. This drives the real `defaultWatchFolder` against a mocked drive client. |
| **Neither `lib/drive/watch.ts` NOR the new leaf module imports `lib/drive/fetch.ts`** — a static source assertion covering BOTH | §3.1.4's entire reason for the leaf is keeping `xlsx` out of the hourly cron, and NO behavioural test can observe that: importing the full helper from `fetch.ts` classifies all three 404 shapes identically and passes every other row in this table (spec R8 finding 3). Only an import-graph assertion discriminates. It must cover the leaf as well as `watch.ts`, AND it must forbid the whole chain rather than one edge: `fetch.ts` is merely the path that was noticed, while a direct import of `exportSheetToMarkdown` or of `xlsx` itself reintroduces the same cost and passes a `fetch.ts`-only guard (spec R9 finding 9). Assert the transitive module graph of `watch.ts` contains no `xlsx`. |
| A `GaxiosError` with `code: "TimeoutError"` classifies as `error_class: "drive_api"` | §3.3.4. Catches a future `CONFIG_PATTERNS` addition silently re-classifying a timeout as `config`, which escalates immediately (`lib/drive/watchEscalation.ts:102`). |
| Run-budget exhaustion stops the loop and records the remainder | Asserts processed count, `failures` rows for unprocessed folders, and the warn emit. Catches a budget check that logs but keeps iterating. |
| A `superseded` row whose stop FAILS with a non-404 is left `superseded` and is NOT in the returned `stopped` array | §3.1.4 and the canonical contract. This is the assertion that stops a timed-out stop from silently retiring a possibly-live channel; without it the two-status split is defeated one layer down. |
| A `superseded` row whose stop fails with a real 404 IS marked `stopped` | Plan R3 finding 3, and the arm with no coverage until now. Supply a Gaxios-shaped 404 (each of the three status shapes in turn) and assert the row reaches `stopped`. Without it an implementation that treats EVERY failed superseded stop as non-404 passes the whole suite while retrying already-gone channels forever, warning on each pass. The non-404 row below and this one are the two halves of one branch; either alone is satisfiable by a constant. |
| An `orphaned` row whose stop fails is STILL marked `stopped` | The canonical "either way" branch, and the reason `tests/drive/watch.test.ts:1517-1543` keeps passing. Both rows together pin that the two statuses diverge deliberately rather than by omission. |
| GC skips `channels.stop` for `expired`, calls it for `orphaned` with a `resourceId`, and marks BOTH stopped | Asserts the stop spy's call list by channel id. A count-only assertion would pass if it skipped the wrong one. |
| `REFRESH_RUN_BUDGET_MS === T_EXEC_BUDGET_MS`, and `DRIVE_CALL_TIMEOUT_MS === 15_000` | The first catches the alias drifting into a second literal. The second pins the VALUE: every option-forwarding assertion refers to the named constant, so defining it as `150_000` or `1_500` forwards happily and satisfies them all (spec R9 finding 10). |

### 6.2 Real DB (`tests/db/watchRenewalDue.test.ts` extended, plus one new suite)

Both resolve their connection through `assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL ?? …)` (`tests/db/_localDbUrl.ts`), matching the existing suite's local-only contract (`tests/db/watchRenewalDue.test.ts:25-27`). The new file bumps the §4.3 scan count.

| Test | Failure mode it catches |
|---|---|
| **DB-clock skew, production path:** insert a row that is UNEXPIRED by the database clock, drive `refreshWatchSubscriptions` with an injected JS clock set hours AHEAD, and assert the row is NOT reaped | §3.1.2's core safety property, and the one the repaired harness can no longer prove: that harness deliberately ALIGNS the injected clock with the database's (§5), so every test through it passes under both a SQL-`now()` and a caller-timestamp implementation. This case must bypass the alignment. Without it an implementation that reintroduces a JS clock parameter passes the entire real-DB suite while prematurely retiring live channels. |
| **Invalid lease, production path:** a row with `expires_at <= created_at` and a FUTURE `expires_at` is reaped to `superseded` through the real `PostgresWatchTx` | §3.1.2's second arm has only a DB-free fake test. Production SQL that omits the `expires_at <= created_at` disjunct passes the fake suite (whose mirror implements it) while leaving those rows renewal-due forever in production — exactly the fake/production drift the real-DB suite exists to catch. |
| The CHECK accepts every one of the SEVEN values (the six pre-existing plus `expired`), asserted as a SET, and still rejects an unknown value | Catches a migration written but never applied locally, one that widened the constraint to anything, and — the reason the set matters — one that silently DROPS an existing value such as `stopping` while adding `expired`. A single-representative test passes that, and so does validation parity, which checks the name and the presence of `expired` (spec R3 finding 7). |
| Through the real `refreshWatchSubscriptions`: an expired-active row ends as `status='expired'`, is absent from `listRenewalDue`, present in `listGcCandidates` | The §5 inversion. Runs the production `PostgresWatchTx` SQL, so it catches SQL that a fake would let pass. |
| A row still INSIDE its lease, **demonstrably renewal-due, and observed to REACH the renewal seam** (assert the injected subscribe spy was called for it), whose renewal fails is NOT reaped | §3.1.2 — the regression "retire on failure" would have shipped. The renewal-due qualifier is load-bearing (spec R1 finding 8): a row that is not due never reaches the renewal seam, so the test would pass without ever exercising the failure it names. Derive its lease from `renewalLeadMs` so it is due by construction, not by a hardcoded date. |
| `markWatchOrphanedWithTx` inside a transaction that then throws leaves **no** `admin_alerts` row, and the channel row — seeded as `pending` — is still `pending` | The direct proof of §3.4. Fails today: the alert commits over its own connection and survives the rollback. The seeded status is load-bearing (spec R7 finding 3): production `markOrphaned` filters `status = 'pending'` (`lib/drive/watch.ts:188-198`), so a test seeded with an `active` or absent row proves no channel rollback at all — only that the alert vanished. |
| The raised alert's `context` satisfies `jsonb_typeof(context) = 'object'` and `context->>'watched_folder_id'` equals the folder id | §3.4.2 double-encoding. A jsonb STRING passes a naive "a row exists" assertion and breaks every consumer. |
| The alert's `occurrence_count` increments on a second raise | Proves the RPC's real `on conflict … do update` body ran over the pg connection, not just that an insert happened. |

### 6.2a Admin health classification

| Test | Failure mode it catches |
| --- | --- |
| A row with status `expired` yields `watch_expired`, NOT `watch_inactive` | §3.1.5. Without it the reap silently downgrades the admin panel's diagnosis for the exact condition tier 3 names, and tier 3 becomes unreachable. |
| A row with status `orphaned` still yields `watch_inactive` | The other side of the same branch. A fix that routes ALL non-active statuses to `watch_expired` would pass the row above and break every other status. |
| Through the real lifecycle: reap → health reports `watch_expired`; then GC → health reports `watch_inactive` | Spec R4 finding 2. A synthetic literal-`expired` row keeps the first assertion green while the second silently regresses, so the pair has to be driven through the actual transitions rather than constructed. Pins the ceiling §3.1.5 claims, and would catch a future change that made `stopped` report as expired. |

### 6.3 Class sweep

Before implementing §3.3, the sweep enumerates every Drive/Sheets API CALL, not every client construction:

```sh
grep -rnE '\.(files|channels|revisions|spreadsheets)\.[a-zA-Z]+\(' lib/ app/ --include='*.ts'
```

**Use `grep -rnE`, not `rg -nE`.** In this repository's `rg`, `-E` is `--encoding` and the command dies with `unknown encoding` instead of matching (spec R4 finding 6) — an earlier revision prescribed exactly that and would have replaced a wrong sweep with one that cannot run. The `grep` form above is the one actually executed to produce the classification below.

`rg -n 'getDriveClient()'`, which an earlier revision prescribed, finds construction sites and misses calls entirely, including a client built inline with `google.drive(...)` (`lib/drive/agendaDrive.ts:94`) and the several distinct calls inside a single route file. It is what produced the misclassification recorded in the plan (spec R3 finding 5). Each hit is judged by its SECOND argument. **The executed classification, in full** (spec R5 finding 8 — an earlier revision promised "the classification below" and then ended the section):

- **Already bounded, no change:** `lib/drive/fetch.ts:359`, `lib/drive/list.ts:102`, `lib/drive/sheetGids.ts:21`, `lib/drive/agendaDrive.ts:115`, `lib/drive/agendaDrive.ts:199`, `lib/sync/applyStaged.ts:1005`, `lib/sync/assetRecovery.ts:280`, `lib/sync/defaultSnapshotAssetsForApply.ts:94`, `lib/sync/runScheduledCronSync.ts:2106`, `lib/sync/runScheduledCronSync.ts:2129`, `lib/sync/verifyReelOnApply.ts:78`, plus the stream path guarded by `lib/drive/stallGuard.ts`.
- **Unbounded, FIXED by this diff:** `lib/drive/watch.ts:383` (`files.watch`) and `lib/drive/watch.ts:420` (`channels.stop`).
- **Unbounded, OUT of scope and filed** as `BL-DRIVE-API-CALLS-UNBOUNDED-APP-ROUTES`: `app/api/admin/onboarding/scan/route.ts:109`, `app/api/asset/agenda/[show]/[id]/route.ts:320`, `app/api/asset/agenda/[show]/[id]/route.ts:481`, `app/api/asset/agenda/[show]/[id]/route.ts:524`, `app/api/asset/reel/[show]/route.ts:397`, `app/api/asset/reel/[show]/route.ts:527`, `app/api/asset/reel/[show]/route.ts:568`, `app/api/asset/reel/[show]/route.ts:661`.

Everything under `lib/` is already bounded; the entire residual is under `app/api/`.

---

## 7. Out of scope

- Backoff, `drive_watch_reconcile_state`, escalation-by-duration, any cadence change (§1.1a item 5).
- `BL-ADMIN-POSTGREST-DML-LOCKDOWN` on `drive_watch_channels` (§1.1a item 8).
- `BL-PG-CRON-COVERAGE-UNRUN` and `BL-CRON-REGISTRY-MIGRATION-PARITY` (BACKLOG.md). Adjacent to the same cron job, unrelated to these four defects.
- The webhook handler's folder resolution (`app/api/drive/webhook/route.ts:82`). §1.3 notes that an abandoned folder's pings become bounded at ≤ 24h instead of permanent; making the handler itself folder-aware is a separate change and is not made here.
- Retiring `'stopping'` from the CHECK (§8.2).
- **Race-freedom for AC-6.18 under concurrent promotion** (§3.2.4). Descoped after three review rounds; closing it requires serialization between the promotion transaction and concurrent subscribers, which conflicts with the ratified no-advisory-locks constraint (§1.1a item 6) and is its own piece of work. Residual is bounded to one lease and filed as a backlog entry.
- **Bounding the `GoogleAuth` credential fetch.** Named residual from §3.3.1a: the per-call `timeout` reaches the Drive request but not the token request that precedes it on `GoogleAuth`'s own transport, and no supported per-call knob was found for it. Filed as a new backlog entry rather than left implicit — the withdrawn outer-race design failed precisely because it claimed to have closed this.

---

## 8. Watchpoints (reviewer preempts)

**8.1 "The reap should trigger on renewal failure, as the backlog says."** Refuted in §3.1.2. Renewal fires with hours of lease left; retiring on failure would destroy a channel that is still delivering. Expiry is the only provably-dead condition.

**8.2 "`'stopping'` is in the CHECK but not in `WatchChannelStatus`."** Pre-existing (`supabase/migrations/20260501001000_internal_and_admin.sql:296` vs `lib/drive/watch.ts:21`). Preserved verbatim because dropping a value from a CHECK is a separate, riskier change than adding one, and no code writes it. Out of scope (§7), noted so it is not read as introduced here.

**8.3 "The failed folder read should get its own field on the returned result."** Rejected — but note the narrower claim: the fault IS reported in the returned result, as a `failures` entry using the existing `'*'` sentinel, under the conditions in the §3.2.2 table. What is rejected is a NEW FIELD, because `RefreshResult` is deep-equality asserted in five test files and serialised into the cron response, so no field is additive there. The condition is reported as a durable emit instead. Reusing the `'*'` sentinel is NOT rejected — §3.2.3 requires it, because under the fail-closed branch nothing was attempted and that is exactly what the sentinel means.

**8.4 "The run budget makes the renewal-timing guarantee defensible now."** Only partly, and deliberately not claimed. §3.3.3 states exactly what is enforced inside the process and what is not enforced around it. `isGrantTooShort` stays a heuristic in this diff.

**8.5 "Two `getActiveWatchedFolder` reads per tick can disagree."** Correct and accepted. Per §3.2.2 a failed read renews nothing, so a disagreement cannot silently renew a stale folder; reconcile performs its own read and records its own fault; the window is one tick. Coupling them is not worth it — both surfaces refuse to renew a non-configured folder, so a disagreement costs a redundant read rather than a wrong write. (An earlier revision justified this by citing the deferred design's D4 as a durable-transport problem; that line says the opposite and the citation is withdrawn — §3.2.3.)

**8.6 What this hands to `BL-WATCH-RECONCILE-BACKOFF`.** The blocking premise of the deferred design was "refresh, not reconcile, is the dominant retry path, and it is ungated" (BACKLOG.md, entry `BL-WATCH-RECONCILE-BACKOFF`). After §3.1 refresh does not retry an expired folder at all, and after §3.2 it does not touch a non-configured one, so reconcile's `!live` branch (`lib/drive/watch.ts:877-881`) becomes the **single** retry surface — which is precisely where the deferred ladder attaches. That entry stays OPEN; its constants and cadence prescriptions were falsified across five rounds and must be re-derived, not resumed (`docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:10`).

**8.7 "The manifest should show a diff for a CHECK change."** It does not — the manifest is a column-name array per table. But that does NOT leave the validation apply unguarded, and an earlier draft of this spec wrongly said it did: `tests/db/validation-schema-parity.test.ts:216-290` already carries a CHECK-parity layer built for this blind spot, and §4.4 extends it rather than substituting a manual paste.

**8.8 "No impeccable gate was run."** Correctly so: AGENTS.md invariant 8 scopes the dual-gate to files under app/ except app/api/**, files under components/, an app/globals.css @theme block, DESIGN.md, and the Tailwind config. This diff touches none of them (§4.1).
