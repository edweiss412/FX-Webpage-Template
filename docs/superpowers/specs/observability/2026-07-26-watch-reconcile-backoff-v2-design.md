# Watch-Channel Reconcile Backoff v2: 15-Minute Cadence, State Table, Ladder on the Single Retry Surface, Duration-Based Escalation

**Date:** 2026-07-26
**Status:** Design ratified by the user 2026-07-26. Ship mode: autonomous through merged PR.
**Branch:** `feat/watch-reconcile-backoff` off `origin/main` @ `9787128b6`
**Closes:** `BL-WATCH-RECONCILE-BACKOFF` (BACKLOG.md).
**Supersedes:** `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md` (status DEFERRED — retained as the analysis record; its round-by-round disposition tables R1–R5 are incorporated by reference and NOT repeated here). This v2 document re-derives every constant, every cadence claim, and every code citation against the post-`watch-renewal-lifecycle` tree, per the backlog's unblock note ("re-derived, not resumed").

---

## 1. Problem, updated for the post-lifecycle tree

The deferred design's blocking premise — "refresh, not reconcile, is the dominant retry path, and it is ungated" — was dissolved by the watch-renewal-lifecycle PR (#611): the reap removes an expired folder from the renewal query before `listRenewalDue` runs, and refresh renews only the configured folder. **Reconcile's `!live` branch (`lib/drive/watch.ts:1334-1361`) is now the single retry surface** (2026-07-26 lifecycle design §8.6) — precisely where a backoff ladder attaches.

What remains true and unfixed:

| Fact | Evidence |
|---|---|
| Renewal/reconcile sampling is **hourly** | `fxav_cron_refresh_watch`, `'0 * * * *'` (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:106`); `SAMPLING_PERIOD_MS = 3_600_000` (`lib/drive/watchErrors.ts:68`) |
| A folder with **no live channel** waits up to 60 min per retry | reconcile subscribes once per tick in the `!live` branch (`lib/drive/watch.ts:1334-1338`) |
| No retry bookkeeping exists | no `drive_watch_reconcile_state` table; no attempt count, no next-attempt time, no last-error record anywhere |
| Escalation is count-based | `alert.occurrence_count >= ESCALATION_THRESHOLD || errorClass === "config"` (`lib/drive/watchEscalation.ts:102`); `ESCALATION_THRESHOLD = 3` (`lib/drive/watchErrors.ts:8`) |
| Shipped copy asserts an hourly cadence | `lib/messages/catalog.ts:364` / `lib/messages/catalog.ts:366` / `lib/messages/catalog.ts:369`; escalation emails `lib/drive/watchEscalation.ts:67` / `lib/drive/watchEscalation.ts:73` |

At `*/15` with no state, a persistently broken folder would cost 96 futile Drive calls/day with no record of what failed or when we retry next. Backoff state earns its place the moment cadence quadruples; that coupling is why the two ship together (ratified scope, §1.1a-1).

The value of the cadence change is recovery latency when **no channel is live** — a newly-configured folder whose first subscribe failed, a Drive-side revocation, post-GC. Today up to 60 minutes of degraded push delivery; at 15 minutes, ~15. Scheduled sync (`fxav_cron_sync`, `*/5`) carries the data regardless; nothing here is an outage fix.

## 1.1a Resolved scope — do not relitigate

Items 1–10 of the deferred design's §1.1a (`docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md:46-59`) were ratified by the user on 2026-07-24 and **carry forward unchanged**; the user re-ratified the full scope on 2026-07-26 ("Scope stands"). Summarized, with deltas noted:

1. **Full scope ships: 15-min cadence + `drive_watch_reconcile_state` + exponential backoff + tiered surfacing.** Zero observed failures is context, not a counter-proposal.
2. **Escalation becomes duration-based (3h).** `ESCALATION_THRESHOLD` is retired, not retuned.
3. **Surfacing is split by field.** Next-attempt time + attempt count → Doug; error class/message/ladder position → developer only (observe CLI).
4. **`WATCH_CHANNEL_ORPHANED` stays `audience: "doug"`** (`lib/messages/catalog.ts:360`) and stays one global unresolved row.
5. **No advisory locks on any watch surface.** Zero holders today (`grep -n "pg_advisory\|hashtext" lib/drive/watch.ts` → none); AGENTS.md invariant 2 does not apply (none of its five tables is mutated). Concurrency defense: single atomic statements (§3.3a) + the partial unique index.
6. **Fail-open posture unchanged.** `subscribeToWatchedFolder` returns `orphaned` rather than throwing (`lib/drive/watch.ts:695-744`).
7. **The stale-pending sweep stays silent** (`lib/drive/watch.ts:1234-1253`) — moves nothing, changes nothing.
8. **`drive_watch_channels`' own PostgREST grants are out of scope** (`BL-ADMIN-POSTGREST-DML-LOCKDOWN`). The NEW table is locked down from birth.
9. **No dedicated reconcile cron.** The 15-min cadence is delivered by RE-SCHEDULING the existing `fxav_cron_refresh_watch` job; reconcile stays in the refresh route, consuming the same-cycle in-process `RefreshResult` (`lib/drive/watch.ts:1225-1227`). Ratified after R4 finding 1 of the deferred series; do not re-propose a separate cron without refuting it.
10. **Chrome vs catalog copy.** The next-attempt line is UI chrome (same class as the bell auto-resolve note, `components/admin/BellPanel.tsx:355-360`), not §12.4 message copy.

New items, ratified 2026-07-26:

11. **`T_EXEC_BUDGET_MS` stays 300_000.** The deferred design's 60_000 was falsified when the lifecycle PR shipped the run budget at 300_000 with `REFRESH_RUN_BUDGET_MS` aliasing it (`lib/drive/watchErrors.ts`). This spec's timing invariants use the shipped value; do not propose shrinking it here.
12. **The unbounded credential fetch stays out of scope.** `BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED` is its own entry; the backlog states any fix "affects every Drive caller and so wants its own review". Every timing claim in §2.1a is therefore enforced modulo that residual, stated in the same posture as the lifecycle design's §8.4. Do not fold an auth-transport change into this diff.
13. **Ship mode: autonomous through merged PR** (re-ratified; deferred design D8).

## 2. Resolved decisions

D1–D11 of the deferred design carry forward. Restated with post-lifecycle citations where the ground moved:

| # | Decision | Choice |
|---|---|---|
| D1 | Cadence | Move `fxav_cron_refresh_watch` to `'7,22,37,52 * * * *'`; `SAMPLING_PERIOD_MS` → 900_000. No new job, no new route. |
| D2 | Ladder placement | Reconcile's `!live` branch only (`lib/drive/watch.ts:1334`), gated by `next_attempt_at`. A live channel is never parked on the ladder. |
| D3 | State writes | Write iff a subscribe attempt completed this cycle (§3.3a). Nothing else writes. |
| D4 | Escalation trigger | `now - alert.raised_at >= ESCALATION_AFTER_MS`, or immediately when `errorClass === "config"`. |
| D5 | Surfacing transport | One shared service-role helper `readWatchSurfaceState(folderId)` feeding both Doug surfaces; `get_bell_feed_rows` NOT widened; `DriveConnectionHealth` union NOT widened. |
| D6 | Developer surfacing | Telemetry deep link (unfiltered) + observe CLI columns. No new telemetry component. |
| D7 | Error detail transport | Widen `SubscribeResult`'s orphaned arm with `errorClass`/`errorMessage` (§3.3); values travel with the result, no cross-table re-read. |

### 2.1 Named constants (single source of truth)

All in `lib/drive/watchErrors.ts`. Later sections use the NAMES, never literals.

- `SAMPLING_PERIOD_MS` = **900_000** (15m) — EDIT of the existing constant (`lib/drive/watchErrors.ts:68`, currently 3_600_000). Still "how often `fxav_cron_refresh_watch` runs"; the comment stays true.
- `BACKOFF_LADDER_MS` = **[900_000, 1_800_000, 3_600_000, 7_200_000]** (15m, 30m, 1h, 2h) — new. Nth consecutive failure waits `BACKOFF_LADDER_MS[min(N, len) - 1]`; last entry repeats.
- `BACKOFF_MAX_MS` = **7_200_000** — definitionally `BACKOFF_LADDER_MS.at(-1)`, asserted equal by test, never written twice.
- `ESCALATION_AFTER_MS` = **10_800_000** (3h) — new. Replaces `ESCALATION_THRESHOLD`.
- `ESCALATION_THRESHOLD` — **deleted.** Readers verified 2026-07-26: definition `lib/drive/watchErrors.ts:8`, import `lib/drive/watchEscalation.ts:8`, sole use `lib/drive/watchEscalation.ts:102`. Nothing else (`grep -rn ESCALATION_THRESHOLD` across `lib/ app/ tests/` at plan time re-verifies).
- Unchanged and NOT touched: `WATCH_TTL_MS` (86_400_000), `RENEWAL_LIFE_FRACTION` (0.75), `RENEWAL_MIN_LEAD_MS` (7_200_000), `T_EXEC_BUDGET_MS` (300_000, §1.1a-11), `REFRESH_RUN_BUDGET_MS` (alias), `DRIVE_CALL_TIMEOUT_MS` (15_000), `STALE_PENDING_MAX_AGE_MS` (3_600_000), `GC_*`, `REAP_ID_LOG_CAP`.
- Schedule literal = **`'7,22,37,52 * * * *'`**. Collision check re-run 2026-07-26 against ALL eleven live schedules (two scheduling migrations plus `cleanup-bootstrap-nonces` `*/5`, `app_events_prune` `17 4 * * *`): claimed minutes are multiples of 5, 15, 30, and 17 (daily, 04:17). 7/22/37/52 collide with none. `fxav_cron_gc_watch` stays at minute 15 — reconcile ticks at :07/:22/:37/:52 never coincide with GC.

#### 2.1a Timing invariants (pinned by §6 class 1)

Let `G` = granted channel life (`expires_at - created_at`), `L(G) = max(RENEWAL_MIN_LEAD_MS, G * (1 - RENEWAL_LIFE_FRACTION))` (the shipped renewal predicate, `lib/drive/watch.ts:362-365`), `P = SAMPLING_PERIOD_MS` (900_000), `T = T_EXEC_BUDGET_MS` (300_000).

- **I1 — renewal is sampled before expiry.** One boundary: `G <= P + T` (**20 min**) is anomalous — no pre-expiry guarantee, `DRIVE_WATCH_GRANT_TOO_SHORT` posture unchanged from the lease-slack work; `G > P + T` is guaranteed — examined-and-due strictly before `expires_at` at every activation phase, margin `G - P - T`. Today's grants: 1h → 40m margin; 24h → 23h40m. The §6 test is a phase sweep over a simulated tick series, never a restatement of the formula.
- **I2 — the ladder never runs while a channel is live.** Structural, not arithmetic: the ladder is consulted only inside the `!live` branch. The arithmetic form would be FALSE — `BACKOFF_MAX_MS + SAMPLING_PERIOD_MS` (2h15m) exceeds the renewal floor (2h) — which is exactly why control flow, pinned by test 16a, enforces it.
- **I3 — recovery latency is bounded.** A folder with no live channel is retried within `SAMPLING_PERIOD_MS + BACKOFF_LADDER_MS[n]`.
- **Residual (§1.1a-12):** all three are enforced modulo the unbounded `GoogleAuth` credential fetch (`BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED`). Stated once here; no per-claim repetition.

## 3. Design

### 3.1 Cadence: reschedule the existing job

New migration (pattern: `supabase/migrations/20260527000003_schedule_cron_jobs.sql:106-112`): `cron.unschedule('fxav_cron_refresh_watch')` if present, then `cron.schedule('fxav_cron_refresh_watch', '7,22,37,52 * * * *', …)` with the identical command body. Idempotent by construction (unschedule-if-exists + schedule).

Fan-out, each re-derived by grep 2026-07-26:

| Surface | Action |
|---|---|
| `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json:10` | `schedule` value `"0 * * * *"` → `"7,22,37,52 * * * *"`; jobname/route unchanged |
| `tests/cross-cutting/pg-cron-coverage.test.ts:68-71` | add the new migration path to `SCHEDULE_MIGRATION_PATHS` |
| `lib/cron/runSummary.ts:54-59` (`refresh-watch` entry) | `cadence: "hourly"` → `"every 15 min"`; `staleAfterMs: 3 * 3_600_000` → `45 * 60_000` (copies the `asset-recovery` 15-min pattern, `lib/cron/runSummary.ts:68-73`) |
| `tests/cron/runSummary.test.ts:21` (`CADENCE_MS` map) | `"refresh-watch": 3_600_000` → `900_000` |
| validation project `vzakgrxqwcalbmagufjh` | surgical apply + `notify pgrst, 'reload schema'` (both migrations, §4.3) |

**Cron-count invariance:** no job added; the count stays **nine** and every literal-nine assertion (`tests/cron/cronJobsParity.test.ts`, `tests/admin/loadCronHealth.test.ts`, `tests/e2e/telemetry-layout.spec.ts:11`, `app/admin/dev/telemetry-dim/page.tsx:9`, the 2026-06-29 phase2 design's nine-job claims) is untouched. Close-out re-runs those suites to prove it.

**Cost:** refresh's per-tick work is one reap + one indexed renewal read inside one tx (`lib/drive/watch.ts:876-881`). With the shipped proportional predicate a 24h channel is due only in its final 6h, so 4x tick ≠ 4x Drive calls (~1 renewal/day steady-state). `REFRESH_RUN_BUDGET_MS` (5m) < period (15m): runs cannot overlap their successor.

### 3.2 `drive_watch_reconcile_state`

One row per watched folder (PK `watched_folder_id`), so a folder switch cannot inherit the old folder's ladder position. DDL, CHECKs, and lockdown are unchanged from the deferred design §3.3 and normative here:

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
revoke all on table public.drive_watch_reconcile_state from public, anon, authenticated;
grant all privileges on table public.drive_watch_reconcile_state to service_role;
alter table public.drive_watch_reconcile_state enable row level security;
```

- Lockdown shape is byte-for-byte `show_share_tokens` (`supabase/migrations/20260523000002_show_share_tokens.sql:43-45`): fully private, RLS enabled with NO policy. **Not an "admin-only table"** in the master spec §4.3 sense — the deferred design §3.3 proved `show_share_tokens` appears in none of the §4.3 list / `lib/audit/admin-tables.generated.ts` / `tests/db/admin-rls-runtime.baseline.json`, and the same holds here: no §4.3 edit, no count bump, no `ADMIN_TABLES` regen, no baseline change.
- Registered in `RPC_GATED_TABLES` (`tests/db/postgrest-dml-lockdown.test.ts:147`) with `selectAnon: false, selectAuthenticated: false`; precedent for a service-role-written row: `app_events` (`tests/db/postgrest-dml-lockdown.test.ts:213`). The bidirectional migrations-walk discovery (`tests/db/postgrest-dml-lockdown.test.ts:826-857`) fails CI if the REVOKE migration lands without the row.
- `last_error_class` mirrors `WatchErrorClass` (`lib/drive/watchErrors.ts:5`); `last_outcome` mirrors `ReconcileOutcome` (`lib/drive/watch.ts:1202-1208`) + the new `backoff_waiting` arm. §4.2 is the CHECK↔union matrix.
- `last_error_message` stores only `redactWatchError` output (`lib/drive/watchErrors.ts`) — same chokepoint as the alert context; no raw error reaches the column.
- The migration is a one-shot forward `create table` — deliberately NOT idempotent; re-applying fails loudly on the duplicate relation. The REVOKE/GRANT statements are naturally idempotent.

**Error detail transport.** `SubscribeResult`'s orphaned arm (`lib/drive/watch.ts:115-117`) widens to carry `errorClass: WatchErrorClass; errorMessage: string`. Both values are already computed at the two catch sites (`lib/drive/watch.ts:724`, `lib/drive/watch.ts:817`) and written to the alert context; the widening surfaces them to the caller. Existing callers ignore the extra fields.

**Transport and registries.** The two state-write statements are `WatchTx` methods carrying raw SQL (interface `lib/drive/watch.ts:60-111`), invoked through `callWatchTx` so they inherit the `DriveWatchInfraError` contract. Two registry surfaces, not interchangeable:

| Surface | Transport | Registry |
|---|---|---|
| `recordAttemptFailure` / `recordAttemptSuccess` (§3.3a) | `WatchTx` raw SQL via `callWatchTx` | `tests/sync/_metaInfraContract.test.ts` (owns `lib/drive/watch.ts` helpers, rows near `tests/sync/_metaInfraContract.test.ts:43-55`) |
| `readWatchSurfaceState` (§3.5) | Supabase service-role `.select()`, `{ data, error }`, `null` on fault | `tests/admin/_metaInfraContract.test.ts` (owns the bell + Settings loaders, rows near `tests/admin/_metaInfraContract.test.ts:287-313`) |

### 3.3 The ladder, and 3.3a write-iff-attempt

> **A state write happens if and only if a subscribe attempt completed in this cycle. Nothing else writes.**

| Cycle | Attempt? | Write |
|---|---|---|
| subscribe returned `active` | yes | **(B)** success reset |
| subscribe returned `orphaned` | yes | **(A)** failure record, error fields from the widened result |
| subscribe threw | yes — Drive was called | **(A)** with `'db'` and the redacted throw message |
| `healthy`, `renewal_failing`, `backoff_waiting`, `vacuous`, every `infra_error` path that made no attempt | no | **none** |

The two statements and the SQL ladder function are unchanged from the deferred design §3.3a and normative here (single atomic upserts; increment evaluated against the STORED row; both paths route the wait through `watch_backoff_ms(n)`):

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
   set consecutive_failures = 0, last_attempt_at = now(), next_attempt_at = now(),
       last_outcome = 'recovered', last_error_class = null, last_error_message = null,
       updated_at = now()
returning consecutive_failures, next_attempt_at;

create function public.watch_backoff_ms(n integer) returns bigint
language sql immutable as $$
  select case
    when n is null or n < 1 then 900000::bigint  -- defensive floor, unreachable from (A)
    when n = 1 then 900000::bigint
    when n = 2 then 1800000::bigint
    when n = 3 then 3600000::bigint
    else 7200000::bigint
  end
$$;
```

`watch_backoff_ms` contract (asserted at `n = 0,1,2,3,4,5,8,null` against an independent literal table, §6 class 20): total, never null, monotonically non-decreasing, clamped at `BACKOFF_MAX_MS`.

**Attempt survives bookkeeping faults.** `markWatchOrphanedWithTx` (`lib/drive/watch.ts:678-693`) can throw after Drive already failed; that throw escapes `subscribeToWatchedFolder` and lands in reconcile's catch (`lib/drive/watch.ts:1358-1360`, currently `faults.push("subscribe_infra")`). That catch now ALSO executes statement (A) with `last_error_class = 'db'` — Drive was called, so the ladder advances whether or not our own bookkeeping of the failure succeeded. A persistent alert-write fault must not pin the ladder at zero (the 15-minute call storm this feature exists to prevent).

**Failure guards:** no row yet → (A) inserts `consecutive_failures = 1`, (B) inserts `0`. Folder switch → fresh PK row; old row left in place (§7). A failing state write records fault `state_write`, returns `infra_error`, leaves bookkeeping one cycle stale — the attempt itself already happened and already raised its alert.

### 3.4 Reconcile changes (the route is otherwise untouched)

Reconcile stays in the refresh route consuming the same-cycle `RefreshResult` (§1.1a-9). Steps, anchored to the shipped structure (`lib/drive/watch.ts:1225-1391`):

1. Stale-pending sweep, folder read, `hasLiveActiveChannel`, `renewalFailed` predicate: **unchanged** (`lib/drive/watch.ts:1234-1309`).
2. **Backoff gate** *(new)*: in the `!live` path only, before the subscribe at `lib/drive/watch.ts:1336`, read the state row (a new `WatchTx` read via `callWatchTx`; read fault → `state_read` fault → `infra_error`, no attempt, no write). If `next_attempt_at > now()`: skip the subscribe, `outcome = "backoff_waiting"`. A live channel never consults the ladder (I2).
3. **Attempt recording** *(new)*: per §3.3a, in all three attempt-completing arms (active / orphaned / threw).
4. **Escalation runs on every unhealthy outcome including `backoff_waiting`**: the condition at `lib/drive/watch.ts:1372` (`outcome === "still_orphaned" || outcome === "renewal_failing"`) gains `|| outcome === "backoff_waiting"`. Backing off suppresses the Drive call, never the escalation check or the resolve-on-recovery path.
5. **Result shape:** `ReconcileOutcome` (`lib/drive/watch.ts:1202-1208`) gains `"backoff_waiting"`; `ReconcileResult` (`lib/drive/watch.ts:1209-1214`) gains `nextAttemptAt: string | null` and `consecutiveFailures: number | null`, taken from the state write's `returning` clause (null when no write happened this cycle). The refresh-watch route serializes them; route tests assert the widened body.
6. **Union refactor prerequisite** (§6 class 5): `ReconcileOutcome` and `WatchErrorClass` become runtime `as const` arrays (`RECONCILE_OUTCOMES`, `WATCH_ERROR_CLASSES`) with types derived from the arrays. Structurally identical types; no consumer changes.
7. `refreshWatchSubscriptions` writes NO state — asserted by spy (§6 class 7).

### 3.5 Escalation: duration, not count

`due` at `lib/drive/watchEscalation.ts:102` becomes `now - alert.raised_at >= ESCALATION_AFTER_MS || errorClass === "config"`.

- `readUnresolvedWatchAlert`'s SELECT (`lib/drive/watchEscalation.ts:32`) gains `raised_at`; `WatchAlertRow` (`lib/drive/watchEscalation.ts:19-23`) gains the field.
- `admin_alerts.raised_at` is `timestamptz not null default now()` (`supabase/migrations/20260501001000_internal_and_admin.sql:273`) and the dedup RPC's `do update set` touches `last_seen_at` / `occurrence_count` / `context` but NOT `raised_at` (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:48-69`, re-verified 2026-07-26) — so `raised_at` is exactly "when this incident window opened".
- Everything downstream — the fired-once guard read / recheck / guard write / sends ordering (`lib/drive/watchEscalation.ts:105-169`) — is load-bearing and untouched. `occurrence_count` stays in the guard context and Sentry payload; it stops being the trigger, not the evidence.
- Guards: future `raised_at` (clock skew) → negative age → not due. Config-class fires at age 0. Dismissed-then-re-raised → fresh `raised_at`, fresh 3h window (intended).

### 3.6 Surfaces — split by field

| Field | Tier |
|---|---|
| `next_attempt_at`, `consecutive_failures` | Doug (bell line + Settings line) |
| `last_error_class`, `last_error_message`, `last_outcome`, ladder position | Developer — `pnpm observe watch` ONLY; never in any UI at any tier |

**Shared helper.** `readWatchSurfaceState(folderId: string): Promise<WatchSurfaceState>` — one service-role `.select()` on the state table, `{ data, error }` destructured, `null` on any fault. `WatchSurfaceState = { nextAttemptAt: string | null; consecutiveFailures: number; lastOutcome: ReconcileOutcome | null } | null`. Registry row in `tests/admin/_metaInfraContract.test.ts` (§3.2). Callers supply the folder id from reads they already perform:

- **Bell:** `lib/admin/bellFeed.ts` calls `getActiveWatchedFolderId()` once per feed load alongside its existing settings read (`lib/admin/bellFeed.ts:197-209`); `BellEntry` (`lib/admin/bellFeed.ts:29-52`) gains optional `watchState: WatchSurfaceState`, null for non-watch rows and on any fault (a failed read never breaks the feed). `get_bell_feed_rows` (`lib/admin/bellFeed.ts:219`) is NOT modified.
- **Settings:** `app/admin/settings/page.tsx` performs its own service-role read via the same helper and passes `watchState` as a new optional prop to `DriveConnectionPanel`. The `DriveConnectionHealth` union (`lib/admin/driveConnectionHealth.ts:39-57`, `folderId` carried at `lib/admin/driveConnectionHealth.ts:43` / `lib/admin/driveConnectionHealth.ts:52`) and its session-scoped loader (`lib/admin/driveConnectionHealth.ts:107`) are untouched — the loader's session client cannot read a service-role-only table (deferred R1 finding 4), which is why the state is NOT threaded through the health union.

**Rendering (both surfaces, same sentence).** A `<p>` mirroring the bell auto-resolve note's exact shape (`components/admin/BellPanel.tsx:355-360`: `data-testid`, `className="wrap-break-word text-sm text-text-subtle"`), rendered only when the ladder is actually in play:

| `lastOutcome` | Rendered line |
|---|---|
| `still_orphaned` or `backoff_waiting`, `nextAttemptAt` in future | `Trying again at 4:45 PM · 7 reconnect attempts so far` |
| `still_orphaned`, `nextAttemptAt` past or null | `Trying again shortly · 7 reconnect attempts so far` |
| anything else, or `watchState === null` | line absent; row renders exactly as today |

Count clause: omitted at 0; singular at 1. No "still connected" line ever renders (`renewal_failing` is a sampled state, not current liveness — deferred R3 finding 6). Time formatting copies `formatStagedAt` (`components/admin/StagedReviewCard.tsx:104-113`): module-local `toLocaleString`, NaN-parse guard renders the raw ISO string, `<time dateTime={iso} suppressHydrationWarning>` for the SSR/client timezone mismatch.

- Bell placement: in the watch row's action cell (`BellActionRow`, `components/admin/BellPanel.tsx:277-377`), rendered when the entry is the watch alert and not health, and state is present.
- Settings placement: inside the existing explainer block, same visibility condition as the Retry control (`components/admin/settings/DriveConnectionPanel.tsx:100-108`: `watch_inactive` / `watch_expired` / `not_configured`-with-folder). `watchState === null` → sentence omitted, nothing else changes.

**Developer link.** The watch bell row gains `View in telemetry ↗` when `viewerIsDeveloper`, reusing the health-row affordance (`components/admin/BellPanel.tsx:308-315`). `viewerIsDeveloper` is currently consumed lower in the tree (`components/admin/BellPanel.tsx:1087`, `components/admin/BellPanel.tsx:1092`) and must be threaded into the action-cell component; render condition becomes `entry.isHealth || (isWatch && viewerIsDeveloper)`. The link is **unfiltered**: `loadAppEvents` applies `source` as an exact `.eq` (`lib/admin/loadAppEvents.ts:39`) and the relevant events span four source values; the multi-source `.in()` path exists only in the observe layer (`lib/observe/query/events.ts:82`), and widening the admin loader for one deep link is out of scope. Stated so nobody "fixes" the link with a single-source param.

**Observe CLI.** `lib/observe/query/watch.ts` gains the state columns (left join or second query on `watched_folder_id`). The SELECT constant (`lib/observe/query/watch.ts:9-10`) must NOT regain the webhook-secret column — `tests/observe/queryWatch.test.ts:61-63` scans for it. `last_error_message` passes through the same `sanitizeIdentityString` treatment used at `lib/observe/query/failures.ts:55` / `lib/observe/query/failures.ts:61`.

**Admin Retry** (`app/admin/actions.ts`, retry-watch action) calls the SAME two statements: subscribe active → (B); orphaned → (A) (a failed manual retry IS a failed attempt and advances the ladder — deliberate, so Retry-mashing cannot reset the cadence); thrown `DriveWatchInfraError` → no write (no attempt completed), action stays fail-visible.

#### Mode boundaries

| Element | Healthy | Watch alert, backing off | Watch alert, attempting now | + viewer is developer |
|---|---|---|---|---|
| Retry form | — | ✓ (unchanged) | ✓ (unchanged) | ✓ |
| Next-attempt line | — | `Trying again at <time> · <n> …` | `Trying again shortly · <n> …` | same |
| `View in telemetry` link | — | — | — | ✓ (watch row) |
| Error class/message | — | — | — | CLI only |

#### Transition inventory

States: **A** line absent, **B** future next-attempt, **C** past-due/null. 3 pairs:

| Pair | Trigger | Treatment |
|---|---|---|
| A↔B | first failure writes a row / recovery | server re-render; instant — no animation (matches the auto-resolve note) |
| A↔C | alert raised with attempt already due | server re-render; instant |
| B↔C | clock passes `next_attempt_at` | no client transition — line is server-rendered, updates on next bell refresh (deliberate; no timer) |
| Compound: Retry pending while line shown | Retry submit | line is static text; `RetryWatchButton`'s own `useFormStatus` drives the button; no shared state |

#### Dimensional invariants

N/A — the line is a block-level `<p>` sibling in the existing column flow, classes copied verbatim from `components/admin/BellPanel.tsx:355-360`; no fixed-dimension parent, no new flex/grid relationship. Stated so the plan's layout-dimensions mandate is discharged by citation.

#### Cap/truncation

One sentence, one bounded integer (grows ≤ 12/day at the ladder cap), one timestamp; `wrap-break-word` handles narrow viewports. No cap needed; a four-digit count would itself be the story.

### 3.7 Copy lockstep (§12.4 three-way)

Shipped strings asserting an hourly cadence, all verified live 2026-07-26:

| Location | Claim |
|---|---|
| `lib/messages/catalog.ts:364` (`followUp`) | "Auto-retry hourly; admin Retry now; Eric if escalated" |
| `lib/messages/catalog.ts:366` (`helpfulContext`) | "…It reconnects on its own each hour…" |
| `lib/messages/catalog.ts:369` (`longExplanation`) | "…retries the connection automatically every hour…" |
| `lib/drive/watchEscalation.ts:67` and `lib/drive/watchEscalation.ts:73` (email, text + HTML) | "FXAV retries the connection automatically every hour." |

Replacement strings are canonical HERE (invariant 7). They avoid naming any interval so a ladder edit cannot re-falsify them:

| Field | New literal |
|---|---|
| `followUp` | `Auto-retry with backoff; admin Retry now; Eric if escalated` |
| `helpfulContext` | `At worst, edits take a few minutes to appear instead of instantly, since the scheduled sync still runs. It keeps trying to reconnect on its own, waiting longer between attempts the longer it fails, or use Retry now. Only worth attention if it keeps failing.` |
| `longExplanation` | `This appears when the connection that makes sheet edits show up instantly can't be set up or renewed. Shows keep syncing on the normal schedule regardless, so nothing is lost; at worst, edits take a few minutes longer to appear instead of showing up instantly. The system keeps retrying the connection on its own, waiting longer between attempts the longer it fails, and a Retry now action is available to try immediately. If it keeps failing, it gets flagged for support.` |
| `dougFacing`, `title` | unchanged (no cadence claim) |
| both email sentences | `FXAV keeps retrying the connection on its own, waiting longer between attempts the longer it fails. An admin can also retry immediately: open the dashboard banner or Settings → Drive connection and use "Retry now".` |

`followUp`/`helpfulContext` are x1-compared (`tests/cross-cutting/codes.test.ts:84-89`), so one commit carries: (a) master-spec §12.4 row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2817` + long-context map at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3336` (never prettier the master spec), (b) `pnpm gen:spec-codes` regen, (c) `lib/messages/catalog.ts`. No new code minted.

**Other master-spec claims this diff falsifies** (edited in the same commit, outside the §12.4 lockstep): `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1321` — §5.5.5's renewal-cron prose names `0 * * * *`/hourly; becomes the new schedule. The lease-slack PR already amended AC-6.13 to the proportional predicate (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3844`) and removed the "~7 days" cap claim — verified 2026-07-26, no edit needed there. Escalation-email test copy assertions (`tests/drive/watchEscalation*.test.ts`) update with the string change.

Mechanical UI-copy gate applied at spec time to every string above: no em-dashes, no invented abbreviations; apostrophes as typed above.

## 4. Completeness matrices

### 4.1 Tier × domain × layer

| Layer | `drive_watch_reconcile_state` | `drive_watch_channels` | `admin_alerts` | Cron | UI |
|---|---|---|---|---|---|
| DDL | new (§3.2) | unchanged | unchanged | reschedule migration (§3.1) | N/A |
| CHECK | 3 new (§4.2) | unchanged | unchanged | N/A | N/A |
| Index | PK only | unchanged | unchanged | N/A | N/A |
| Grants/RLS | full lockdown + registry row | out of scope (§1.1a-8) | unchanged | N/A | N/A |
| Read | reconcile gate; observe CLI; `readWatchSurfaceState` | `hasLiveActiveChannel` unchanged | `readUnresolvedWatchAlert` +`raised_at` | N/A | BellPanel, DriveConnectionPanel |
| Write | reconcile §3.3a; admin Retry. `refreshWatchSubscriptions` is NOT a writer | unchanged | unchanged | N/A | N/A |
| Cleanup | N/A — one row per folder | unchanged | unchanged | N/A | N/A |
| Tests | §6 | §6 | §6 | §6 | §6 |

### 4.2 CHECK/enum matrix

| Constraint | Values | Source of truth | NULL | Apply-twice |
|---|---|---|---|---|
| `…_error_class_check` | `config`, `drive_api`, `db` | `WATCH_ERROR_CLASSES` (§3.4 step 6 refactor of `lib/drive/watchErrors.ts:5`) | allowed | one-shot `create table`; not idempotent by design |
| `…_outcome_check` | 6 shipped outcomes + `backoff_waiting` | `RECONCILE_OUTCOMES` (§3.4 step 6 refactor of `lib/drive/watch.ts:1202-1208`) | allowed | same |
| `…_failures_nonneg` | `>= 0` | — | not-null | same |

Transitional window: none (new table). A structural meta-test pins both CHECKs against the runtime arrays, set-equality both directions, with a negative control (§6 class 5).

### 4.3 Migration → validation parity

Two migrations (state table; reschedule). Same-PR checklist per AGENTS.md: local apply + tests; `pnpm gen:schema-manifest` + commit (state table adds public columns); surgical apply of BOTH to validation `vzakgrxqwcalbmagufjh` + `notify pgrst, 'reload schema'`. `validation-schema-parity` enforces the first; the reschedule is verified by the §6 class-21 live probe (`pnpm observe cron --env validation` or `cron.job` query showing the new schedule).

### 4.4 Flag lifecycle

| Field | Storage | Write | Read | Effect |
|---|---|---|---|---|
| `next_attempt_at` | state table | §3.3a; Retry | reconcile gate; both Doug lines; CLI | suppresses subscribe while future; renders line |
| `consecutive_failures` | state table | §3.3a | ladder index (in SQL); Doug line; CLI | selects wait; renders count |
| `last_error_class`/`_message` | state table | §3.3a failure arm; cleared on success | CLI only | developer diagnosis |
| `last_outcome` | state table | §3.3a | line-render branch; CLI | selects Doug copy row |
| `ESCALATION_AFTER_MS` | constant | — | escalation `due` | when Sentry+email fire |

No zombie columns.

## 5. Empirical grounding

- Reconcile-as-single-retry-surface: established by the lifecycle PR's measured reap (48→24 calls/day, lifecycle design §1.2) and re-verified against `lib/drive/watch.ts:1334-1361` on this branch's base commit.
- `raised_at` dedup survival: re-verified against the RPC body 2026-07-26 (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:48-69`).
- Cron collision map: enumerated from all eleven live schedules (both scheduling migrations + `20260504000001` + `20260629000002`), not a sample.
- `ESCALATION_THRESHOLD` reader set: three grep hits, all named in §2.1.
- No race state machine in prose: the one concurrency surface (two writers, one row) is closed by single atomic statements evaluated by Postgres, pinned by a real-DB concurrency test (§6 16d).

## 6. Testing

TDD per task. Placement per `vitest.projects.ts:96-97`: `tests/drive/**`/`tests/cron/**` are PARALLEL DB-free (a DB touch there fails in `unit-suite-nodb` by design); DB classes live in `tests/db/**` (serial); components in `tests/components/**`; CLI in `tests/observe/**`.

The 21 test classes of the deferred design §6 carry forward as the normative inventory, with these re-derivations:

1. Class 1 (constants + I1 phase sweep) uses `P = 900_000`, `T = 300_000`; grant table `{P−ε, P, P+T, P+T+ε, 1h, 6h, 24h}` with the boundary at 20m; ladder expectation is an independent literal table `[[1,"15m"],[2,"30m"],[3,"1h"],[4,"2h"],[5,"2h"],[6,"2h"]]`.
2. Classes 2–3 (lease request/predicate) SHIPPED with the lease-slack PR — dropped here; their suites must stay green untouched.
3. Class 6 (reconcile units) extends the existing reconcile suite in `tests/drive/watch.test.ts`: backoff gate cells; `backoff_waiting` still escalates (the §3.4 step-4 condition) and still resolves on recovery; state-read fault → `state_read` → `infra_error`, no write.
4. Class 7: spy asserts `refreshWatchSubscriptions` performs ZERO state writes on every path.
5. Class 10 (route): refresh-watch route body gains `nextAttemptAt`/`consecutiveFailures`; 200 for `backoff_waiting`; 500 + `outcome: "infra"` for `state_read`/`state_write` faults.
6. Classes 11/12/18/19 (components + production data path): as specified in §3.6, including the never-render-error-fields scan and the anti-tautology clause (clone subtree, strip the alert's cataloged copy, derive expected time through the same formatter).
7. Class 16a–16d, 17: unchanged contracts (gate decision table; write-iff-attempt spy table; attempt-survives-finalization-faults with 3-cycle `consecutive_failures === 3`; real-DB two-writer concurrency → `2`; fault-vs-attempt independence for every post-attempt fault name in the shipped inventory `lib/drive/watch.ts:1252-1381`).
8. Class 20: `watch_backoff_ms` ↔ `BACKOFF_LADDER_MS` parity (real DB, n = 1..8, independent literal table).
9. Class 21 (live validation probe, pre-merge): state columns visible via `pnpm observe watch --env validation`; `cron.job` shows `'7,22,37,52 * * * *'`; next renewal window behaves (no 15-min churn regression).
10. Meta-tests re-run, not assumed: `postgrest-dml-lockdown` bidirectional discovery, `validation-schema-parity` both layers, `_metaInfraContract` both registries, `_metaMutationSurfaceObservability` (no new mutating route; refresh-watch stays GET), literal-nine cron suites (§3.1), x1 catalog parity.

## 7. Out of scope

- `drive_watch_channels` PostgREST grants (`BL-ADMIN-POSTGREST-DML-LOCKDOWN`).
- Credential-fetch bound (`BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED`, §1.1a-12).
- Promotion/activation race (`BL-WATCH-PROMOTION-ACTIVATION-RACE`) — lock-topology change, own design.
- State-row cleanup for abandoned folders (one stale row per switch; bounded, harmless).
- Live-ticking countdown on the Doug line.
- Per-show watch alerts; alert stays global.

## 8. Watchpoints (reviewer preempts)

- **Zero observed failures is not a descope argument** — presented and declined twice (§1.1a-1).
- **`backoff_waiting` still resolves and still escalates** (§3.4 step 4; §6 class 6 asserts it). "Backoff" suppresses one Drive call, not the cycle.
- **The ladder is not charged for refresh's renewal failures** — `renewal_failing` makes no attempt and writes nothing.
- **Two crons, one row, no lock** — deliberate (§1.1a-5); atomic single statements; the minute offsets mean refresh (:07/:22/:37/:52) and GC (:15) never coincide anyway.
- **`raised_at`, not a new `first_failure_at`** — one incident-start timestamp for both escalation and (if ever needed) UI, verified to survive dedup bumps.
- **Reconcile keeps its resolve paths** — unlike the abandoned R3 draft, this design does NOT move resolution into any transaction; the shipped resolve-on-healthy and resolve-on-recovered paths (`lib/drive/watch.ts:1311-1328`, `lib/drive/watch.ts:1344-1354`) are untouched.
- **Faults never suppress the attempt record** (§3.3a; §6 classes 16c/17). A persistent email fault reports 500 while the ladder keeps climbing.
- **`occurrence_count` is not deleted** — it leaves the trigger role only.
- **The deferred design's §3.4a descope of the dedicated cron is settled** — the alert-raise transport it distrusted is now atomic anyway (lifecycle D10), but the same-cycle in-process design needs nothing from that fact.
