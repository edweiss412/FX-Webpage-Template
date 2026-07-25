# Watch-Channel Reconcile: Real Renewal Slack, Dedicated Cadence, and Backoff State

**Date:** 2026-07-24
**Status:** DRAFT — autonomous ship (spec + plan user-review gates waived per the AGENTS.md brainstorming gate; cross-model APPROVE required at each stage)
**Branch:** `feat/watch-reconcile-backoff` off `origin/main` @ `7ed193dde`
**Closes:** `BL-WATCH-RECONCILE-BACKOFF` (the root `BACKLOG.md` entry (lines 103-107)) — Approach B from `docs/superpowers/specs/observability/2026-07-01-watch-channel-health-design.md` §2/D1, plus a defect that backlog entry did not know about.

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
| D2 | Renewal trigger | A fraction of the channel's own granted life **with an absolute floor** (`RENEWAL_MIN_LEAD_MS`). The floor is not optional: a purely proportional trigger is unsafe on short grants because the predicate is only sampled hourly (§2.1a I1). |
| D3 | Reconcile placement | Its own route + cron, off-minute, `*/15`-equivalent. Refresh keeps its hourly cron and no longer calls reconcile. |
| D4 | Condition (b) transport | **Derived**, not stored: unresolved-alert `last_seen_at` vs the live channel's `created_at` (§3.4a). Both facts are already written inside the failing transaction. |
| D5 | Backoff | Exponential ladder, running **only** when no live channel exists (§2.1a I2), so its cap never races an expiry. |
| D6 | Escalation trigger | Duration since `admin_alerts.raised_at`, or immediate on `error_class === "config"`. |
| D7 | Surfacing | Split by field (§3.7). |
| D8 | Ship mode | Autonomous through merged PR. |
| D9 | Bell-feed state transport | A separate service-role read joined in TypeScript in `lib/admin/bellFeed.ts`; `get_bell_feed_rows` is **not** widened (§3.7). |
| D10 | Developer surfacing | A filtered deep link into the existing telemetry activity feed. **No new telemetry component**; the state columns are `pnpm observe watch`-only (§3.7). |
| D11 | Settings state transport | A separate service-role read in `app/admin/settings/page.tsx`, passed as its own prop. The `DriveConnectionHealth` union and its session-scoped loader are untouched (§3.7). |

### 2.1 Named constants (single source of truth)

Every later section references these **names**, never the literals. All live in `lib/drive/watchErrors.ts` alongside the existing `STALE_PENDING_MAX_AGE_MS` (`lib/drive/watchErrors.ts:9`).

- `WATCH_TTL_MS` = **86_400_000** (24h) — requested channel lifetime; Google's documented maximum for the `files` resource.
- `RENEWAL_LIFE_FRACTION` = **0.75** — the *proportional* part of the renewal trigger: a channel is due once 75% of its granted life has elapsed.
- `RENEWAL_MIN_LEAD_MS` = **7_200_000** (2h) — the *absolute floor* on remaining life at which a channel becomes due. Exists because the proportional term alone is unsafe on short grants (§3.2).
- `REFRESH_PERIOD_MS` = **3_600_000** (1h) — how often the renewal predicate is sampled (`fxav_cron_refresh_watch`, `'0 * * * *'`).
- `RECONCILE_PERIOD_MS` = **900_000** (15m) — how often reconcile is sampled.
- `BACKOFF_LADDER_MS` = **[900_000, 1_800_000, 3_600_000, 7_200_000]** (15m, 30m, 1h, 2h). The Nth consecutive failure waits `BACKOFF_LADDER_MS[min(N, len) - 1]`; the final entry repeats indefinitely.
- `BACKOFF_MAX_MS` = **7_200_000** (2h) — definitionally `BACKOFF_LADDER_MS.at(-1)`; asserted equal by a unit test rather than written twice.
- `ESCALATION_AFTER_MS` = **10_800_000** (3h) — escalate once an unresolved alert has persisted this long. Replaces `ESCALATION_THRESHOLD`.
- `STALE_PENDING_MAX_AGE_MS` = **3_600_000** (1h) — unchanged (`lib/drive/watchErrors.ts:9`).
- Reconcile schedule = **`'7,22,37,52 * * * *'`** — a 15-minute period at a fixed 7-minute offset. Wherever this document (and `BL-WATCH-RECONCILE-BACKOFF`) says `*/15`, it means this schedule; the offset exists solely to avoid collisions (§3.4) and the period is exactly `RECONCILE_PERIOD_MS`, so the expected-interval registration is `900_000`. There is no second cadence.

**`ESCALATION_THRESHOLD` is retired**, not repurposed. Its only readers are `lib/drive/watchErrors.ts:8` (definition) and `lib/drive/watchEscalation.ts:8` (import) / `lib/drive/watchEscalation.ts:102` (sole use) — verified by `grep -rn ESCALATION_THRESHOLD`. The export is deleted in the same task that introduces `ESCALATION_AFTER_MS`.

#### 2.1a Timing invariants (pinned by unit tests, §6.1)

A cadence design is only correct relative to how often its predicates are *sampled*. The first draft of this spec asserted a single invariant over the requested TTL and was wrong for exactly that reason (R1 finding 1): a predicate that becomes true at T is not acted on until the next sampling tick, so every margin must be reduced by one sampling period, and the *granted* life — not the requested one — is what the system actually has.

Let `G` be the lifetime Drive actually granted a channel (`expires_at - created_at`), and `L(G) = max(RENEWAL_MIN_LEAD_MS, G * (1 - RENEWAL_LIFE_FRACTION))` the remaining-life threshold at which it becomes renewal-due (§3.2).

- **I1 — renewal is sampled before expiry.** The first draft claimed this for *every* `G` on the strength of `L(G) > REFRESH_PERIOD_MS`, which is false when `L(G) > G` (R2 finding 3): a 1-minute grant created just after a tick expires ~59 minutes before the next one, and no value of `L` can change that. The honest statement separates two regimes, because the boundary is set by the **sampling period**, not by the lead:

  - **`G >= REFRESH_PERIOD_MS` → guaranteed.** A channel is examined at least once per `REFRESH_PERIOD_MS`, and `L(G) >= RENEWAL_MIN_LEAD_MS = 2h > 1h`, so at the first tick after creation the channel is already due and is renewed. Worst-case phase (created one instant after a tick) leaves `G - REFRESH_PERIOD_MS` of margin, which is `>= 0` by assumption and 23h for the 24h grant we request. Subscriptions created off-schedule by admin Retry (`app/admin/actions.ts:326`) or onboarding finalize are covered by the same argument — the guarantee is over phase, not over creation path.
  - **`G < REFRESH_PERIOD_MS` → impossible for any sampling schedule**, including this one. A lease shorter than the interval between examinations cannot be renewed in time by a sampler; the only fixes are a faster sampler or a longer lease. This is **not** a state the system can be correct in, so it is treated as an anomaly rather than papered over: `subscribeToWatchedFolder` compares the granted lifetime against `REFRESH_PERIOD_MS` and, when short, emits `log.error` with `code: "DRIVE_WATCH_GRANT_TOO_SHORT"` carrying the granted milliseconds. We request 24h and Drive's documented floor for an unspecified request is 1h, so this should be unreachable; if it ever fires, the cadence design needs revisiting rather than the channel.

  The §6.1 test is a **phase sweep**, not a formula comparison (the first draft's test computed `L(G)` and compared it to the period, which merely re-asserted the incorrect formula): for each `G` in the table and each creation offset across a full `REFRESH_PERIOD_MS`, simulate the fixed hourly tick series and assert the channel is examined-and-due strictly before `expires_at` for every `G >= REFRESH_PERIOD_MS`, and assert the anomaly log fires for every `G` below it.
- **I2 — the backoff ladder cannot outlive a live-but-unrenewable channel.** `BACKOFF_MAX_MS + RECONCILE_PERIOD_MS < L(G)` for every `G` the system will act on. With the floor: `2h + 15m = 2h15m` vs `L(G) >= 2h` — **this does not hold at the floor**, and the resolution is structural rather than numeric: the ladder only runs in `still_orphaned` (no live channel — there is nothing left to expire), never in `renewal_failing` (§3.4 step 7). A live channel is therefore never waiting on the ladder, so I2 constrains nothing real. It is stated and tested as an explicit non-constraint so that a future change making the ladder run while a channel is live has to confront it.
- **I3 — reconcile's recovery latency is bounded by its own period.** A folder with no live channel is retried within `RECONCILE_PERIOD_MS + BACKOFF_LADDER_MS[n]`, never longer. This is the property §1.3 claims as the cadence change's actual value.

The unit tests assert I1 over a table of grants (`1m`, `1h`, `6h`, `24h`, and the exact `RENEWAL_MIN_LEAD_MS` boundary) computed through the **implementation's own** `L(G)`, so a future edit to any of the four constants that breaks I1 fails CI rather than shipping.

---

## 3. Design

### 3.1 Lease fix — ask for the 24 hours Google already offers

**Request.** `defaultWatchFolder` (`lib/drive/watch.ts:336-359`) adds `expiration: String(now + WATCH_TTL_MS)` to `requestBody` — a Unix timestamp in **milliseconds**, as a string, per the Drive API `Schema$Channel.expiration` contract. `now` comes from an injectable clock so the unit test is not wall-clock dependent.

**Response handling is unchanged.** The function already parses `data.expiration` and throws when it is absent (`lib/drive/watch.ts:351-353`), then stores `new Date(Number(data.expiration)).toISOString()` (`lib/drive/watch.ts:357`). Drive granting *less* than requested therefore degrades safely with no code change: we persist the real expiry, and §3.2 renews against the real expiry.

**Guard conditions.**
- Drive returns an expiration **later** than requested → stored verbatim; harmless.
- Drive returns an expiration **already in the past** (clock skew) → the §3.2 predicate treats it as immediately due, which is correct.
- `data.expiration` absent or non-numeric → existing throw at `lib/drive/watch.ts:351-353`, existing `catch` classifies and marks orphaned (`lib/drive/watch.ts:436-490`). Unchanged.

### 3.2 Renewal trigger — proportional, with an absolute floor

Today: `listExpiringActive(now + 24h)` (`lib/drive/watch.ts:520-527`), i.e. `where status='active' and expires_at < $1` (`lib/drive/watch.ts:206-210`). With a 24h TTL that predicate is true for **every** channel from the instant it is created, so the 24h lease would still churn once per cycle — though it would still buy the slack, which is the point that matters.

A purely proportional replacement is also wrong, because the predicate is only sampled once an hour (§2.1a). On a 1-hour grant, 25%-remaining is +45min, but the next sampling tick is at +60min — at expiry. The trigger therefore needs both terms:

```sql
where status = 'active'
  and now() >= expires_at - greatest(
        $1::interval,                                  -- RENEWAL_MIN_LEAD_MS
        (expires_at - created_at) * $2                 -- 1 - RENEWAL_LIFE_FRACTION
      )
```

`created_at` is added to the `listExpiringActive` SELECT (`lib/drive/watch.ts:206`), which currently reads `id, status, watched_folder_id, webhook_secret, resource_id, expires_at`. The `drive_watch_channels_renewal_due_idx` partial index on `(expires_at) where status = 'active'` (`supabase/migrations/20260501001000_internal_and_admin.sql:306`) no longer covers the predicate; with a single-digit row count for a singleton folder this is a non-issue and the index is left in place for the GC path. **No new index** — stated explicitly so a reviewer does not read the omission as an oversight.

Behavior across grants (the §6.3 test table):

| Granted life `G` | `L(G)` | Due at | Sampling ticks before expiry |
|---|---|---|---|
| 24h (requested) | 6h | 18h elapsed | 6 |
| 6h | 2h (floor) | 4h elapsed | 2 |
| 2h | 2h (floor) | immediately | 2 |
| 1h (today's observed grant) | 2h (floor) | immediately | 1 |

**Guard conditions.**
- `expires_at is null` → **unreachable for `status='active'`**: `drive_watch_channels_active_requires_drive_state` forbids it (`supabase/migrations/20260501001000_internal_and_admin.sql:298-300`), and the query filters on `status='active'`. The predicate therefore does not special-case it, and §6.3 does **not** attempt a test fixture for it (R1 finding 7 — the row cannot be constructed).
- `expires_at <= created_at` (clock skew / zero-length grant) → the proportional term is ≤ 0, `greatest` selects the floor, `now() >= expires_at - 2h` is true → due immediately. Correct: a nonsense lease is replaced at the first opportunity.
- Behavior on today's 1-hour grants, before §3.1 reaches production: every sampling tick renews, exactly as now. The two changes are independent and neither is a prerequisite for the other's correctness.

### 3.3 `drive_watch_reconcile_state`

One row per watched folder. Keyed on the folder rather than made a singleton so that switching folders cannot inherit the previous folder's backoff position or failure count.

**This table carries retry bookkeeping and diagnostics only. It does NOT carry the health signal.** The first draft stored two renewal timestamps here and had reconcile infer "is renewal failing" by comparing them across writers and processes. R1 findings 2, 3 and 5 are all consequences of that single choice: a signal assembled from multiple independent writers disagrees with the same-cycle signal it replaced (five enumerated states), is not atomic with the alert write it must agree with, and leaves a long tail of stale-field postconditions. §3.4 replaces it with a predicate over data that is already authoritative and already written in the same transaction as the failure itself.

```sql
create table public.drive_watch_reconcile_state (
  watched_folder_id    text primary key,
  consecutive_failures int         not null default 0,
  last_attempt_at      timestamptz,
  next_attempt_at      timestamptz not null default now(),
  last_outcome         text,
  last_error_class     text,
  last_error_message   text,
  updated_at           timestamptz not null default now(),
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

`last_error_class` mirrors `WatchErrorClass` (`lib/drive/watchErrors.ts:5`); `last_outcome` mirrors `ReconcileOutcome` (`lib/drive/watch.ts:626-632`) plus the new `backoff_waiting` arm. §4.2 enumerates both.

`last_error_message` stores the output of the existing `redactWatchError` (`lib/drive/watchErrors.ts:37`), truncated to 300 chars by that function. **No raw error ever reaches this column** — same chokepoint contract as the alert context (2026-07-01 design §3.1.3).

**Error detail reaches the writer through `SubscribeResult`, not through a re-read of the alert context.** `SubscribeResult`'s orphaned arm (`lib/drive/watch.ts:64-68`) widens to `{ outcome: "orphaned"; channelId: string; reason: SubscribeOrphanReason; errorClass: WatchErrorClass; errorMessage: string }`. Both values are **already computed at both catch sites** (`lib/drive/watch.ts:438-439`, `lib/drive/watch.ts:476-477`) and written to the alert context; this surfaces them to the caller. Existing callers ignore the extra fields. This is the same widening move the 2026-07-01 design made for `reason`, and it removes the unspecified cross-table read R1 finding 5 flagged: there is no race, because the value travels with the result.

**Lockdown (from birth) — fully private, not "admin-only".** R2 finding 13: the first draft prescribed revoking only `INSERT`/`UPDATE`/`DELETE` while its prose claimed SELECT was revoked too, and cited the `shows_internal` precedent, which deliberately *retains* SELECT (`supabase/migrations/20260619000001_lockdown_shows_internal.sql:14-19`). The correct precedent is the fully-private one:

```sql
revoke all on table public.drive_watch_reconcile_state from public, anon, authenticated;
grant all privileges on table public.drive_watch_reconcile_state to service_role;
alter table public.drive_watch_reconcile_state enable row level security;
```

— byte-for-byte the shape used by `show_share_tokens` (`supabase/migrations/20260523000002_show_share_tokens.sql:43-45`) and the bell state tables (`supabase/migrations/20260705100000_bell_state_tables.sql:35-45`). RLS is enabled with **no policy**, so even a privilege regression cannot yield rows.

**This is why the table is NOT an "admin-only table" in the master spec's §4.3 sense, and R2 finding 11's first two bullets do not apply** (verified, not assumed): `show_share_tokens` is fully private and appears in **none** of the three surfaces that finding named — not the §4.3 prose list, not `lib/audit/admin-tables.generated.ts`, not `tests/db/admin-rls-runtime.baseline.json` (`grep` returns zero hits in all three). An admin-only table is one admins can *read* through `admin_only` RLS; this table is readable by nothing but the service role. Registering it as admin-only would additionally require a `create table` block in the master spec, because `scripts/generate-admin-tables.ts:29-31` filters the §4.3 name list against `create table` definitions found in that same document — a large, purely-ceremonial master-spec expansion for a table no admin session may read. Consequences of this choice, stated so a reviewer can check them: no §4.3 prose edit, no `23 → 24` count bump, no footnote arithmetic change, no `ADMIN_TABLES` regeneration, no `admin-rls-runtime` baseline change, no RLS policy.

A row IS registered in `RPC_GATED_TABLES` (`tests/db/postgrest-dml-lockdown.test.ts:147`) with `selectAnon: false, selectAuthenticated: false`; the registry's bidirectional discovery walks the migrations directory (`tests/db/postgrest-dml-lockdown.test.ts:805-815`) and fails CI if a REVOKE migration exists without a registry row. **Precedent for a service-role-written (not RPC-gated) table in that registry: `app_events` at `tests/db/postgrest-dml-lockdown.test.ts:213`.**

**Writes go through the postgres transaction port, not PostgREST.** R2 finding 8: a column-relative increment (`consecutive_failures = <stored> + 1`) cannot be expressed through a PostgREST upsert, so classifying this writer as a Supabase `{ data, error }` boundary was incoherent. It is a **new `WatchTx` method** carrying raw SQL, exactly like every other watch mutation (`lib/drive/watch.ts:129-175`), invoked through the existing `callWatchTx` wrapper so it inherits the `DriveWatchInfraError` contract:

```sql
insert into public.drive_watch_reconcile_state as st
       (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
        last_outcome, last_error_class, last_error_message, updated_at)
values ($1, $2, $3, $4::timestamptz, $5, $6, $7, now())
on conflict (watched_folder_id) do update
   set consecutive_failures = case when $8::bool
                                   then st.consecutive_failures + 1
                                   else excluded.consecutive_failures end,
       last_attempt_at     = coalesce(excluded.last_attempt_at, st.last_attempt_at),
       next_attempt_at     = excluded.next_attempt_at,
       last_outcome        = excluded.last_outcome,
       last_error_class    = excluded.last_error_class,
       last_error_message  = excluded.last_error_message,
       updated_at          = now()
returning consecutive_failures, next_attempt_at;
```

`st.consecutive_failures + 1` is evaluated by Postgres against the row it is updating, never against a value the application read earlier, so two concurrent writers produce `2` rather than `1`. There is no read-modify-write and therefore no need for a lock (§1.1a item 5). **`returning`** is load-bearing: the caller reports the *persisted* `consecutive_failures` and `next_attempt_at` in `ReconcileResult`, so the route body and the Doug surfaces can never display a value the database did not accept. Invariant 9 treatment follows the pg-port precedent (`DriveWatchInfraError`), not the PostgREST-boundary precedent — the registry row says so explicitly.

#### 3.3a State write: exactly one per cycle, at one point

R1 finding 5 asked for total postconditions; R2 finding 7 showed a per-branch matrix cannot *be* total — it left `updated_at` unlisted, demanded writes on paths that return before a folder id exists, and required a `last_outcome='infra_error'` write on the very path whose fault is that the state write failed.

The structural fix is to stop describing writes per branch. **`reconcileWatchChannels` performs at most one state write per invocation, at a single point: immediately before it returns, after the outcome is final.** Everything upstream computes a value; nothing upstream persists. That makes totality expressible as one rule plus a small value table.

**The rule.** The single write executes **iff** a `watched_folder_id` was resolved (step 2 succeeded with a configured folder) **and** the terminal path is not itself a state-boundary fault (`state_read` / `state_write`). Otherwise no write occurs and the row keeps its previous contents. Concretely, these paths write **nothing**, and each is a deliberate no-write rather than an omission:

| No-write path | Why |
|---|---|
| `vacuous` (no folder configured) | no primary key to write under |
| `infra_error` from `folder_read` | folder id unknown |
| `infra_error` from the no-folder alert-resolve failure (`lib/drive/watch.ts:696-712`) | folder id is `no_folder_configured`; there is still no key (R2 finding 7) |
| `infra_error` from `state_read` | the state boundary is the thing that failed; writing through it would fault again |
| `infra_error` from `state_write` | the write already failed; there is no second attempt (see below) |

**The values.** When the write does execute, every column gets a value from this table. `updated_at` is `now()` on every write, unconditionally, and is listed here because R2 finding 7 correctly noted its absence.

| Final outcome | `consecutive_failures` | `next_attempt_at` | `last_attempt_at` | `last_outcome` | `last_error_class` / `last_error_message` | `updated_at` |
|---|---|---|---|---|---|---|
| `healthy` | `0` | `now()` | unchanged | `'healthy'` | `null` / `null` | `now()` |
| `recovered` | `0` | `now()` | `now()` | `'recovered'` | `null` / `null` | `now()` |
| `still_orphaned` (subscribe returned orphaned) | `stored + 1` | `now() + ladder[min(new,len)-1]` | `now()` | `'still_orphaned'` | from the widened `SubscribeResult` | `now()` |
| `still_orphaned` (subscribe threw) | `stored + 1` | `now() + ladder[…]` | `now()` | `'still_orphaned'` | `'db'` / redacted throw message | `now()` |
| `renewal_failing` | unchanged | unchanged | unchanged | `'renewal_failing'` | unchanged | `now()` |
| `backoff_waiting` | unchanged | unchanged | unchanged | `'backoff_waiting'` | unchanged | `now()` |
| `infra_error` (folder known, non-state fault) | unchanged | unchanged | unchanged | `'infra_error'` | unchanged | `now()` |

"unchanged" is expressed in SQL as `coalesce(excluded.<col>, st.<col>)` or by omitting the column from the `do update set` list — never by the application reading and rewriting a value, which would reintroduce the read-modify-write §3.3 exists to avoid.

**Faults that occur after the outcome is determined** (R2 finding 7's fourth bullet) — `alert_resolve_write`, and every escalation-helper fault (`guard_read`, `guard_write`, `pref_read`, `recipients_read`, `email_send`, `escalation_helper`) — flip the returned `outcome` to `infra_error` **before** the single write happens, because the write is last. There is no second post-fault write and none is needed. This is precisely why the write is positioned at the end rather than inline with each branch.

**A failed state write never retries within the cycle.** It records `state_write`, the cycle returns `infra_error` (500, scheduler-visible), and the bookkeeping is simply one cycle stale — the pre-feature behavior. The subscribe it would have recorded already happened and already raised its alert, so nothing user-visible is lost.

Two outcomes deserve their rationale restated, because both look like gaps:

- **`renewal_failing` touches only `last_outcome`.** Reconcile performed no attempt in that state (§3.4b step 7), so advancing the ladder or stamping `last_attempt_at` would charge reconcile for refresh's attempt. The failure's own diagnostics live on the alert row, which is what the escalation reads.
- **`backoff_waiting` likewise.** The wait was set by the attempt that caused it; observing the wait is not an attempt.

**Guard conditions.**
- No row for the folder yet → the upsert inserts one; `next_attempt_at` defaults to `now()`, so a first-ever reconcile is never blocked by backoff.
- Folder switched → new PK, fresh row, `consecutive_failures = 0`. The old row is orphaned data and is **not** cleaned up (a folder switch is rare and the row is a handful of bytes) — stated so a reviewer does not file it as a leak.
- `consecutive_failures` exceeds the ladder length → clamped to the last entry by construction (`min(N, len) - 1`).

### 3.4 Reconcile moves to its own route and cron

**New route** at app/api/cron/reconcile-watch/route.ts (does not exist yet), structurally a copy of the existing refresh-watch route (`app/api/cron/refresh-watch/route.ts`): `rejectUnauthorizedCron` guard (`app/api/cron/_auth.ts:3`), then `runCronRoute("reconcile-watch", …)` (`lib/cron/withCronRunSummary.ts`).

**New job** `fxav_cron_reconcile_watch` at `'7,22,37,52 * * * *'`. Minute choice is load-bearing: the two `*/5` jobs (`fxav_cron_sync`, `fxav_cron_notify_realtime`) already claim **every** multiple of 5, `fxav_cron_gc_watch` holds minute 15 and `fxav_cron_diagram_gc` holds minute 30. Minutes 7/22/37/52 collide with none of them, and specifically never with refresh-watch at minute 0.

**`refreshWatchSubscriptions` and `reconcileWatchChannels` are decoupled.** The refresh-watch route stops calling reconcile; its response body and summary lose `reconcile`, `sweptPending`, and `escalated`, keeping `refreshed` / `refreshOrphaned` / `refreshFailures`. `reconcileWatchChannels` loses its `refresh: RefreshResult` first parameter and becomes `reconcileWatchChannels(deps: ReconcileDeps = {})`.

#### 3.4a Condition (b): derived from the alert, not from bookkeeping

The health predicate's second leg — "a renewal for this folder has failed and has not since recovered" (2026-07-01 design §3.2.2, implemented at `lib/drive/watch.ts:727-733`) — currently reads the same-cycle `RefreshResult` in memory. Splitting the processes means it must come from durable data.

**It does not need a new column.** Two facts already in the database are jointly sufficient, and both are written *inside the transaction that fails*:

1. Every renewal failure raises or bumps the global `WATCH_CHANNEL_ORPHANED` alert via `markWatchOrphanedWithTx` (`lib/drive/watch.ts:437-450`).
2. `upsert_admin_alert` sets `last_seen_at = now()` on **every** bump for this code. Verified against the RPC body: the `where not (…)` no-op guard requires `p_context ? 'failedKeys'` on **both** sides (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:70-79`), and the watch alert's context carries no `failedKeys`, so the guard is always false and the update always applies.

```
renewalFailed = unresolvedAlert !== null
             && unresolvedAlert.last_seen_at > activeChannel.activated_at
```

**`activated_at`, not `created_at`** (R2 finding 2). `created_at` is stamped when the *pending* row is inserted, **before** the external Drive request (`lib/drive/watch.ts:136-143`, `lib/drive/watch.ts:428-436`); the row becomes `active` in a later transaction that stamps `activated_at = now()` (`lib/drive/watch.ts:152-173`). Using `created_at` misclassifies this legal interleaving: subscription A inserts pending at T0 → a concurrent failure bumps the alert at T1 → A activates at T2. A is operationally newer than the failure, but `A.created_at (T0) < last_seen_at (T1)`, so the folder would be pinned in `renewal_failing` indefinitely and eventually send a false escalation. `activated_at (T2) > T1` classifies it correctly. `activatePending` is the only path to `status='active'` and always stamps it, so the field is non-null for every row the predicate reads.

`hasLiveActiveChannel` (`lib/drive/watch.ts:269-279`) widens from `Promise<boolean>` to return the live row's `activated_at` (or `null` when there is none) — one query, no extra round trip.

This predicate is **self-clearing by construction**. Every path that establishes a working channel — hourly renewal, reconcile's own subscribe, the admin Retry action (`app/admin/actions.ts:301-328`), onboarding finalize (`app/api/admin/onboarding/finalize-cas/route.ts:1080-1088` and `app/api/admin/onboarding/finalize-cas/route.ts:1157-1170`) — activates a row with a later `activated_at`, and none of them has to know this feature exists. Walking R1 finding 2's five divergence states:

| R1 state | Old (timestamp bookkeeping) | New (alert age vs activation age) |
|---|---|---|
| 1. `"*"` list failure, then a clean cycle with zero due rows | old failure stays dominant forever | no alert bump occurs, so nothing changes; if the channel activated after the last bump, healthy |
| 2. folder switched after a failure | new folder has null state; old `"*"` mis-applies | the new folder's channel activated after any prior bump → healthy |
| 3. admin Retry / onboarding finalize succeeds | neither writes `ok_at`; old failure dominates after real recovery | both activate a newer row → healthy. Retry additionally resolves the alert outright |
| 4. state upsert faults after the alert is raised | reconcile sees stale state and can auto-resolve a genuine failure | **the failure signal IS the alert**; there is no second write to fault |
| 5. a successful cycle that attempts nothing | cannot distinguish clean from historically-failed | no bump, no change — the activation time answers it |

#### 3.4a-1 The resolve must be compare-and-set (R2 finding 1)

Deriving the *read* correctly is not sufficient. `resolveAdminAlert` updates **every** unresolved row for the code — it filters on `code` + `show_id is null` + `resolved_at is null` and nothing else (`lib/adminAlerts/resolveAdminAlert.ts:29-39`). So this interleaving erases a real failure:

1. reconcile reads: live channel, no newer alert bump → healthy;
2. refresh's renewal fails and commits a fresh `WATCH_CHANNEL_ORPHANED` sighting;
3. reconcile proceeds to its resolve, which matches the row raised in step 2 and closes it.

The failure is now invisible: no unresolved alert, so the next reconcile also reads healthy and escalation never starts. The alert write being transactional does not help — the gap is between reconcile's *read* and reconcile's *resolve*, not inside either.

**Fix: reconcile never calls the unconditional resolve for this code.** A new `WatchTx` method performs a compare-and-set against the exact row and timestamp the health decision was made on:

```sql
update public.admin_alerts
   set resolved_at = now()
 where id = $1
   and resolved_at is null
   and last_seen_at = $2::timestamptz
```

Zero rows affected → a newer sighting (or a concurrent resolve) landed after the read → **reconcile does not treat the folder as healthy this cycle.** It records outcome `renewal_failing`, writes no ladder movement, and re-evaluates next cycle against the new alert. This is the same raw-SQL-through-the-tx-port shape as the existing `resolveStaleWebhookTokenInvalid` (`lib/drive/watch.ts:281-296`), so it introduces no new transport.

`resolveAdminAlert`'s unconditional form is still correct for the **admin Retry** path (`app/admin/actions.ts:328`), which resolves after a *confirmed successful* subscribe rather than after a read — there is no window there. It is also still used for the `no_folder_configured` vacuous arm, where there is no channel to compare against. Both are unchanged.

**Guard conditions.**
- No unresolved alert → `renewalFailed = false`, and the CAS resolve is skipped entirely (nothing to resolve).
- Unresolved alert but **no** live channel → leg (a) already failed; leg (b) is not consulted.
- `last_seen_at` exactly equal to `activated_at` (same-instant) → strict `>` means healthy. Deliberate: the channel is at least as new as the failure record.
- Clock skew making `activated_at` implausibly future → healthy. Same posture as §3.6's future-`raised_at` arm.
- CAS read/write failure → `alert_resolve_write` fault → `infra_error`; no healthy classification is published.

#### 3.4b Steps

Deltas from the shipped `reconcileWatchChannels` (`lib/drive/watch.ts:649-815`) are marked.

1. **Stale-pending sweep** — unchanged (`lib/drive/watch.ts:658-677`), still silent, still zero `admin_alerts` writes.
2. **Configured folder** via `getActiveWatchedFolder()` — unchanged (`lib/drive/watch.ts:685-713`). `no_folder_configured` → vacuous-healthy, resolve both alerts unconditionally, return.
3. **Read state row and alert row** *(new)*. State read failure → `state_read` fault → `infra_error`, return. Alert read failure → `alert_row_read` fault → `infra_error`, return. Absent state row → treated as `{consecutive_failures: 0, next_attempt_at: now()}` without writing one.
4. **Health predicate.** Leg (a): `hasLiveActiveChannel` returns the live row's `activated_at` or `null`. Leg (b): §3.4a.
5. **Classify, then act.** The first draft gated on `unhealthy && next_attempt_at > now()` *before* distinguishing live from no-live, which let a live channel with a stale future wait return `backoff_waiting` — contradicting the very invariant §2.1a I2 claims (R2 finding 4). Classification is therefore a total function of three booleans, evaluated in this order:

| `live` | `renewalFailed` | `next_attempt_at > now()` | Outcome | Subscribe? | Ladder moves? |
|---|---|---|---|---|---|
| yes | no | past | `healthy` | no | reset to 0 |
| yes | no | **future** | `healthy` | no | reset to 0 — **the wait is stale and is cleared**; a healthy folder must never stay parked |
| yes | yes | past | `renewal_failing` | no | no |
| yes | yes | **future** | `renewal_failing` | no | no — **not `backoff_waiting`**; the ladder is irrelevant while a channel is live |
| no | no | past | `still_orphaned` | **yes** | advance on failure |
| no | no | future | `backoff_waiting` | no | no |
| no | yes | past | `still_orphaned` | **yes** | advance on failure |
| no | yes | future | `backoff_waiting` | no | no |

The backoff gate is therefore consulted **only when `live` is false**, which is what makes §2.1a I2 a true statement about the implementation rather than an aspiration about it. All eight cells are executable test cases (§6.6).

6. **Healthy → auto-resolve via CAS** (§3.4a-1). Zero rows affected → downgrade the outcome to `renewal_failing` for this cycle and skip the ladder reset.
7. **`still_orphaned` → subscribe once**, then write state per §3.3a. A folder in `renewal_failing` is not re-subscribed. Two reasons, and note that the *shipped* reason no longer applies: the 2026-07-01 design justified this by `occurrence_count` distortion, a premise duration-based escalation (§3.6) deletes. The surviving reasons are (i) **Drive traffic** — refresh owns renewal, and reconcile attempting in parallel doubles `files.watch` calls against a folder that already has a live channel; and (ii) **ownership** — in `renewal_failing` push is still being delivered, so there is nothing to recover, only a renewal to retry, and the renewal path is refresh's.
8. **Escalation check** — unchanged trigger *site* (every unhealthy outcome, including `backoff_waiting`), changed *predicate* (§3.6).

**New `ReconcileResult`:** `{ outcome: ReconcileOutcome; sweptPending: number; escalated: boolean; faults: string[]; nextAttemptAt: string | null; consecutiveFailures: number }`. The last two are the values **returned by the state write** (§3.3), never values the application computed, so the route body cannot report a number the database did not accept. Both are null/0 when no state row was read or written this cycle.

**Fault inventory.** The shipped thirteen (`pending_sweep`, `folder_read`, `channel_read`, `subscribe_infra`, `activate_write`, `alert_resolve_write`, `alert_row_read`, `guard_read`, `guard_write`, `pref_read`, `recipients_read`, `email_send`, `escalation_helper`) plus **two new**: `state_read`, `state_write`. Any non-empty `faults` → `outcome: "infra_error"` → the route's 500 class. Recorded-not-thrown throughout; an unhandled throw out of the handler is a contract violation, not an accepted path.

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

**Doug — `BellPanel`, data transport (D9).** The bell feed is not a direct table read: `lib/admin/bellFeed.ts` assembles `BellEntry` (`lib/admin/bellFeed.ts:29-52`) from the RPC `get_bell_feed_rows`, whose `RETURNS TABLE` shape is mirrored exactly by `RpcRow` (`lib/admin/bellFeed.ts:73`) and guarded by `BellFeedShapeError` (`lib/admin/bellFeed.ts:68`). The state is **per watched folder**, not per alert row, so widening a per-row RPC would fan one folder-scoped value across every row and inflate the RPC contract for a single consumer.

**Decision:** one shared server-side helper, `readWatchSurfaceState()`, used by **both** Doug surfaces. It performs a single service-role read joining the state row and the unresolved alert row for the configured folder, and returns:

```ts
type WatchSurfaceState = {
  nextAttemptAt: string | null;
  consecutiveFailures: number;
  incidentStartedAt: string | null;   // admin_alerts.raised_at
  lastOutcome: ReconcileOutcome | null;
} | null;
```

Two fields exist because R2 findings 5 and 6 showed the two-field prop could not render the sentence it promised:

- **`incidentStartedAt`** (finding 5). The copy says "tries since `<incident start>`", but neither surface can supply it. The bell RPC collapses `raised_at` and `last_seen_at` into a single `activityAt` (`lib/admin/bellFeed.ts:84-88`, `lib/admin/bellFeed.ts:111-130`) and `BellEntry` has no incident-start field (`lib/admin/bellFeed.ts:29-52`); Settings receives only `DriveConnectionHealth`, whose union has no alert timestamp at all (`lib/admin/driveConnectionHealth.ts:39-57`). Reading `raised_at` in this helper gives both surfaces the same value the escalation trigger uses (§3.6), so the sentence and the escalation cannot disagree — and the bell can never accidentally render the most recent *bump* as if it were the incident start.
- **`lastOutcome`** (finding 6). `WATCH_CHANNEL_ORPHANED` is raised by renewal failures as well as no-channel failures, but **only the no-channel path uses the ladder** — in `renewal_failing` the next attempt is the next hourly refresh, and `consecutive_failures`/`next_attempt_at` are deliberately untouched (§3.3a). Without the outcome, the line would render "Trying again shortly" from stale state and the catalog would promise exponential backoff while the real cadence is hourly. The copy branches on it (§3.7 rendering).

`get_bell_feed_rows` is **not** modified — stated explicitly so a reviewer does not read the absence of a migration as an oversight. `BellEntry` gains one optional field, `watchState: WatchSurfaceState`, null for every non-watch row and null when the read fails (a failed read must never break the feed — the line simply does not render, and the alert row still does).

**Doug — `BellPanel`, rendering.** A `<p>` in the watch row's action cell, mirroring the existing auto-resolve note's exact shape (`components/admin/BellPanel.tsx:324-330`: `data-testid`, `className="wrap-break-word text-sm text-text-subtle"`). Rendered when `isWatch && !entry.isHealth` and state is present.

The sentence branches on `lastOutcome`, because the two failure modes retry on different schedules (R2 finding 6):

| `lastOutcome` | Rendered line |
|---|---|
| `still_orphaned` / `backoff_waiting`, `nextAttemptAt` in the future | `Trying again at 4:45 PM · 7 tries since 9:00 AM` |
| `still_orphaned`, `nextAttemptAt` past or null | `Trying again shortly. · 7 tries since 9:00 AM` |
| `renewal_failing` | `Still connected for now. Trying to renew within the hour.` — **no count and no next-attempt time**, because neither is advanced in this state and showing a stale 0 or an old timestamp would be a lie |
| `healthy` / `recovered` / `vacuous` / `infra_error`, or `watchState === null` | line does not render; the row looks exactly as it does today |

Additional guards on the count clause: `consecutiveFailures === 0` → the clause is omitted entirely (never `0 tries`); `=== 1` → `1 try`, not `1 tries`; `incidentStartedAt === null` → the clause is omitted (never `since null`).

The "since" timestamp is `raised_at`, not a `first_failure_at` column — one incident-start timestamp, already the escalation basis, so the two surfaces cannot disagree.

**Time rendering follows the established local-formatter pattern, not a shared helper** (there is none). Copy the shape of `formatStagedAt` (`components/admin/StagedReviewCard.tsx:104-113`): a module-local function calling `toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })`, with the same two contracts that function carries:

- **Non-finite parse guard.** `Date.parse` returning `NaN` renders the raw ISO string, never the literal `Invalid Date` (`StagedReviewCard.tsx:105-106`).
- **Hydration.** The timestamp renders inside `<time dateTime={iso} suppressHydrationWarning>`. Node and the browser can resolve the viewer's timezone differently on first render, so an unguarded locale string is a guaranteed hydration warning on every admin page load — the reason `StagedReviewCard.tsx:100-103` documents the same treatment. The client value is the one that matters; the SSR flash is a few ms.

**Doug — `DriveConnectionPanel`, data transport (D11).** The panel receives only `DriveConnectionHealth` (`app/admin/settings/page.tsx:130-145`), whose union carries no reconcile fields (`lib/admin/driveConnectionHealth.ts:39-57`). Critically, **that loader uses the session-scoped server client** (`lib/admin/driveConnectionHealth.ts:22-23`, `lib/admin/driveConnectionHealth.ts:97-108`) while the new table is service-role-only with SELECT revoked (§3.3) — reading the state through the existing client would return an error and degrade the whole panel to `infra_error` (R1 finding 4).

**Decision:** the state is **not** threaded through `DriveConnectionHealth`. `app/admin/settings/page.tsx` performs a separate service-role read (the same helper §3.3 defines, shared with the bell path) and passes the result to `DriveConnectionPanel` as its own optional prop `watchState: WatchSurfaceState` — the same helper and the same shape the bell uses, so the two surfaces cannot drift. The health union is unchanged, the session-client loader is untouched, and a failed state read renders the panel exactly as it renders today.

**Doug — `DriveConnectionPanel`, rendering.** The same sentence as the bell line, in the existing explainer block, under the same visibility condition as the Retry control (`health === "warn"` and `reason ∈ {watch_inactive, watch_expired}` or (`not_configured` and `folderId !== null`) — `lib/admin/driveConnectionHealth.ts:131-168`, `components/admin/settings/DriveConnectionPanel.tsx:260`). `watchState === null` → the sentence is omitted and nothing else changes.

**Developer — telemetry deep link only; no new telemetry component (D10).** The watch bell row gains a `View in telemetry ↗` link when `viewerIsDeveloper`, reusing the affordance already built for health rows (`components/admin/BellPanel.tsx:283-296`). **The existing branch cannot be reused as-is** (R1 finding 4): that link renders only under `entry.isHealth`, and `ActionCell` does not receive `viewerIsDeveloper` at all — the flag is consumed further down, for footer content (`components/admin/BellPanel.tsx:1050-1073`). So the prop is threaded into `ActionCell` (`components/admin/BellPanel.tsx:259-297`) — it already exists further down the tree (`components/admin/BellPanel.tsx:1055`), so this is a prop pass, not a new data source — and the render condition becomes `entry.isHealth || (isWatch && viewerIsDeveloper)`, with the href differing per arm: health rows keep `#health`, the watch arm points at the **unfiltered** telemetry route. The first draft proposed `?source=drive.watch`, which R2 finding 10 correctly showed would render almost nothing useful: `parseAppEventFilters` does accept the key (`lib/admin/telemetryTypes.ts:102-103`), but `loadAppEvents` applies it as an **exact** match, `.eq("source", filters.source)` (`lib/admin/loadAppEvents.ts:38`). The events a developer following this link actually wants live under four distinct source values — `drive.watch`, `drive.watch.reconcile` (`lib/drive/watch.ts:669-673`), `drive.watch.escalation` (`lib/drive/watchEscalation.ts:17`), and the new `cron.reconcile-watch` summary — so an exact filter on `drive.watch` would hide three of them.

Prefix matching is not added: `loadAppEvents` has no `.in()`/`ilike` source path today, and widening a shared telemetry filter to serve one deep link is scope this feature does not own. The link therefore lands on the telemetry page unfiltered, where the developer has the full filter UI. Stated explicitly so a later reader does not "fix" the link by adding the exact-match param back.

**No `WatchConnectionCard` or equivalent is built.** The telemetry page is a 91-line composition of an activity feed and a cron-health aside (`app/admin/dev/telemetry/page.tsx`); nothing there reads watch state today, so "surface the state columns on the telemetry page" would mean a third UI file and a third impeccable-gated surface for a developer-only view that `pnpm observe watch` already serves. The state **columns** are therefore CLI-only; the telemetry link carries the developer to the *event history*, which is the question a deep link from an alert actually answers. This keeps the impeccable dual-gate scoped to the two Doug surfaces (§4.1).

**Developer — `pnpm observe watch`.** `lib/observe/query/watch.ts` gains the state columns via a left join or a second query, keyed on `watched_folder_id`. **The `SELECT` constant at `lib/observe/query/watch.ts:9-10` must not gain the webhook-secret column** — `tests/observe/queryWatch.test.ts` scans that file for the column's snake_case literal (`lib/observe/query/watch.ts:1-5`), and the new columns must not reintroduce it. No free-text column added to the CLI output is unsanitized: `last_error_message` is redacted at write time, and the CLI applies the same `sanitizeIdentityString` treatment `queryIngestFailures` uses for `last_error_message` (`lib/observe/query/failures.ts:61`).

#### Mode boundaries


| Element | Healthy (no alert) | Watch alert, backing off | Watch alert, attempting now | Watch alert, viewer is developer |
|---|---|---|---|---|
| Retry form | — | ✓ (unchanged) | ✓ (unchanged) | ✓ |
| Next-attempt line | — | `Trying again at <time> · <n> tries since <time>` | `Trying again shortly.` | same as non-developer |
| `View in telemetry` link | — | — | — | ✓ |
| Error class / message | — | — | — | `pnpm observe watch` only (§3.7 D10); never in any UI, at any tier |

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

**The replacement strings are canonical here, not deferred to plan time** (R1 finding 9 — `AGENTS.md` invariant 7 makes the spec authoritative, so leaving shipped copy to the plan would let conforming plans ship different cadence claims). They state that retries happen automatically and back off, without naming an interval, so a future ladder change cannot re-falsify them:

| Field | New literal |
|---|---|
| `followUp` | `"Auto-retry with backoff; admin Retry now; Eric if escalated"` |
| `helpfulContext` | `"At worst, edits take a few minutes to appear instead of instantly, since the scheduled sync still runs. It keeps trying to reconnect on its own, waiting longer between attempts the longer it fails, or use Retry now. Only worth attention if it keeps failing."` |
| `longExplanation` | `"This appears when the connection that makes sheet edits show up instantly can't be set up or renewed. Shows keep syncing on the normal schedule regardless, so nothing is lost; at worst, edits take a few minutes longer to appear instead of showing up instantly. The system keeps retrying the connection on its own, waiting longer between attempts the longer it fails, and a Retry now action is available to try immediately. If it keeps failing, it gets flagged for support."` |
| `dougFacing` | unchanged (carries no cadence claim) |
| `title` | unchanged |

The two escalation-email sentences (`lib/drive/watchEscalation.ts:67`, `lib/drive/watchEscalation.ts:73`) both become: `"FXAV keeps retrying the connection on its own, waiting longer between attempts the longer it fails. An admin can also retry immediately: open the dashboard banner or Settings → Drive connection and use \"Retry now\"."`

Mechanical UI-copy gate (pre-code, applied at spec time): no em-dashes, no straight apostrophes, no invented abbreviations in any string above.

`followUp` and `helpfulContext` are x1-compared fields (`tests/cross-cutting/codes.test.ts:73-87`), so this is a **three-way lockstep in one commit**: (a) master-spec §12.4 prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (row + long-context map entry — the plan re-greps both line numbers; **never prettier the master spec**), (b) `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts`, (c) `lib/messages/catalog.ts`. `title` and `longExplanation` are catalog-only (rendered at `/help/errors`). **No new code is minted** — no 4-gate new-code surface.

**Master-spec statements this diff falsifies (invariant 7 — the spec is canonical, so these are edited, not left stale).** Two are architecture/AC prose and are therefore **outside** the three-way §12.4 lockstep, needing their own edit in the same commit:

| Location | Current claim | Falsified by |
|---|---|---|
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1320` | renewal runs `0 * * * *` "For any `active` row whose `expires_at < now() + interval '24 hours'`" | §3.2 (`RENEWAL_LIFE_FRACTION`) |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2816` | §12.4 row: "kept current by the hourly reconcile" + `followUp` "Auto-retry hourly" | §3.4 |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3333` | long-context map: "It reconnects on its own each hour" | §3.4 |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3841` | AC-6.13: "when `expires_at < now() + 24h`" | §3.2 |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1249` | schema comment: "Drive caps watch channels at ~7 days" | **factually wrong** and load-bearing here: Google caps the `files` resource at 86400s (1 day); 7 days is the `changes` resource. §3.1 |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1301-1304` | the canonical Create request enumerates `id`, `token`, `address` | §3.1 adds `expiration`, now load-bearing |

**Not falsified, verified rather than assumed** (R2 finding 11's first two bullets): the §4.3 admin-only table list and its `23 tables` count (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:637-643`), AC-2.5's repetition of those counts (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3771-3777`), `lib/audit/admin-tables.generated.ts`, and `tests/db/admin-rls-runtime.baseline.json` are **all unchanged**, because the new table is fully private rather than admin-only (§3.3). The check that settles it: `show_share_tokens` is fully private under the identical lockdown shape and appears in none of those four surfaces — `grep` returns zero hits in each.

§5.5 gains a short subsection documenting the dedicated reconcile job — nothing in the master spec currently describes reconcile as a distinct cron (the 2026-07-01 design added it inside the refresh route without amending §5.5). **§5.5.6 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1323-1331`) is the GC cron (`15 * * * *`) and is genuinely unchanged** — stated so its absence from the edit list is not read as an oversight.

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
| Read path | reconcile step 3; observe CLI; the shared service-role helper feeding both Doug surfaces | `hasLiveActiveChannel` (widened to return `created_at`), `listExpiringActive` (+`created_at`) | `readUnresolvedWatchAlert` (+`raised_at`, +`last_seen_at`) | N/A | BellPanel, DriveConnectionPanel |
| Write path | reconcile per §3.3a; admin retry (`next_attempt_at` only). **`refreshWatchSubscriptions` is NOT a writer** — condition (b) is derived (§3.4a) | unchanged | unchanged | N/A | N/A |
| Trigger fn | N/A — no propagation trigger needed | N/A | N/A | N/A | N/A |
| Cleanup fn | N/A — one row per folder, unbounded growth impossible | `gcWatchChannels` unchanged | 60-day `app_events` prune unchanged | N/A | N/A |
| Cron registration | N/A | N/A | N/A | **New** job + route (§4.3) | N/A |
| Tests | §6 | §6 | §6 | §6 | §6 |

### 4.2 CHECK / enum matrix

| Constraint | Accepted values | Source of truth | NULL | Apply-twice |
|---|---|---|---|---|
| `…_error_class_check` | `config`, `drive_api`, `db` | `WatchErrorClass` (`lib/drive/watchErrors.ts:5`) — all three enumerated, none omitted | allowed (no failure recorded yet) | table is `create table` in a one-shot migration; re-apply guarded by `if not exists` |
| `…_outcome_check` | `healthy`, `recovered`, `still_orphaned`, `renewal_failing`, `vacuous`, `infra_error`, **`backoff_waiting`** | `ReconcileOutcome` (`lib/drive/watch.ts:626-632`) + the new arm | allowed (never reconciled yet) | same |
| `…_failures_nonneg` | `>= 0` | — | not-null column | same |

**Apply-twice idempotency, stated precisely** (R2 finding 9): the DDL is a bare `create table`, so the migration is **not** idempotent and is not claimed to be — it is a one-shot forward migration applied exactly once per environment, like every other `create table` migration in `supabase/migrations/`. The earlier draft's "guarded by `if not exists`" claim contradicted its own DDL and is withdrawn. The REVOKE/GRANT statements that follow it *are* naturally idempotent. The surgical validation apply (§4.3) runs the file once; re-running it fails loudly on the duplicate relation, which is the intended signal.

**Transitional window:** none. This is a new table, so there is no old-value/new-value window and no `tables/`-runs-before-`migrations/` hazard. A structural meta-test pins both CHECKs against their TypeScript unions so a future union member cannot land without the CHECK (§6.1).

### 4.3 Cron registration fan-out

Every surface that must learn about `reconcile-watch`, each verified to exist at the cited line. **The last two were missing from the first draft** (R1 finding 6) and are the two that fail *silently as a red suite* rather than as a missing registration, which is why the inventory is re-derived by grep at plan time rather than trusted:

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
| `tests/cross-cutting/pg-cron-coverage.test.ts:53-56` | **`SCHEDULE_MIGRATION_PATHS` is a hard-coded two-file list** and the suite requires every canonical JSON job to appear in that corpus (`tests/cross-cutting/pg-cron-coverage.test.ts:144-160`). A third scheduling migration is invisible to it — add the new file to the list |
| `tests/admin/loadCronHealth.test.ts:59-79` | **hard-codes nine jobs across four assertions** (`toHaveLength(9)` × 4). Every count becomes ten |
| `tests/cron/runSummary.test.ts:11-33` | two literal-nine assertions (`toHaveLength(9)`, `new Set(names).size).toBe(9)`) in addition to the cadence-map entry |
| `tests/cron/cronJobsParity.test.ts:29-40` | a literal-nine assertion (`pgNames.size).toBe(9)`) in addition to the new route→jobname pairing row |
| `tests/cron/refreshWatchRoute.test.ts` | **24 `reconcile` references — the file is built end to end around refresh invoking reconcile.** Splitting the routes rewrites it: the reconcile assertions move to a new `reconcileWatchRoute` spec and the refresh spec asserts reconcile is NOT called |
| `tests/api/cron-sync.test.ts:143-186` | 4 `reconcile` references; the refresh-route case mocks and expects `reconcileWatchChannels` |
| `tests/cron/cronRouteSummaries.test.ts:94-123` | the existing refresh-watch summary assertion expects reconcile counts; adding a new-route case does not update it |
| validation project `vzakgrxqwcalbmagufjh` | surgical apply of both migrations + `notify pgrst, 'reload schema'` — or `validation-schema-parity` fails |

**Invariant 10 (mutation-surface observability): N/A by contract.** The new route exports `GET` only; the meta-test covers `POST`/`PUT`/`PATCH`/`DELETE` handlers and `"use server"` actions. The route is nonetheless instrumented — `runCronRoute` emits a code-carrying `CRON_RUN_SUMMARY` — so it is not a dark surface. No `AUDITABLE_MUTATIONS` row, no `KNOWN_UNINSTRUMENTED` row, no `// no-telemetry:` comment.

**Invariant 9 (Supabase call boundaries):** every new helper destructures `{ data, error }`, distinguishes returned-error from thrown-error, and surfaces infra faults as discriminable typed results. New boundaries: the state read, the state upsert (three callers), and the widened `readUnresolvedWatchAlert`. Registry rows go in `tests/sync/_metaInfraContract.test.ts` — the registry that already owns the `lib/drive/watch.ts` lifecycle helpers and `readUnresolvedWatchAlert`'s row (`lib/drive/watchEscalation.ts:25-26` names it).

### 4.4 Flag lifecycle

| Flag / field | Storage | Write path | Read path | Effect on output |
|---|---|---|---|---|
| `next_attempt_at` | new table | reconcile steps 5/7; admin retry action | reconcile step 6 gate; BellPanel; DriveConnectionPanel; observe CLI | suppresses the subscribe attempt while in the future; renders the Doug line |
| `consecutive_failures` | new table | reconcile step 7 (`+1` / reset 0) | ladder index in step 7; Doug line | selects the backoff wait; renders the try count |
| *(no renewal-timestamp columns)* | — | — | — | condition (b) is derived from `admin_alerts.last_seen_at` vs the live channel's `created_at` (§3.4a); deliberately **not** stored |
| `last_error_class` / `last_error_message` | new table | reconcile step 7 failure arm, from the widened `SubscribeResult` (§3.3); **cleared to null** on `healthy`/`recovered` | observe CLI | developer diagnosis only — never rendered to Doug |
| `last_outcome` | new table | every reconcile terminal path **that has resolved a folder id** (§3.3a) | observe CLI | diagnosis only |
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

**Vitest project placement is load-bearing.** `vitest.projects.ts:92-95` puts `tests/drive/**` and `tests/cron/**` in the **PARALLEL (DB-free)** project, which the `unit-suite-nodb` CI job runs on a runner with no Supabase and no psql — a DB-touching file added to those directories fails immediately, by design (`vitest.projects.ts:22-29`). Therefore: classes 1, 2, 6, 7, 8, 9, 10 are deps-injected and DB-free and belong in `tests/drive/**` or `tests/cron/**`; classes 3, 4, 5 touch a real database and MUST live under `tests/db/**` (serial). Classes 11, 12 are component tests (`tests/components/**`, parallel). Class 13 extends `tests/observe/**`. Every new file's directory is named in the plan, and the `vitest-projects-partition` meta-test pins that each lands in exactly one project.

1. **Constants, ladder, and the §2.1a timing invariants.** `BACKOFF_MAX_MS === BACKOFF_LADDER_MS.at(-1)`. **I1 asserted over a grant table** (`1m`, `1h`, `2h`, `6h`, `24h`, and the exact `RENEWAL_MIN_LEAD_MS` boundary), each computed through the implementation's own `L(G)` and compared against `REFRESH_PERIOD_MS`. **The ladder expectation is an independent literal table**, not derived from `BACKOFF_LADDER_MS` — the first draft derived expected waits from the array under test, so an incorrect ladder satisfied both the index test and the `.at(-1)` identity (R1 finding 7). The table is written out as `[[1, "15m"], [2, "30m"], [3, "1h"], [4, "2h"], [5, "2h"], [6, "2h"]]` in human units and converted in the test, so a ladder edit must be consciously mirrored. *Catches:* a constant edit that lets renewal be sampled after expiry; a silently reordered or rescaled ladder.
2. **`defaultWatchFolder` expiration.** Request body carries `expiration` as a **string of milliseconds** equal to `injectedNow + WATCH_TTL_MS` (derived from the constant, not a literal); a Drive response with a *shorter* expiration is stored verbatim; a response with a past expiration is stored verbatim (the §3.2 predicate, not this function, decides due-ness). *Catches:* sending seconds instead of milliseconds — the most likely silent mistake, which would request an expiry 46 years in the past.
3. **Renewal predicate, real DB** (`tests/db/**`). The §3.2 grant table, each row's due-ness derived from its own `created_at`/`expires_at` and the constants, never wall-clock literals: a 24h grant not-due at 17h and due at 19h; a 6h grant due via the floor at 4h; a 1h grant due immediately; `expires_at <= created_at` due immediately. **No `expires_at is null` fixture** — `drive_watch_channels_active_requires_drive_state` makes that row unconstructible for `status='active'` (`supabase/migrations/20260501001000_internal_and_admin.sql:298-300`), and the first draft specified a test that could not be written (R1 finding 7). **Negative control:** the same table run against a deliberately-broken predicate that drops the `greatest(…)` floor must fail on the 1h and 6h rows — asserted by extracting the predicate into a pure SQL-building helper and passing the broken variant. *Catches:* boundary direction, and a floor-less regression that would silently reintroduce sampling-after-expiry.
4. **State table, real DB.** CHECK rejects an out-of-union `last_error_class` and `last_outcome`; rejects negative `consecutive_failures`; the upsert increments against the **stored** value (two sequential upserts from a stale in-memory `0` still yield `2`); PostgREST `INSERT`/`UPDATE`/`DELETE` as `authenticated` and `anon` are rejected with SQLSTATE 42501 via the `RPC_GATED_TABLES` registry row. *Catches:* the read-modify-write regression the atomic-upsert contract exists to prevent, and a missing REVOKE.
5. **Structural meta-test: CHECK ↔ union parity.** TypeScript type aliases are erased and cannot be imported at runtime (R1 finding 7 — the first draft asserted against `WatchErrorClass` and `ReconcileOutcome` as if they were values). **Prerequisite refactor, in the same task:** both unions become runtime `as const` arrays with the type derived from the array, not the reverse —

```ts
export const WATCH_ERROR_CLASSES = ["config", "drive_api", "db"] as const;
export type WatchErrorClass = (typeof WATCH_ERROR_CLASSES)[number];
```

— and identically for `RECONCILE_OUTCOMES` / `ReconcileOutcome`. The type stays structurally identical, so no consumer changes. The meta-test then parses both CHECK value lists out of the migration text and asserts **set equality in both directions** against the imported arrays. *Catches:* a new outcome arm landing without the CHECK (a runtime insert failure no unit test would see) **and** the inverse one-sided addition. **Negative control:** the test is run against a fixture migration string with one extra CHECK value and one missing, asserting it fails both ways.
6. **Reconcile unit tests** (deps-injected, extending `tests/drive/watch.test.ts:664`). Backoff gate: `next_attempt_at` in the future → outcome `backoff_waiting`, **zero** subscribe calls, **and** the auto-resolve path still reached when the channel is healthy, **and** the escalation check still invoked. Ladder advance on failure; reset on success; `renewal_failing` advances **nothing**. Condition (b) per §3.4a: alert `last_seen_at` newer than the live channel's `created_at` → not resolved, no second subscribe; no unresolved alert → renewal-clean; channel newer than the last bump → resolves. (The exhaustive divergence cases are class 16.) State-read failure → `state_read` fault → `infra_error`; state-write failure → `state_write` fault but the cycle's other work is preserved. *Catches:* the resolve-defeats-renewal-alert class (2026-07-01 R4-1) regressing through the in-memory→durable port; backoff silently suppressing auto-resolve or escalation; double-counting refresh's failure against reconcile's ladder.
7. **`refreshWatchSubscriptions` is asserted NOT to write state.** R2 finding 9: the previous draft of this class still required refresh to write one of two renewal timestamps — columns D4 and §3.3 had already deleted — making the requirements mutually exclusive. The class is inverted: a spy on the state-write transport asserts **zero** calls from any refresh path, including the `list_expiring` `"*"` failure. Per-row isolation (existing behavior — one folder's failure does not abort the rest) is retained and re-asserted. *Catches:* a partial revert to the bookkeeping design, and the loop-abort regression.
8. **Escalation duration trigger.** Fires at `raised_at` age ≥ `ESCALATION_AFTER_MS` regardless of `occurrence_count` (including `occurrence_count = 1`); does **not** fire below it (including at high `occurrence_count` — the specific regression the change exists to create); config-class fires at age 0; future `raised_at` does not fire. Ages derived from `ESCALATION_AFTER_MS` ± 1 minute. The shipped guard-read / recheck / guard-write / send ordering assertions (`tests/drive/watchEscalation*.test.ts`) must still pass **unmodified** except for fixtures gaining `raised_at` — an assertion in that ordering suite that needs rewriting is a signal the change leaked past its intended surface. *Catches:* re-coupling escalation to cadence; and the fired-once guard being consumed by the refactor.
9. **Anti-tautology guard on the retired constant.** A source scan asserting zero occurrences of `ESCALATION_THRESHOLD` outside its own deletion. *Catches:* a partial retirement leaving a dead export that a future reader takes as live.
10. **Route tests.** New reconcile route: 200 for `backoff_waiting` / `still_orphaned` / `renewal_failing` / `vacuous` (handled degradation must not page every 15 minutes); 500 + summary `outcome: "infra"` for **every** fault name in the §3.4 inventory including the two new ones; body shapes asserted. Refresh route: no longer returns `reconcile`, and `reconcileWatchChannels` is **not called** (spy assertion, not body inspection — the body could omit the field while the call still happens). *Catches:* the silent-200-on-infra-fault class, and a half-finished split leaving reconcile running twice per hour.
11. **BellPanel component tests.** Line renders with future `next_attempt_at`; renders the "shortly" variant when past-due and when null; omits the count clause at 0; singular at 1; **absent entirely with no state row**; never renders `last_error_class` or `last_error_message` — asserted by scanning the rendered tree for the fixture's error-class and message strings after cloning and removing nothing (they must appear nowhere at any tier). Developer link renders only when `viewerIsDeveloper`. **Anti-tautology:** assert against the state fixture's values, not against a container that also renders the alert's own copy; derive the expected formatted time from the fixture timestamp through the same formatter, never a hardcoded string.
12. **DriveConnectionPanel tests.** Line present for `watch_inactive` / `watch_expired` and for `not_configured` with `folderId !== null`; absent for `not_configured` with `folderId === null` and for positive/`sync_*`/`stale_*`/`infra_error`. Mirrors the shipped Retry-visibility test split.
13. **observe CLI.** `pnpm observe watch` surfaces the state columns; the structural secret-scan pin (`tests/observe/queryWatch.test.ts`) still passes; `last_error_message` goes through the sanitizer. *Catches:* the webhook secret being reintroduced into the SELECT while adding columns.
14. **x1 catalog parity.** `pnpm test:audit:x1-catalog-parity` green after the §3.8 lockstep.
15. **Meta-tests verified, not assumed:** `_metaAdminAlertCatalog` (producer stays `lib/drive/watch.ts`), `_metaAdminAlertProducer` (no new raw `admin_alerts` writes), `_metaMutationSurfaceObservability` (GET route → no row required, asserted by running it), `postgrest-dml-lockdown` bidirectional discovery, `validation-schema-parity` both layers.
16a. **Classification decision table** (`tests/drive/**`, deps-injected). All **eight** cells of §3.4b step 5 as executable cases, each asserting outcome, whether subscribe was called, and whether the ladder moved. The `live + renewalFailed + future next_attempt_at` cell is named explicitly — it is the cell R2 finding 4 showed the first control flow got wrong, returning `backoff_waiting` for a live channel. *Catches:* any reordering that re-gates live channels on the ladder.

16b. **Resolve compare-and-set race** (`tests/db/**`, real DB). Reconcile reads healthy; a renewal failure commits a fresh sighting (bumping `last_seen_at`); reconcile then attempts its CAS resolve. Assert: **zero rows affected**, the newly-raised alert remains unresolved, and the cycle reports `renewal_failing` rather than `healthy`. Second case: no interleaving → CAS affects exactly one row. *Catches:* R2 finding 1's erasure class — the failure vanishing and escalation never starting. A negative control runs the same interleaving against the unconditional `resolveAdminAlert` and asserts it *does* erase the alert, proving the test discriminates.

16c. **`activated_at` vs `created_at`** (`tests/db/**`, real DB). The R2-finding-2 interleaving: insert pending A at T0, bump the alert at T1, activate A at T2. Assert the predicate classifies healthy. Negative control: the same fixture evaluated against a `created_at`-based predicate must classify `renewal_failing`, proving the fixture actually discriminates between the two columns. Plus the equal-timestamp boundary (`last_seen_at === activated_at` → healthy). *Catches:* silently reverting to `created_at`, which no single-threaded test would notice.

16d. **State write transport, concurrency** (`tests/db/**`, real DB). Two concurrent writers through the `WatchTx` method against the same folder both taking the increment arm → final `consecutive_failures === 2`, and each caller's `returning` value reflects the row it wrote. *Catches:* R2 finding 8 — an implementation that reads then writes, or one routed through a PostgREST upsert that cannot express the increment at all.

17. **Condition-(b) transition table** (`tests/drive/**`, deps-injected). Every row of the §3.4a divergence table asserted as an executable case: `"*"`-then-clean-cycle, folder switch, admin-Retry recovery, onboarding-finalize recovery, state-write fault, and attempt-nothing cycle. Each fixture sets `alert.last_seen_at` and the live channel's `created_at` explicitly and asserts the resulting outcome and whether `resolveAdminAlert` was called. *Catches:* the exact five-state divergence class R1 finding 2 identified, pinned so a future refactor back to bookkeeping cannot pass.

17. **Production data-path integration** (`tests/db/**` + `tests/components/**`). Real `drive_watch_reconcile_state` rows read through the **actual** loaders — `lib/admin/bellFeed.ts` and the `app/admin/settings/page.tsx` service-role read — asserting the values reach `BellEntry.watchState` and the `DriveConnectionPanel` prop respectively, plus the failure arm (state read errors → `watchState: null`, feed and panel still render). *Catches:* R1 finding 4's class exactly — component fixtures passing while production never supplies the field, and the session-client privilege error degrading the Settings panel.

18. **Doug copy per outcome** (`tests/components/**`). One rendered case per §3.7 row: `still_orphaned` with a future attempt; `still_orphaned` past-due; `backoff_waiting`; `renewal_failing` (asserting **no** count and **no** next-attempt time appear — the R2-finding-6 lie); each `healthy`-family outcome and `watchState === null` (line absent). Plus the count-clause guards (0 omitted, 1 singular, null `incidentStartedAt` omits the clause). Anti-tautology: the `renewal_failing` assertion scans the cloned subtree with the alert's own copy removed, so a count appearing anywhere in the row fails.

19. **`incidentStartedAt` provenance** (`tests/db/**` + `tests/components/**`). Fixture where `raised_at` and `last_seen_at` are deliberately hours apart; assert both surfaces render the value derived from `raised_at`, and that it equals the timestamp the escalation predicate uses. *Catches:* R2 finding 5 — the bell silently rendering the most recent bump as the incident start.

20. **Live validation probe (pre-merge).** After the migrations are applied surgically to validation, `pnpm observe watch --env validation` shows the new columns and the next renewal produces a 24h `expiresAt`. Mocked-only review of a cadence/lease change invites a tautological APPROVE; this is the live-integration leg.

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
- **The lease fix and the cadence change are independent.** Neither is a prerequisite for the other's correctness; they ship together because they are calibrated against each other by the §2.1a timing invariants, not because either is blocked on the other.
- **`backoff_waiting` still resolves and still escalates.** Only the subscribe attempt is suppressed (§3.4 step 6). A reviewer reading "backoff" as "skip the cycle" is reading a bug that is not there — and the §6.6 test asserts it.
- **The ladder is not charged for refresh's failures.** `renewal_failing` advances `last_outcome` only (§3.4 step 7). Reconcile made no attempt in that state.
- **Two crons, one row, no lock.** Deliberate (§1.1a-5). Every write is a single atomic statement; the increment is evaluated by Postgres against the stored row. The minute choice (§3.4) means the two jobs never coincide under normal scheduling anyway — that is defence in depth, not the primary mechanism.
- **`raised_at`, not a new `first_failure_at` column.** The state table deliberately does not carry an incident-start timestamp: `admin_alerts.raised_at` already is one, is preserved across dedup bumps (verified against the RPC body), and using one timestamp for both the escalation trigger and the Doug line makes the two surfaces incapable of disagreeing.
- **Condition (b) is derived, not stored — and that is the point.** The first draft stored two renewal timestamps and compared them across writers; R1 findings 2, 3 and 5 were all downstream of that one choice. The alert-vs-channel-age predicate (§3.4a) is self-clearing for every channel creator, including ones this feature never touches (admin Retry, onboarding finalize). A reviewer proposing to "just store the renewal outcome" is proposing the design this spec replaced.
- **`renewal_failing` does not spin unbounded.** With a 24h grant renewed at 6h remaining, a failing renewal gets ~6 hourly refresh attempts while reconcile runs 4x/hour doing only sweep, auto-resolve and escalation checks — no Drive traffic, no ladder movement. If the lease finally expires, `live` flips false, the outcome becomes `still_orphaned`, and the ladder starts. Every state has an exit.
- **The ladder never runs while a channel is live** (§2.1a I2). That is what makes the backoff cap a non-constraint rather than a race against expiry.
- **`occurrence_count` is not deleted.** It remains on the alert row, in the escalation guard context, and in the Sentry payload. It stops being the *trigger*; it does not stop being *evidence*.
