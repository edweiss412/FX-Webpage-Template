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
3. **No new table, no new route, no new cron job, no UI.** The diff is two source files plus tests — `lib/drive/watch.ts` and `lib/drive/watchErrors.ts`, matching the §4 completeness table. (An earlier draft said three; whole-diff R9 finding 4.)
4. **Fail-open posture unchanged.** Subscribe failures still degrade to scheduled sync (`lib/drive/watch.ts:436-490`).
5. **No advisory locks.** Zero holders on every surface touched; invariant 2 does not apply — none of `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions` is mutated.

## 2. Resolved decisions and named constants

| # | Decision | Choice |
|---|----------|--------|
| D1 | Requested lifetime | Google's documented maximum for `files` (24h). Store whatever Drive actually grants — already the behavior at `lib/drive/watch.ts:357`. |
| D2 | Renewal trigger | A fraction of the channel's own granted life **with an absolute floor**. A purely proportional trigger is unsafe on short grants because the predicate is sampled on a fixed cron tick (§2.1). |
| D3 | Pathologically short grants | Detected and logged on a best-effort basis (§3.3). NOT a durability guarantee: the emit is deliberately unawaited and its rejection is swallowed so observability can never convert a committed activation into an orphan, so a failed `app_events` write loses the signal (whole-diff R15). |

Constants, all in `lib/drive/watchErrors.ts` beside the existing `STALE_PENDING_MAX_AGE_MS` (`lib/drive/watchErrors.ts:9`). Every later section references these names, never the literals.

- `WATCH_TTL_MS` = **86_400_000** (24h) — requested lifetime.
- `RENEWAL_LIFE_FRACTION` = **0.75** — proportional term: due once 75% of granted life has elapsed.
- `RENEWAL_MIN_LEAD_MS` = **7_200_000** (2h) — absolute floor on remaining life at which a channel becomes due.
- `SAMPLING_PERIOD_MS` = **3_600_000** (1h) — how often the predicate is sampled (`fxav_cron_refresh_watch`). Unchanged by this PR; named because §2.1's boundary depends on it.
- `T_EXEC_BUDGET_MS` = **300_000** (5m) — a *margin*, not a bound, standing in for "one run's slack" when sizing the §3.3 heuristic. Nothing enforces it (R3 finding 1). **Not an enforced timeout** (review R1 finding 1): `files.watch` carries no timeout (`lib/drive/client.ts:35-39`) and renewals run sequentially (`lib/drive/watch.ts:547-577`), so there is no ceiling at all; the value is merely the scheduler's declared intent — pg_net is passed `timeout_milliseconds = 300000`, **which the migration itself notes may be ignored** (R7 finding 3: calling it a ceiling overstated it), matching Vercel Functions' 300s default (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:15-22`). An earlier draft used 60_000. Note that no value makes this a bound — see the heuristic framing below; the constant only sizes the detector.

### 2.1 The timing invariant

A cadence design is only correct relative to how often its predicate is **sampled**. Let `P = SAMPLING_PERIOD_MS`, `T = T_EXEC_BUDGET_MS`, `G` the lifetime Drive actually granted (`expires_at - created_at`), and

```
L(G) = max(RENEWAL_MIN_LEAD_MS, G * (1 - RENEWAL_LIFE_FRACTION))
```

the remaining-life threshold at which a channel becomes due. A channel activated at arbitrary phase is *typically* next examined about `P` later, but nothing enforces that — see the heuristic framing below.

| Granted life | Classification | Guarantee |
|---|---|---|
| remaining-at-activation `<= P + 2T` | **implausible** | flagged by the §3.3 heuristic. Note the quantity is REMAINING LIFE AT ACTIVATION, not the granted span `G` — the pending insert and Drive round-trip consume lease life before the channel is live. |
| remaining-at-activation `> P + 2T` | **not flagged** | **nothing is claimed** — see below. |

**No timing guarantee is claimed at all** (whole-diff R3 finding 1). Three successive rounds found the guarantee framing indefensible for the same reason each time: any such claim is parameterised by `T_EXEC_BUDGET_MS`, and nothing enforces it — renewals run sequentially, `files.watch` has no per-call timeout, and pg_net may ignore its own timeout hint (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:15-22`). A stalled earlier row can starve a later one regardless of threshold. The bound was widened twice chasing a property the constants cannot deliver.

`P + 2T` is therefore a **heuristic detector**, not a boundary of safety: below it, renewal is implausible rather than merely tight, and the cadence assumption deserves a look. Above it, nothing is promised. **The actual safety margin comes from the lease** — we request 24h and renew at 6h remaining, so the heuristic should never fire. The tests assert that ordering (`renewalLeadMs(WATCH_TTL_MS)` and `RENEWAL_MIN_LEAD_MS` both exceed the threshold) rather than modelling a tick series, because the earlier phase sweep modelled an idealised series and could not fail for realistic input (R3 finding 2).

**Post-activation observability is isolated** (whole-diff R1 finding 1). The anomaly's clock read and its log run *after* a committed activation, inside their own try/catch. Without that isolation a throwing clock or a rejecting sink would fall into the activation catch, raise `WATCH_CHANNEL_ORPHANED`, and return `orphaned` for a channel that is genuinely live — while `markOrphaned` (which only touches `status='pending'`) left the DB disagreeing with both the alert and the return value, and the previous channel already superseded. Two tests pin it: a throwing second clock read, and a sink that rejects only the anomaly code.

**No worst-case margin is quoted.** Earlier drafts stated one (`min(G, L(G)) - P - T`); it depended on `T` being enforced, which it is not (R3 finding 1, R4 finding 2). The lease is what provides margin: 24h requested, renewed at 6h remaining.

**No phase model is asserted either.** An earlier draft argued from an infimum over activation phase and cited a §5.1 phase sweep to prove it; that sweep is deleted (it modelled an idealised tick series and could not fail), and with no enforced execution budget there is nothing for such a model to rest on.

**Where the clock is read is load-bearing** (review R1 finding 2, and it decides which side of the heuristic a lease lands on). "Remaining life" means **remaining at successful activation**, not at request time. The pending row is inserted, Drive is called, and only then is the channel activated (`lib/drive/watch.ts:428-436`, `lib/drive/watch.ts:461-474`), so a nominal 62-minute grant that took two minutes to obtain has only 60 usable minutes. Measuring at request time would suppress the anomaly for exactly the leases that need it. `isGrantTooShort` therefore takes `remainingMsAtActivation`, and the emitted log field carries that name rather than `grantedMs`.

Note what the boundary says about today: a 1-hour grant sampled hourly is `G = P`, i.e. **anomalous** — which is exactly the §1.1 defect, stated as arithmetic rather than anecdote. It ceases to be anomalous the moment §3.1 lands.

## 3. Design

### 3.1 Request the maximum

`defaultWatchFolder` (`lib/drive/watch.ts:336-359`) adds `expiration: String(now + WATCH_TTL_MS)` to `requestBody` — a Unix timestamp in **milliseconds**, as a string, per the Drive API `Schema$Channel.expiration` contract. `now` comes from an injectable clock so the test is not wall-clock dependent.

Response handling is unchanged: the function already requires `data.expiration` (`lib/drive/watch.ts:351-353`) and stores `new Date(Number(data.expiration)).toISOString()` (`lib/drive/watch.ts:357`). A shorter-than-requested grant therefore degrades safely with no code change — we persist the real expiry and §3.2 renews against the real expiry.

**Guard conditions.** Drive returns a later expiration than requested → stored verbatim, harmless. Drive returns one already in the past (clock skew) → stored verbatim; §3.2 treats it as immediately due. `data.expiration` absent or empty → the existing throw at `lib/drive/watch.ts:405-407`, caught and classified by the existing handler. A **truthy but non-numeric** value (`"garbage"`) does NOT hit that check: it is truthy, so `Number(...)` yields `NaN` and `new Date(NaN).toISOString()` throws a `RangeError` one line later, at `lib/drive/watch.ts:411`. Same outcome — the outer handler catches either — but by a different path than an earlier draft claimed (whole-diff R15). Unchanged behavior; only the description was wrong.

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

`created_at` is used by the predicate. It is **not** added to the projected column list — the SELECT still returns `id, status, watched_folder_id, webhook_secret, resource_id, expires_at`, because no caller needs the value (R2 finding 3). The `drive_watch_channels_renewal_due_idx` partial index on `(expires_at) where status='active'` (`supabase/migrations/20260501001000_internal_and_admin.sql:306`) no longer covers the predicate; with a single-digit row count for a singleton folder this is a non-issue and the index is left in place (it serves nothing; see below). **No new index** — stated so the omission is not read as an oversight.

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
const emitted = log.error("drive watch grant too short to renew reliably", {
  source: "drive.watch",
  code: "DRIVE_WATCH_GRANT_TOO_SHORT",
  watchedFolderId,
  remainingMsAtActivation,
});
void emitted.catch(() => {}); // unawaited, but NEVER unhandled
```

The emit is deliberately NOT awaited and carries its own `.catch()` (see §3.1's post-activation note; the sample above shows that form, and a bare `void` without the handler reintroduces the unhandled-rejection failure). The bound is `<=`, not `<`, because the threshold is a heuristic boundary: a lease sitting exactly on it is indistinguishable from one just below it, and flagging is the conservative direction for a detector. **No claim is made about when such a lease expires relative to any tick.** An earlier draft justified the inclusive bound by asserting one ("expires at the next examination"), which was both arithmetically wrong — at `P = 60m`, `T = 5m` a boundary lease still has ~10 minutes left one period later — and exactly the execution claim §2.1 disclaims (whole-diff R8 finding 1).

We request 24h (§3.1), so after that lands this should not fire. Note what a firing does **not** imply. Drive's documented 1h is the **default applied when `expiration` is omitted, not a minimum** — the API states internal limits may yield an expiration earlier than the one requested, and §3.1's guard conditions already handle a shorter-than-requested grant. So the earlier reading of this code ("Drive's floor is 1h, therefore the cadence is at fault") was wrong in both halves (whole-diff R8 finding 2), and contradicted §3.1. A firing means either Drive granted materially less than the 24h asked for, or activation was slow enough to consume the lease (§2.1 measures at activation, not at request). Compare the logged `remainingMsAtActivation` against the stored `expires_at` to tell those apart before touching cadence. It is `log.error` because that level is always ROUTED to `app_events` (`shouldPersist` returns true for `error`, `lib/log/logger.ts:21-22`), and it carries a `code` so the observe CLI and telemetry can filter it. Routing is not delivery: the call is not awaited and carries `.catch(() => {})` (§3.3), so a failed write is swallowed by design — the alternative is letting a logging fault orphan a live channel. Treat the signal as best-effort, matching D3.

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
| Meta-tests | **EXTENDS one** (`tests/db/_metaLocalDbUrlGuard.test.ts` — its hard-coded reader census gains the new DB suite, so a new reader must be consciously registered) and **CREATES one** (review R1 finding 5): `tests/cron/samplingPeriodParity.test.ts` ties `SAMPLING_PERIOD_MS` to the canonical refresh-watch schedule in `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json`. Without it a future cadence change could update the existing cron-parity surfaces (`tests/cross-cutting/pg-cron-coverage.test.ts:153-159`) while leaving the renewal lead and the anomaly heuristic computed against the old period. **No OTHER meta-test is extended** — the relevant existing suites (`tests/drive/watch.test.ts`, `tests/sync/_metaInfraContract.test.ts`) are run to prove they still pass, but gain no new registry rows. (This cell previously read "EXTENDS one … EXTENDS none" in the same breath; whole-diff R8 finding 4.) |

## 5. Testing

TDD per task. Each class names the failure mode it catches.

1. **Constants and the §2.1 ordering** (`tests/drive/**`, DB-free). `T_EXEC_BUDGET_MS` **parsed out of** the scheduler migration rather than restated (mutating only the migration fails the test); and the orderings the heuristic depends on — `renewalLeadMs(WATCH_TTL_MS)` and `RENEWAL_MIN_LEAD_MS` both exceed `P + 2T`, which itself exceeds one bare `P`. **No phase sweep and no worst-case-margin assertion**: both were deleted with the guarantee they belonged to. `renewalLeadMs` has direct coverage for its proportional arm, its floor arm, and totality over NaN/Inf/negative/zero.
2. **`defaultWatchFolder` expiration** (`tests/drive/**`, DB-free). Request body carries `expiration` as a **string of milliseconds** equal to `injectedNow + WATCH_TTL_MS`, derived from the constant rather than a literal. A Drive response with a shorter expiration is stored verbatim; one already in the past is stored verbatim. *Catches:* sending seconds instead of milliseconds — the most likely silent mistake, which would request an expiry 46 years in the past.
3. **Renewal predicate** (`tests/db/**`, real DB — this directory is the serial project; `tests/drive/**` is DB-free and would fail on the no-Supabase CI runner). Fixtures actually present, enumerated rather than claimed (R4 finding 3 caught the earlier over-claim): a 24h lease not-due at 17h elapsed and due at 19h; a 6h lease due via the floor at 4h; an already-expired lease; an inverted lease expiring in the past; an inverted lease expiring in the **future** (`created_at > expires_at > NOW + floor`, which the floor alone would miss); and a non-active row that must never be selected. **Negative control:** a freshly-created 24h lease that the RETIRED `expires_at < now() + 24h` threshold would renew and this predicate must not; mutation-verified. The 1h and 2h rows of the §3.2 table are covered by the DB-free lead arithmetic, not here.
4. **Short-grant anomaly** (`tests/drive/**`, DB-free). Remaining-at-activation of `P`, of `P + T + 1ms`, and of exactly `P + 2T` all emit `DRIVE_WATCH_GRANT_TOO_SHORT` carrying `remainingMsAtActivation`; `P + 2T + 1ms` does not. A separate case models elapsed time between the two clock reads, so a regression to request-time measurement fails. Assert on the logger spy's fields, not on the message string. *Catches:* the `<` versus `<=` boundary flipping, and the `P + T` bound returning (being *examined* is not the same as *completing*).
5. **Existing suites still pass** (this diff does modify `tests/drive/watch.test.ts`'s fake and four of its fixtures — R3 finding 4; "unmodified" was wrong) — `tests/drive/watch.test.ts` renewal cases (their fixtures gain `created_at`), `tests/cron/refreshWatchRoute.test.ts`, `tests/api/cron-sync.test.ts`. *Catches:* the widened SELECT or predicate breaking a caller.
6. **Live validation probe (pre-merge).** After deploy, `pnpm observe watch --env validation` shows the next renewal producing a 24h `expiresAt` and the channel count dropping from 24/day toward 1/day.

## 6. Watchpoints (reviewer preempts)

- **Zero observed failures is not an argument against this.** §1.1 reports 168/168 clean renewals. The defect is the absence of margin, not a history of breakage; the measurement is the evidence, not a counter-argument.
- **This is deliberately not the backoff feature.** Scope was ratified after five adversarial rounds (§1.1a-1, §7). Findings that belong to the deferred half are out of scope here.
- **The cron schedule is unchanged**, so no cron-count, route-inventory, or cadence claim anywhere in the repo is affected.
- **The expired-but-active row is pre-existing** (§3.2 guard conditions, §7). This PR neither introduces nor worsens it: the schedule is unchanged, so the retry rate is unchanged.
- **`DRIVE_WATCH_GRANT_TOO_SHORT` is log-only by precedent**, not an oversight — two sibling codes in the same module are already log-only (§3.3).

## 7. Deferred, with the dependencies that forced the split

`BL-WATCH-RECONCILE-BACKOFF` (dedicated cadence + `drive_watch_reconcile_state` + exponential backoff + tiered surfacing) is deferred. Five adversarial rounds established that it cannot be built correctly on the current watch subsystem without first fixing four shipped defects: `BL-WATCH-EXPIRED-ACTIVE-ROW`, `BL-WATCH-ALERT-RAISE-NOT-ATOMIC`, `BL-WATCH-ALERT-FOLDER-SCOPE`, and `BL-WATCH-DRIVE-CALL-TIMEOUT` (the last is a prerequisite for any timing guarantee, per its own entry; whole-diff R9 finding 2 caught this count reading "three"). Each is filed separately with its evidence, and the full design work is retained at `docs/superpowers/specs/observability/2026-07-24-watch-reconcile-backoff-design.md` (status: DEFERRED, not implemented) so the follow-up starts from the analysis rather than repeating it.

- **`BL-WATCH-EXPIRED-ACTIVE-ROW`** — a failed renewal marks only the *new* pending channel orphaned (`lib/drive/watch.ts:442-450`); the old row keeps `status='active'` past its expiry, `listRenewalDue` keeps returning it (`lib/drive/watch.ts:206-210`), and GC only touches `superseded`/`orphaned` (`lib/drive/watch.ts:226-230`). It is therefore retried on every tick forever. **This is why a ladder on reconcile alone cannot deliver backoff** — refresh is the dominant retry path and is ungated.
- **`BL-WATCH-ALERT-RAISE-NOT-ATOMIC`** — `PostgresWatchTx.upsertAdminAlert` (`lib/drive/watch.ts:189-194`) calls the standalone service-role helper, which opens its own client and issues an RPC on a different connection (`lib/adminAlerts/upsertAdminAlert.ts:47-52`), outside the surrounding `sql.begin` (`lib/drive/watch.ts:315-318`). The alert raise is not atomic with the channel mutation it accompanies, so any design that infers health from alert-versus-channel state has a window.
- **`BL-WATCH-ALERT-FOLDER-SCOPE`** — `WATCH_CHANNEL_ORPHANED` is global (`show_id IS NULL`, one unresolved row) and carries no folder identity, while `refreshWatchSubscriptions` renews every active channel regardless of the configured folder (`lib/drive/watch.ts:196-210`) and folder promotion supersedes nothing. An old folder's failure can therefore describe the current folder.
