# Watch-Channel Lease Slack: ask Google for the 24 hours it already offers

**Date:** 2026-07-25
**Status:** DRAFT — autonomous ship
**Branch:** `feat/watch-reconcile-backoff` off `origin/main` @ `7ed193dde`
**Relationship to `BL-WATCH-RECONCILE-BACKOFF`:** this is the first of two PRs. It ships the measured defect only. The backoff/state/cadence half is deferred with its blocking dependencies documented — see §7 and `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md` (retained, not implemented).

---

## 1. Problem

Every Drive watch channel this system creates lives for **exactly one hour**, and the renewal cron runs **hourly**, so every lease is renewed at the instant it expires. A single failed renewal costs a full hour of push delivery.

### 1.1 Measured, on the live validation deployment (2026-07-24)

Validation is the only deployed environment — the ambient `SUPABASE_URL` in `.env.local` is loopback — so these are production numbers.

| Fact | Evidence |
|---|---|
| Channel lifetime is exactly 1 hour | `pnpm observe watch --env validation --json`: every row has `expiresAt = createdAt + 1h` (e.g. created `2026-07-25T04:00:02.781936+00:00`, expires `2026-07-25T05:00:03+00:00`) |
| Renewal runs hourly | `fxav_cron_refresh_watch`, `'0 * * * *'` (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:106`) |
| Slack is therefore **~1 second** | channel created `04:00:02` expires `05:00:03`; its replacement is created `05:00:02` |
| Churn: 24 channels/day | one `DRIVE_WATCH_ACTIVATED` per hour, 168 consecutive over 7 days |
| Failures in 7 days | **zero** — it works; it is simply fragile |

### 1.2 Root cause

`defaultWatchFolder` builds the `files.watch` request body with `id` / `type` / `address` / `token` and **no `expiration`** (`lib/drive/watch.ts:341-349`). Google's push guide: *"the expiration time defaults to 3600 seconds after the current time"*, and *"the maximum expiration time is 86400 seconds (1 day) after the current time for the `files` resource"* (<https://developers.google.com/workspace/drive/api/guides/push>).

We take the 1-hour default and never ask for the 24 hours available. Shows still sync on the scheduled path (`fxav_cron_sync`, `*/5`) so nothing is lost — but "Doug edited the sheet an hour ago and the crew still cannot see it" is the failure people feel during a live show.

## 1.1a Resolved scope — do not relitigate

1. **This PR is the lease fix only.** User-ratified 2026-07-25 after five adversarial rounds established that the backoff half depends on fixing shipped defects in the retry path (§7). Do not propose folding the state table, the backoff ladder, the cadence change, or the UI surfacing back in.
2. **The cron schedule does not change here.** It stays `'0 * * * *'`. The 15-minute cadence belongs to the deferred half.
3. **No new table, no new route, no new cron job, no UI.** The diff is three source files plus tests.
4. **Fail-open posture unchanged.** Subscribe failures still degrade to scheduled sync (`lib/drive/watch.ts:436-490`).
5. **No advisory locks.** Zero holders on every surface touched; invariant 2 does not apply — none of `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions` is mutated.

## 2. Resolved decisions and named constants

| # | Decision | Choice |
|---|----------|--------|
| D1 | Requested lifetime | Google's documented maximum for `files` (24h). Store whatever Drive actually grants — already the behavior at `lib/drive/watch.ts:357`. |
| D2 | Renewal trigger | A fraction of the channel's own granted life **with an absolute floor**. A purely proportional trigger is unsafe on short grants because the predicate is sampled on a fixed cron tick (§2.1). |
| D3 | Pathologically short grants | Detected and logged, not silently accepted (§3.3). |

Constants, all in `lib/drive/watchErrors.ts` beside the existing `STALE_PENDING_MAX_AGE_MS` (`lib/drive/watchErrors.ts:9`). Every later section references these names, never the literals.

- `WATCH_TTL_MS` = **86_400_000** (24h) — requested lifetime.
- `RENEWAL_LIFE_FRACTION` = **0.75** — proportional term: due once 75% of granted life has elapsed.
- `RENEWAL_MIN_LEAD_MS` = **7_200_000** (2h) — absolute floor on remaining life at which a channel becomes due.
- `SAMPLING_PERIOD_MS` = **3_600_000** (1h) — how often the predicate is sampled (`fxav_cron_refresh_watch`). Unchanged by this PR; named because §2.1's boundary depends on it.
- `T_EXEC_BUDGET_MS` = **300_000** (5m) — upper bound on the delay between a refresh run's candidate query and any one row's renewal attempt. **Not an enforced timeout** (review R1 finding 1): `files.watch` carries no timeout (`lib/drive/client.ts:35-39`) and renewals run sequentially (`lib/drive/watch.ts:547-577`), so the only defensible ceiling is the scheduler's own request budget — pg_net is passed `timeout_milliseconds = 300000`, matching Vercel Functions' 300s default (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:15-22`). An earlier draft used 60_000, which would have classified a 62-65 minute grant as "guaranteed" while it could expire before a later row was reached in a slow run.

### 2.1 The timing invariant

A cadence design is only correct relative to how often its predicate is **sampled**. Let `P = SAMPLING_PERIOD_MS`, `T = T_EXEC_BUDGET_MS`, `G` the lifetime Drive actually granted (`expires_at - created_at`), and

```
L(G) = max(RENEWAL_MIN_LEAD_MS, G * (1 - RENEWAL_LIFE_FRACTION))
```

the remaining-life threshold at which a channel becomes due. A channel activated at arbitrary phase is next examined at most `P + T` after activation.

| Granted life | Classification | Guarantee |
|---|---|---|
| `G <= P + 2T` | **anomalous** | none is claimed. `P + T` is not enough (R1 finding 2): a lease with `P + T + 1ms` at activation is examined with 1ms left, and `T` is only the delay until an attempt *starts* — the renewal must still complete a `files.watch` round-trip and a DB activation, so a second `T` of budget is required. Logged (§3.3). |
| `G > P + 2T` | **guaranteed** | the channel is examined-and-due strictly before `expires_at`, **with more than `T` of life remaining at that examination** — i.e. enough to complete the renewal, not merely to start it. Asserted by a phase sweep over activation offsets. |

**What is NOT claimed** (whole-diff R2 finding 1): the design does **not** guarantee that a lease survives *missing* a renewal tick. That would require `lead > 2P + T` (125 min), and the floor is 120 min — two earlier drafts asserted a stronger property than the constants deliver, once at `P + T` and once at `2 * (P + T)`. Rather than tune the constant a third time, the claim is the weaker one the phase sweep actually verifies: examined before expiry, with a completion budget left. A lease that misses its tick is covered by the next cron pass, not by this guarantee.

**Post-activation observability is isolated** (whole-diff R1 finding 1). The anomaly's clock read and its log run *after* a committed activation, inside their own try/catch. Without that isolation a throwing clock or a rejecting sink would fall into the activation catch, raise `WATCH_CHANNEL_ORPHANED`, and return `orphaned` for a channel that is genuinely live — while `markOrphaned` (which only touches `status='pending'`) left the DB disagreeing with both the alert and the return value, and the previous channel already superseded. Two tests pin it: a throwing second clock read, and a sink that rejects only the anomaly code.

**Worst-case remaining life at the renewing execution** is `min(G, L(G)) - P - T`, **not** `G - P - T`. The distinction matters and an earlier draft got it wrong: for the 24h grant we request, `L(G) = 6h`, so the true worst case is `6h - 1h - 5m = 4h55m` of remaining lease when the renewal actually runs — not 22h55m. Still ample; the point is that the margin comes from the *lead*, not the *lifetime*.

**That bound is an infimum, not an attained minimum** (review R1 finding 4). Under continuous arbitrary phase it is approached as the due-transition moves to just after a tick, but at the exact tick the `>=` predicate selects the row on that tick, so the value itself is never realized. The §5.1 sweep therefore asserts **every** sampled phase is `>=` the bound, plus that the near-worst phase lands within one phase-step epsilon of it — not exact equality, which a correct implementation would fail.

**Where the clock is read is load-bearing** (review R1 finding 2). "Remaining life" means **remaining at successful activation**, not at request time. The pending row is inserted, Drive is called, and only then is the channel activated (`lib/drive/watch.ts:428-436`, `lib/drive/watch.ts:461-474`), so a nominal 62-minute grant that took two minutes to obtain has only 60 usable minutes. Measuring at request time would suppress the anomaly for exactly the leases that need it. `isGrantTooShort` therefore takes `remainingMsAtActivation`, and the emitted log field carries that name rather than `grantedMs`.

Note what the boundary says about today: a 1-hour grant sampled hourly is `G = P`, i.e. **anomalous** — which is exactly the §1.1 defect, stated as arithmetic rather than anecdote. It ceases to be anomalous the moment §3.1 lands.

## 3. Design

### 3.1 Request the maximum

`defaultWatchFolder` (`lib/drive/watch.ts:336-359`) adds `expiration: String(now + WATCH_TTL_MS)` to `requestBody` — a Unix timestamp in **milliseconds**, as a string, per the Drive API `Schema$Channel.expiration` contract. `now` comes from an injectable clock so the test is not wall-clock dependent.

Response handling is unchanged: the function already requires `data.expiration` (`lib/drive/watch.ts:351-353`) and stores `new Date(Number(data.expiration)).toISOString()` (`lib/drive/watch.ts:357`). A shorter-than-requested grant therefore degrades safely with no code change — we persist the real expiry and §3.2 renews against the real expiry.

**Guard conditions.** Drive returns a later expiration than requested → stored verbatim, harmless. Drive returns one already in the past (clock skew) → stored verbatim; §3.2 treats it as immediately due. `data.expiration` absent or non-numeric → the existing throw at `lib/drive/watch.ts:351-353`, caught and classified by the existing handler at `lib/drive/watch.ts:436-490`. Unchanged.

### 3.2 Renew on a fraction of granted life, with a floor

Today: `listExpiringActive(now + 24h)` (`lib/drive/watch.ts:520-527`), i.e. `where status='active' and expires_at < $1` (`lib/drive/watch.ts:206-210`). With a 24h TTL that predicate is true for **every** channel from creation, so the longer lease alone would still churn once per cycle — it would buy the slack but not the quiet.

A purely proportional replacement is also wrong, because the predicate is sampled hourly (§2.1). Both terms are needed:

```sql
where status = 'active'
  and now() >= expires_at - greatest(
        $1::interval,                     -- RENEWAL_MIN_LEAD_MS
        (expires_at - created_at) * $2    -- 1 - RENEWAL_LIFE_FRACTION
      )
```

`created_at` is used by the predicate. It is **not** added to the projected column list — the SELECT still returns `id, status, watched_folder_id, webhook_secret, resource_id, expires_at`, because no caller needs the value (R2 finding 3). The `drive_watch_channels_renewal_due_idx` partial index on `(expires_at) where status='active'` (`supabase/migrations/20260501001000_internal_and_admin.sql:306`) no longer covers the predicate; with a single-digit row count for a singleton folder this is a non-issue and the index stays for the GC path. **No new index** — stated so the omission is not read as an oversight.

Behavior across grants (this table is the §5.2 test fixture set):

| Granted life `G` | `L(G)` | Due at | Sampling ticks between due and expiry |
|---|---|---|---|
| 24h (what we request) | 6h | 18h elapsed | 6 |
| 6h | 2h (floor) | 4h elapsed | 2 |
| 2h | 2h (floor) | immediately | 2 |
| 1h (today's grant) | 2h (floor) | immediately | 1 |

**Guard conditions.**
- `expires_at is null` → **unreachable for `status='active'`**: `drive_watch_channels_active_requires_drive_state` forbids it (`supabase/migrations/20260501001000_internal_and_admin.sql:298-300`) and the query filters on `status='active'`. No fixture is written for it, because the row cannot be constructed.
- `expires_at <= created_at` (clock skew, inverted or zero-length grant) → matched by an **explicit disjunct**, not by the floor. Whole-diff R1 finding 3: with `created_at > expires_at > now + floor` the proportional term is negative, `greatest` picks the 2h floor, and the row would NOT be selected despite being exactly the nonsense the contract says to replace. The predicate therefore reads `expires_at <= created_at OR <the lead test>`, and the DB suite carries a future-expiring inverted fixture that fails when the disjunct is removed.
- A channel already past `expires_at` remains due. **Note:** such a row also stays `status='active'` forever and is retried on every tick — a **pre-existing** defect this PR neither introduces nor fixes; see §7 `BL-WATCH-EXPIRED-ACTIVE-ROW`.

### 3.3 Detect pathologically short grants

`subscribeToWatchedFolder` compares the remaining life at activation against `SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS` on the activation path and, when the grant does not **exceed** it, emits:

```ts
await log.error("drive watch grant too short to renew reliably", {
  source: "drive.watch",
  code: "DRIVE_WATCH_GRANT_TOO_SHORT",
  watchedFolderId,
  remainingMsAtActivation,
});
```

The bound is `<=`, not `<`: a lease of exactly one sampling period activated just after a tick expires at the next examination rather than strictly before it.

We request 24h and Drive's documented floor for an unspecified request is 1h, so after §3.1 this should be unreachable. If it ever fires, the cadence needs revisiting rather than the channel. It is `log.error` because error level always persists to `app_events` (`lib/log/logger.ts:22`), and it carries a `code` so the observe CLI and telemetry can filter it.

**This code is admin-log-only and is NOT a §12.4 catalog entry**: it raises no `admin_alerts` row, renders in no UI, and has no Doug-facing copy. Precedent: `DRIVE_WATCH_INFRA_FAULT` and `DRIVE_WATCH_STALE_PENDING_SWEPT` are already log-only codes in this module (`lib/drive/watch.ts:530-537`, `lib/drive/watch.ts:669-673`). Consequently the §12.4 three-way lockstep does **not** apply and `tests/cross-cutting/codes.test.ts` needs no new row — verified against the existing log-only codes rather than assumed.

## 4. Completeness

| Layer | Change |
|---|---|
| Table DDL / CHECK / index | **none** |
| Migration | **none** |
| RPC | **none** |
| Grants / RLS | **none** |
| Cron registration | **none** — schedule, job count, route inventory and every canonical nine-job claim are untouched |
| §12.4 catalog | **none** (§3.3) |
| UI | **none** — no file under `app/` (except none) or `components/` is touched, so the invariant-8 impeccable dual-gate does not apply |
| Source | `lib/drive/watchErrors.ts` (constants), `lib/drive/watch.ts` (request body, SELECT, predicate, anomaly log) |
| Invariant 9 | no new Supabase call boundary — the renewal read is an existing `WatchTx` method whose registry row is unchanged in contract |
| Invariant 10 | N/A — no mutating route or server action is added |
| Meta-tests | **CREATES one** (review R1 finding 5): `tests/cron/samplingPeriodParity.test.ts` ties `SAMPLING_PERIOD_MS` to the canonical refresh-watch schedule in `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json`. Without it a future cadence change could update the existing cron-parity surfaces (`tests/cross-cutting/pg-cron-coverage.test.ts:153-159`) while leaving the renewal guarantee and the anomaly boundary computed against the old period. **EXTENDS none.** The relevant existing suites (`tests/drive/watch.test.ts`, `tests/sync/_metaInfraContract.test.ts`) are run to prove they still pass. |

## 5. Testing

TDD per task. Each class names the failure mode it catches.

1. **Constants and the §2.1 boundary** (`tests/drive/**`, DB-free). `L(G)` computed through the implementation for `G ∈ {P-ε, P, P+T, P+T+ε, 6h, 24h}`; the classification table asserted per row. **A phase sweep, not a formula restatement**: for each `G`, step the activation offset across a full period against a simulated fixed tick series and assert, for every `G > P+T`, that the channel is examined-and-due strictly before `expires_at` at **every** offset — and record the minimum remaining life at the renewing execution, asserting it equals `min(G, L(G)) - P - T` rather than `G - P - T`. *Catches:* the boundary being `<` instead of `<=`; the margin overstatement an earlier draft shipped; a constant edit that lets renewal be sampled after expiry.
2. **`defaultWatchFolder` expiration** (`tests/drive/**`, DB-free). Request body carries `expiration` as a **string of milliseconds** equal to `injectedNow + WATCH_TTL_MS`, derived from the constant rather than a literal. A Drive response with a shorter expiration is stored verbatim; one already in the past is stored verbatim. *Catches:* sending seconds instead of milliseconds — the most likely silent mistake, which would request an expiry 46 years in the past.
3. **Renewal predicate** (`tests/db/**`, real DB — this directory is the serial project; `tests/drive/**` is DB-free and would fail on the no-Supabase CI runner). Every row of the §3.2 table, each row's due-ness derived from its own `created_at`/`expires_at` and the constants, never wall-clock literals: 24h not-due at 17h and due at 19h; 6h due via the floor at 4h; 1h due immediately; `expires_at <= created_at` due immediately. **Negative control:** the same table run against a variant predicate with the `greatest(...)` floor removed must **fail** on the 1h and 6h rows, proving the fixtures discriminate. *Catches:* boundary direction, and a floor-less regression that silently reintroduces sampling-after-expiry.
4. **Short-grant anomaly** (`tests/drive/**`, DB-free). Remaining-at-activation of `P`, of `P + T + 1ms`, and of exactly `P + 2T` all emit `DRIVE_WATCH_GRANT_TOO_SHORT` carrying `remainingMsAtActivation`; `P + 2T + 1ms` does not. A separate case models elapsed time between the two clock reads, so a regression to request-time measurement fails. Assert on the logger spy's fields, not on the message string. *Catches:* the `<` versus `<=` boundary flipping, and the `P + T` bound returning (being *examined* is not the same as *completing*).
5. **Existing suites pass unmodified** — `tests/drive/watch.test.ts` renewal cases (their fixtures gain `created_at`), `tests/cron/refreshWatchRoute.test.ts`, `tests/api/cron-sync.test.ts`. *Catches:* the widened SELECT or predicate breaking a caller.
6. **Live validation probe (pre-merge).** After deploy, `pnpm observe watch --env validation` shows the next renewal producing a 24h `expiresAt` and the channel count dropping from 24/day toward 1/day.

## 6. Watchpoints (reviewer preempts)

- **Zero observed failures is not an argument against this.** §1.1 reports 168/168 clean renewals. The defect is the absence of margin, not a history of breakage; the measurement is the evidence, not a counter-argument.
- **This is deliberately not the backoff feature.** Scope was ratified after five adversarial rounds (§1.1a-1, §7). Findings that belong to the deferred half are out of scope here.
- **The cron schedule is unchanged**, so no cron-count, route-inventory, or cadence claim anywhere in the repo is affected.
- **The expired-but-active row is pre-existing** (§3.2 guard conditions, §7). This PR neither introduces nor worsens it: the schedule is unchanged, so the retry rate is unchanged.
- **`DRIVE_WATCH_GRANT_TOO_SHORT` is log-only by precedent**, not an oversight — two sibling codes in the same module are already log-only (§3.3).

## 7. Deferred, with the dependencies that forced the split

`BL-WATCH-RECONCILE-BACKOFF` (dedicated cadence + `drive_watch_reconcile_state` + exponential backoff + tiered surfacing) is deferred. Five adversarial rounds established that it cannot be built correctly on the current watch subsystem without first fixing three shipped defects. Each is filed separately with its evidence, and the full design work is retained at `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md` (status: DEFERRED, not implemented) so the follow-up starts from the analysis rather than repeating it.

- **`BL-WATCH-EXPIRED-ACTIVE-ROW`** — a failed renewal marks only the *new* pending channel orphaned (`lib/drive/watch.ts:442-450`); the old row keeps `status='active'` past its expiry, `listExpiringActive` keeps returning it (`lib/drive/watch.ts:206-210`), and GC only touches `superseded`/`orphaned` (`lib/drive/watch.ts:226-230`). It is therefore retried on every tick forever. **This is why a ladder on reconcile alone cannot deliver backoff** — refresh is the dominant retry path and is ungated.
- **`BL-WATCH-ALERT-RAISE-NOT-ATOMIC`** — `PostgresWatchTx.upsertAdminAlert` (`lib/drive/watch.ts:189-194`) calls the standalone service-role helper, which opens its own client and issues an RPC on a different connection (`lib/adminAlerts/upsertAdminAlert.ts:47-52`), outside the surrounding `sql.begin` (`lib/drive/watch.ts:315-318`). The alert raise is not atomic with the channel mutation it accompanies, so any design that infers health from alert-versus-channel state has a window.
- **`BL-WATCH-ALERT-FOLDER-SCOPE`** — `WATCH_CHANNEL_ORPHANED` is global (`show_id IS NULL`, one unresolved row) and carries no folder identity, while `refreshWatchSubscriptions` renews every active channel regardless of the configured folder (`lib/drive/watch.ts:196-210`) and folder promotion supersedes nothing. An old folder's failure can therefore describe the current folder.
