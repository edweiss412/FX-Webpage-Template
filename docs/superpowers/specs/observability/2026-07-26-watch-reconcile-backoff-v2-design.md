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
| D3 | State writes | Write iff a Drive subscribe attempt completed (§3.3a), recorded INSIDE `subscribeToWatchedFolder` at the sites that already classify the attempt — the only layer that can tell a pre-Drive fault from a post-Drive one (spec R1 finding 2) — and ONLY when the caller opted in via `recordAttempt: true` (spec R2 finding 1: the function has five production call paths, and the ladder is a reconnect concept — renewal of a live channel and onboarding's first subscribe must not touch it). Nothing else writes. |
| D4 | Escalation trigger | `now - alert.raised_at >= ESCALATION_AFTER_MS`, or immediately when `errorClass === "config"`. |
| D5 | Surfacing transport | One shared service-role helper `readWatchSurfaceState(folderId)` feeding both Doug surfaces; `get_bell_feed_rows` NOT widened; `DriveConnectionHealth` union NOT widened. |
| D6 | Developer surfacing | Telemetry deep link (unfiltered) + observe CLI columns. No new telemetry component. |
| D7 | Error detail transport | Widen `SubscribeResult`: the orphaned arm gains `errorClass`/`errorMessage`, and BOTH arms gain `attempt: { consecutiveFailures: number; nextAttemptAt: string } | null` — the state write's `returning` values. `null` means “no state write landed”: always for a `recordAttempt: false` caller, and for an opt-in caller exactly when the write failed — so for reconcile and Retry, which always opt in, `null` unambiguously signals a failed write (§3.3a). Values travel with the result; no cross-table re-read. |
| D8 | Backoff-gate clock domain | The gate read computes `waiting` in SQL — `next_attempt_at > now()` evaluated by Postgres — so the writer's clock (statement A/B's `now()`) and the gate's clock are the same clock, and app-clock skew can neither bypass nor extend a wait (spec R1 finding 3). The GATE is the only skew-sensitive comparison; the §3.6 render branch ("at `<time>`" vs "shortly") does compare against the viewer's clock, deliberately — a skewed rendering costs one cosmetic word, never a Drive call (spec R2 finding 5). |

### 2.1 Named constants (single source of truth)

All in `lib/drive/watchErrors.ts`. Later sections use the NAMES, never literals.

- `SAMPLING_PERIOD_MS` = **900_000** (15m) — EDIT of the existing constant (`lib/drive/watchErrors.ts:68`, currently 3_600_000). Still "how often `fxav_cron_refresh_watch` runs"; the comment stays true.
- `BACKOFF_LADDER_MS` = **[900_000, 1_800_000, 3_600_000, 7_200_000]** (15m, 30m, 1h, 2h) — new. Nth consecutive failure waits `BACKOFF_LADDER_MS[min(N, len) - 1]`; last entry repeats.
- `BACKOFF_MAX_MS` = **7_200_000** — definitionally `BACKOFF_LADDER_MS.at(-1)`, asserted equal by test, never written twice.
- `ESCALATION_AFTER_MS` = **10_800_000** (3h) — new. Replaces `ESCALATION_THRESHOLD`.
- `ESCALATION_THRESHOLD` — **deleted.** Readers verified 2026-07-26: definition `lib/drive/watchErrors.ts:8`, import `lib/drive/watchEscalation.ts:8`, sole use `lib/drive/watchEscalation.ts:102`. Nothing else (`grep -rn ESCALATION_THRESHOLD` across `lib/ app/ tests/` at plan time re-verifies).
- Unchanged and NOT touched: `WATCH_TTL_MS` (86_400_000), `RENEWAL_LIFE_FRACTION` (0.75), `RENEWAL_MIN_LEAD_MS` (7_200_000), `T_EXEC_BUDGET_MS` (300_000, §1.1a-11), `REFRESH_RUN_BUDGET_MS` (alias), `DRIVE_CALL_TIMEOUT_MS` (15_000), `STALE_PENDING_MAX_AGE_MS` (3_600_000), `GC_*`, `REAP_ID_LOG_CAP`.
- Schedule literal = **`'7,22,37,52 * * * *'`**. Collision check re-run 2026-07-26 against ALL ten live schedules (the nine `fxav_cron_*` jobs plus `app_events_prune` `17 4 * * *`; the orphaned `cleanup-bootstrap-nonces` cron is UNSCHEDULED by `supabase/migrations/20260527000003_schedule_cron_jobs.sql:84-85`): claimed minutes are multiples of 5, 15, 30, and 17 (daily, 04:17). 7/22/37/52 collide with none. `fxav_cron_gc_watch` stays at minute 15 — reconcile ticks at :07/:22/:37/:52 never coincide with GC.

#### 2.1a Timing invariants (pinned by §6 class 1)

Let `G` = granted channel life (`expires_at - created_at`), `L(G) = max(RENEWAL_MIN_LEAD_MS, G * (1 - RENEWAL_LIFE_FRACTION))` (the shipped renewal predicate, `lib/drive/watch.ts:362-365`), `P = SAMPLING_PERIOD_MS` (900_000), `T = T_EXEC_BUDGET_MS` (300_000).

- **I1 — renewal is sampled before expiry.** A channel becomes due when its remaining life reaches `L(G)`, i.e. at `max(0, G - L(G))` after activation, and is next examined at most `P + T` later. Its remaining life at that examination is therefore `min(G, L(G)) - P - T` — the `min` because a grant shorter than its own threshold (`G <= L(G)`, i.e. `G <= RENEWAL_MIN_LEAD_MS` = 2h, since for `G <= 8h` the floor is the binding term) is due from the moment it is created. One boundary: `G <= P + T` (**20 min**) is anomalous — no pre-expiry guarantee, `DRIVE_WATCH_GRANT_TOO_SHORT` posture unchanged from the lease-slack work; `G > P + T` is examined-and-due strictly before `expires_at` at every activation phase. Worst-case margins today: 1h grant → `min(1h, 2h) - 20m` = **40m**; 24h grant → `min(24h, 6h) - 20m` = **5h40m**. The §6 test is a phase sweep over a simulated tick series, never a restatement of the formula.
- **I2 — the ladder never runs while a channel is live.** Structural, not arithmetic: the ladder is consulted only inside the `!live` branch. The arithmetic form would be FALSE — `BACKOFF_MAX_MS + SAMPLING_PERIOD_MS` (2h15m) exceeds the renewal floor (2h) — which is exactly why control flow, pinned by test 16a, enforces it.
- **I3 — recovery latency is bounded by the tick.** A folder with no live channel and an expired backoff wait is retried on the next tick: latency ≤ `SAMPLING_PERIOD_MS + BACKOFF_LADDER_MS[min(N, 4) - 1]` plus that tick's own execution time (refresh runs before reconcile in the route, `app/api/cron/refresh-watch/route.ts`).
- **Enforcement honesty (unchanged from lifecycle §8.4 — restated, not weakened here).** `T` is the shipped `REFRESH_RUN_BUDGET_MS` semantics: the renewal loop stops STARTING rows past the budget, it does not bound the iteration it admits, and the budget clock starts after the reap/renewal/folder reads. I1 and I3 are therefore design targets enforced modulo those shipped residuals plus the unbounded `GoogleAuth` credential fetch (`BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED`, §1.1a-12) — the same posture the lifecycle design ships under. `isGrantTooShort` stays a heuristic. Stated once here; no per-claim repetition.

## 3. Design

### 3.1 Cadence: reschedule the existing job

New migration (pattern: `supabase/migrations/20260527000003_schedule_cron_jobs.sql:106-112`): `cron.unschedule('fxav_cron_refresh_watch')` if present, then `cron.schedule('fxav_cron_refresh_watch', '7,22,37,52 * * * *', …)` with the identical command body. Idempotent by construction (unschedule-if-exists + schedule).

Fan-out, each re-derived by grep 2026-07-26:

| Surface | Action |
|---|---|
| `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json:10` | `schedule` value `"0 * * * *"` → `"7,22,37,52 * * * *"`; jobname/route unchanged |
| `tests/cross-cutting/pg-cron-coverage.test.ts:68-71` | add the new migration path to `SCHEDULE_MIGRATION_PATHS` |
| `lib/cron/runSummary.ts:54-59` (`refresh-watch` entry) | `cadence: "hourly"` → `"every 15 min"`; `staleAfterMs: 3 * 3_600_000` → `45 * 60_000` (copies the `asset-recovery` 15-min pattern, `lib/cron/runSummary.ts:68-73`) |
| `tests/cron/runSummary.test.ts:21` (`CADENCE_MS` map) | `"refresh-watch": 3_600_000` → `900_000`. **Insufficient alone as a red test** (spec R1 finding 6): the suite asserts only `staleAfterMs >= 2 × cadence`, which the stale 3h value still satisfies at a 15-min cadence. The task therefore ALSO adds exact-value assertions for the `refresh-watch` row — `cadence === "every 15 min"` and `staleAfterMs === 45 * 60_000` — written red-first. |
| `tests/cron/samplingPeriodParity.test.ts` | goes red on the `SAMPLING_PERIOD_MS` edit and green when the registry/schedule agree — the natural TDD red test for the cadence change; listed as a fan-out surface, not an edit target, unless its pinned literals require the new values |
| validation project `vzakgrxqwcalbmagufjh` | surgical apply + `notify pgrst, 'reload schema'` (both migrations, §4.3) |

**Cron-count invariance:** no job added; the count stays **nine** and every literal-nine assertion (`tests/cron/cronJobsParity.test.ts`, `tests/admin/loadCronHealth.test.ts`, `tests/e2e/telemetry-layout.spec.ts:11`, `app/admin/dev/telemetry-dim/page.tsx:9`, the 2026-06-29 phase2 design's nine-job claims) is untouched. Close-out re-runs those suites to prove it.

**Cost:** refresh's per-tick work is one reap + one indexed renewal read inside one tx (`lib/drive/watch.ts:876-881`). With the shipped proportional predicate a 24h channel is due only in its final 6h, so 4x tick ≠ 4x Drive calls (~1 renewal/day steady-state). `REFRESH_RUN_BUDGET_MS` (5m) < period (15m) makes overlap a residual-only risk, not an impossibility — the budget stops starting rows rather than bounding the admitted one (§2.1a enforcement honesty), so a pathological stall can still cross a tick boundary. That is the shipped exposure at hourly cadence too; this diff narrows the window it must fit in but adds no new mechanism, and two overlapping writers are safe against the state row by §3.3a's atomic statements.

### 3.2 `drive_watch_reconcile_state`

One row per watched folder (PK `watched_folder_id`), so a folder switch cannot inherit the old folder's ladder position. DDL, CHECKs, and lockdown are unchanged from the deferred design §3.3 and normative here:

```sql
create table public.drive_watch_reconcile_state (
  watched_folder_id    text primary key,
  consecutive_failures int         not null default 0,
  last_attempt_at      timestamptz,
  next_attempt_at      timestamptz not null default now(),
  last_attempt_outcome text,
  last_error_class     text,
  last_error_message   text,
  updated_at           timestamptz not null default now(),
  constraint drive_watch_reconcile_state_error_class_check check (
    last_error_class is null or last_error_class in ('config', 'drive_api', 'db')
  ),
  constraint drive_watch_reconcile_state_attempt_outcome_check check (
    last_attempt_outcome is null or last_attempt_outcome in ('failed', 'succeeded')
  ),
  constraint drive_watch_reconcile_state_failures_nonneg check (consecutive_failures >= 0)
);
revoke all on table public.drive_watch_reconcile_state from public, anon, authenticated;
grant all privileges on table public.drive_watch_reconcile_state to service_role;
alter table public.drive_watch_reconcile_state enable row level security;
```

- Lockdown shape is byte-for-byte `show_share_tokens` (`supabase/migrations/20260523000002_show_share_tokens.sql:43-45`): fully private, RLS enabled with NO policy. **Not an "admin-only table"** in the master spec §4.3 sense — the deferred design §3.3 proved `show_share_tokens` appears in none of the §4.3 list / `lib/audit/admin-tables.generated.ts` / `tests/db/admin-rls-runtime.baseline.json`, and the same holds here: no §4.3 edit, no count bump, no `ADMIN_TABLES` regen, no baseline change.
- Registered in `RPC_GATED_TABLES` (`tests/db/postgrest-dml-lockdown.test.ts:147`) with the FULL row shape the registry type requires (`tests/db/postgrest-dml-lockdown.test.ts:138`): `selectAnon: false, selectAuthenticated: false`, a valid `postBody` (minimal insert payload for the probe), a `rowFilter`, and `closed_at` (the migration timestamp) — spec R1 finding 8; the plan copies the `app_events` row (`tests/db/postgrest-dml-lockdown.test.ts:213`) as the service-role-written precedent and fills every field. The bidirectional migrations-walk discovery (`tests/db/postgrest-dml-lockdown.test.ts:826-857`) fails CI if the REVOKE migration lands without the row.
- `last_error_class` mirrors `WatchErrorClass` (`lib/drive/watchErrors.ts:5`). `last_attempt_outcome` deliberately does NOT mirror `ReconcileOutcome`: under §3.3a only a completed attempt writes, so the only persistable outcomes are `'failed'` and `'succeeded'` — a wider CHECK would admit values no writer can produce and invite a future write that violates "nothing else writes" (spec R1 finding 5). The runtime source of truth is a new `ATTEMPT_OUTCOMES = ["failed", "succeeded"] as const` in `lib/drive/watchErrors.ts`. Cycle-level outcomes (`backoff_waiting`, `renewal_failing`, …) live in `ReconcileResult`/route bodies/app_events only, never in this table. §4.2 is the CHECK↔union matrix.
- `last_error_message` stores only `redactWatchError` output (`lib/drive/watchErrors.ts`) — same chokepoint as the alert context; no raw error reaches the column.
- The migration is a one-shot forward `create table` — deliberately NOT idempotent; re-applying fails loudly on the duplicate relation. The REVOKE/GRANT statements are naturally idempotent.

**Error detail transport.** `SubscribeResult` (`lib/drive/watch.ts:115-117`) widens: the orphaned arm gains `errorClass: WatchErrorClass; errorMessage: string` (both already computed at the two catch sites, `lib/drive/watch.ts:724`, `lib/drive/watch.ts:817`), and BOTH arms gain `attempt: { consecutiveFailures: number; nextAttemptAt: string } | null` — the §3.3a state write's `returning` values, with `null` meaning no write landed (always for opt-out callers; = write failure for opt-in callers, D7). Existing callers ignore the extra fields.

**Transport and registries.** The two state-write statements are `WatchTx` methods carrying raw SQL (interface `lib/drive/watch.ts:60-111`), invoked through `callWatchTx` so they inherit the `DriveWatchInfraError` contract. Two registry surfaces, not interchangeable:

| Surface | Transport | Registry |
|---|---|---|
| `recordAttemptFailure` / `recordAttemptSuccess` (§3.3a) | `WatchTx` raw SQL via `callWatchTx` | `tests/sync/_metaInfraContract.test.ts` (owns `lib/drive/watch.ts` helpers, rows near `tests/sync/_metaInfraContract.test.ts:43-55`) |
| `readWatchSurfaceState` (§3.6) | Supabase service-role `.select()`, `{ data, error }`, `{ kind: "infra_error" }` on any fault, `null` only for "no row" (§3.6) | `tests/admin/_metaInfraContract.test.ts` (owns the bell + Settings loaders, rows near `tests/admin/_metaInfraContract.test.ts:287-313`) |

### 3.3 The ladder, and 3.3a write-iff-attempt

> **A state write happens if and only if a Drive subscribe attempt completed. Nothing else writes.**

**Where the rule is enforced: inside `subscribeToWatchedFolder`, not in its callers** (spec R1 finding 2). A caller cannot classify a throw — the pre-Drive `insertPending` fault (`lib/drive/watch.ts:707`) and a post-Drive finalization fault (`markWatchOrphanedWithTx`, `lib/drive/watch.ts:728`, `lib/drive/watch.ts:821`) both surface to the caller as a rejection — but the function body knows exactly where it is. The **attempt boundary is the `watchFolder` invocation** (`lib/drive/watch.ts:717`): everything from that call onward is an attempt; everything before it is not.

| Site inside `subscribeToWatchedFolder` (rows below assume `recordAttempt: true`; with the default `false`, NO site writes and `attempt` is always `null`) | Attempt? | Write |
|---|---|---|
| `insertPending` tx throws (`lib/drive/watch.ts:707`) — before the boundary | no | none; the throw escapes as today |
| `watchFolder` rejects → catch at `lib/drive/watch.ts:723` | yes | **(A)**, recorded FIRST inside the catch — before `markWatchOrphanedWithTx` — so a finalization throw cannot lose the record |
| activation throws after Drive created the channel → catch at `lib/drive/watch.ts:816` | yes | **(A)**, same ordering |
| activation commits → success path (`lib/drive/watch.ts:748-815`) | yes | **(B)**, post-commit, beside the existing `DRIVE_WATCH_ACTIVATED` emit |
| the (A)/(B) statement itself fails | attempt already happened | swallowed locally: one `DRIVE_WATCH_STATE_WRITE_FAILED` warn at the swallow site (the guaranteed record), the result's `attempt` field is `null`; the alert raise and the return value are unaffected. Reconcile — the only caller with a fault channel — additionally maps a RETURNED result with `attempt === null` to fault `state_write` (a thrown flow has no result and is covered by the warn alone) |

Known edge, accepted: the injectable clock read sits inside the same try as `watchFolder` (`lib/drive/watch.ts:716`, deliberately per its own comment), so a THROWING test-injected clock would classify as an attempt without a Drive call. The production clock is native `Date.now`, which cannot throw; restructuring shipped, review-hardened code to close a test-only path is worse than documenting it. Tests inject rejecting `watchFolder` fakes, not throwing clocks, to exercise the failure arm.

**Caller topology, re-verified 2026-07-26 including deps-bound sites** (spec R2 finding 1 — the first sweep filtered out `deps.` lines and missed three of five paths). `subscribeToWatchedFolder` has FIVE production invocation paths, and recording is opt-in per call via a new `recordAttempt?: boolean` (default `false`) on `SubscribeDeps`:

| Caller | Site | `recordAttempt` | Why |
|---|---|---|---|
| Reconcile `!live` branch | `lib/drive/watch.ts:1336` | **true** | the reconnect surface the ladder gates |
| Admin Retry | `app/admin/actions.ts:326` | **true** | a manual reconnect attempt counts (Retry-mashing must not reset the cadence) |
| Refresh renewal loop | bound at `lib/drive/watch.ts:993-994`, invoked `lib/drive/watch.ts:1017` | false (default) | renews LIVE channels; the ladder is `!live`-only (I2), and "`refreshWatchSubscriptions` writes NO state" (§6 class 7) stays literally true — a failed renewal must not advance `next_attempt_at` while refresh itself ignores the gate and retries next tick |
| Onboarding finalize, non-streaming | `app/api/admin/onboarding/finalize-cas/route.ts:1123` | false (default) | a failed FIRST subscribe raises the alert as shipped; the ladder engages on reconcile's next `!live` cycle, which is the surface that owns retries |
| Onboarding finalize, streaming | `app/api/admin/onboarding/finalize-cas/route.ts:1205` | false (default) | same |

With `recordAttempt: false` the function performs ZERO state writes and returns `attempt: null` on every arm — the widened fields are inert for legacy callers (onboarding types the result loosely, `app/api/admin/onboarding/finalize-cas/route.ts:53`, and ignores them).

**Who observes a failed state write** (spec R2 finding 2; restructured after spec R3 finding 1 showed caller-side observation has blind arms — Retry's outcome emit exists only on the active branch, and a finalization throw after a failed (A) leaves NO result for any caller to inspect). The observation point moves to the failure itself: the swallow site inside `subscribeToWatchedFolder` emits `log.warn("drive watch state write failed", { source: "drive.watch", code: "DRIVE_WATCH_STATE_WRITE_FAILED", watchedFolderId, statement: "record_attempt_failure" | "record_attempt_success", errorMessage })` — fire-and-forget with the house `.catch(() => {})` guard, forensic-only (a `log.*`-span code, NOT a §12.4 row, per the lifecycle design's §1.1a-11 precedent), emitted on EVERY failed (A)/(B) regardless of which arm or what throws afterwards. On top of that guaranteed floor, reconcile — the only caller whose contract carries a fault channel — still maps a completed attempt with `attempt === null` to fault `state_write` → `infra_error` (route 500s). Retry adds NO bespoke plumbing: its admin-outcome emit is unchanged, and the warn above is the record.

**Thrown `DriveWatchInfraError` is NOT always pre-boundary** (spec R2 finding 2 corrected the v2-R1 wording): `markWatchOrphanedWithTx` throws typed errors from both post-attempt finalization sites (`lib/drive/watch.ts:728`, `lib/drive/watch.ts:821`). The ordering rule makes every case correct without the caller distinguishing them: pre-boundary throw → nothing recorded (right — no attempt); post-attempt throw → (A) already recorded before the finalization call (right — attempt counted). Callers keep their shipped throw handling: Retry stays fail-visible, reconcile keeps `subscribe_infra`.

The two statements and the SQL ladder function are unchanged from the deferred design §3.3a and normative here (single atomic upserts; increment evaluated against the STORED row; both paths route the wait through `watch_backoff_ms(n)`):

```sql
-- (A) recordAttemptFailure($1 folder, $2 errorClass, $3 errorMessage)
insert into public.drive_watch_reconcile_state as st
       (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
        last_attempt_outcome, last_error_class, last_error_message, updated_at)
values ($1, 1, now(), now() + (public.watch_backoff_ms(1) || ' milliseconds')::interval,
        'failed', $2, $3, now())
on conflict (watched_folder_id) do update
   set consecutive_failures = st.consecutive_failures + 1,
       last_attempt_at      = now(),
       next_attempt_at      = now() + (public.watch_backoff_ms(st.consecutive_failures + 1)
                                       || ' milliseconds')::interval,
       last_attempt_outcome = 'failed',
       last_error_class     = excluded.last_error_class,
       last_error_message   = excluded.last_error_message,
       updated_at           = now()
returning consecutive_failures, next_attempt_at;

-- (B) recordAttemptSuccess($1 folder)
insert into public.drive_watch_reconcile_state as st
       (watched_folder_id, consecutive_failures, last_attempt_at, next_attempt_at,
        last_attempt_outcome, last_error_class, last_error_message, updated_at)
values ($1, 0, now(), now(), 'succeeded', null, null, now())
on conflict (watched_folder_id) do update
   set consecutive_failures = 0, last_attempt_at = now(), next_attempt_at = now(),
       last_attempt_outcome = 'succeeded', last_error_class = null, last_error_message = null,
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

**Attempt survives bookkeeping faults by ordering, not by caller heroics.** Because (A) runs FIRST inside each catch — before `markWatchOrphanedWithTx` and the failure log — a finalization throw (`lib/drive/watch.ts:728`, `lib/drive/watch.ts:821`) escapes AFTER the ladder already advanced. Reconcile's catch (`lib/drive/watch.ts:1358-1360`) keeps its `subscribe_infra` fault and adds nothing: a persistent alert-write fault can no longer pin the ladder at zero (the 15-minute call storm this feature exists to prevent), and a pre-boundary `insertPending` throw correctly records nothing.

**Mixed-outcome writer race, accepted and bounded** (spec R1 finding 4). Two writers (reconcile × Retry, or overlapping runs) can interleave so that an (A) commits after a concurrent (B): the row then reads `failed`/count ≥ 1 while a live channel exists. Consequences, enumerated: no wrong Drive traffic (the gate is consulted only in a `!live` cycle, and the next such cycle is a REAL incident); no alert-lifetime impact (alert raise/resolve run on the shipped reconcile paths, not from this table); no UI impact while healthy (both render surfaces are gated behind an unresolved watch alert / unhealthy panel reason, §3.6); the residue is that the NEXT incident's first failure increments from the stale count and starts one-or-more rungs high — self-limiting, capped at `BACKOFF_MAX_MS`, and corrected by that incident's first (B). Serializing writers to remove a bounded cosmetic offset would need the locks §1.1a-5 forbids. §6 class 16d pins the exact interleaving outcome so it is chosen, not accidental.

**Failure guards:** no row yet → (A) inserts `consecutive_failures = 1`, (B) inserts `0`. Folder switch → fresh PK row; old row left in place (§7). A failing state write always produces the swallow-site warn; on a reconcile cycle whose subscribe RETURNED, it additionally surfaces as `attempt: null` → fault `state_write` → route `infra_error`. Bookkeeping is one cycle stale either way; the attempt itself already happened, and its alert lifecycle (raise on the failure arms, resolve on the recovery paths) is driven by the shipped subscribe/reconcile code, unaffected by the state-write failure.

### 3.4 Reconcile changes (the route is otherwise untouched)

Reconcile stays in the refresh route consuming the same-cycle `RefreshResult` (§1.1a-9). Steps, anchored to the shipped structure (`lib/drive/watch.ts:1225-1391`):

1. Stale-pending sweep, folder read, `hasLiveActiveChannel`, `renewalFailed` predicate: **unchanged** (`lib/drive/watch.ts:1234-1309`).
2. **Backoff gate** *(new)*: in the `!live` path only, before the subscribe at `lib/drive/watch.ts:1336`, read the state row through a new `WatchTx` method whose SQL computes the verdict in the DATABASE clock domain — `select consecutive_failures, next_attempt_at, next_attempt_at > now() as waiting from …` — so the gate and the §3.3a writers share one clock and app-clock skew cannot bypass or extend a wait (D8). Read fault → `state_read` fault → `infra_error`, no attempt, no write. `waiting` true → skip the subscribe, `outcome = "backoff_waiting"`. No row → not waiting. A live channel never consults the ladder (I2).
3. **Attempt recording**: happens inside `subscribeToWatchedFolder` (§3.3a). Reconcile's only new bookkeeping: when subscribe RETURNED a result with `attempt === null`, push fault `state_write` (a thrown flow has no result; it keeps `subscribe_infra` and the §3.3a warn is the state-write record).
4. **Escalation runs on every unhealthy outcome including `backoff_waiting`**: the condition at `lib/drive/watch.ts:1372` (`outcome === "still_orphaned" || outcome === "renewal_failing"`) gains `|| outcome === "backoff_waiting"`. Backing off suppresses the Drive call, never the escalation check or the resolve-on-recovery path.
5. **Result shape:** `ReconcileOutcome` (`lib/drive/watch.ts:1202-1208`) gains `"backoff_waiting"` — an in-memory cycle outcome only, never persisted (§3.2); `ReconcileResult` (`lib/drive/watch.ts:1209-1214`) gains `nextAttemptAt: string | null` and `consecutiveFailures: number | null`, sourced from `result.attempt` on an attempt cycle and from the gate read on a `backoff_waiting` cycle (null otherwise). The refresh-watch route serializes them; route tests assert the widened body.
6. **Runtime-array prerequisite** (§6 class 5): `WatchErrorClass` becomes a runtime `as const` array (`WATCH_ERROR_CLASSES`, type derived from the array — structurally identical, no consumer changes), and `ATTEMPT_OUTCOMES` is born as one (§3.2). Both CHECKs get set-equality meta-tests against these arrays. `ReconcileOutcome` stays a plain type union — no CHECK mirrors it anymore (spec R1 finding 5), so it needs no runtime form.
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
| `last_error_class`, `last_error_message`, `last_attempt_outcome`, ladder position | Developer — `pnpm observe watch` ONLY; never in any UI at any tier |

**Shared helper — typed faults, mapped to "hidden" only at the render boundary** (spec R1 finding 1: a helper that returns `null` for both "no row" and "infra fault" is exactly the benign-signal collapse invariant 9 forbids). Signature:

```ts
type WatchSurfaceState = {
  nextAttemptAt: string | null;
  consecutiveFailures: number;
  lastAttemptOutcome: "failed" | "succeeded" | null;
};
readWatchSurfaceState(folderId: string): Promise<WatchSurfaceState | null | { kind: "infra_error" }>;
```

One service-role `.select()` on the state table; `{ data, error }` destructured; returned error, thrown query, and client-construction throw each → `{ kind: "infra_error" }`; zero rows → `null`. EACH caller then maps `infra_error` to "line hidden" as an explicit, commented render-boundary decision (the feed and the panel must render when this read fails), which keeps the boundary discriminable and the degradation policy in the consumer where invariant 9 wants it. The registry row in `tests/admin/_metaInfraContract.test.ts` (§3.2) states both halves: typed infra result from the helper; deliberate hide-on-fault in the two consumers. Callers supply the folder id from reads they already perform:

- **Bell:** `lib/admin/bellFeed.ts` calls `getActiveWatchedFolderId()` once per feed load alongside its existing settings read (`lib/admin/bellFeed.ts:197-209`); `BellEntry` (`lib/admin/bellFeed.ts:29-52`) gains optional `watchState: WatchSurfaceState | null` — the COMPONENT contract never carries `infra_error`; the loader performs the §3.6 render-boundary mapping (helper returns `infra_error` → entry gets `null`, with the inline comment), and non-watch rows get `null` (a failed read never breaks the feed). `get_bell_feed_rows` (`lib/admin/bellFeed.ts:219`) is NOT modified.
- **Settings:** `app/admin/settings/page.tsx` performs its own service-role read via the same helper and passes `watchState` as a new optional prop to `DriveConnectionPanel`. The `DriveConnectionHealth` union (`lib/admin/driveConnectionHealth.ts:39-57`, `folderId` carried at `lib/admin/driveConnectionHealth.ts:43` / `lib/admin/driveConnectionHealth.ts:52`) and its session-scoped loader (`lib/admin/driveConnectionHealth.ts:107`) are untouched — the loader's session client cannot read a service-role-only table (deferred R1 finding 4), which is why the state is NOT threaded through the health union.

**Rendering (both surfaces, same sentence).** A `<p>` with a `data-testid` and the bell auto-resolve note's typography classes `wrap-break-word text-sm text-text-subtle` (`components/admin/BellPanel.tsx:355-360`). Two of the note's own layout facts do NOT carry over (spec R3 finding 5, spec R4 finding 4): `ml-auto` (the note's right-alignment) is not copied, and the new line is NOT a block-flow sibling — on the BELL surface the parent is a wrapping flex row, so the `<p>` there additionally carries **`w-full`** to force its own visual line; the SETTINGS sentence sits in plain column flow and carries no width class (placement details below). Rendered only when the ladder is actually in play:

| State | Rendered line |
|---|---|
| `lastAttemptOutcome === "failed"`, `nextAttemptAt` in future | `Trying again at Jul 26, 4:45 PM · 7 reconnect attempts so far` (the `formatStagedAt` shape includes month and day) |
| `lastAttemptOutcome === "failed"`, `nextAttemptAt` past or null | `Trying again shortly · 7 reconnect attempts so far` |
| `lastAttemptOutcome` `"succeeded"` or `null`, or `watchState` `null`/`infra_error` | line absent; row renders exactly as today |

(The branch key is the persisted attempt outcome, not `ReconcileOutcome` — a `backoff_waiting` cycle leaves `lastAttemptOutcome = "failed"` from the attempt that STARTED the wait, with its `nextAttemptAt` in the future, so the first table row covers it. Spec R1 finding 5 killed the earlier `lastOutcome` branch, which keyed on values this table never stores.)

Count clause: omitted at 0; singular at 1. No "still connected" line ever renders (`renewal_failing` is a sampled state, not current liveness — deferred R3 finding 6). Time formatting copies `formatStagedAt` (`components/admin/StagedReviewCard.tsx:104-113`): module-local `toLocaleString`, NaN-parse guard renders the raw ISO string, `<time dateTime={iso} suppressHydrationWarning>` for the SSR/client timezone mismatch.

- Bell placement: last child of `BellActionRow`'s root — a `flex flex-wrap items-center` row (`components/admin/BellPanel.tsx:303-306`) — where `w-full` wraps it onto its own line below the Retry/Dismiss controls. Rendered when the entry is the watch alert and not health, and state is present.
- Settings placement: inside the existing explainer block (`components/admin/settings/DriveConnectionPanel.tsx:234` region), as a sibling `<p>` AFTER the `flex flex-col … min-[720px]:flex-row` re-run-setup row, in the panel's outer column flow — not inside the row, whose desktop variant is a non-wrapping space-between pair. Same visibility condition as the Retry control (`components/admin/settings/DriveConnectionPanel.tsx:100-108`: `watch_inactive` / `watch_expired` / `not_configured`-with-folder). `watchState === null` → sentence omitted, nothing else changes.

**Developer link.** The watch bell row gains `View in telemetry ↗` when `viewerIsDeveloper`, reusing the health-row affordance (`components/admin/BellPanel.tsx:308-315`). `viewerIsDeveloper` is currently consumed lower in the tree (`components/admin/BellPanel.tsx:1087`, `components/admin/BellPanel.tsx:1092`) and must be threaded into the action-cell component; render condition becomes `entry.isHealth || (isWatch && viewerIsDeveloper)`. The link is **unfiltered**: `loadAppEvents` applies `source` as an exact `.eq` (`lib/admin/loadAppEvents.ts:39`) and the relevant events span four source values; the multi-source `.in()` path exists only in the observe layer (`lib/observe/query/events.ts:82`), and widening the admin loader for one deep link is out of scope. Stated so nobody "fixes" the link with a single-source param.

**Observe CLI.** `lib/observe/query/watch.ts` gains the state columns (left join or second query on `watched_folder_id`). The SELECT constant (`lib/observe/query/watch.ts:9-10`) must NOT regain the webhook-secret column — `tests/observe/queryWatch.test.ts:61-63` scans for it. `last_error_message` passes through the same `sanitizeIdentityString` treatment used at `lib/observe/query/failures.ts:55` / `lib/observe/query/failures.ts:61`.

**Admin Retry** (`app/admin/actions.ts:326`) passes `recordAttempt: true` and otherwise changes nothing (§3.3a): the shared implementation records (A)/(B), so a failed manual retry IS a failed attempt and advances the ladder — deliberate, Retry-mashing cannot reset the automatic cadence. A thrown `DriveWatchInfraError` leaves the action fail-visible as shipped (pre-boundary → nothing recorded; post-attempt → already recorded; §3.3a). A failed state write is recorded by the `DRIVE_WATCH_STATE_WRITE_FAILED` warn at the swallow site (§3.3a); the action does not inspect `attempt` and the resolve on the active arm proceeds on channel reality.

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

No fixed-dimension parent exists on either surface, so no parent→child height/width equality is asserted. The one layout contract the line DOES carry (spec R4 finding 4): `w-full` on the `<p>`, which inside the bell cell's `flex flex-wrap` row (`components/admin/BellPanel.tsx:303-306`) forces the line onto its own row — Tailwind v4 does not stretch flex items by default, and without `w-full` the sentence would inline beside the Dismiss button. The Settings copy sits in plain column flow and needs nothing. Stated so the plan's layout-dimensions mandate is discharged explicitly, not by omission.

#### Cap/truncation

One sentence, one integer, one timestamp; `wrap-break-word` handles narrow viewports. The count grows ≤ 12/day from the automatic ladder at its cap, plus one per failed manual Retry (ungated by design, §3.3a) — human-bounded, not unbounded (spec R4 finding 7). No display cap; a four-digit count would itself be the story.

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

**Full cadence-claim sweep** (spec R1 finding 7 — the sweep is grep-DRIVEN, run 2026-07-26: `grep -rn "hourly\|every hour\|each hour" lib/ app/ tests/ docs/` filtered to watch-relevant hits; every hit dispositioned):

| Hit | Disposition |
|---|---|
| `lib/messages/catalog.ts:364` / `lib/messages/catalog.ts:366` / `lib/messages/catalog.ts:369` | §12.4 lockstep table above |
| `lib/messages/__generated__/spec-codes.ts:1568-1569` | regenerated by `pnpm gen:spec-codes` (lockstep step b) |
| `lib/drive/watchEscalation.ts:67` / `lib/drive/watchEscalation.ts:73` | email copy, replaced above; `tests/drive/watchEscalation*.test.ts` copy assertions update with it |
| `tests/messages/popoverContextCopy.test.ts:30` | frozen `helpfulContext` oracle — literal updated to the new string in the same commit, else red |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1321` (§5.5.5 renewal cron `0 * * * *`) | edited to the new schedule |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2817` (§12.4 row) | BOTH the `followUp` literal AND the row's "kept current by the hourly reconcile" prose clause edited |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3336` (long-context map) | edited (lockstep step a) |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3844` (AC-6.13) | predicate already proportional (lease PR), but the sentence still says "hourly renewal cron" — that residual word IS edited (the v1 draft of this spec wrongly claimed no edit needed) |
| `docs/superpowers/plans/coverage.md:143` | AC-6.13 mirror — edited in lockstep with the AC |
| `docs/alerts/admin-alert-system-explainer.html:915` and `docs/alerts/admin-alert-system-explainer.html:924` | rendered copy mirror of `helpfulContext` — both occurrences updated |
| Comments only — `lib/drive/watch.ts:956`, `app/admin/actions.ts:300`, `lib/drive/errorStatus.ts:7`, `tests/drive/watchImportGraph.test.ts:4` + `tests/drive/watchImportGraph.test.ts:70` (assertion MESSAGE string), `tests/drive/watchExpiration.test.ts:4` + `tests/drive/watchExpiration.test.ts:242`, `tests/db/watchRenewalDue.test.ts:145`, `tests/cron/refreshWatchRoute.test.ts:5` + `tests/cron/refreshWatchRoute.test.ts:80` ("must not page hourly" — becomes "…every 15 minutes") | comment/message edits, same commit; none is a §12.4 surface |
| `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md:346` ("hourly watch renewal") | living canonical plan overview — edited to "15-min watch renewal"; the sibling `gc-watch` "hourly GC" line is a different job and stays |
| `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/html-plans/06-drive-sync.html:382`; `docs/superpowers/specs/2026-07-20-alert-popover-context-design.md:73`; `docs/superpowers/plans/2026-07-20-alert-popover-context/00-plan.md:58`; `docs/superpowers/specs/2026-07-20-alert-popover-context-copy-now-vs-proposed.html:195` | **frozen — dated design/plan artifacts** recording what was true at their date; editing history to match later cadence would falsify the record (same convention that leaves the deferred 2026-07-24 design untouched). Dispositioned explicitly per spec R2 finding 6 |
| Unrelated `hourly` hits (notify digest, keepalive descriptions, `runSummary.ts` other rows, quota tests, telemetry fixtures) | out of scope — different jobs, still hourly |

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
| `…_attempt_outcome_check` | `failed`, `succeeded` | `ATTEMPT_OUTCOMES` (§3.2 — deliberately NOT `ReconcileOutcome`; only these two values are writable under §3.3a) | allowed (no attempt yet) | same |
| `…_failures_nonneg` | `>= 0` | — | not-null | same |

Transitional window: none (new table). A structural meta-test pins both CHECKs against the runtime arrays, set-equality both directions, with a negative control (§6 class 5).

### 4.3 Migration → validation parity

Two migrations (state table + `watch_backoff_ms`; reschedule). Same-PR checklist per AGENTS.md: local apply + tests; `pnpm gen:schema-manifest` + commit (state table adds public columns); surgical apply of BOTH to validation `vzakgrxqwcalbmagufjh` + `notify pgrst, 'reload schema'`. `validation-schema-parity` covers the table's columns but observes neither the FUNCTION nor the schedule (spec R1 finding 8), so the §6 class-21 live probe covers both explicitly: `select public.watch_backoff_ms(3)` must return `3600000` on validation (a partial apply that created the table but not the function would otherwise surface only as every failure upsert faulting in production), and the `cron.job` row must show `'7,22,37,52 * * * *'`.

### 4.4 Flag lifecycle

| Field | Storage | Write | Read | Effect |
|---|---|---|---|---|
| `next_attempt_at` | state table | §3.3a; Retry | reconcile gate; both Doug lines; CLI | suppresses subscribe while future; renders line |
| `consecutive_failures` | state table | §3.3a | ladder index (in SQL); Doug line; CLI | selects wait; renders count |
| `last_error_class`/`_message` | state table | §3.3a failure arm; cleared on success | CLI only | developer diagnosis |
| `last_attempt_outcome` | state table | §3.3a | line-render branch; CLI | selects Doug copy row |
| `ESCALATION_AFTER_MS` | constant | — | escalation `due` | when Sentry+email fire |

No zombie columns.

## 5. Empirical grounding

- Reconcile-as-single-retry-surface: established by the lifecycle PR's measured reap (48→24 calls/day, lifecycle design §1.2) and re-verified against `lib/drive/watch.ts:1334-1361` on this branch's base commit.
- `raised_at` dedup survival: re-verified against the RPC body 2026-07-26 (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:48-69`).
- Cron collision map: enumerated from all ten live schedules (§2.1 — nine `fxav_cron_*` + `app_events_prune`), not a sample.
- `ESCALATION_THRESHOLD` reader set: three grep hits, all named in §2.1.
- No race state machine in prose: the one concurrency surface (two writers, one row) is closed by single atomic statements evaluated by Postgres, pinned by a real-DB concurrency test (§6 16d).

## 6. Testing

TDD per task. Placement per `vitest.projects.ts:96-97`: `tests/drive/**`/`tests/cron/**` are PARALLEL DB-free (a DB touch there fails in `unit-suite-nodb` by design); DB classes live in `tests/db/**` (serial); components in `tests/components/**`; CLI in `tests/observe/**`.

The 21 test classes of the deferred design §6 carry forward as the normative inventory, with these re-derivations:

1. Class 1 (constants + I1 phase sweep) uses `P = 900_000`, `T = 300_000`; grant table `{P−ε, P, P+T, P+T+ε, 1h, 6h, 24h}` with the boundary at 20m; ladder expectation is an independent literal table `[[1,"15m"],[2,"30m"],[3,"1h"],[4,"2h"],[5,"2h"],[6,"2h"]]`.
2. Classes 2–3 (lease request/predicate) SHIPPED with the lease-slack PR — dropped here; their suites must stay green untouched.
3. Class 6 (reconcile units) extends the existing reconcile suite in `tests/drive/watch.test.ts`: backoff gate cells; `backoff_waiting` still escalates (the §3.4 step-4 condition) and still resolves on recovery; state-read fault → `state_read` → `infra_error`, no write.
4. Class 4 (state table, real DB) re-derived for the narrowed column (spec R2 finding 3): CHECK rejects out-of-union `last_error_class` AND out-of-union `last_attempt_outcome` (fixture value `still_orphaned` — a `ReconcileOutcome` member — MUST be rejected, pinning the narrowing); rejects negative `consecutive_failures`; sequential upserts increment against the STORED value; PostgREST DML as `anon`/`authenticated` rejected with 42501 via the registry row. The CHECK↔array meta-test compares against `ATTEMPT_OUTCOMES` and `WATCH_ERROR_CLASSES`, set-equality both directions, with one-extra/one-missing negative controls.
5. Class 7, two halves with the seam named (spec R5 finding 3 — the default binding is a same-module lexical and no injected spy can observe its options): (a) deps-injected spy asserts zero state-write transport calls on every refresh path exercised through `RefreshDeps`; (b) a structural source scan — same idiom as the reconcile pin in class 18 — asserts the default `subscribe` binding literal at `lib/drive/watch.ts:993-994` passes NO `recordAttempt` option, so the production default cannot silently opt in.
6. Class 10 (route): refresh-watch route body gains `nextAttemptAt`/`consecutiveFailures`; 200 for `backoff_waiting`; 500 + `outcome: "infra"` for `state_read`/`state_write` faults.
7. Classes 11/12/18 (components + production data path): as specified in §3.6, including the never-render-error-fields scan and the anti-tautology clause (clone subtree, strip the alert's cataloged copy, derive expected time through the same formatter). Class 18 additionally carries three pins:
   - the `infra_error` → hidden mapping asserted at the BELL loader (spec R3 finding 3): `bellFeed` with a failing state read → `watchState: null`, feed still renders;
   - the same mapping at the SETTINGS read → prop `null`, panel renders;
   - **the production `recordAttempt: true` opt-in pinned at both call sites, with the seam named** (spec R4 finding 1 — neither caller forwards `SubscribeDeps`, so "inject a failing `watchFolder`" has no path): for the RETRY action, a module mock of `lib/drive/watch` (vitest `vi.mock`, the actions suites' established pattern) whose spy asserts it was called with `{ recordAttempt: true }`; for RECONCILE — same-module internal call, unmockable — a structural source scan asserting the default binding literal at the reconcile call site contains `recordAttempt: true` (same idiom as the `queryWatch` structural pin, `lib/observe/query/watch.ts:1-5`). Either pin fails if its call site drops the option.
7a. Class 19 re-derived — the deferred version keyed cases on `ReconcileOutcome` values this table no longer stores (spec R2 finding 3). The normative case list is the §3.6 render table over the COMPONENT contract (`WatchSurfaceState | null` — `infra_error` never reaches a component, it is mapped at the loader, class 18): `failed` + future `nextAttemptAt`; `failed` + past; `failed` + null; `succeeded`; state `null` — the last two assert the line ABSENT; plus the count-clause guards (0 omitted, 1 singular). Anti-tautology clause unchanged.
8. Class 16a–16d, 17, updated for the §3.3a placement:
   - **16a** gate decision table over the inputs the live control flow actually has — (`live`, `renewalFailed`, `waiting`) — because a live channel never reaches the gate at all (`lib/drive/watch.ts:1311` returns `healthy` for live+clean before any `!live` logic; spec R4 finding 5): `!live` + `waiting` → `backoff_waiting`, zero subscribe calls, escalation still invoked; `!live` + not waiting → subscribe attempt; `live` + `renewalFailed` → `renewal_failing` with the gate NEVER read (zero gate-read calls asserted — the structural I2 pin); `live` + clean → `healthy`, gate never read.
   - **16b** write-iff-attempt, spy on the state-write transport **inside `subscribeToWatchedFolder`**: with `recordAttempt: true` — pre-boundary `insertPending` throw → zero writes; `watchFolder` rejection → exactly one (A) BEFORE `markWatchOrphanedWithTx` (call-order asserted); activation-throw arm → one (A); success → one (B). With the default `recordAttempt` absent/false — zero writes on EVERY arm including a failed subscribe (the refresh/onboarding contract, spec R2 finding 1). Write transport made to fail under `recordAttempt: true` → exactly one `DRIVE_WATCH_STATE_WRITE_FAILED` warn emit and `attempt: null`, on both the (A) and (B) arms (spec R3 finding 1). Reconcile cycles that make no attempt (`healthy`, `renewal_failing`, `backoff_waiting`, `vacuous`, folder/channel-read faults) → zero writes.
   - **16c** attempt survives finalization faults: `markWatchOrphanedWithTx` made to throw at both production fault points AFTER a Drive failure → (A) already recorded; three cycles under a persistent fault → `consecutive_failures === 3`, not 0.
   - **16d** real-DB concurrency: two concurrent (A) writers → `2`; insert-first-failure → `1` not `0`; AND the mixed-outcome interleaving (spec R1 finding 4) — (B) commits, then a delayed (A) — asserting the documented end state (`failed`, count 1) so the accepted race is pinned, not accidental.
   - **17** fault-vs-attempt independence for every post-attempt fault in the shipped inventory (`lib/drive/watch.ts:1252-1381`) EXCEPT `state_write`: cycle reports `infra_error` AND the attempt's write landed. `state_write` is definitionally the write NOT landing (spec R4 finding 3); its coverage is the 16b warn cell plus reconcile's returned-result mapping.
9. Class 20: `watch_backoff_ms` ↔ `BACKOFF_LADDER_MS` parity (real DB) at the SAME case set §3.3 names for the function contract — `n = 0, 1, 2, 3, 4, 5, 8, null` — against the independent literal table, with the `0`/`null` defensive-floor rows included (spec R3 finding 4 unified the two lists).
10. Class 21 (live validation probe, pre-merge): state columns visible via `pnpm observe watch --env validation`; `select public.watch_backoff_ms(3)` returns `3600000` (§4.3 — the function is invisible to the schema manifest); `cron.job` shows `'7,22,37,52 * * * *'`; next renewal window behaves (no 15-min churn regression).
11. Meta-tests re-run, not assumed: `postgrest-dml-lockdown` bidirectional discovery, `validation-schema-parity` both layers, `_metaInfraContract` both registries, `_metaMutationSurfaceObservability` (no new mutating route; refresh-watch stays GET), literal-nine cron suites (§3.1), x1 catalog parity.

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
- **Faults never suppress the attempt record** (§3.3a; §6 classes 16c/17) — `state_write` excepted, since it IS the attempt record failing, and it self-logs via `DRIVE_WATCH_STATE_WRITE_FAILED`. A persistent email fault reports 500 while the ladder keeps climbing.
- **The mixed-outcome writer race is chosen, not missed** (§3.3a): bounded to a cosmetic count offset on the NEXT incident, pinned by 16d; serializing it would need the locks §1.1a-5 forbids.
- **`last_attempt_outcome` is narrower than `ReconcileOutcome` on purpose** (§3.2): the CHECK admits only what §3.3a can write. Proposing to "complete" the CHECK to the full reconcile union is re-introducing spec R1 finding 5.
- **`occurrence_count` is not deleted** — it leaves the trigger role only.
- **The deferred design's §3.4a descope of the dedicated cron is settled** — the alert-raise transport it distrusted is now atomic anyway (lifecycle D10), but the same-cycle in-process design needs nothing from that fact.
