# Watch-Channel Reconcile: Real Renewal Slack, Dedicated Cadence, and Backoff State

**Date:** 2026-07-24
**Status:** **DEFERRED — NOT IMPLEMENTED.** Retained as the input for the deferred half of `BL-WATCH-RECONCILE-BACKOFF`, not as a description of shipped or intended-for-this-PR behavior.

> **Why this is deferred.** Five cross-model adversarial rounds (R1-R5, ~55 findings, every checkable claim verified against the live tree) established that the backoff/state/cadence design cannot be built correctly on the current watch subsystem without first fixing four shipped defects: `BL-WATCH-EXPIRED-ACTIVE-ROW`, `BL-WATCH-ALERT-RAISE-NOT-ATOMIC`, `BL-WATCH-ALERT-FOLDER-SCOPE`, and `BL-WATCH-DRIVE-CALL-TIMEOUT` — the last because a backoff ladder makes timing claims, and every such claim is parameterised by an execution budget nothing currently enforces. The decisive one is the first: a failed renewal leaves the old channel `status='active'` past expiry, where `listExpiringActive` keeps returning it and GC never collects it, so refresh retries it on every tick — which means a backoff ladder on reconcile alone cannot deliver backoff at all, because refresh is the dominant retry path and is ungated.
>
> The measured defect this work started from — every lease expiring with ~1 second of slack — is shipped separately and immediately as `docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md`. Scope split ratified by the user on 2026-07-25.
>
> **Reading this document:** §3.1/§3.2 (the lease fix) have moved to the new spec and are authoritative there. Everything else records design work whose premises were repeatedly falsified — read §3.4a's round-by-round disposition tables before reusing any of it. The value here is the analysis and the enumerated failure modes, not the prescriptions.
**Branch:** `feat/watch-reconcile-backoff` off `origin/main` @ `7ed193dde`
**Does NOT close `BL-WATCH-RECONCILE-BACKOFF`** — that entry stays OPEN and blocked. This document is the design input for it, retained so the follow-up starts from the analysis rather than repeating five review rounds. It extends Approach B from `docs/superpowers/specs/observability/2026-07-01-watch-channel-health-design.md` §2/D1. The lease half it started from shipped separately; see the status note above.

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
9. **The dedicated reconcile cron is superseded, and this is a mechanism change, not a scope change.** The option the user chose described a "dedicated `fxav_cron_reconcile_watch` (`*/15`)". Four adversarial rounds established that a *separate process* is what forces condition (b) to be re-derived durably, and that every P0 lives there (§3.4a). The 15-minute cadence — the actual outcome — is delivered by moving the existing job. Every ratified outcome is preserved; the table in §3.4a maps each one. Do not re-propose a separate cron without first refuting R4 finding 1.
10. **Chrome vs catalog copy.** The next-attempt line (§3.7) is UI chrome in the same class as the existing bell auto-resolve note (`components/admin/BellPanel.tsx:324-330`) and the `DriveConnectionPanel` status lines — not §12.4 message copy. The substantive explanation stays cataloged. Precedent ratified in the 2026-07-01 design §6.

---

## 2. Resolved decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Channel lifetime | Request the Google maximum for `files` (24h) rather than accepting the 1-hour default. Store whatever Drive actually grants (already the behavior at `lib/drive/watch.ts:357`). |
| D2 | Renewal trigger | A fraction of the channel's own granted life **with an absolute floor** (`RENEWAL_MIN_LEAD_MS`). The floor is not optional: a purely proportional trigger is unsafe on short grants because the predicate is only sampled hourly (§2.1a I1). |
| D3 | Reconcile placement | **Unchanged — reconcile stays on the refresh-watch route.** The cadence goal is met by moving that existing job to the off-minute 15-minute schedule. Superseded the dedicated-cron design after R4 finding 1; rationale in §3.4a. |
| D4 | Condition (b) transport | **Unchanged from shipped** — the same-cycle in-process `RefreshResult` (`lib/drive/watch.ts:727-733`). Splitting the processes was the only thing that ever required a durable transport, and §3.4a removes the split. |
| D5 | Backoff | Exponential ladder, running **only** when no live channel exists (§2.1a I2), so its cap never races an expiry. |
| D6 | Escalation trigger | Duration since `admin_alerts.raised_at`, or immediate on `error_class === "config"`. |
| D7 | Surfacing | Split by field (§3.7). |
| D8 | Ship mode | Autonomous through merged PR. |
| D9 | Bell-feed state transport | A single-table service-role read of `drive_watch_reconcile_state` in `lib/admin/bellFeed.ts`, keyed on the folder id the caller supplies (§3.7 D12), joined in TypeScript; `get_bell_feed_rows` is **not** widened. |
| D10 | Developer surfacing | A filtered deep link into the existing telemetry activity feed. **No new telemetry component**; the state columns are `pnpm observe watch`-only (§3.7). |
| D11 | Settings state transport | A separate service-role read in `app/admin/settings/page.tsx`, passed as its own prop. The `DriveConnectionHealth` union and its session-scoped loader are untouched (§3.7). |

### 2.1 Named constants (single source of truth)

Every later section references these **names**, never the literals. All live in `lib/drive/watchErrors.ts` alongside the existing `STALE_PENDING_MAX_AGE_MS` (`lib/drive/watchErrors.ts:9`).

- `WATCH_TTL_MS` = **86_400_000** (24h) — requested channel lifetime; Google's documented maximum for the `files` resource.
- `RENEWAL_LIFE_FRACTION` = **0.75** — the *proportional* part of the renewal trigger: a channel is due once 75% of its granted life has elapsed.
- `RENEWAL_MIN_LEAD_MS` = **7_200_000** (2h) — the *absolute floor* on remaining life at which a channel becomes due. Exists because the proportional term alone is unsafe on short grants (§3.2).
- `SAMPLING_PERIOD_MS` = **900_000** (15m) — how often `fxav_cron_refresh_watch` runs, and therefore how often **both** the renewal predicate and reconcile are sampled. They share one tick because they share one route (§3.4a); the earlier drafts' separate one-hour refresh period and fifteen-minute reconcile period collapse into this single constant, which is one of the simplifications the descope buys.
- `T_EXEC_BUDGET_MS` = **60_000** (1m) — an upper bound on one run's execution time before it reaches a given row. Appears only in the §2.1a I1 boundary and the short-grant anomaly check; a safety margin, not a timeout.
- `BACKOFF_LADDER_MS` = **[900_000, 1_800_000, 3_600_000, 7_200_000]** (15m, 30m, 1h, 2h). The Nth consecutive failure waits `BACKOFF_LADDER_MS[min(N, len) - 1]`; the final entry repeats indefinitely.
- `BACKOFF_MAX_MS` = **7_200_000** (2h) — definitionally `BACKOFF_LADDER_MS.at(-1)`; asserted equal by a unit test rather than written twice.
- `ESCALATION_AFTER_MS` = **10_800_000** (3h) — escalate once an unresolved alert has persisted this long. Replaces `ESCALATION_THRESHOLD`.
- `STALE_PENDING_MAX_AGE_MS` = **3_600_000** (1h) — unchanged (`lib/drive/watchErrors.ts:9`).
- `fxav_cron_refresh_watch` schedule = **`'7,22,37,52 * * * *'`** — a 15-minute period at a fixed 7-minute offset. Wherever this document (and `BL-WATCH-RECONCILE-BACKOFF`) says `*/15`, it means this schedule; the offset avoids collisions (§3.4b) and the period is exactly `SAMPLING_PERIOD_MS`, so the `lib/cron/runSummary.ts` registration becomes `900_000`. There is exactly one cadence in this design.

**`ESCALATION_THRESHOLD` is retired**, not repurposed. Its only readers are `lib/drive/watchErrors.ts:8` (definition) and `lib/drive/watchEscalation.ts:8` (import) / `lib/drive/watchEscalation.ts:102` (sole use) — verified by `grep -rn ESCALATION_THRESHOLD`. The export is deleted in the same task that introduces `ESCALATION_AFTER_MS`.

#### 2.1a Timing invariants (pinned by unit tests, §6.1)

A cadence design is only correct relative to how often its predicates are *sampled*. The first draft of this spec asserted a single invariant over the requested TTL and was wrong for exactly that reason (R1 finding 1): a predicate that becomes true at T is not acted on until the next sampling tick, so every margin must be reduced by one sampling period, and the *granted* life — not the requested one — is what the system actually has.

Let `G` be the lifetime Drive actually granted a channel (`expires_at - created_at`), and `L(G) = max(RENEWAL_MIN_LEAD_MS, G * (1 - RENEWAL_LIFE_FRACTION))` the remaining-life threshold at which it becomes renewal-due (§3.2).

- **I1 — renewal is sampled before expiry.** R2 finding 3 showed the original claim false when `L(G) > G`; R4 finding 9 showed the repair left two overlapping regimes (a 1-hour grant sat in both the "must renew before expiry" set and the anomaly set). There is exactly **one** boundary, stated once:

  Let `P = SAMPLING_PERIOD_MS` and `T = T_EXEC_BUDGET_MS`. A channel activated at arbitrary phase is next examined at most `P + T` after activation.

  | Granted life `G` | Classification | Expectation |
  |---|---|---|
  | `G <= P + T` | **anomalous** | renewal cannot be guaranteed at any phase; `DRIVE_WATCH_GRANT_TOO_SHORT` is emitted at subscribe time; no pre-expiry guarantee is claimed |
  | `G > P + T` | **guaranteed** | examined-and-due strictly before `expires_at` at every phase, with margin `G - P - T` |

  With `P = 15m` and `T = 1m`, the anomalous band is `G <= 16m`. Today's 1-hour grant is **guaranteed** under the new cadence (margin 44m) even before §3.1 lands — moving the tick to 15 minutes fixes the §1.2 no-margin defect on its own, and the 24h lease then makes the margin 23h+. The anomaly log therefore fires only for a grant Drive has never been observed to issue, which is the intended posture for an unreachable-but-unsafe state.

  The §6.1 test is a **phase sweep against a simulated tick series**, never a restatement of the formula (R2-3 and R4-9 both caught drift back toward the latter). For each `G` in `{P-ε, P, P+T, P+T+ε, 6h, 24h}` and each activation offset stepped across a full period, it runs the fixed tick series and asserts: for `G > P + T`, the channel is examined-and-due strictly before `expires_at` at **every** offset; for `G <= P + T`, the anomaly log fires at subscribe time and no pre-expiry guarantee is asserted. The four boundary values are named explicitly so the `<=` versus `<` distinction is executable rather than editorial.
- **I2 — the backoff ladder never runs while a channel is live.** Stated as a structural property, not an arithmetic one: the ladder is consulted only when `live` is false (§3.4b step 2), where there is no lease left to expire. `BACKOFF_MAX_MS + SAMPLING_PERIOD_MS` (2h15m) exceeds the renewal floor `L(G) >= 2h`, so an arithmetic form of this invariant would be **false** — which is exactly why it is enforced by control flow and pinned by test 16a rather than by a constant relationship. A future change that lets the ladder run against a live channel has to confront this.
- **I3 — reconcile's recovery latency is bounded by its own period.** A folder with no live channel is retried within `SAMPLING_PERIOD_MS + BACKOFF_LADDER_MS[n]`, never longer. This is the property §1.3 claims as the cadence change's actual value.

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

| Granted life `G` | `L(G)` | Due at | Sampling ticks between due and expiry |
|---|---|---|---|
| 24h (requested) | 6h | 18h elapsed | 24 |
| 6h | 2h (floor) | 4h elapsed | 8 |
| 2h | 2h (floor) | immediately | 8 |
| 1h (today's observed grant) | 2h (floor) | immediately | 4 |

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

**Registry ownership, stated once to end the R4-12 ambiguity** — the diff has exactly two registry surfaces and they are not interchangeable:

| Surface | Transport | Registry |
|---|---|---|
| `recordAttemptFailure` / `recordAttemptSuccess` (§3.3a) | `WatchTx` raw SQL via `callWatchTx`; faults surface as `DriveWatchInfraError` | `tests/sync/_metaInfraContract.test.ts` (already owns `lib/drive/watch.ts`'s lifecycle helpers) |
| `readWatchSurfaceState` (§3.7) | Supabase service-role `.select()`; destructures `{ data, error }`; returns `null` on fault | `tests/admin/_metaInfraContract.test.ts` (already owns the bell + Settings loaders that consume it) |

No helper appears in both, and no helper uses both transports.

#### 3.3a State writes: only when an attempt happened

R1-5 asked for total postconditions; R2-7 showed a per-branch matrix cannot be total; R3-3/R3-4 showed the omni-upsert was unimplementable and let unrelated faults pin the ladder; R4-5/R4-7/R4-8 showed the surviving `healthy` arm was a synthetic success that could erase a real concurrent failure, and that the two statements still had unbound parameters.

The rule that makes all of it total and race-free is one sentence:

> **A state write happens if and only if a subscribe attempt completed in this cycle. Nothing else writes.**

No attempt, no write. That single rule removes the stale-`healthy` lost update (R4-5) — reconcile can no longer overwrite a concurrent failure's bookkeeping with a synthetic success, because a cycle that made no attempt writes nothing at all. It also removes the mislabeled-Retry case (R4-7): the only thing that ever sets `last_outcome` is an attempt, so the field always describes a real attempt.

| Cycle | Attempt? | Write |
|---|---|---|
| subscribe returned `active` | yes | **(B)** success reset |
| subscribe returned `orphaned` | yes | **(A)** failure record |
| subscribe threw | yes — Drive was called | **(A)**, with `'db'` and the redacted throw message |
| `healthy`, `renewal_failing`, `backoff_waiting`, `vacuous`, every `infra_error` | no | **none** |

Admin Retry uses the same two statements on the same rule (§3.5).

**The two statements.** Both take an explicit parameter list; neither has a "preserve" cell, so no concurrent increment can be clobbered by a stale rewrite.

```sql
-- (A) recordAttemptFailure($1 folder, $2 errorClass, $3 errorMessage)
insert into public.drive_watch_reconcile_state as st
       (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
        last_outcome, last_error_class, last_error_message, updated_at)
values ($1, 1, now(), now() + (public.watch_backoff_ms(1) || ' milliseconds')::interval,
        'still_orphaned', $2, $3, now())
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

-- (B) recordAttemptSuccess($1 folder)
insert into public.drive_watch_reconcile_state as st
       (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
        last_outcome, last_error_class, last_error_message, updated_at)
values ($1, 0, now(), now(), 'recovered', null, null, now())
on conflict (watched_folder_id) do update
   set consecutive_failures = 0,
       last_attempt_at      = now(),
       next_attempt_at      = now(),
       last_outcome         = 'recovered',
       last_error_class     = null,
       last_error_message   = null,
       updated_at           = now()
returning consecutive_failures, next_attempt_at;
```

R4-8's specific defects, each closed: statement B no longer references an unbound `$2` (its `last_outcome` is the literal `'recovered'`, the only outcome a completed success can have); statement A's INSERT wait now comes from `watch_backoff_ms(1)` rather than a caller-supplied interval, so **both** paths route through the same function and the first rung is inside the parity test; and the function's contract is specified below rather than left to the implementer.

```sql
create function public.watch_backoff_ms(n integer)
returns bigint
language sql
immutable
as $$
  select case
    when n is null or n < 1 then 900000::bigint          -- 15m: defensive floor, unreachable from (A)
    when n = 1 then 900000::bigint                       -- 15m
    when n = 2 then 1800000::bigint                      -- 30m
    when n = 3 then 3600000::bigint                      -- 1h
    else 7200000::bigint                                 -- 2h, clamped
  end
$$;
```

Contract, asserted at `n = 0, 1, 2, 3, 4, 5, 8, null` by the §6 parity test against the independent literal table: total over its input, never null, monotonically non-decreasing, clamped at `BACKOFF_MAX_MS`. `n = 0` and `null` are unreachable through (A)'s expressions and return the first rung defensively rather than null.

**Faults never suppress a completed attempt** (R3-3, extended per R4-6). `faults` determines the route's HTTP class and nothing else. Every escalation-time and resolve-time fault occurs after the attempt is recorded. **R4 finding 6 identified the one real gap in that claim:** `markWatchOrphanedWithTx` can itself throw — at `drive_watch_channels.mark_orphaned` or at the alert upsert (`lib/drive/watch.ts:402-414`) — *after* Drive has already returned a failure. That throw escapes `subscribeToWatchedFolder` rather than returning the orphaned result, so statement (A) would never run and a persistent alert-write fault would pin the ladder at zero — the exact call storm this feature exists to prevent. **Fix:** reconcile catches a throw from its subscribe call, records `subscribe_infra`, and **still executes statement (A)** with `last_error_class = 'db'`. Drive was called; that is an attempt, and it must advance the ladder whether or not our own bookkeeping of it succeeded.

**Guard conditions.**
- No row yet → (A) inserts `consecutive_failures = 1`; (B) inserts `0`. A first failure recorded as zero would render "0 reconnect attempts" and misindex the ladder.
- Folder switched → new PK, fresh row; the old row is left in place (rare, tiny) rather than cleaned up.
- Beyond the ladder length → clamped by `watch_backoff_ms`.
- A failing state write records `state_write`, returns `infra_error`, and leaves the bookkeeping one cycle stale — the pre-feature behavior. The attempt itself already happened and already raised its alert.

### 3.4 Cadence: move the existing job, do not add one

#### 3.4a Why this replaces the dedicated-cron design (R4 finding 1)

Rounds 1 through 4 all landed findings on one vector: how a *separate* reconcile process learns that a renewal failed. Round 3 answered it by making the alert lifecycle transactional — "the transaction that fails raises the alert; the transaction that succeeds clears it." **R4 finding 1 proved that premise false in the live implementation, and the check is decisive:**

`PostgresWatchTx.upsertAdminAlert` does not write through the transaction it appears to belong to. It calls the standalone service-role helper (`lib/drive/watch.ts:189-194`), which constructs its own Supabase client and issues an RPC over a **different connection** (`lib/adminAlerts/upsertAdminAlert.ts:47-52`), outside the surrounding `sql.begin` (`lib/drive/watch.ts:315-318`). The alert raise has therefore never been atomic with the channel mutation, and an in-transaction resolve would not have been atomic with activation either.

Under this repo's three-round rule for design-correctness vectors (`docs/agents/spec-self-review.md`), a vector still unresolved after the comprehensive re-analysis is not to be patched again — it is to be resolved structurally or **descoped**. Descoping is available here at no cost to any ratified outcome, because the vector exists **only** as a consequence of splitting reconcile into its own process. Nothing the user asked for requires that split:

| Ratified outcome (§1.1a-1) | Delivered by the dedicated cron? | Delivered by this design? |
|---|---|---|
| Recovery within ~15 min when no channel is live | yes | **yes** — reconcile runs on the same 15-minute tick |
| Exponential backoff with attempt state | yes | **yes** — §3.3 is unchanged |
| Next-attempt time and count on Doug's surfaces | yes | **yes** — §3.7 is unchanged |
| Duration-based escalation | yes | **yes** — §3.6 is unchanged |
| Real renewal slack (the lease fix) | independent | **yes** — §3.1/§3.2 unchanged |

**The change: `fxav_cron_refresh_watch` moves from `'0 * * * *'` to `'7,22,37,52 * * * *'`, and `reconcileWatchChannels` stays exactly where it is** — invoked by `app/api/cron/refresh-watch/route.ts` immediately after `refreshWatchSubscriptions()`, in the same handler, receiving the same in-process `RefreshResult` it receives today.

Condition (b) therefore needs no re-derivation at all. It remains the shipped same-cycle computation (`lib/drive/watch.ts:727-733`) — a value produced and consumed inside one process, which is why it was never racy to begin with. Every P0 and most P1s from rounds 1 through 4 concerned machinery this design no longer contains:

| Finding | Status |
|---|---|
| R4-1 (alert raise not transactional) | **not relied upon** — no in-transaction resolve exists |
| R4-2 (`activateWithTx` not a real chokepoint) | **not relied upon** — nothing hooks activation |
| R4-3 (folder-scope amplified by removing the clearing path) | **not applicable** — the shipped clearing path is retained unchanged; the residual pre-existing exposure is unchanged by this diff and stays filed as `BL-WATCH-ALERT-FOLDER-SCOPE` |
| R4-4 (concurrent establishment leaves a false unresolved alert) | **pre-existing and unchanged** — reconcile's shipped resolve still clears it on the next healthy cycle, which the R3 design had removed |
| R4-5 (stale synthetic `healthy` write) | **fixed** — state is written only when an attempt happened (§3.3a) |
| R4-7 (failed manual Retry mislabels a live channel) | **fixed** by the same rule: no attempt, no write, and Retry's own write is an attempt |
| R2-1 / R3-1 (read-to-resolve races) | **not applicable** — no new resolve path is introduced |
| R1-2 / R2-2 / R3-5 / R3-8 (timestamp predicates) | **not applicable** — no timestamp predicate exists |
| R4-11 (nine→ten cron count across two canonical specs, prod comments, e2e) | **eliminated** — the job count stays **nine** |

#### 3.4b What actually changes in the route

Almost nothing, which is the point.

1. **Schedule.** `fxav_cron_refresh_watch` → `'7,22,37,52 * * * *'`. Minutes 7/22/37/52 avoid every multiple of 5 (claimed by the two `*/5` jobs), minute 15 (`fxav_cron_gc_watch`) and minute 30 (`fxav_cron_diagram_gc`).
2. **Backoff gate** *(new)*. Before reconcile's step-3 subscribe, read the state row; if `next_attempt_at > now()` **and** there is no live channel, skip the subscribe and report `backoff_waiting`. Applied **only** when no channel is live (R2 finding 4), so a live channel is never parked on the ladder.
3. **Attempt recording** *(new)*. When — and only when — a subscribe attempt completed this cycle, record it (§3.3a).
4. **Result shape.** `ReconcileResult` gains `nextAttemptAt` and `consecutiveFailures`, both taken from the state write's `returning` clause. The existing `outcome` union gains `backoff_waiting`.
5. **Everything else is untouched:** the stale-pending sweep, the folder read, the health predicate including condition (b), the resolve-on-healthy path, the subscribe-only-when-not-live rule, the escalation call site, the fault inventory, and the route's HTTP contract. `refreshWatchSubscriptions` is **not** modified at all and writes no state.

**Cost of the faster tick.** Refresh's own work per run is one indexed `listExpiringActive` SELECT. With the §3.2 renewal floor a 24h channel is due only in its final 6h, so quadrupling the tick does **not** quadruple Drive calls — it renews at the first tick after a channel becomes due, then goes quiet for ~18h. Channel churn drops from today's 24/day to ~1/day (§3.1), so this design makes fewer Drive calls than the shipped system while recovering four times faster.

**Cron-count invariance.** Because no job is added, `CRON_JOBS` stays at nine and every canonical claim R4 finding 11 enumerated — `docs/superpowers/specs/observability/2026-06-29-observability-timeline-phase2-design.md` (nine places), `docs/superpowers/specs/observability/2026-07-06-telemetry-console-redesign.md:40`, `app/admin/dev/telemetry-dim/page.tsx:9`, `tests/e2e/telemetry-layout.spec.ts:11`, and the literal-nine assertions in `tests/cron/runSummary.test.ts`, `tests/cron/cronJobsParity.test.ts` and `tests/admin/loadCronHealth.test.ts` — remains true and untouched. The `expectedIntervalMs`/`staleAfterMs` entry for `refresh-watch` in `lib/cron/runSummary.ts:54-58` changes from hourly to `900_000`, and its assertion in `tests/cron/runSummary.test.ts:21` changes with it. That is the entire cron fan-out.

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

**The helper takes the folder id as an argument (D12).** R4 finding 10: `readWatchSurfaceState()` was described with no parameter yet had to select "for the configured folder", and neither caller has that id in hand — bell's settings read fetches only bell bounds (`lib/admin/bellFeed.ts:194`) and `BellEntry` carries no folder (`lib/admin/bellFeed.ts:29-52`). Resolving it inside the helper would mean a second read of `app_settings` (`lib/appSettings/getWatchedFolderId.ts:44`), contradicting the single-read claim. Signature is therefore `readWatchSurfaceState(folderId: string): Promise<WatchSurfaceState>`, and each caller supplies it from a read it already performs: **Settings** from `DriveConnectionHealth`, whose non-infra variants carry `folderId` (`lib/admin/driveConnectionHealth.ts:39-57`); **bell** from `getActiveWatchedFolderId()`, an already-registered helper it calls once per feed load alongside its existing settings read. A null/absent folder id → the helper is not called and `watchState` is null, so the line does not render.

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

**Developer — telemetry deep link only; no new telemetry component (D10).** The watch bell row gains a `View in telemetry ↗` link when `viewerIsDeveloper`, reusing the affordance already built for health rows (`components/admin/BellPanel.tsx:283-296`). **The existing branch cannot be reused as-is** (R1 finding 4): that link renders only under `entry.isHealth`, and `ActionCell` does not receive `viewerIsDeveloper` at all — the flag is consumed further down, for footer content (`components/admin/BellPanel.tsx:1050-1073`). So the prop is threaded into `ActionCell` (`components/admin/BellPanel.tsx:259-297`) — it already exists further down the tree (`components/admin/BellPanel.tsx:1055`), so this is a prop pass, not a new data source — and the render condition becomes `entry.isHealth || (isWatch && viewerIsDeveloper)`, with the href differing per arm: health rows keep `#health`, the watch arm points at the **unfiltered** telemetry route. The first draft proposed `?source=drive.watch`, which R2 finding 10 correctly showed would render almost nothing useful: `parseAppEventFilters` does accept the key (`lib/admin/telemetryTypes.ts:102-103`), but `loadAppEvents` applies it as an **exact** match, `.eq("source", filters.source)` (`lib/admin/loadAppEvents.ts:38`). The events a developer following this link actually wants live under four distinct source values — `drive.watch`, `drive.watch.reconcile` (`lib/drive/watch.ts:669-673`), `drive.watch.escalation` (`lib/drive/watchEscalation.ts:17`), and `cron.refresh-watch` — so an exact filter on `drive.watch` would hide three of them.

Prefix matching is not added: `loadAppEvents` has no `.in()`/`ilike` source path today, and widening a shared telemetry filter to serve one deep link is scope this feature does not own. The link therefore lands on the telemetry page unfiltered, where the developer has the full filter UI. Stated explicitly so a later reader does not "fix" the link by adding the exact-match param back.

**No `WatchConnectionCard` or equivalent is built.** The telemetry page is a 91-line composition of an activity feed and a cron-health aside (`app/admin/dev/telemetry/page.tsx`); nothing there reads watch state today, so "surface the state columns on the telemetry page" would mean a third UI file and a third impeccable-gated surface for a developer-only view that `pnpm observe watch` already serves. The state **columns** are therefore CLI-only; the telemetry link carries the developer to the *event history*, which is the question a deep link from an alert actually answers. This keeps the impeccable dual-gate scoped to the two Doug surfaces (§4.1).

**Developer — `pnpm observe watch`.** `lib/observe/query/watch.ts` gains the state columns via a left join or a second query, keyed on `watched_folder_id`. **The `SELECT` constant at `lib/observe/query/watch.ts:9-10` must not gain the webhook-secret column** — `tests/observe/queryWatch.test.ts` scans that file for the column's snake_case literal (`lib/observe/query/watch.ts:1-5`), and the new columns must not reintroduce it. No free-text column added to the CLI output is unsanitized: `last_error_message` is redacted at write time, and the CLI applies the same `sanitizeIdentityString` treatment `queryIngestFailures` uses for `last_error_message` (`lib/observe/query/failures.ts:61`).

#### Mode boundaries


| Element | Healthy (no alert) | Watch alert, backing off | Watch alert, attempting now | Watch alert, viewer is developer |
|---|---|---|---|---|
| Retry form | — | ✓ (unchanged) | ✓ (unchanged) | ✓ |
| Next-attempt line | — | `Trying again at <time> · <n> reconnect attempts so far` | `Trying again shortly · <n> reconnect attempts so far` | same as non-developer |
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

The line is a single sentence with one bounded integer and one timestamp; `consecutive_failures` is displayed verbatim with no cap (it grows by at most 12/day under the ladder, and a four-digit count would itself be the story). `wrap-break-word` handles narrow viewports, as it does for the auto-resolve note.

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
| `…_error_class_check` | `config`, `drive_api`, `db` | `WatchErrorClass` (`lib/drive/watchErrors.ts:5`) — all three enumerated, none omitted | allowed (no failure recorded yet) | one-shot forward migration; NOT idempotent by design (see below) |
| `…_outcome_check` | `healthy`, `recovered`, `still_orphaned`, `renewal_failing`, `vacuous`, `infra_error`, **`backoff_waiting`** | `ReconcileOutcome` (`lib/drive/watch.ts:626-632`) + the new arm | allowed (never reconciled yet) | same |
| `…_failures_nonneg` | `>= 0` | — | not-null column | same |

**Apply-twice idempotency, stated precisely** (R2 finding 9): the DDL is a bare `create table`, so the migration is **not** idempotent and is not claimed to be — it is a one-shot forward migration applied exactly once per environment, like every other `create table` migration in `supabase/migrations/`. The earlier draft's "guarded by `if not exists`" claim contradicted its own DDL and is withdrawn. The REVOKE/GRANT statements that follow it *are* naturally idempotent. The surgical validation apply (§4.3) runs the file once; re-running it fails loudly on the duplicate relation, which is the intended signal.

**Transitional window:** none. This is a new table, so there is no old-value/new-value window and no `tables/`-runs-before-`migrations/` hazard. A structural meta-test pins both CHECKs against their TypeScript unions so a future union member cannot land without the CHECK (§6.1).

### 4.3 Cron registration fan-out

Because **no job is added and no route is added**, the fan-out is small. Every surface below was re-derived by grep at spec time, not carried forward from the dedicated-cron draft:

| Surface | Action |
|---|---|
| new migration, supabase/migrations/&lt;timestamp&gt;_reschedule_refresh_watch.sql | new migration: `cron.unschedule('fxav_cron_refresh_watch')` if present, then re-`cron.schedule` it at `'7,22,37,52 * * * *'` (pattern: `supabase/migrations/20260527000003_schedule_cron_jobs.sql:106-112`) |
| `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json:8` | `schedule` value only — the `jobname` and `route` are unchanged |
| `tests/cross-cutting/pg-cron-coverage.test.ts:53-56` | add the new scheduling migration to `SCHEDULE_MIGRATION_PATHS` (a hard-coded file list) |
| `lib/cron/runSummary.ts:54-58` | `refresh-watch` interval `3_600_000` → `900_000`; `staleAfterMs` rescaled to the same ~3x cadence rule the file already applies |
| `tests/cron/runSummary.test.ts:21` | the matching expected-interval assertion |
| `supabase/__generated__/schema-manifest.json` | regen via `pnpm gen:schema-manifest` (the state-table migration, not the schedule one) |
| validation project `vzakgrxqwcalbmagufjh` | surgical apply of both migrations + `notify pgrst, 'reload schema'` — or `validation-schema-parity` fails |

**Unchanged, and verified unchanged rather than assumed** — because the job count stays nine and no route is added: `tests/cron/cronJobsParity.test.ts` (route→jobname map and its literal-nine assertion), `tests/cron/cronRouteSummaries.test.ts`, `tests/admin/loadCronHealth.test.ts` (four literal-nine assertions), `tests/db/b3-notify-cron-idempotency.test.ts`, `lib/audit/trustDomains.ts`, and every canonical nine-job claim R4 finding 11 enumerated across `2026-06-29-observability-timeline-phase2-design.md`, `2026-07-06-telemetry-console-redesign.md:40`, `app/admin/dev/telemetry-dim/page.tsx:9`, and `tests/e2e/telemetry-layout.spec.ts:11`. The close-out runs each of these suites to prove it.

**Invariant 10 (mutation-surface observability): N/A by contract, unchanged.** No route is added; `refresh-watch` remains a `GET` and the meta-test covers `POST`/`PUT`/`PATCH`/`DELETE` handlers and `"use server"` actions. It stays instrumented through `runCronRoute`'s `CRON_RUN_SUMMARY`.

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

1. **Constants, ladder, and the §2.1a timing invariants.** `BACKOFF_MAX_MS === BACKOFF_LADDER_MS.at(-1)`. **I1 asserted over a grant table** (`1m`, `1h`, `2h`, `6h`, `24h`, and the exact `RENEWAL_MIN_LEAD_MS` boundary), each computed through the implementation's own `L(G)`. **The ladder expectation is an independent literal table**, not derived from `BACKOFF_LADDER_MS` — the first draft derived expected waits from the array under test, so an incorrect ladder satisfied both the index test and the `.at(-1)` identity (R1 finding 7). The table is written out as `[[1, "15m"], [2, "30m"], [3, "1h"], [4, "2h"], [5, "2h"], [6, "2h"]]` in human units and converted in the test, so a ladder edit must be consciously mirrored. *Catches:* a constant edit that lets renewal be sampled after expiry; a silently reordered or rescaled ladder.
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
16a. **Backoff gate decision table** (`tests/drive/**`, deps-injected). The four cells of §3.4b step 2 — `live` × `wait in future` — each asserting outcome, whether subscribe was called, and whether a state write happened. The `live + future wait` cell is named explicitly: it must report `renewal_failing`, **not** `backoff_waiting`, because a live channel is never parked on the ladder (R2 finding 4). *Catches:* re-gating live channels on the ladder.

16b. **Write-iff-attempt rule** (`tests/drive/**`, deps-injected). For every outcome, assert whether a state write occurred: `recovered`/`still_orphaned` → exactly one; `healthy`, `renewal_failing`, `backoff_waiting`, `vacuous`, every `infra_error` → **zero**, asserted with a spy on the write transport. *Catches:* R4 finding 5's lost update — a synthetic `healthy` write resetting a concurrent failure's bookkeeping — and R4 finding 7's mislabeled `last_outcome` after a failed manual Retry against a live channel.

16c. **Attempt survives failure-finalization faults** (`tests/drive/**`, deps-injected). The R4 finding 6 class: make `markWatchOrphanedWithTx` throw at each of its two production fault points (`drive_watch_channels.mark_orphaned` and the alert upsert, `lib/drive/watch.ts:402-414`) *after* Drive has already failed, and assert reconcile records `subscribe_infra` **and still executes statement (A)** with the ladder advanced. Loop three cycles under a persistent fault and assert `consecutive_failures === 3`, not 0. *Catches:* the 15-minute call storm this feature exists to prevent, arriving through the feature's own error handling.

16d. **State write transport, concurrency** (`tests/db/**`, real DB). Two concurrent writers through the `WatchTx` method against the same folder both taking (A) → final `consecutive_failures === 2`, each caller's `returning` reflecting the row it wrote. Plus the no-pre-existing-row case asserting the insert lands `1`, not `0`. *Catches:* R2 finding 8 (a read-then-write implementation) and the first-failure-as-zero bug that would render "0 reconnect attempts".

17. **Fault-versus-attempt independence** (`tests/drive/**`, deps-injected). For every post-attempt fault (`alert_resolve_write`, `guard_read`, `guard_write`, `pref_read`, `recipients_read`, `email_send`, `escalation_helper`, escalation-time `alert_row_read`) and the pre-attempt `pending_sweep`, assert the cycle reports `infra_error` **and** the completed attempt's write still landed. *Catches:* the same call-storm class as 16c, arriving through a later step instead of an earlier one.

18. **Production data-path integration** (`tests/db/**` + `tests/components/**`). Real `drive_watch_reconcile_state` rows read through the **actual** loaders — `lib/admin/bellFeed.ts` and the `app/admin/settings/page.tsx` service-role read — asserting the values reach `BellEntry.watchState` and the `DriveConnectionPanel` prop respectively, plus the failure arm (state read errors → `watchState: null`, feed and panel still render). *Catches:* R1 finding 4's class exactly — component fixtures passing while production never supplies the field, and the session-client privilege error degrading the Settings panel.

19. **Doug copy per outcome** (`tests/components/**`). One rendered case per §3.7 row: `still_orphaned` with a future attempt; `still_orphaned` past-due; `backoff_waiting`; and **every non-rendering outcome** — `renewal_failing`, `healthy`, `recovered`, `vacuous`, `infra_error`, and `watchState === null` — asserting the line is absent. The `renewal_failing` case is the R3-finding-6 class: a sampled state must never claim current liveness. Plus the count-clause guards (0 omitted, 1 singular). Anti-tautology: each absence assertion scans a cloned subtree with the alert's own cataloged copy removed first, so a stray count or timestamp anywhere in the row fails the test.

20. **`watch_backoff_ms` ↔ `BACKOFF_LADDER_MS` parity** (`tests/db/**`, real DB). The SQL function and the TypeScript constant agree for n = 1..8, compared against the independent literal table from class 1. *Catches:* the ladder drifting between its two implementations — a class that exists only because the conflict path computes the wait in SQL (§3.3a).

21. **Live validation probe (pre-merge).** After the migrations are applied surgically to validation, `pnpm observe watch --env validation` shows the new columns and the next renewal produces a 24h `expiresAt`. Mocked-only review of a cadence/lease change invites a tautological APPROVE; this is the live-integration leg.

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
