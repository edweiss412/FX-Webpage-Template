# Watch-Channel Reconcile: Real Renewal Slack, Dedicated Cadence, and Backoff State

**Date:** 2026-07-24
**Status:** DRAFT — autonomous ship (spec + plan user-review gates waived per the AGENTS.md brainstorming gate; cross-model APPROVE required at each stage)
**Branch:** `feat/watch-reconcile-backoff` off `origin/main` @ `7ed193dde`
**Closes:** `BL-WATCH-RECONCILE-BACKOFF` (BACKLOG.md:115-119) — Approach B from `docs/superpowers/specs/observability/2026-07-01-watch-channel-health-design.md` §2/D1, plus a defect that backlog entry did not know about.

---

## 1. Problem

`BL-WATCH-RECONCILE-BACKOFF` proposes a dedicated `*/15` reconcile cron plus a backoff-state table, to be adopted "if the hourly cadence proves too slow in practice (e.g., renewal failures near show start)."

Telemetry against the live validation deployment (2026-07-24; the only deployed environment — the ambient `SUPABASE_URL` in `.env.local` is loopback, so validation *is* production today) says the motivating risk is real, and that its dominant cause is a defect nobody had identified when that entry was written.

### 1.1 Measured facts

| Fact | Evidence |
|---|---|
| Every watch channel's lifetime is **exactly 1 hour** | `pnpm observe watch --env validation --json`: every row has `expiresAt = createdAt + 1h` (e.g. `createdAt 2026-07-25T04:00:02.781936+00:00` / `expiresAt 2026-07-25T05:00:03+00:00`) |
| Renewal runs **hourly** | `fxav_cron_refresh_watch`, `'0 * * * *'` (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:106`) |
| Renewal slack is therefore **~1 second** | channel created `04:00:02` expires `05:00:03`; its replacement is created `05:00:02` |
| Churn: **24 channels/day** | one `DRIVE_WATCH_ACTIVATED` per hour, 168 consecutive over 7 days (`pnpm observe events --env validation --source drive.watch --since 7d`) |
| Observed failures in 7 days | **zero** — no orphan, no escalation, no open `WATCH_CHANNEL_ORPHANED` (`pnpm observe alerts --env validation`) |

### 1.2 Root cause of the 1-hour lifetime

`defaultWatchFolder` builds the `files.watch` request body with `id` / `type` / `address` / `token` and **no `expiration` field** (`lib/drive/watch.ts:341-349`). Google's push-notification guide: *"the expiration time defaults to 3600 seconds after the current time"*, and *"the maximum expiration time is 86400 seconds (1 day) after the current time for the `files` resource"* (<https://developers.google.com/workspace/drive/api/guides/push>). We take the 1-hour default and never ask for the 24 hours available.

Consequence: **a single failed renewal costs a full hour of push delivery.** The renewal fires at the moment the old channel expires, so a failure leaves nothing live, and the next attempt is a whole hour away. Shows still sync on the scheduled path (`fxav_cron_sync`, `*/5`), so nothing is lost — but "Doug edited the sheet an hour ago and the crew still can't see it" is exactly the show-start failure the backlog entry named. Cadence is the *secondary* variable here; the primary one is that every lease expires with no time to spare.

### 1.3 What the cadence question is actually worth

With real slack in place (§3.1), a failed renewal is a non-event and the hourly cadence costs nothing. The residual value of `*/15` is narrower and genuine: recovery when there is **no live channel at all** — a newly-configured folder whose first subscribe failed, a Drive-side revocation, or the post-GC state where an orphaned channel has been stopped and deleted. Today that is up to 60 minutes of degraded delivery; at `*/15` it is ~15 minutes.

Backoff state earns its place once cadence goes to `*/15`: at hourly, one attempt per hour against a persistently broken folder is already gentle; at `*/15` it is 96 futile Drive calls a day, with no record of how many times we have tried, what failed last, or when we will try again.

---

## 1.1a Resolved scope — do not relitigate

Ratified by the user during brainstorming on 2026-07-24. Cite these rather than re-deriving them.

1. **Scope is "Option C": lease fix + dedicated `*/15` cron + state table + backoff + tiered surfacing.** The user was shown the four-option comparison (lease-only / lease+cadence / full / lease-now-decide-later) and chose full. Do not propose descoping to the lease fix alone on the grounds that zero failures were observed — that trade was presented explicitly and declined.
2. **Escalation moves from count-based to duration-based (3h).** Ratified as a deliberate behavior change to shipped, tested code (§3.6). Do not propose retuning `ESCALATION_THRESHOLD` instead; the count-vs-ladder coupling is precisely the defect being removed.
3. **Surfacing is split by field, not by feature.** Next-attempt time and attempt count go to Doug; error class, redacted message, and ladder position are developer-only. Do not propose gating the whole feature behind the developer tier, and do not propose putting `error_class` on Doug's surface. Rationale in §3.7.
4. **`WATCH_CHANNEL_ORPHANED` stays `audience: "doug"`** (`lib/messages/catalog.ts:360`). It carries a Retry action Doug is meant to take (ratified D3 of the 2026-07-01 design). Do not propose flipping it to `audience: "health"` on the grounds that watch internals are operator concerns.
5. **No advisory locks on any watch surface.** Zero holders today (`lib/drive/watch.ts` contains no `pg_advisory`/`hashtext`), and invariant 2 does not apply — this feature mutates none of `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`. Adding one would create the M5-R20 nested-holder class. Concurrency defense is the existing partial unique index plus same-tx supersession, plus the single atomic upsert in §3.3. Ratified in the 2026-07-01 design §3.2 and §6 and unchanged here.
6. **Fail-open posture is unchanged.** Subscribe failures degrade to scheduled sync by design (`subscribeToWatchedFolder` returns `orphaned` rather than throwing, `lib/drive/watch.ts:436-490`). This feature adds recovery and observability, never fail-closed behavior.
7. **The stale-pending sweep stays silent.** It performs zero `admin_alerts` writes (2026-07-01 design §3.2.1, implemented at `lib/drive/watch.ts:658-677`). It moves routes in §3.4 but its contract does not change.
8. **`drive_watch_channels`' own PostgREST grants are out of scope.** `supabase/migrations/20260501002000_rls_policies.sql:163` grants `insert, update, delete` on that table to `anon, authenticated` — a pre-existing exposure tracked under `BL-ADMIN-POSTGREST-DML-LOCKDOWN`, not created or widened by this diff. The **new** table is locked down from birth (§3.3). Do not expand this diff to remediate the old table.
9. **Chrome vs catalog copy.** The next-attempt line (§3.7) is UI chrome in the same class as the existing bell auto-resolve note (`components/admin/BellPanel.tsx:324-330`) and the `DriveConnectionPanel` status lines — not §12.4 message copy. The substantive explanation stays cataloged. Precedent ratified in the 2026-07-01 design §6.

---

## 2. Resolved decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Channel lifetime | Request the Google maximum for `files` (24h) rather than accepting the 1-hour default. Store whatever Drive actually grants (already the behavior at `lib/drive/watch.ts:357`). |
| D2 | Renewal trigger | A **fraction of the channel's own granted life**, not an absolute lead time. Self-scaling; cannot degenerate into per-cycle churn if Drive ever shortens the grant. |
| D3 | Reconcile placement | Its own route + cron, off-minute, `*/15`-equivalent. Refresh keeps its hourly cron and no longer calls reconcile. |
| D4 | Condition (b) transport | Durable state row, replacing the in-memory same-cycle refresh result. |
| D5 | Backoff | Exponential ladder capped strictly inside the renewal slack. |
| D6 | Escalation trigger | Duration since `admin_alerts.raised_at`, or immediate on `error_class === "config"`. |
| D7 | Surfacing | Split by field (§3.7). |
| D8 | Ship mode | Autonomous through merged PR. |

### 2.1 Named constants (single source of truth)

Every later section references these **names**, never the literals. All live in `lib/drive/watchErrors.ts` alongside the existing `STALE_PENDING_MAX_AGE_MS` (`lib/drive/watchErrors.ts:9`).

- `WATCH_TTL_MS` = **86_400_000** (24h) — requested channel lifetime; Google's documented maximum for the `files` resource.
- `RENEWAL_LIFE_FRACTION` = **0.75** — a channel is renewal-due once 75% of its granted life has elapsed. On a 24h grant that is 6h of remaining slack; on a 1h grant, 15 minutes.
- `BACKOFF_LADDER_MS` = **[900_000, 1_800_000, 3_600_000, 7_200_000]** (15m, 30m, 1h, 2h). The Nth consecutive failure waits `BACKOFF_LADDER_MS[min(N, len) - 1]`; the final entry repeats indefinitely.
- `BACKOFF_MAX_MS` = **7_200_000** (2h) — definitionally the last entry of `BACKOFF_LADDER_MS`; asserted equal by a unit test rather than written twice.
- `ESCALATION_AFTER_MS` = **10_800_000** (3h) — escalate once an unresolved alert has persisted this long. Replaces `ESCALATION_THRESHOLD`.
- `STALE_PENDING_MAX_AGE_MS` = **3_600_000** (1h) — unchanged (`lib/drive/watchErrors.ts:9`).
- Reconcile schedule = **`'7,22,37,52 * * * *'`** — a 15-minute period at a fixed 7-minute offset. Wherever this document (and `BL-WATCH-RECONCILE-BACKOFF`) says `*/15`, it means this schedule; the offset exists solely to avoid collisions (§3.4) and the period is exactly 15 minutes, so the expected-interval registration is `900_000`. There is no second cadence.

**Constant-coupling invariant (pinned by a unit test, §6.1):** `BACKOFF_MAX_MS < WATCH_TTL_MS * (1 - RENEWAL_LIFE_FRACTION)`. In words: the longest backoff wait must be strictly shorter than the renewal slack, or a broken-but-live channel could expire between retries. With the values above: 2h < 6h. ✓ This is the reason the ladder caps at 2h rather than climbing further, and any future edit to any of the three constants must keep it true.

**`ESCALATION_THRESHOLD` is retired**, not repurposed. Its only readers are `lib/drive/watchErrors.ts:8` (definition) and `lib/drive/watchEscalation.ts:8` (import) and `lib/drive/watchEscalation.ts:102` (sole use) — verified by `grep -rn ESCALATION_THRESHOLD`. The export is deleted in the same task that introduces `ESCALATION_AFTER_MS`.

---

## 3. Design

### 3.1 Lease fix — ask for the 24 hours Google already offers

**Request.** `defaultWatchFolder` (`lib/drive/watch.ts:336-359`) adds `expiration: String(now + WATCH_TTL_MS)` to `requestBody` — a Unix timestamp in **milliseconds**, as a string, per the Drive API `Schema$Channel.expiration` contract. `now` comes from an injectable clock so the unit test is not wall-clock dependent.

**Response handling is unchanged.** The function already parses `data.expiration` and throws when it is absent (`lib/drive/watch.ts:351-353`), then stores `new Date(Number(data.expiration)).toISOString()` (`lib/drive/watch.ts:357`). Drive granting *less* than requested therefore degrades safely with no code change: we persist the real expiry, and §3.2 renews against the real expiry.

**Guard conditions.**
- Drive returns an expiration **later** than requested → stored verbatim; harmless.
- Drive returns an expiration **already in the past** (clock skew) → the §3.2 predicate treats it as immediately due, which is correct.
- `data.expiration` absent or non-numeric → existing throw at `lib/drive/watch.ts:351-353`, existing `catch` classifies and marks orphaned (`lib/drive/watch.ts:436-490`). Unchanged.

### 3.2 Renewal trigger — a fraction of granted life, not an absolute lead

Today: `listExpiringActive(now + 24h)` (`lib/drive/watch.ts:520-527`), i.e. `where status='active' and expires_at < $1` (`lib/drive/watch.ts:206-210`). With a 24h TTL that predicate is true for **every** channel from the instant it is created, so the 24h lease would still churn once per cycle and buy no reduction in Drive traffic — though it would still buy the slack, which is the point that matters.

Replace the absolute threshold with a predicate over the row's own lifetime:

```sql
where status = 'active'
  and (
    expires_at is null
    or now() >= created_at + (expires_at - created_at) * $1   -- $1 = RENEWAL_LIFE_FRACTION
  )
```

`created_at` is added to the `listExpiringActive` SELECT (`lib/drive/watch.ts:206`), which currently reads `id, status, watched_folder_id, webhook_secret, resource_id, expires_at`. The `drive_watch_channels_renewal_due_idx` partial index on `(expires_at) where status = 'active'` (`supabase/migrations/20260501001000_internal_and_admin.sql:306`) no longer covers the predicate; with a single-digit row count for a singleton folder this is a non-issue and the index is left in place for the GC path. **No new index** — stated explicitly so a reviewer does not read the omission as an oversight.

**Guard conditions.**
- `expires_at is null` → due now. (`drive_watch_channels_active_requires_drive_state` already forbids `status='active' and expires_at is null` at `supabase/migrations/20260501001000_internal_and_admin.sql:299-301`, so this arm is defence-in-depth for non-active rows that a future caller might pass.)
- `expires_at <= created_at` (clock skew / zero-length grant) → `(expires_at - created_at) * 0.75` is ≤ 0, so `now() >= created_at + <=0` is true → due now. Correct: a nonsense lease should be replaced immediately.
- Behavior on the current 1-hour grants, before the §3.1 change lands in production: renewal moves from "every hour at the expiry boundary" to "every hour at 15 minutes remaining" — strictly better even in isolation. The two changes are independent and neither is a prerequisite for the other's correctness.

### 3.3 `drive_watch_reconcile_state`

One row per watched folder. Keyed on the folder rather than made a singleton so that switching folders cannot inherit the previous folder's backoff position or failure count.

```sql
create table public.drive_watch_reconcile_state (
  watched_folder_id      text primary key,
  consecutive_failures   int         not null default 0,
  last_attempt_at        timestamptz,
  next_attempt_at        timestamptz not null default now(),
  last_outcome           text,
  last_error_class       text,
  last_error_message     text,
  last_renewal_ok_at     timestamptz,
  last_renewal_failed_at timestamptz,
  updated_at             timestamptz not null default now(),
  constraint drive_watch_reconcile_state_error_class_check check (
    last_error_class is null or last_error_class in ('config', 'drive_api', 'db')
  ),
  constraint drive_watch_reconcile_state_outcome_check check (
    last_outcome is null or last_outcome in (
      'healthy', 'recovered', 'still_orphaned', 'renewal_failing',
      'vacuous', 'backoff_waiting', 'infra_error'
    )
  ),
  constraint drive_watch_reconcile_state_failures_nonneg check (consecutive_failures >= 0)
);
```

`last_error_class` mirrors the existing `WatchErrorClass` union (`lib/drive/watchErrors.ts:28`); `last_outcome` mirrors `ReconcileOutcome` (`lib/drive/watch.ts:626-632`) plus the new `backoff_waiting` arm. Both CHECKs are enumerated against those unions in §4.2.

`last_error_message` stores the output of the existing `redactWatchError` (`lib/drive/watchErrors.ts:37`), truncated to 300 chars by that function. **No raw error ever reaches this column** — same chokepoint contract as the alert context (2026-07-01 design §3.1.3).

**Lockdown (from birth).** `revoke insert, update, delete on table public.drive_watch_reconcile_state from anon, authenticated; grant all privileges … to service_role;` — the class-wide pattern (`supabase/migrations/20260619000001_lockdown_shows_internal.sql:18-20`). A row is registered in `RPC_GATED_TABLES` (`tests/db/postgrest-dml-lockdown.test.ts:139`); the registry's bidirectional discovery walks the migrations directory (`tests/db/postgrest-dml-lockdown.test.ts:805-815`) and fails CI if a REVOKE migration exists without a registry row. **Precedent for a service-role-written (not RPC-gated) table in that registry: `app_events` at `tests/db/postgrest-dml-lockdown.test.ts:213`** — so this membership is consistent with the registry's existing semantics, not a stretch of them. SELECT is revoked too: every read is service-role (the observe CLI and the telemetry page both use `createSupabaseServiceRoleClient`).

**Writes are one atomic statement.** Every mutation is a single `insert … on conflict (watched_folder_id) do update set …`. There is no read-modify-write, so the two crons cannot interleave-corrupt the row even without a lock (§1.1a item 5). `consecutive_failures` increments as `drive_watch_reconcile_state.consecutive_failures + 1` inside the `do update`, evaluated by Postgres against the current row, never against a value the application read earlier.

**Guard conditions.**
- No row for the folder yet → the upsert inserts one; `next_attempt_at` defaults to `now()`, so a first-ever reconcile is never blocked by backoff.
- Folder switched → new PK, fresh row, `consecutive_failures = 0`. Old row is orphaned data; **not** cleaned up by this feature (a folder switch is rare and the row is a handful of bytes). Stated so a reviewer does not file it as a leak.
- `consecutive_failures` exceeds the ladder length → clamped to the last entry by construction (`min(N, len) - 1`).

### 3.4 Reconcile moves to its own route and cron

**New route** at app/api/cron/reconcile-watch/route.ts (does not exist yet), structurally a copy of the existing refresh-watch route (`app/api/cron/refresh-watch/route.ts`): `rejectUnauthorizedCron` guard (`app/api/cron/_auth.ts:3`), then `runCronRoute("reconcile-watch", …)` (`lib/cron/withCronRunSummary.ts`).

**New job** `fxav_cron_reconcile_watch` at `'7,22,37,52 * * * *'`. Minute choice is load-bearing: the two `*/5` jobs (`fxav_cron_sync`, `fxav_cron_notify_realtime`) already claim **every** multiple of 5, `fxav_cron_gc_watch` holds minute 15 and `fxav_cron_diagram_gc` holds minute 30. Minutes 7/22/37/52 collide with none of them, and specifically never with refresh-watch at minute 0, so the two watch crons never run concurrently under normal scheduling.

**`refreshWatchSubscriptions` and `reconcileWatchChannels` are decoupled.** The refresh-watch route stops calling reconcile; its response body and summary lose `reconcile`, `sweptPending`, and `escalated`, keeping `refreshed` / `refreshOrphaned` / `refreshFailures`. `reconcileWatchChannels` loses its `refresh: RefreshResult` first parameter and becomes `reconcileWatchChannels(deps: ReconcileDeps = {})`.

**Condition (b) becomes durable.** The health predicate's second leg — "this cycle's refresh reported no failed renewal of any kind for that folder" (2026-07-01 design §3.2.2, implemented at `lib/drive/watch.ts:727-733`) — can no longer read an in-memory result. Instead:

- `refreshWatchSubscriptions` writes, per folder it attempted, exactly one of `last_renewal_ok_at = now()` (subscribe returned `active`) or `last_renewal_failed_at = now()` (orphaned in either reason, or a thrown `DriveWatchInfraError`).
- On the pre-loop `list_expiring` failure (`lib/drive/watch.ts:528-539`, the `folderId: "*"` case), renewal state is unknown for every folder, so refresh writes `last_renewal_failed_at = now()` for the configured folder. This preserves the shipped `"*"` semantics (`watch.ts:730-733`: no folder may count as renewal-clean on a list-infra cycle).
- Reconcile computes `renewalFailed = last_renewal_failed_at > coalesce(last_renewal_ok_at, '-infinity')`.

Two monotonic timestamps rather than a boolean: each writer sets exactly one column, so there is no stale-flag class, and the comparison is total. **Guard:** both null (folder never renewed — e.g. freshly configured) → `renewalFailed = false`, i.e. renewal-clean. Correct: there is no failed renewal to hide.

**Steps, in order** (deltas from the shipped `reconcileWatchChannels`, `lib/drive/watch.ts:649-815`, are marked):

1. **Stale-pending sweep** — unchanged (`lib/drive/watch.ts:658-677`), still silent, still zero `admin_alerts` writes.
2. **Configured folder** via `getActiveWatchedFolder()` — unchanged (`lib/drive/watch.ts:685-713`). `no_folder_configured` → vacuous-healthy, resolve both alerts, return.
3. **Read state row** *(new)*. Read failure → `"state_read"` fault → `infra_error`, return. Absent row → treated as `{consecutive_failures: 0, next_attempt_at: now(), both renewal timestamps null}` without writing one.
4. **Health predicate** — leg (a) `hasLiveActiveChannel` unchanged (`lib/drive/watch.ts:716-726`); leg (b) now from step 3's state row.
5. **Healthy → auto-resolve** — unchanged (`lib/drive/watch.ts:735-752`), plus a state write resetting `consecutive_failures = 0`, `next_attempt_at = now()`, `last_outcome = 'healthy'`.
6. **Backoff gate** *(new)*. If unhealthy **and** `next_attempt_at > now()` → outcome `backoff_waiting`; **skip the subscribe only.** The sweep (step 1), the auto-resolve path (step 5), and the escalation check (step 8) all still run. This matters: a channel that recovered by some other route (admin Retry, a successful renewal) must be able to clear its alert during a backoff window, and a long-running incident must still escalate on schedule rather than having escalation gated behind the retry ladder.
7. **Unhealthy and not backing off → re-attempt.** Unchanged subscribe semantics (`lib/drive/watch.ts:754-785`): subscribe only when there is **no live channel**; a renewal-failing folder already had its attempt via refresh. Then write state:
   - subscribe returned `active` → `consecutive_failures = 0`, `next_attempt_at = now()`, `last_outcome = 'recovered'`, error columns nulled.
   - otherwise → `consecutive_failures = <current> + 1`, `next_attempt_at = now() + BACKOFF_LADDER_MS[min(new_failures, len) - 1]`, `last_outcome` = the computed outcome, `last_error_class` / `last_error_message` from the alert context the failed subscribe just wrote.
   - `last_attempt_at = now()` on both arms.
   - A state-write failure → `"state_write"` fault. It does **not** abort the cycle: the subscribe already happened and its alert is already raised; losing the backoff bookkeeping degrades to "retry next cycle", which is the pre-feature behavior.
   - **`renewal_failing` does not advance the ladder.** Reconcile performed no attempt in that state, so incrementing would charge it for refresh's failure and double-count. It writes `last_outcome` only.
8. **Escalation check** — unchanged trigger *site* (every unhealthy outcome, now including `backoff_waiting`), changed *predicate* (§3.6).

**New `ReconcileResult`:** `{ outcome: ReconcileOutcome; sweptPending: number; escalated: boolean; faults: string[]; nextAttemptAt: string | null; consecutiveFailures: number }`. The two new fields are for the route body and the cron summary; `nextAttemptAt` is null when no state row was written this cycle.

**Fault inventory.** The shipped thirteen (`lib/drive/watch.ts` §3.2 of the 2026-07-01 design: `pending_sweep`, `folder_read`, `channel_read`, `subscribe_infra`, `activate_write`, `alert_resolve_write`, `alert_row_read`, `guard_read`, `guard_write`, `pref_read`, `recipients_read`, `email_send`, `escalation_helper`) plus **two new**: `state_read`, `state_write`. Any non-empty `faults` → `outcome: "infra_error"` → the route's 500 class. Recorded-not-thrown throughout; an unhandled throw out of the handler is a contract violation, not an accepted path.

**Route HTTP contract**, mirroring the shipped refresh-watch route:
- **200**, summary `outcome: "ok"` — no infra faults. Body `{ ok: true, reconcile: { outcome, sweptPending, escalated, nextAttemptAt, consecutiveFailures } }`. `still_orphaned` / `renewal_failing` / `vacuous` / `backoff_waiting` are all 200: the system working as designed. A 5xx here would page every 15 minutes for the duration of an already-alerted incident.
- **500**, summary `outcome: "infra"` — any recorded fault. Body `{ ok: false, reconcile: { outcome, faults } }`.
- Summary counts via the existing `CronRunSummary` map (`lib/cron/withCronRunSummary.ts`): `{ sweptPending, escalated: 0|1, consecutiveFailures }`. The `CronRunOutcome` union (`lib/cron/runSummary.ts:6`) is unchanged.

### 3.5 Backoff ladder

| Consecutive failures | Wait before next attempt | Elapsed since first failure |
|---|---|---|
| 1 | 15 min | 15 min |
| 2 | 30 min | 45 min |
| 3 | 1 h | 1 h 45 min |
| 4 | 2 h | 3 h 45 min |
| 5+ | 2 h (cap) | +2 h each |

Admin **Retry now** (`retryWatchSubscriptionFormAction`, `app/admin/actions.ts`) clears the wait — sets `next_attempt_at = now()` — but does **not** reset `consecutive_failures`. The count is evidence of an ongoing incident, not a nuisance counter; resetting it on a manual retry would let repeated manual retries hide a persistent failure from the ladder. On a successful manual retry the success path resets it to 0 anyway.

### 3.6 Escalation: duration, not count

**Shipped:** `alert.occurrence_count >= ESCALATION_THRESHOLD || errorClass === "config"` (`lib/drive/watchEscalation.ts:102`). At hourly cadence with one bump per hour, `>= 3` meant ~3 hours.

**Problem:** the threshold is a duration wearing a count's costume. At `*/15` with the §3.5 ladder, bumps land at 0/15/45/105 minutes, so `>= 3` fires at ~45 minutes — and any future ladder edit silently moves it again.

**New:** `now - alert.raised_at >= ESCALATION_AFTER_MS || errorClass === "config"`.

`admin_alerts.raised_at` is `timestamptz not null default now()` (`supabase/migrations/20260501001000_internal_and_admin.sql:273`) and the dedup RPC's `do update set` touches `last_seen_at`, `occurrence_count`, and `context` **but not `raised_at`** (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:48-70`) — verified line by line. So `raised_at` is exactly "when this incident window opened", preserved across every bump, and reset only when a dismissed row is replaced by a fresh insert (a new incident window — correct).

**Diff surface:** `readUnresolvedWatchAlert`'s SELECT (`lib/drive/watchEscalation.ts:32`) gains `raised_at`; `WatchAlertRow` (`lib/drive/watchEscalation.ts:19-23`) gains the field; the `due` computation at `lib/drive/watchEscalation.ts:102` changes; `ESCALATION_THRESHOLD` is deleted. **Everything downstream is untouched** — the guard-read / recheck / guard-write / sends ordering (`lib/drive/watchEscalation.ts:105-169`) is load-bearing and stays exactly as shipped, including `occurrence_count` remaining in the guard-row context and the Sentry `extra` payload (it is still true and still useful; it is just no longer the trigger).

**Guard conditions.**
- `raised_at` in the future (clock skew) → `now - raised_at` is negative → not due. Correct: an alert that claims to be from the future has not persisted for 3 hours.
- Config-class arm is evaluated first and is unchanged, so a config error still escalates on its first reconcile regardless of age.
- A dismissed-then-re-raised alert gets a fresh `raised_at` and must persist another 3 hours. Intended: dismissal closes the incident window.

### 3.7 Surfaces — split by field

The gating question is not "is telemetry developer material" but "can Doug act on this field."

| Field | Tier | Rationale |
|---|---|---|
| `next_attempt_at` | **Doug** | Answers "is it even trying?" — the question that otherwise produces a support ping or repeated Retry taps. |
| `consecutive_failures` | **Doug** | Distinguishes a blip from an incident, in a form Doug can read. |
| `last_error_class` | Developer | `config` / `drive_api` / `db` is jargon by construction; Doug cannot act on the distinction. |
| `last_error_message` | Developer | Redacted, but still raw API text. |
| Ladder position, `last_outcome`, attempt history | Developer | Diagnostic only. |

**Doug — `BellPanel`.** A `<p>` in the watch row's action cell, mirroring the existing auto-resolve note's exact shape (`components/admin/BellPanel.tsx:324-330`: `data-testid`, `className="wrap-break-word text-sm text-text-subtle"`). Rendered when `isWatch && !entry.isHealth` and state is present.

- Both fields present, `next_attempt_at` in the future → `Trying again at 4:45 PM · 7 tries since 9:00 AM`
- `next_attempt_at` null or in the past → `Trying again shortly.` (failure count clause appended when > 0)
- `consecutive_failures === 0` → the count clause is omitted entirely (no `0 tries`)
- `consecutive_failures === 1` → `1 try`, not `1 tries`
- No state row at all → the line does not render; the row looks exactly as it does today

Times render in the viewer's locale via the project's existing time-formatting helper (the plan identifies it by `file:line`; **do not** hand-roll a formatter). The "since" timestamp is `raised_at`, not `first_failure_at` — one incident-start timestamp, already the escalation basis, so the two surfaces cannot disagree.

**Doug — `DriveConnectionPanel`.** The same sentence, in the existing explainer block, rendered under the same visibility condition as the Retry control (`health === "warn"` and `reason ∈ {watch_inactive, watch_expired}` or (`not_configured` and `folderId !== null`) — `lib/admin/driveConnectionHealth.ts:131-168`, `components/admin/settings/DriveConnectionPanel.tsx:260`).

**Developer — telemetry.** The watch bell row gains a `View in telemetry ↗` link when `viewerIsDeveloper`, reusing the exact affordance already built for health rows (`components/admin/BellPanel.tsx:283-296`, `href="/admin/dev/telemetry#health"`) — the prop is already threaded (`components/admin/BellPanel.tsx:1055`). The telemetry page surfaces the developer-tier columns.

**Developer — `pnpm observe watch`.** `lib/observe/query/watch.ts` gains the state columns via a left join or a second query, keyed on `watched_folder_id`. **The `SELECT` constant at `lib/observe/query/watch.ts:9-10` must not gain the webhook-secret column** — `tests/observe/queryWatch.test.ts` scans that file for the column's snake_case literal (`lib/observe/query/watch.ts:1-5`), and the new columns must not reintroduce it. No free-text column added to the CLI output is unsanitized: `last_error_message` is redacted at write time, and the CLI applies the same `sanitizeIdentityString` treatment `queryIngestFailures` uses for `last_error_message` (`lib/observe/query/failures.ts:61`).

#### Mode boundaries


| Element | Healthy (no alert) | Watch alert, backing off | Watch alert, attempting now | Watch alert, viewer is developer |
|---|---|---|---|---|
| Retry form | — | ✓ (unchanged) | ✓ (unchanged) | ✓ |
| Next-attempt line | — | `Trying again at <time> · <n> tries since <time>` | `Trying again shortly.` | same as non-developer |
| `View in telemetry` link | — | — | — | ✓ |
| Error class / message | — | — | — | telemetry page only, never in the bell |

#### Transition Inventory

The next-attempt line has three states — **A** absent (no state row / healthy), **B** future next-attempt, **C** past-due or null — plus the orthogonal existing Retry pending state. 3·(3−1)/2 = 3 pairs:

| Pair | Trigger | Treatment |
|---|---|---|
| A↔B | first failure writes a state row / recovery clears the alert | server re-render; instant — no animation (matches the auto-resolve note, which has none) |
| A↔C | alert raised with `next_attempt_at` already due | server re-render; instant |
| B↔C | the clock passes `next_attempt_at` | **no client-side transition exists** — the line is server-rendered and does not tick. It updates on the next bell refresh. Deliberate: a live countdown would need a client timer for a line nobody watches. |
| Compound: Retry pending while the line is shown | Retry submit | line is static text, unaffected; `RetryWatchButton`'s own `useFormStatus` drives the button. No shared state. |

#### Dimensional Invariants

N/A — the line is a block-level `<p>` sibling in the bell row's existing column flow, with no fixed-dimension parent, and it copies the auto-resolve note's classes verbatim (`BellPanel.tsx:324-330`). No new flex/grid parent–child dimension relationship is introduced. Stated explicitly so the plan's layout-dimensions mandate is discharged by citation rather than silently skipped.

#### Cap and truncation

The line is a single sentence with a bounded integer and two timestamps; `consecutive_failures` is displayed verbatim with no cap (it grows by at most 12/day under the ladder, and a four-digit count would itself be the story). `wrap-break-word` handles narrow viewports, as it does for the auto-resolve note.

### 3.8 Copy lockstep (§12.4 three-way)

Three shipped strings assert an hourly retry cadence and become false at `*/15` with backoff:

| Location | Current text | Change |
|---|---|---|
| `lib/messages/catalog.ts:364` (`followUp`) | `"Auto-retry hourly; admin Retry now; Eric if escalated"` | cadence claim removed |
| `lib/messages/catalog.ts:366` (`helpfulContext`) | `"… It reconnects on its own each hour, or use Retry now. …"` | cadence claim removed |
| `lib/messages/catalog.ts:369` (`longExplanation`) | `"… The system retries the connection automatically every hour …"` | cadence claim removed |

Replacement copy states that retries happen automatically and back off, without naming an interval — so a future ladder change cannot re-falsify it. Exact strings are fixed at plan time.

`followUp` and `helpfulContext` are x1-compared fields (`tests/cross-cutting/codes.test.ts:73-87`), so this is a **three-way lockstep in one commit**: (a) master-spec §12.4 prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (row + long-context map entry — the plan re-greps both line numbers; **never prettier the master spec**), (b) `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts`, (c) `lib/messages/catalog.ts`. `title` and `longExplanation` are catalog-only (rendered at `/help/errors`). **No new code is minted** — no 4-gate new-code surface.

The escalation **email** copy carries the same false claim twice (`lib/drive/watchEscalation.ts:67` and `lib/drive/watchEscalation.ts:73`: *"FXAV retries the connection automatically every hour"*). Not §12.4-cataloged, but corrected in the same commit; `tests/drive/watchEscalation*.test.ts` copy assertions update with it.

---

## 4. Completeness matrices

### 4.1 Tier × domain × layer

| Layer | `drive_watch_reconcile_state` | `drive_watch_channels` | `admin_alerts` | Cron surface | UI |
|---|---|---|---|---|---|
| Table DDL | **New** (§3.3) | unchanged | unchanged | N/A | N/A |
| Inline CHECK | 3 new (§4.2) | unchanged | unchanged | N/A | N/A |
| Index | PK only | none added (§3.2) | unchanged | N/A | N/A |
| Grants / REVOKE | **New** lockdown + `RPC_GATED_TABLES` row | out of scope (§1.1a-8) | unchanged | N/A | N/A |
| RLS policy | none — service-role only, SELECT revoked | unchanged | unchanged | N/A | N/A |
| Read path | reconcile step 3; observe CLI; telemetry page | `hasLiveActiveChannel`, `listExpiringActive` (+`created_at`) | `readUnresolvedWatchAlert` (+`raised_at`) | N/A | BellPanel, DriveConnectionPanel |
| Write path | refresh (renewal timestamps), reconcile (all), admin retry (`next_attempt_at`) | unchanged | unchanged | N/A | N/A |
| Trigger fn | N/A — no propagation trigger needed | N/A | N/A | N/A | N/A |
| Cleanup fn | N/A — one row per folder, unbounded growth impossible | `gcWatchChannels` unchanged | 60-day `app_events` prune unchanged | N/A | N/A |
| Cron registration | N/A | N/A | N/A | **New** job + route (§4.3) | N/A |
| Tests | §6 | §6 | §6 | §6 | §6 |

### 4.2 CHECK / enum matrix

| Constraint | Accepted values | Source of truth | NULL | Apply-twice |
|---|---|---|---|---|
| `…_error_class_check` | `config`, `drive_api`, `db` | `WatchErrorClass` (`lib/drive/watchErrors.ts:28`) — all three enumerated, none omitted | allowed (no failure recorded yet) | table is `create table` in a one-shot migration; re-apply guarded by `if not exists` |
| `…_outcome_check` | `healthy`, `recovered`, `still_orphaned`, `renewal_failing`, `vacuous`, `infra_error`, **`backoff_waiting`** | `ReconcileOutcome` (`lib/drive/watch.ts:626-632`) + the new arm | allowed (never reconciled yet) | same |
| `…_failures_nonneg` | `>= 0` | — | not-null column | same |

**Transitional window:** none. This is a new table, so there is no old-value/new-value window and no `tables/`-runs-before-`migrations/` hazard. A structural meta-test pins both CHECKs against their TypeScript unions so a future union member cannot land without the CHECK (§6.1).

### 4.3 Cron registration fan-out

Every surface that must learn about `reconcile-watch`, each verified to exist at the cited line:

| Surface | Action |
|---|---|
| new migration supabase/migrations/&lt;ts&gt;_schedule_reconcile_watch_cron.sql | new `cron.schedule` (pattern: `supabase/migrations/20260527000003_schedule_cron_jobs.sql:106-112`), scoped unschedule-if-exists first |
| `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json:8` | new row |
| `tests/cron/cronJobsParity.test.ts:13` | new route→jobname mapping |
| `tests/cron/cronRouteSummaries.test.ts:59` | new route in the import list + a summary test |
| `lib/cron/runSummary.ts:54` | new `jobName` + expected-interval entry |
| `tests/cron/runSummary.test.ts:21` | new expected-interval assertion (900_000) |
| `lib/audit/trustDomains.ts:208` | new `{ path, chain: "cron" }` row |
| `tests/db/b3-notify-cron-idempotency.test.ts:13` | new jobname in the asserted list |
| `supabase/__generated__/schema-manifest.json` | regen via `pnpm gen:schema-manifest` |
| validation project `vzakgrxqwcalbmagufjh` | surgical apply of both migrations + `notify pgrst, 'reload schema'` — or `validation-schema-parity` fails |

**Invariant 10 (mutation-surface observability): N/A by contract.** The new route exports `GET` only; the meta-test covers `POST`/`PUT`/`PATCH`/`DELETE` handlers and `"use server"` actions. The route is nonetheless instrumented — `runCronRoute` emits a code-carrying `CRON_RUN_SUMMARY` — so it is not a dark surface. No `AUDITABLE_MUTATIONS` row, no `KNOWN_UNINSTRUMENTED` row, no `// no-telemetry:` comment.

**Invariant 9 (Supabase call boundaries):** every new helper destructures `{ data, error }`, distinguishes returned-error from thrown-error, and surfaces infra faults as discriminable typed results. New boundaries: the state read, the state upsert (three callers), and the widened `readUnresolvedWatchAlert`. Registry rows go in `tests/sync/_metaInfraContract.test.ts` — the registry that already owns the `lib/drive/watch.ts` lifecycle helpers and `readUnresolvedWatchAlert`'s row (`lib/drive/watchEscalation.ts:25-26` names it).

### 4.4 Flag lifecycle

| Flag / field | Storage | Write path | Read path | Effect on output |
|---|---|---|---|---|
| `next_attempt_at` | new table | reconcile steps 5/7; admin retry action | reconcile step 6 gate; BellPanel; DriveConnectionPanel; observe CLI | suppresses the subscribe attempt while in the future; renders the Doug line |
| `consecutive_failures` | new table | reconcile step 7 (`+1` / reset 0) | ladder index in step 7; Doug line | selects the backoff wait; renders the try count |
| `last_renewal_ok_at` / `last_renewal_failed_at` | new table | `refreshWatchSubscriptions`, one per attempted folder | reconcile health leg (b) | keeps the alert raised while renewals fail |
| `last_error_class` / `last_error_message` | new table | reconcile step 7 failure arm | telemetry page; observe CLI | developer diagnosis only — never rendered to Doug |
| `last_outcome` | new table | every reconcile terminal path | telemetry page; observe CLI | diagnosis only |
| `WATCH_TTL_MS` | code constant | — | `defaultWatchFolder` request body | requested channel lifetime |
| `RENEWAL_LIFE_FRACTION` | code constant | — | `listExpiringActive` predicate | when a channel becomes renewal-due |
| `ESCALATION_AFTER_MS` | code constant | — | `maybeEscalateWatchOrphaned` `due` computation | when Sentry + email fire |

No zombie flags: every row has a non-empty write path, read path, and effect.

---

## 5. Empirical grounding

Per the spec-self-review mandate on stateful/cadence surfaces, the load-bearing claims here are measurements, not first-principles reasoning:

- The 1-hour lifetime and ~1-second slack are **observed** (`pnpm observe watch --env validation --json`, §1.1), not inferred from the absence of an `expiration` field.
- The 24h maximum is **quoted from Google's published guide**, not recalled.
- `raised_at` survival across dedup bumps is **verified against the RPC body** (`20260618000000_upsert_admin_alert_failedkeys_merge.sql:48-70`), not assumed from the column name.
- The cron minute collision analysis enumerates **all nine existing schedules** read from the two scheduling migrations, not a sample.
- `ESCALATION_THRESHOLD`'s reader set is a **`grep -rn` result** (three hits, all accounted for), not an assumption that it is only used once.

No race state machine is designed in prose here: the one genuine concurrency surface (two crons writing one row) is resolved by making every write a single atomic statement (§3.3) rather than by reasoning about interleavings.

---

## 6. Testing

TDD per task (invariant 1). Each class below names the concrete failure mode it catches.

1. **Constants + ladder unit tests.** `BACKOFF_MAX_MS === BACKOFF_LADDER_MS.at(-1)`; the coupling invariant `BACKOFF_MAX_MS < WATCH_TTL_MS * (1 - RENEWAL_LIFE_FRACTION)`; ladder index clamps at `consecutive_failures` > length; index for failures 1..6 derived from `BACKOFF_LADDER_MS` itself, never hardcoded. *Catches:* a future constant edit silently allowing a backoff wait longer than the renewal slack — the single failure mode that would reintroduce the §1.2 defect through the back door.
2. **`defaultWatchFolder` expiration.** Request body carries `expiration` as a **string of milliseconds** equal to `injectedNow + WATCH_TTL_MS` (derived from the constant, not a literal); a Drive response with a *shorter* expiration is stored verbatim; a response with a past expiration is stored verbatim (the §3.2 predicate, not this function, decides due-ness). *Catches:* sending seconds instead of milliseconds — the most likely silent mistake, which would request an expiry 46 years in the past.
3. **Renewal predicate, real DB.** Rows at 50% / 74% / 76% / 100% of granted life; ages derived from `RENEWAL_LIFE_FRACTION` and each row's own `created_at`/`expires_at`, never wall-clock literals. Includes `expires_at is null` and `expires_at <= created_at`. *Catches:* the boundary being `>` vs `>=`, and the clock-skew arm silently excluding a nonsense lease from renewal forever.
4. **State table, real DB.** CHECK rejects an out-of-union `last_error_class` and `last_outcome`; rejects negative `consecutive_failures`; the upsert increments against the **stored** value (two sequential upserts from a stale in-memory `0` still yield `2`); PostgREST `INSERT`/`UPDATE`/`DELETE` as `authenticated` and `anon` are rejected with SQLSTATE 42501 via the `RPC_GATED_TABLES` registry row. *Catches:* the read-modify-write regression the atomic-upsert contract exists to prevent, and a missing REVOKE.
5. **Structural meta-test: CHECK ↔ union parity.** Parses both CHECK constraints out of the migration and asserts set equality against `WatchErrorClass` and `ReconcileOutcome` as imported from source. *Catches:* a new `ReconcileOutcome` arm landing without the CHECK — a runtime insert failure that no unit test would see.
6. **Reconcile unit tests** (deps-injected, extending `tests/drive/watch.test.ts:664`). Backoff gate: `next_attempt_at` in the future → outcome `backoff_waiting`, **zero** subscribe calls, **and** the auto-resolve path still reached when the channel is healthy, **and** the escalation check still invoked. Ladder advance on failure; reset on success; `renewal_failing` advances **nothing**. Condition (b) from durable state: `last_renewal_failed_at > last_renewal_ok_at` → not resolved, no second subscribe; both null → renewal-clean; `ok_at > failed_at` → resolves. State-read failure → `state_read` fault → `infra_error`; state-write failure → `state_write` fault but the cycle's other work is preserved. *Catches:* the resolve-defeats-renewal-alert class (2026-07-01 R4-1) regressing through the in-memory→durable port; backoff silently suppressing auto-resolve or escalation; double-counting refresh's failure against reconcile's ladder.
7. **`refreshWatchSubscriptions` renewal-outcome writes.** Exactly one of the two timestamps written per attempted folder; `active` → ok; both orphan reasons and a thrown `DriveWatchInfraError` → failed; the `list_expiring` `"*"` case → failed for the configured folder. Per-row isolation (existing) preserved. *Catches:* a folder whose renewal failed being recorded as renewal-clean, which would let reconcile auto-resolve a live alert.
8. **Escalation duration trigger.** Fires at `raised_at` age ≥ `ESCALATION_AFTER_MS` regardless of `occurrence_count` (including `occurrence_count = 1`); does **not** fire below it (including at high `occurrence_count` — the specific regression the change exists to create); config-class fires at age 0; future `raised_at` does not fire. Ages derived from `ESCALATION_AFTER_MS` ± 1 minute. The shipped guard-read / recheck / guard-write / send ordering assertions (`tests/drive/watchEscalation*.test.ts`) must still pass **unmodified** except for fixtures gaining `raised_at` — an assertion in that ordering suite that needs rewriting is a signal the change leaked past its intended surface. *Catches:* re-coupling escalation to cadence; and the fired-once guard being consumed by the refactor.
9. **Anti-tautology guard on the retired constant.** A source scan asserting zero occurrences of `ESCALATION_THRESHOLD` outside its own deletion. *Catches:* a partial retirement leaving a dead export that a future reader takes as live.
10. **Route tests.** New reconcile route: 200 for `backoff_waiting` / `still_orphaned` / `renewal_failing` / `vacuous` (handled degradation must not page every 15 minutes); 500 + summary `outcome: "infra"` for **every** fault name in the §3.4 inventory including the two new ones; body shapes asserted. Refresh route: no longer returns `reconcile`, and `reconcileWatchChannels` is **not called** (spy assertion, not body inspection — the body could omit the field while the call still happens). *Catches:* the silent-200-on-infra-fault class, and a half-finished split leaving reconcile running twice per hour.
11. **BellPanel component tests.** Line renders with future `next_attempt_at`; renders the "shortly" variant when past-due and when null; omits the count clause at 0; singular at 1; **absent entirely with no state row**; never renders `last_error_class` or `last_error_message` — asserted by scanning the rendered tree for the fixture's error-class and message strings after cloning and removing nothing (they must appear nowhere at any tier). Developer link renders only when `viewerIsDeveloper`. **Anti-tautology:** assert against the state fixture's values, not against a container that also renders the alert's own copy; derive the expected formatted time from the fixture timestamp through the same formatter, never a hardcoded string.
12. **DriveConnectionPanel tests.** Line present for `watch_inactive` / `watch_expired` and for `not_configured` with `folderId !== null`; absent for `not_configured` with `folderId === null` and for positive/`sync_*`/`stale_*`/`infra_error`. Mirrors the shipped Retry-visibility test split.
13. **observe CLI.** `pnpm observe watch` surfaces the state columns; the structural secret-scan pin (`tests/observe/queryWatch.test.ts`) still passes; `last_error_message` goes through the sanitizer. *Catches:* the webhook secret being reintroduced into the SELECT while adding columns.
14. **x1 catalog parity.** `pnpm test:audit:x1-catalog-parity` green after the §3.8 lockstep.
15. **Meta-tests verified, not assumed:** `_metaAdminAlertCatalog` (producer stays `lib/drive/watch.ts`), `_metaAdminAlertProducer` (no new raw `admin_alerts` writes), `_metaMutationSurfaceObservability` (GET route → no row required, asserted by running it), `postgrest-dml-lockdown` bidirectional discovery, `validation-schema-parity` both layers.
16. **Live validation probe (pre-merge).** After the migrations are applied surgically to validation, `pnpm observe watch --env validation` shows the new columns and the next renewal produces a 24h `expiresAt`. Mocked-only review of a cadence/lease change invites a tautological APPROVE; this is the live-integration leg.

---

## 7. Out of scope

- `drive_watch_channels`' own PostgREST DML grants (§1.1a-8) — `BL-ADMIN-POSTGREST-DML-LOCKDOWN`.
- GCP domain verification for the webhook endpoint (2026-07-01 design §3.7.3) — unchanged dev/console ops.
- Per-show watch alerts — the alert is and remains global (`show_id: null`).
- Cleaning up state rows for folders no longer watched (§3.3 guard conditions).
- A live-ticking countdown on the Doug line (§3.7 transition inventory).
- Any change to the `WEBHOOK_TOKEN_INVALID` resolve path that reconcile also performs (`lib/drive/watch.ts:738-742`, `lib/drive/watch.ts:771-775`) — carried through both routes unchanged.

## 8. Watchpoints (reviewer preempts)

- **Zero observed failures is not an argument for descoping.** §1.1 reports 168/168 clean renewals. The user was shown that number alongside a lease-fix-only option and chose the full scope (§1.1a-1). The measurement is context, not a counter-proposal.
- **The lease fix and the cadence change are independent.** Neither is a prerequisite for the other's correctness; they ship together because they are calibrated against each other by the §2.1 coupling invariant, not because either is blocked on the other.
- **`backoff_waiting` still resolves and still escalates.** Only the subscribe attempt is suppressed (§3.4 step 6). A reviewer reading "backoff" as "skip the cycle" is reading a bug that is not there — and the §6.6 test asserts it.
- **The ladder is not charged for refresh's failures.** `renewal_failing` advances `last_outcome` only (§3.4 step 7). Reconcile made no attempt in that state.
- **Two crons, one row, no lock.** Deliberate (§1.1a-5). Every write is a single atomic statement; the increment is evaluated by Postgres against the stored row. The minute choice (§3.4) means the two jobs never coincide under normal scheduling anyway — that is defence in depth, not the primary mechanism.
- **`raised_at`, not a new `first_failure_at` column.** The state table deliberately does not carry an incident-start timestamp: `admin_alerts.raised_at` already is one, is preserved across dedup bumps (verified against the RPC body), and using one timestamp for both the escalation trigger and the Doug line makes the two surfaces incapable of disagreeing.
- **`occurrence_count` is not deleted.** It remains on the alert row, in the escalation guard context, and in the Sentry payload. It stops being the *trigger*; it does not stop being *evidence*.
