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
| D4 | Condition (b) transport | **Neither stored nor derived — made explicit.** The transaction that activates a channel resolves the alert; the transaction that fails raises it. Condition (b) is then just "does an unresolved alert exist" (§3.4a). |
| D5 | Backoff | Exponential ladder, running **only** when no live channel exists (§2.1a I2), so its cap never races an expiry. |
| D6 | Escalation trigger | Duration since `admin_alerts.raised_at`, or immediate on `error_class === "config"`. |
| D7 | Surfacing | Split by field (§3.7). |
| D8 | Ship mode | Autonomous through merged PR. |
| D9 | Bell-feed state transport | A single-table service-role read of `drive_watch_reconcile_state` in `lib/admin/bellFeed.ts`, joined in TypeScript; `get_bell_feed_rows` is **not** widened, and no cross-table join is needed (§3.7). |
| D10 | Developer surfacing | A filtered deep link into the existing telemetry activity feed. **No new telemetry component**; the state columns are `pnpm observe watch`-only (§3.7). |
| D11 | Settings state transport | A separate service-role read in `app/admin/settings/page.tsx`, passed as its own prop. The `DriveConnectionHealth` union and its session-scoped loader are untouched (§3.7). |

### 2.1 Named constants (single source of truth)

Every later section references these **names**, never the literals. All live in `lib/drive/watchErrors.ts` alongside the existing `STALE_PENDING_MAX_AGE_MS` (`lib/drive/watchErrors.ts:9`).

- `WATCH_TTL_MS` = **86_400_000** (24h) — requested channel lifetime; Google's documented maximum for the `files` resource.
- `RENEWAL_LIFE_FRACTION` = **0.75** — the *proportional* part of the renewal trigger: a channel is due once 75% of its granted life has elapsed.
- `RENEWAL_MIN_LEAD_MS` = **7_200_000** (2h) — the *absolute floor* on remaining life at which a channel becomes due. Exists because the proportional term alone is unsafe on short grants (§3.2).
- `REFRESH_PERIOD_MS` = **3_600_000** (1h) — how often the renewal predicate is sampled (`fxav_cron_refresh_watch`, `'0 * * * *'`).
- `T_EXEC_BUDGET_MS` = **60_000** (1m) — an upper bound on one refresh run's execution time before it reaches a given row. Appears only in the §2.1a I1 boundary and the short-grant anomaly check; it is a safety margin, not a timeout.
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

  - **`G > REFRESH_PERIOD_MS + T_exec` → guaranteed**, where `T_exec` bounds one refresh run's execution time. Worst-case phase is a channel activated one instant *after* the current tick has already read its candidate list: it is not examined until the next tick, `REFRESH_PERIOD_MS` later, plus that run's own execution time before it reaches this row. The margin is `G - REFRESH_PERIOD_MS - T_exec`, and the guarantee needs it strictly positive. **Equality is therefore NOT safe** (R3 finding 7): a channel granted exactly `REFRESH_PERIOD_MS` and activated just after a tick expires at — or fractionally before — the next examination. For the 24h grant we request the margin is ~23h and the point is academic; it matters because admin Retry (`app/admin/actions.ts:326`) and onboarding finalize activate at arbitrary phase, so the boundary must be stated over phase rather than assumed away.
  - **`G <= REFRESH_PERIOD_MS + T_exec` → not maintainable by this sampler.** The anomaly arm below covers this whole range, not just `G < REFRESH_PERIOD_MS` — the earlier draft excluded exactly the unsafe equality case.
  - **`G <= REFRESH_PERIOD_MS + T_EXEC_BUDGET_MS` → not maintainable by any sampler on this cadence.** A lease no longer than the interval between examinations (plus one run's execution time before it reaches the row) cannot be reliably renewed; the only fixes are a faster sampler or a longer lease. **The bound is `<=`, not `<`** (R3 finding 7): the earlier draft excluded exactly the unsafe equality case, where a channel granted precisely one period and activated just after a tick expires at the next examination rather than strictly before it. This is **not** a state the system can be correct in, so it is treated as an anomaly rather than papered over: `subscribeToWatchedFolder` compares the granted lifetime against `REFRESH_PERIOD_MS + T_EXEC_BUDGET_MS` (`T_EXEC_BUDGET_MS` = 60_000, a named §2.1 constant) and, when the grant does not exceed it, emits `log.error` with `code: "DRIVE_WATCH_GRANT_TOO_SHORT"` carrying the granted milliseconds. We request 24h and Drive's documented floor for an unspecified request is 1h, so this should be unreachable; if it ever fires, the cadence design needs revisiting rather than the channel.

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

**Writes go through the postgres transaction port, not PostgREST** (R2 finding 8). A column-relative increment cannot be expressed through a PostgREST upsert, so classifying this writer as a Supabase `{ data, error }` boundary was incoherent. The two statements in §3.3a are **`WatchTx` methods carrying raw SQL**, exactly like every other watch mutation (`lib/drive/watch.ts:129-175`), invoked through `callWatchTx` so they inherit the `DriveWatchInfraError` contract. Invariant 9 treatment follows the pg-port precedent, not the PostgREST-boundary precedent; the registry row says so explicitly.

#### 3.3a State writes: two explicit statements, never a preserve-upsert

R1 finding 5 asked for total postconditions; R2 finding 7 showed a per-branch matrix cannot be total; R3 findings 3 and 4 showed the single omni-upsert that replaced it was **both** unimplementable as written (its `on conflict` clause overwrote every column it claimed to preserve, and `st.` is unbound on the INSERT path) **and** semantically wrong (routing every unrelated fault into an `infra_error` arm that preserved state meant a persistent email or guard fault could hold `consecutive_failures` at zero forever — retrying every 15 minutes, the exact call storm this feature exists to prevent).

Both defects have the same cause: one statement trying to express "sometimes increment, sometimes reset, sometimes change nothing." The fix is to stop expressing "change nothing" in SQL at all.

**There are exactly two state-write statements, each with a fixed column list, and a cycle calls at most one of them.**

```sql
-- (A) recordAttemptFailure(folderId, ladderMs, errorClass, errorMessage)
insert into public.drive_watch_reconcile_state as st
       (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
        last_outcome, last_error_class, last_error_message, updated_at)
values ($1, 1, now(), now() + ($2 || ' milliseconds')::interval,
        'still_orphaned', $3, $4, now())
on conflict (watched_folder_id) do update
   set consecutive_failures = st.consecutive_failures + 1,
       last_attempt_at      = now(),
       next_attempt_at      = now() + (public.watch_backoff_ms(st.consecutive_failures + 1)
                                       || ' milliseconds')::interval,
       last_outcome         = 'still_orphaned',
       last_error_class     = excluded.last_error_class,
       last_error_message   = excluded.last_error_message,
       updated_at           = now()
returning consecutive_failures, next_attempt_at;

-- (B) recordAttemptSuccess(folderId)
insert into public.drive_watch_reconcile_state as st
       (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
        last_outcome, last_error_class, last_error_message, updated_at)
values ($1, 0, now(), now(), $2, null, null, now())
on conflict (watched_folder_id) do update
   set consecutive_failures = 0,
       last_attempt_at      = now(),
       next_attempt_at      = now(),
       last_outcome         = excluded.last_outcome,
       last_error_class     = null,
       last_error_message   = null,
       updated_at           = now()
returning consecutive_failures, next_attempt_at;
```

Notes that close the R3 finding 4 defects specifically:

- **The INSERT path carries literals, not `st.` references.** (A) inserts `consecutive_failures = 1` — the first failure for a folder with no prior row is failure number one, not zero. An implementation that inserted `0` would render "0 tries" and misindex the ladder.
- **The ladder is computed in SQL, not passed in, on the conflict path.** `watch_backoff_ms(n)` is a small `immutable` SQL function created by the same migration, mirroring `BACKOFF_LADDER_MS`. Passing a precomputed interval would require the caller to know the post-increment count, which it cannot without a read — reintroducing the read-modify-write. A parity test asserts the SQL function and the TypeScript constant agree at n = 1..8.
- **No statement has a "preserve" cell**, so no concurrent increment can be clobbered by a stale rewrite.
- **`returning`** feeds `ReconcileResult`, so no reported number is one the database did not accept.

**When each runs.** The write is positioned after the outcome is final, and **only these outcomes write at all**:

| Outcome | Statement | Rationale |
|---|---|---|
| `recovered`, `healthy` | (B) | a working channel is the definition of a reset |
| `still_orphaned` | (A) | an attempt happened and failed |
| `renewal_failing`, `backoff_waiting`, `vacuous`, every `infra_error` | **none** | no attempt was made this cycle, so there is nothing to record |

**Faults do not suppress the attempt record (R3 finding 3).** The `faults` array determines the route's HTTP class and nothing else. If a subscribe attempt completed — succeeded or failed — its (A)/(B) write executes and its result stands, *even when a later step faults*. Concretely: `alert_resolve_write`, `guard_read`, `guard_write`, `pref_read`, `recipients_read`, `email_send`, `escalation_helper`, and escalation-time `alert_row_read` all occur **after** the attempt is recorded and cannot erase it. `pending_sweep` occurs before and likewise does not suppress it. The route still reports 500; the ladder still advanced. That separation is the whole point: a persistently broken email sender must not be able to pin the retry ladder at zero.

The only faults that prevent a write are the two state-boundary faults themselves (`state_read`, `state_write`), where writing is either impossible or already failed, plus the no-folder paths where there is no key to write under (`vacuous`, `folder_read`, and the no-folder alert-resolve failure at `lib/drive/watch.ts:696-712`).

**Guard conditions.**
- No row yet → (A) inserts with `consecutive_failures = 1`; (B) inserts with `0`.
- Folder switched → new PK, fresh row. The old row is left in place (a folder switch is rare, the row is a handful of bytes) — stated so it is not filed as a leak.
- `consecutive_failures` beyond the ladder length → `watch_backoff_ms` clamps to the last entry.

### 3.4 Reconcile moves to its own route and cron

**New route** at app/api/cron/reconcile-watch/route.ts (does not exist yet), structurally a copy of the existing refresh-watch route (`app/api/cron/refresh-watch/route.ts`): `rejectUnauthorizedCron` guard (`app/api/cron/_auth.ts:3`), then `runCronRoute("reconcile-watch", …)` (`lib/cron/withCronRunSummary.ts`).

**New job** `fxav_cron_reconcile_watch` at `'7,22,37,52 * * * *'`. Minute choice is load-bearing: the two `*/5` jobs (`fxav_cron_sync`, `fxav_cron_notify_realtime`) already claim **every** multiple of 5, `fxav_cron_gc_watch` holds minute 15 and `fxav_cron_diagram_gc` holds minute 30. Minutes 7/22/37/52 collide with none of them, and specifically never with refresh-watch at minute 0.

**`refreshWatchSubscriptions` and `reconcileWatchChannels` are decoupled.** The refresh-watch route stops calling reconcile; its response body and summary lose `reconcile`, `sweptPending`, and `escalated`, keeping `refreshed` / `refreshOrphaned` / `refreshFailures`. `reconcileWatchChannels` loses its `refresh: RefreshResult` first parameter and becomes `reconcileWatchChannels(deps: ReconcileDeps = {})`.

#### 3.4a Condition (b): success clears its own alert

Three adversarial rounds found race and consistency defects on this one surface (R1 finding 2; R2 findings 1, 2; R3 findings 1, 2, 5, 8). Under the repo's three-round rule for design-correctness vectors, the response is not another prose patch — it is to remove the premise all three rounds were attacking.

**The bad premise.** Every prior draft tried to *infer* "has a renewal failed since we last had a working channel?" by comparing a **global, folder-agnostic** alert row against channel timestamps, from a process that neither wrote. `WATCH_CHANNEL_ORPHANED` is unique per `(null show_id, code)` (`supabase/migrations/20260501001000_internal_and_admin.sql:279-280`), carries no folder column, and has its context replaced on every bump — so any inference over it is (a) racy against writers in another process, (b) blind to which folder failed, and (c) dependent on `last_seen_at` being a complete version, which R3 finding 5 showed it is not.

**The replacement.** Make the fact explicit instead of inferring it. `activateWithTx` — the **single** activation-success chokepoint, which `lib/drive/watch.ts:462-471` already documents as the funnel for "initial subscribe, refresh renewal, reconcile recovery, admin manual-retry" — resolves `WATCH_CHANNEL_ORPHANED` **in the same transaction that flips the channel to `active`**:

```sql
update public.admin_alerts
   set resolved_at = now()
 where show_id is null and code = 'WATCH_CHANNEL_ORPHANED' and resolved_at is null
```

Failure continues to raise through `markWatchOrphanedWithTx` in the failing transaction (`lib/drive/watch.ts:437-450`), exactly as today. The two are now symmetric: **the transaction that succeeds clears the alert; the transaction that fails raises it.**

Condition (b) therefore stops being a computation and becomes a lookup:

```
renewalFailed = an unresolved WATCH_CHANNEL_ORPHANED row exists
```

No timestamp comparison. No `created_at` versus `activated_at` question (R3 finding 8 — the five stale references are deleted rather than corrected, because the predicate they belonged to no longer exists). No compare-and-set, because reconcile no longer resolves anything it did not itself just succeed at. No read-to-resolve window in the admin Retry path (R3 finding 1), because that action stops calling `resolveAdminAlert` altogether — its subscribe's own activation transaction does the resolving, atomically.

**What each prior finding becomes:**

| Finding | Status under the new model |
|---|---|
| R2-1 / R3-1 (read-to-resolve erasure, admin and reconcile) | **Gone.** Nothing resolves after a read. Resolution is a side effect of a committed success. |
| R2-2 / R3-8 (`created_at` vs `activated_at`) | **Gone.** No timestamp participates in the predicate. |
| R3-5 (`last_seen_at` is not a complete version) | **Gone.** No version comparison exists. |
| R1-2 states 1-5 (bookkeeping divergence) | **Gone.** No bookkeeping. |
| R3-2 (folder-switch alert scoping) | **Reduced and bounded** — see below. |

**R3 finding 2, honestly scoped.** The alert is global while channels are per-folder, and `refreshWatchSubscriptions` renews every active channel without consulting `app_settings` (`lib/drive/watch.ts:196-210`), while folder promotion supersedes nothing (`app/api/admin/onboarding/finalize-cas/route.ts:779-804`). So an *old* folder's renewal failure can raise the global alert after the new folder is healthy. **This is a pre-existing defect of the global-alert design, not one this diff introduces** — the shipped reconcile has the same exposure through the same global row. Two things change it for the better here: a successful current-folder activation now *clears* the alert (previously only reconcile's inferential path did), so the state self-corrects within one refresh cycle instead of persisting; and the failure is no longer able to pin a *derived* per-folder state machine, because there is no longer a derived per-folder state machine. Full remediation means either scoping the alert per folder or having refresh skip non-configured folders — both are behavior changes beyond this scope, filed as `BL-WATCH-ALERT-FOLDER-SCOPE`. Stated here so a reviewer does not read the residue as unnoticed.

**Guard conditions.**
- The in-transaction resolve is a raw-SQL `update` through the existing tx port, not `resolveAdminAlert`. Precedent: `resolveStaleWebhookTokenInvalid` already updates `admin_alerts` from this port (`lib/drive/watch.ts:281-296`), so `_metaAdminAlertProducer` sees no new writer class.
- Resolving zero rows (no unresolved alert) is the normal case and is not an error.
- The existing stale-`WEBHOOK_TOKEN_INVALID` sweep is unchanged and stays where it is.
- A rollback of the activation transaction rolls back the resolve with it. That is the point.

#### 3.4b Steps

Deltas from the shipped `reconcileWatchChannels` (`lib/drive/watch.ts:649-815`) are marked.

1. **Stale-pending sweep** — unchanged (`lib/drive/watch.ts:658-677`), still silent, still zero `admin_alerts` writes.
2. **Configured folder** via `getActiveWatchedFolder()` — unchanged (`lib/drive/watch.ts:685-713`). `no_folder_configured` → vacuous: resolve both alerts unconditionally (there is nothing to watch, so a lingering alert is stale by definition) and return without a state write.
3. **Read state row and alert existence** *(new)*. State read failure → `state_read` fault. Alert read failure → `alert_row_read` fault. Either → `infra_error`, return, no state write.
4. **Health predicate.** Leg (a): `hasLiveActiveChannel` (unchanged boolean — R3 finding 8's null-activation ambiguity disappears with the timestamp predicate). Leg (b): §3.4a — does an unresolved alert exist.
5. **Classify.** A total function of three booleans:

| `live` | alert unresolved | wait in future | Outcome | Subscribe? | State write |
|---|---|---|---|---|---|
| yes | no | either | `healthy` | no | success-reset |
| yes | yes | either | `renewal_failing` | no | outcome only |
| no | either | past | `recovered` or `still_orphaned` | **yes** | success-reset or attempt-failure |
| no | either | future | `backoff_waiting` | no | outcome only |

`renewal_failing` is now a **reported** state, not an inferred one: a live channel with an unresolved alert means the last establishment attempt failed and none has succeeded since, which is exactly what the alert's existence asserts. Reconcile takes no action in that state beyond the escalation check — refresh owns renewal, and a stale read here drives no write, so it cannot mis-persist anything.

The backoff gate is consulted **only when `live` is false** (R2 finding 4), which is what makes §2.1a I2 a statement about the implementation rather than an aspiration.

6. **Subscribe** when `!live` and the wait has passed. Success resolves the alert inside its own activation transaction (§3.4a) — reconcile itself never resolves. Then record the attempt (step 7).
7. **Record the attempt** *(new; §3.3a)*.
8. **Escalation check** — unchanged trigger site (every outcome where an unresolved alert exists, including `renewal_failing` and `backoff_waiting`), changed predicate (§3.6).

**New `ReconcileResult`:** `{ outcome; sweptPending; escalated; faults; nextAttemptAt; consecutiveFailures }`. The last two are the values **returned by the state write**, never values the application computed.

**Fault inventory.** The shipped thirteen plus **two new**: `state_read`, `state_write`. Note what `faults` does and does not affect (R3 finding 3): it determines the **route's** outcome and HTTP class only. It does **not** rewrite or suppress the persisted attempt record — see §3.3a.

**Route HTTP contract**, mirroring the shipped refresh-watch route:
- **200**, summary `outcome: "ok"` — no infra faults. Body `{ ok: true, reconcile: { outcome, sweptPending, escalated, nextAttemptAt, consecutiveFailures } }`. `still_orphaned` / `renewal_failing` / `vacuous` / `backoff_waiting` are all 200: the system working as designed.
- **500**, summary `outcome: "infra"` — any recorded fault. Body `{ ok: false, reconcile: { outcome, faults } }`.
- Summary counts via the existing `CronRunSummary` map: `{ sweptPending, escalated: 0|1, consecutiveFailures }`. The `CronRunOutcome` union (`lib/cron/runSummary.ts:6`) is unchanged.

### 3.5 Backoff ladder

| Consecutive failures | Wait before next attempt | Elapsed since first failure |
|---|---|---|
| 1 | 15 min | 15 min |
| 2 | 30 min | 45 min |
| 3 | 1 h | 1 h 45 min |
| 4 | 2 h | 3 h 45 min |
| 5+ | 2 h (cap) | +2 h each |

**Admin Retry's exact write contract** (R3 finding 9 — the previous text contradicted itself, saying the count is not reset and then that success resets it, while the layer matrix claimed `next_attempt_at` only and the shipped action writes no state at all, `app/admin/actions.ts:301-342`). Retry calls the **same two statements** as reconcile, so there is one implementation of "an attempt happened":

| Retry outcome | Statement | Effect |
|---|---|---|
| subscribe returns `active` | (B) `recordAttemptSuccess` | count → 0, wait → now, errors cleared. The alert is already resolved by the activation transaction (§3.4a); the action no longer calls `resolveAdminAlert` |
| subscribe returns `orphaned` | (A) `recordAttemptFailure` | count +1, ladder advances, error columns from the result. A manual retry that fails **is** a failed attempt and is counted as one |
| subscribe throws `DriveWatchInfraError` | none | the action rejects (fail-visible, unchanged posture); no attempt is recorded because none completed |
| no folder configured | none | unchanged deliberate no-op |

The manual path deliberately advances the ladder on failure: a human mashing Retry against a broken folder should not reset the automatic cadence, and the shared statements make that automatic rather than a second policy to keep in sync.

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

**Decision:** one shared server-side helper, `readWatchSurfaceState()`, used by **both** Doug surfaces. It reads **one table** — `drive_watch_reconcile_state` for the configured folder — and returns:

```ts
type WatchSurfaceState = {
  nextAttemptAt: string | null;
  consecutiveFailures: number;
  lastOutcome: ReconcileOutcome | null;
} | null;
```

**Single table, deliberately** (R3 finding 10). The R2 draft added `incidentStartedAt` from `admin_alerts.raised_at`, which required joining a table that has no folder column and no relationship to the state table — unavailable through a PostgREST service-role select, and two sequential reads would have introduced a snapshot race while contradicting the single-read claim. Dropping the "since `<time>`" clause from the rendered sentence (§3.7 rendering) removes the need for `raised_at` entirely, and the helper collapses to one `.select()` with a plain `{ data, error }` boundary. `lastOutcome` is retained because the copy genuinely branches on it (R2 finding 6).

**Registry ownership** (R3 finding 10): this helper is consumed by the bell and Settings loaders, whose existing registry rows live in the **admin** registry (`tests/admin/_metaInfraContract.test.ts:281-313`) — its row goes there, not in `tests/sync/_metaInfraContract.test.ts`. Only the reconcile-side `WatchTx` methods (§3.3) go to the sync registry, which already owns `lib/drive/watch.ts`'s lifecycle helpers.

`get_bell_feed_rows` is **not** modified — stated explicitly so a reviewer does not read the absence of a migration as an oversight. `BellEntry` gains one optional field, `watchState: WatchSurfaceState`, null for every non-watch row and null when the read fails (a failed read must never break the feed — the line simply does not render, and the alert row still does).

**Doug — `BellPanel`, rendering.** A `<p>` in the watch row's action cell, mirroring the existing auto-resolve note's exact shape (`components/admin/BellPanel.tsx:324-330`: `data-testid`, `className="wrap-break-word text-sm text-text-subtle"`). Rendered when `isWatch && !entry.isHealth` and state is present.

The sentence renders **only in the states where the retry ladder is actually in play** — that is, when there is no live channel. R3 finding 6 showed both halves of the R2 draft could be false:

- `renewal_failing` is a **sampled** state, not current liveness. A channel can expire between reconcile runs, and Settings independently classifies that as `watch_expired` from the current clock (`lib/admin/driveConnectionHealth.ts:166-168`) — so a line saying "Still connected for now" could sit directly beneath a panel saying the connection has lapsed. That line is removed entirely; the cataloged alert copy already covers the state truthfully.
- The count must not be presented as total attempts. `consecutive_failures` is advanced by the no-live reconnect path only (§3.3a statement A, called by reconcile and by a failed admin Retry). Hourly renewals of a *live* channel (`lib/drive/watch.ts:547-576`) are a different operation and are not counted — which is exactly right for a line that only renders when no channel is live, but only if the label says so.

| `lastOutcome` | Rendered line |
|---|---|
| `still_orphaned` or `backoff_waiting`, `nextAttemptAt` in the future | `Trying again at 4:45 PM · 7 reconnect attempts so far` |
| `still_orphaned`, `nextAttemptAt` past or null | `Trying again shortly · 7 reconnect attempts so far` |
| anything else (`healthy`, `recovered`, `renewal_failing`, `vacuous`, `infra_error`), or `watchState === null` | line does not render; the row looks exactly as it does today |

Additional guards on the count clause: `consecutiveFailures === 0` → the clause is omitted entirely (never `0 reconnect attempts`); `=== 1` → `1 reconnect attempt`, singular.

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

**A second canonical spec also states the cron count** (R3 finding 11 — this was missed because the first sweep looked for *registrations*, and these are *requirements*). `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md` asserts "9 jobs" in **seven** places, each of which becomes ten: `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:18` (per-run wrapper scope), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:34` (G4 cron-health header), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:35` (G5 wrapper coverage), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:125` (the `CRON_JOBS` ↔ `pg-cron-jobs.json` parity contract), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:170` (route-edit inventory heading), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:295` (the per-job `limit(1)` query count), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:460` (AC5), plus the two sweep contracts that name the figure as a consistency invariant, `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:489` (numeric sweep) and `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:493` (self-consistency sweep, "'9 jobs' stated consistently across §0/§1/§5/§11").

The command that produced this list, run at spec time rather than described for later (writing-plans reconciliation rule): `grep -n "\b9\b" docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md`, with every hit dispositioned — the six above are cron-count claims; `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:56` (invariant 9), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:58` (invariant 2), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:203` (nine `AssetRecoveryResult` literals), `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:240`/`docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md:270` (unrelated prose) are not.

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
| Read path | reconcile step 3; observe CLI; `readWatchSurfaceState` (single-table, feeds both Doug surfaces) | `hasLiveActiveChannel` (unchanged boolean), `listExpiringActive` (+`created_at` for the lifetime fraction) | unresolved-alert existence check; `readUnresolvedWatchAlert` (+`raised_at` for escalation) | N/A | BellPanel, DriveConnectionPanel |
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
| *(no condition-(b) column)* | — | — | — | condition (b) is the **existence** of an unresolved alert; the activation transaction resolves it and the failing transaction raises it (§3.4a). Deliberately neither stored here nor derived from timestamps |
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
6. **Reconcile unit tests** (deps-injected, extending `tests/drive/watch.test.ts:664`). Backoff gate: no live channel + `next_attempt_at` in the future → `backoff_waiting`, **zero** subscribe calls, **zero** state writes, escalation check still invoked. Ladder advance on a failed attempt; reset on success. `renewal_failing` (live + unresolved alert) → no subscribe, no state write, escalation still checked. **Reconcile never calls any resolve helper** — asserted by spy, since resolution is now the activation transaction's job (§3.4a). State-read failure → `state_read` fault → `infra_error`, no state write. *Catches:* reconcile re-acquiring a resolve path; backoff suppressing escalation; a state write on a cycle that made no attempt.
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

16b. **Resolve is atomic with activation** (`tests/db/**`, real DB). Assert the resolve happens inside the activation transaction: (a) a successful activation leaves zero unresolved `WATCH_CHANNEL_ORPHANED` rows; (b) an activation transaction that is **rolled back** leaves the alert unresolved — proving the resolve is not a separate committed statement; (c) a failure committing *after* activation raises a fresh alert that survives, since nothing resolves after a read. **Negative control:** the same interleaving run against the previous design (a post-activation `resolveAdminAlert` call) erases the newer alert, proving the test discriminates. *Catches:* R2 finding 1 / R3 finding 1 — the erasure class returning if resolution is ever moved back outside the transaction.

16c. **Single-writer alert lifecycle** (`tests/db/**`, real DB). Drive the four production establishment paths — reconcile subscribe, refresh renewal, admin Retry, onboarding finalize — and assert each one's success clears the alert **without any caller-side resolve call**, since all four funnel through `activateWithTx` (`lib/drive/watch.ts:462`). Then assert each one's failure raises it. *Catches:* a future caller bypassing the chokepoint, which would silently reintroduce per-caller resolve logic and every race it brings.

16d. **State write transport, concurrency** (`tests/db/**`, real DB). Two concurrent writers through the `WatchTx` method against the same folder both taking the increment arm → final `consecutive_failures === 2`, and each caller's `returning` value reflects the row it wrote. *Catches:* R2 finding 8 — an implementation that reads then writes, or one routed through a PostgREST upsert that cannot express the increment at all.

17. **Fault-versus-attempt independence** (`tests/drive/**`, deps-injected). The R3-finding-3 class: for **every** post-attempt fault (`alert_resolve_write`, `guard_read`, `guard_write`, `pref_read`, `recipients_read`, `email_send`, `escalation_helper`, escalation-time `alert_row_read`) and the pre-attempt `pending_sweep`, assert the cycle reports `infra_error` **and** the attempt's state write still landed with the ladder advanced. A persistent-email-fault loop over three cycles must reach `consecutive_failures === 3`, not stay at 0. *Catches:* the call-storm regression where an unrelated fault pins the ladder at zero and retries every 15 minutes forever.

17. **Production data-path integration** (`tests/db/**` + `tests/components/**`). Real `drive_watch_reconcile_state` rows read through the **actual** loaders — `lib/admin/bellFeed.ts` and the `app/admin/settings/page.tsx` service-role read — asserting the values reach `BellEntry.watchState` and the `DriveConnectionPanel` prop respectively, plus the failure arm (state read errors → `watchState: null`, feed and panel still render). *Catches:* R1 finding 4's class exactly — component fixtures passing while production never supplies the field, and the session-client privilege error degrading the Settings panel.

18. **Doug copy per outcome** (`tests/components/**`). One rendered case per §3.7 row: `still_orphaned` with a future attempt; `still_orphaned` past-due; `backoff_waiting`; and **every non-rendering outcome** — `renewal_failing`, `healthy`, `recovered`, `vacuous`, `infra_error`, and `watchState === null` — asserting the line is absent. The `renewal_failing` case is the R3-finding-6 class: a sampled state must never claim current liveness. Plus the count-clause guards (0 omitted, 1 singular). Anti-tautology: each absence assertion scans a cloned subtree with the alert's own cataloged copy removed first, so a stray count or timestamp anywhere in the row fails the test.

19. **`watch_backoff_ms` ↔ `BACKOFF_LADDER_MS` parity** (`tests/db/**`, real DB). The SQL function and the TypeScript constant agree for n = 1..8, compared against the independent literal table from class 1. *Catches:* the ladder drifting between its two implementations — a class that exists only because the conflict path computes the wait in SQL (§3.3a).

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
- **Condition (b) is neither stored nor derived — the successful transaction clears the alert.** Three rounds of findings (R1-2; R2-1, R2-2; R3-1, R3-2, R3-5, R3-8) all attacked one premise: inferring per-folder health from a global alert row plus channel timestamps, from a process that wrote neither. §3.4a removes the inference. A reviewer proposing to "store the renewal outcome" or "compare timestamps" is proposing a design this spec already tried twice and discarded on evidence.
- **`renewal_failing` does not spin unbounded.** With a 24h grant renewed at 6h remaining, a failing renewal gets ~6 hourly refresh attempts while reconcile runs 4x/hour doing only the sweep and the escalation check — no Drive traffic, no ladder movement, and no state write. If the lease finally expires, `live` flips false, the outcome becomes `still_orphaned`, and the ladder starts. Every state has an exit.
- **Faults never suppress the attempt record.** A persistent email or guard fault reports 500 every cycle while the ladder keeps climbing (§3.3a). Reading `faults` as "the cycle did nothing" is reading a bug that R3 finding 3 already closed.
- **The ladder never runs while a channel is live** (§2.1a I2). That is what makes the backoff cap a non-constraint rather than a race against expiry.
- **`occurrence_count` is not deleted.** It remains on the alert row, in the escalation guard context, and in the Sentry payload. It stops being the *trigger*; it does not stop being *evidence*.
