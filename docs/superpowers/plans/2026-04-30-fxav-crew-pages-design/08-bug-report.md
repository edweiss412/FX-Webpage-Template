# Milestone 8 — Bug-report pipeline (AC-8.1..8.13)

> Part of [the FXAV crew pages design plan](README.md).

Spec context: §13 entire section, §17.1 milestone 8.

### Task 8.1: Reports lease-ownership protocol formalization (no new migration)

**Files:** Test: `tests/db/reports-schema.test.ts`. Create: `lib/reports/leaseProtocol.ts` for the `lease_holder` UUID + `processing_lease_until` helpers (acquire/extend/release, idempotency-key dedup).

**schema is authored in Task 2.2, NOT here.** Earlier draft had Task 8.1 ALTER `reports` to add `idempotency_key` / `processing_lease_until` / `lease_holder` — but Task 2.2 already authors those columns from §4.1 verbatim. Two migrations adding the same columns is a duplicate-enforcement hazard (the second `ADD COLUMN IF NOT EXISTS` becomes a no-op in production but masks schema drift in dev where IF-NOT-EXISTS isn't always present). The corrected design: Task 2.2 owns the schema; Task 8.1 owns the **application protocol** that uses those columns.

- [x] **Step 1: Schema gate test** — assert the columns/indexes Task 2.2 authored are in place: `idempotency_key uuid NOT NULL` with a unique index, `processing_lease_until timestamptz` (nullable), `lease_holder uuid` (nullable) with a partial-not-null index for fast reaper scans. The test reads `pg_get_indexdef` per Task 2.5 patterns. If any are missing, fix Task 2.2 — do NOT add a parallel migration here.
- [x] **Step 2: Implement `lib/reports/leaseProtocol.ts`** — the lease-ownership helpers that every report-pipeline path uses. (preserved): lease-expiry alone isn't proof the original worker is dead; a slow original can complete `createIssue` AFTER a retry has reclaimed the lease, producing duplicate GitHub issues. The `lease_holder` UUID is written at reservation time and rotated on every reacquisition: every UPDATE that mutates a row's `github_issue_url` carries an `AND lease_holder = $myToken` predicate, so a worker whose lease was stolen sees its tail UPDATE match 0 rows and runs the orphan cleanup (close at GitHub + UPSERT `admin_alerts` keyed `REPORT_ORPHANED_LOST_LEASE`).
- [x] **Step 3: Commit** `feat(reports): lease-ownership protocol helpers (§13.2.3)`.

### Task 8.2: GitHub Issues client (§13.2)

**Files:** Create: `lib/github/issues.ts`. Test: `tests/github/issues.test.ts` (mocked).

- [x] **Step 1: Failing tests** — `createIssue({title, body, labels})` calls Octokit with the configured repo and token. `findIssueByMarker(idempotencyKey)` paginates `issues.listForRepo({creator: GITHUB_BOT_LOGIN, since: <T-24h>, state: 'all'})` and returns the matching issue url or null; throws `LookupInconclusive` on pagination errors or missing config (per Task 8.3d).
- [x] **Step 2: Implement** with `@octokit/rest`. Use the env vars `GITHUB_API_TOKEN` and `GITHUB_REPO`.
- [x] **Step 3: Commit** `feat(github): issues client + marker search (§13.2.3)`.

### Task 8.3: `/api/report` skeleton + auth + anonymous rejection (AC-8.7)

**Files:** Create: `app/api/report/route.ts`, `lib/reports/submit.ts`. Test: `tests/reports/auth.test.ts`.

This is the smallest TDD slice — auth gate only, no GH integration, no quota, no idempotency yet. Subsequent tasks layer features on.

- [x] **Step 1: Failing test** — POST `/api/report` with no session → 401.
- [x] **Step 2: Run** test — expect FAIL (route missing).
- [x] **Step 3: Implement** the route skeleton: dispatch to `validateLinkSession`/`validateGoogleSession`/`requireAdmin`; if all three reject → 401. Otherwise return a 501 NOT_IMPLEMENTED stub for downstream tests to flesh out.
- [x] **Step 4: Run** test — expect PASS.
- [x] **Step 5: Commit** `feat(reports): /api/report skeleton + auth (AC-8.7)`.

### Task 8.3a: Atomic quota reservation (AC-8.3, AC-8.6, AC-8.10)

**Files:** Create: `lib/reports/rateLimit.ts`. Modify: `lib/reports/submit.ts`. Test: `tests/reports/quota.test.ts`.

- [x] **Step 1: Failing tests**
  - AC-8.3: synthesize 10 admin rows in current `hour_bucket`, then 11th request → 429 with `REPORT_RATE_LIMITED_ADMIN`.
  - AC-8.6: 4th crew submission in 1h from same `crew_members.id` → 429 with `REPORT_RATE_LIMITED_CREW`.
  - AC-8.10: spawn 4 concurrent crew submissions from same `crew_members.id` against an empty bucket → exactly 3 succeed (HTTP 201/202), 4th returns 429. The atomic `INSERT .. ON CONFLICT (kind, identity, hour_bucket) DO UPDATE SET count = count + 1 RETURNING count` guarantees no race.
- [x] **Step 2: Run** — FAIL (no quota path yet).
- [x] **Step 3: Implement** `enforceQuota(tx, kind, identity)` that runs the atomic UPSERT, ROLLBACKs on `count > limit`, and returns `{ allowed: boolean, count: number }`. Wire into the route between auth and the (still-stubbed) issue create.
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(reports): atomic quota reservation (AC-8.3, AC-8.6, AC-8.10)`.

### Task 8.3b: Happy-path idempotency + reservation (AC-8.1..8.5, AC-8.9, first-submit race)

**Files:** Modify: `lib/reports/submit.ts`. Test: `tests/reports/happyPath.test.ts`, `tests/reports/firstSubmitRace.test.ts`.

The reservation-acquisition path uses `INSERT .. ON CONFLICT (idempotency_key) DO NOTHING RETURNING id` — NOT `SELECT FOR UPDATE` followed by `INSERT`. The `SELECT FOR UPDATE`-then-`INSERT` pattern has a window where two concurrent first submissions both find no row to lock, both attempt INSERT, and the second hits `unique_violation` (Postgres error 23505) instead of getting an idempotent response. The `INSERT .. ON CONFLICT DO NOTHING` form forces the conflict resolution to happen atomically inside the engine: at most one transaction's INSERT returns a row; the other gets an empty result and falls through to the existing-row branch. This handles the first-submit race correctly without a separate lock dance.

- [x] **Step 1: Failing tests**
  - AC-8.1: admin click → GH issue with §13.2.1 body + `reporter:admin` label.
  - AC-8.2: row recorded with `reported_by_kind='admin'`, populated `github_issue_url`.
  - AC-8.4: crew submission → §13.2.2 body, NO crew name/email in issue, `reporter:crew` label.
  - AC-8.5: row recorded with `reported_by_kind='crew'`, `reported_by=<crew_members.id>`, `reporter_role` snapshot, `github_issue_url` populated.
  - AC-8.9: same `idempotency_key` POSTed twice → same `github_issue_url` returned, no duplicate issue, exactly one `reports` row.
  - **First-submit race test:** spawn two concurrent POSTs with the same brand-new `idempotency_key` against an empty `reports` table. Exactly one `reports` row is INSERTed and exactly one GH issue is created. The "loser" returns `IDEMPOTENCY_IN_FLIGHT` (HTTP 409) while the winner is still mid-call to GitHub OR returns the same URL once the winner finishes. NEITHER request returns 500 with a unique-violation error.
- [x] **Step 2: Run** — FAIL.
      **Quota is charged only when an idempotency claim is genuinely won — INSERT first, then quota.** Round 3's draft put quota before INSERT and tried to refund losers via `GREATEST(count - 1, 0)`. The observed that approach still allows a false 429: with `remaining_quota = 1`, two concurrent same-key first submitters both pass the pre-check, both increment quota (one to limit, one to limit+1), and the loser returns 429 at the quota step before reaching the conflict-safe INSERT — even though the request is an idempotent duplicate that should return 200 or 409. The fix: do the INSERT first, and only the actual inserter (the row that returned from `RETURNING`) charges quota inside the same transaction. The loser sees zero rows from the INSERT and falls through to the existing-row dispatch without ever touching the quota counter.

- [x] **Step 3: Implement** the reserve-then-call flow as INSERT-first, quota-on-claim:
  1. Open transaction.
     **Server response contract:** every terminal success returns `{ ok: true, status: 'created' | 'duplicate' | 'recovered', github_issue_url?: string }`. Admin path includes `github_issue_url`; crew path omits it (privacy §13.2.3). Failure responses return `{ ok: false, code: <message catalog code> }` with the appropriate non-2xx HTTP status.

  2. **Pre-check for an existing idempotent row** (fast path for completed and in-flight retries):

     ```sql
     SELECT id, github_issue_url, processing_lease_until
       FROM reports
      WHERE idempotency_key = $1;
     ```

     - `github_issue_url IS NOT NULL` → COMMIT, return HTTP 200 with `{ ok: true, status: 'duplicate', github_issue_url: <url, admin only> }`. **Quota NOT touched** — duplicate completed retry.
     - `github_issue_url IS NULL AND processing_lease_until > now` → COMMIT, return 409 `IDEMPOTENCY_IN_FLIGHT`. **Quota NOT touched** — duplicate concurrent retry.
     - `github_issue_url IS NULL AND processing_lease_until <= now` → existing orphan row. Quota was already charged when the original was created. Hand off to the recovery path in Task 8.3c (re-acquire lease via conditional UPDATE; if that UPDATE matches 0 rows, another retry has the lease, return 409). **Quota NOT touched.**
     - Row not found → genuinely brand-new. Continue to step 3.

  3. **Conflict-safe insertion attempt** (the row may have been created by a concurrent first-submitter between step 2's SELECT and now — `ON CONFLICT DO NOTHING` resolves the race atomically). The winner stamps a fresh `lease_holder` UUID — the ownership token. The token is captured in request-local memory and consumed by step 7's tail UPDATE.
     ```sql
     INSERT INTO reports (
       idempotency_key, show_id, reported_by_kind, reported_by, reporter_role,
       context, message, processing_lease_until, lease_holder
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, now + interval '90 seconds', $8::uuid
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id, lease_holder;
     ```
     `$8` is `gen_random_uuid` minted in request scope before the INSERT and held in `myLeaseHolder` for the duration of this attempt.
  4. **If `RETURNING` yielded zero rows** (a concurrent winner INSERTed between our step-2 SELECT and our step-3 INSERT) → re-SELECT for the existing row's state and return per the same dispatch as step 2 (200 / 409 / fall-through to 8.3c). **Quota NOT charged** — we lost the claim race. COMMIT and return.
  5. **If `RETURNING` yielded a row** → we are the winner. NOW charge quota inside the same transaction:

     ```sql
     INSERT INTO report_rate_limits (kind, identity, hour_bucket, count)
     VALUES ($kind, $identity, date_trunc('hour', now), 1)
     ON CONFLICT (kind, identity, hour_bucket) DO UPDATE
       SET count = report_rate_limits.count + 1
     RETURNING count;
     ```

     - If returned `count > limit` (10 admin / 3 crew) → ROLLBACK the entire transaction. The INSERT into `reports` is also discarded by ROLLBACK, so the brand-new row never persists. Return 429 with `REPORT_RATE_LIMITED_*`. The user's idempotency_key is now associated with no row anywhere; a future retry with the same key will pass step 2's "row not found" branch and try again — desirable, because the user might wait an hour and retry, in which case the new bucket allows the claim.
     - If `count <= limit` → COMMIT and proceed to step 6.

  6. **Winner branch (post-COMMIT):** outside transaction, build the issue body with the `<!-- fxav-report-id: <key> -->` marker; call GitHub create (15s timeout). The `labels` arg uses ONLY the static set per Task 8.3d (`bug-report`, `reporter:admin`/`reporter:crew`, area labels) — no per-key labels.
  7. **On 2xx, conditional tail UPDATE — the lease-ownership guard:**

     ```sql
     UPDATE reports
        SET github_issue_url = $1
      WHERE idempotency_key = $2
        AND github_issue_url IS NULL
        AND lease_holder = $3::uuid -- I still own the lease
      RETURNING id;
     ```

     `$3` is `myLeaseHolder` from step 3.
     - 1 row → I am still the lease holder. Return 201 with `{ ok: true, status: 'created', github_issue_url }`.
     - 0 rows → my tail UPDATE missed. **The 0-row branch is implemented as a shared helper `handleTailUpdateMiss(key, newIssue, myLeaseHolder, fallbackShowId)`** in `lib/reports/submit.ts`, called by both the original-worker tail (Task 8.3b) and the retry-worker tail (Task 8.3e). The `fallbackShowId` argument is the : it carries the caller's in-memory show id so Case Reaped's alert keys per-show. **The original-worker tail passes `request.body.show_id` (the show id from the report submission, which was just INSERTed on the reservation row in this same request).** The retry-worker tail passes `entryShowId` (captured from the entry-time row read at the top of `expiredLeaseRetry`). Helper signature:

       ```ts
       async function handleTailUpdateMiss: Promise<Response>;
       ```

       The contract:
       1. **Re-read the row** with `SELECT github_issue_url, show_id FROM reports WHERE idempotency_key = $1` (NULL-safe — the row may be gone).
       2. **Case A:** `row` exists AND `row.github_issue_url === myUrl` → a newer retry's `findIssueByMarker` recovered MY issue and wrote its URL into the row. The issue is live; **DO NOT close it.** Return 200 with that URL.
       3. **Case B:** `row` exists AND `row.github_issue_url` is set AND ≠ `myUrl` → a separate retry created a different issue; mine is the orphan. Close MY issue (single atomic Octokit `issues.update` setting state=closed, state_reason=not_planned, labels including `fxav-orphan-lost-lease`); UPSERT `admin_alerts.REPORT_ORPHANED_LOST_LEASE` with `show_id = row.show_id` and `context.row_reaped = false`; return 200 with the row's existing URL.
       4. **Case C:** `row` exists AND `row.github_issue_url IS NULL` → another worker holds the lease but hasn't finished. Cleanup as in B; UPSERT alert with `show_id = row.show_id` and `context.row_reaped = false`; return 409 `IDEMPOTENCY_IN_FLIGHT`.
       5. **Case Reaped:** `row` is null → the daily reaper deleted it because it crossed the 24h `created_at` horizon AND its lease had expired. **MY issue still exists at GitHub** and MUST be closed regardless; otherwise an orphan leaks. Cleanup as in B; UPSERT alert with `show_id = <caller-supplied>` — for the original-worker tail this is the `show_id` captured at request-submission time (we know which show the report was for, since the worker ran the reservation in this same request); for the retry-worker tail this is `entryShowId` captured at the start of `expiredLeaseRetry`. Only fall back to `NULL` if no in-memory show id exists in either caller's scope (genuinely impossible to attribute). Mark `context.row_reaped = true` as a discriminator; return 410 `REPORT_HORIZON_EXPIRED`. **Per-show alert keying is preserved across both callers** so two unresolved reaped lost-lease incidents on different shows produce two distinct admin_alerts rows under §4.6's `(coalesce(show_id::text,''), code)` partial unique index.

       The `findIssueByMarker` filter (Task 8.3d) skips any marker-bearing `state='closed' && state_reason='not_planned'` issue REGARDLESS of label presence, so even if future code regression splits the cleanup `issues.update` into two calls and only the close half lands, the filter still excludes the orphan. The UPSERT pattern is the standard `ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL DO UPDATE SET last_seen_at = now, occurrence_count = admin_alerts.occurrence_count + 1, context = EXCLUDED.context`.

  **Net invariant:** the quota counter in `report_rate_limits` reflects the number of distinct GH-creation attempts that successfully claimed an idempotency row, not raw POSTs. Two retries of the same key = 1 increment. The first-submit race winner = 1 increment; the loser = 0 increment. A 429 (over quota) ROLLBACK leaves the counter unchanged — the failed `RETURNING count` was discarded. The single same-transaction quota INSERT means there's no window where the loser can see a partially-incremented bucket.

  Add explicit tests for these invariants:
  - **Duplicate-attempt zero-charge:** POST twice with the same idempotency_key and the same admin/crew identity. Assert `report_rate_limits.count` is 1, not 2, after both calls.
  - **Race-loser zero-charge:** seed `report_rate_limits` so that the identity has `count = limit - 1` (one slot remaining). Spawn two concurrent POSTs with the same brand-new idempotency_key. Assert exactly one issue is created, exactly one `reports` row exists, `report_rate_limits.count = limit` (NOT `limit + 1`), and **NEITHER call returns 429** — the winner gets 201 (or eventually 201 after GH call), the loser gets 200 with the same URL OR 409 `IDEMPOTENCY_IN_FLIGHT`.
  - **Quota-exhausted-rollback:** seed `count = limit`. POST a brand-new idempotency_key. Assert 429 returned, `reports` table has no new row for that key, `report_rate_limits.count = limit` (the 429 ROLLBACK reverted the optimistic increment).
  - **8.3c retry-after-lease-expiry no-recharge:** simulate the GH 5xx scenario where the original submission charges quota and sets the lease but never sets `github_issue_url`. After the lease expires, retry. Assert `report_rate_limits.count` is unchanged (still 1) — the existing-row branch in step 2 short-circuits before quota.

- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(reports): conflict-safe reservation + first-submit race protection (AC-8.1..8.5, AC-8.9)`.

### Task 8.3c: 5xx retry path — lock-free search-then-recover (AC-8.11)

**Files:** Modify: `lib/reports/submit.ts`, `lib/github/issues.ts`. Test: `tests/reports/retry5xx.test.ts`.

**The retry path holds NO row-level lock during GitHub I/O.** The original submission's tail UPDATE — `UPDATE reports SET github_issue_url = $url WHERE id = $row` — must be free to land at any time. If the retry path were to take a `SELECT FOR UPDATE` and then call `findIssueByMarker` while holding the row lock, the original tail UPDATE would block, the URL would stay NULL during the retry's lookup, and the retry's late-success guard (Task 8.3e) would have nothing to detect. The only serialized step in the retry is the conditional lease-claim UPDATE itself; everything else uses unlocked SELECTs and lock-free GitHub calls.

- [x] **Step 1: Failing test (AC-8.11)** — mock GitHub returning 5xx after row reservation. Row stays NULL. First retry within lease window → 409 `IDEMPOTENCY_IN_FLIGHT`. After lease expiry, retry triggers `reconcileBeforeCreate(key)` → `findIssueByMarker` returns null cleanly (no issue exists) → re-call `createIssue` → exactly one issue ever exists; row gets the URL. **Additional regression:** start the original submission's tail `UPDATE` AFTER the retry's lease-expired SELECT — assert the tail update is not blocked (no row lock held by the retry during the lookup) and that the late-success guard in 8.3e fires correctly.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement** the retry branch in `submit` — the canonical algorithm lives in **Task 8.3e's pseudocode** (the `expiredLeaseRetry` function). 8.3c's contribution is the AC-8.11 test coverage and the lock-free transaction-boundary contract; the actual retry implementation must use the `lease_holder` rotation and `AND lease_holder = $myToken` tail-UPDATE fencing as spelled out in 8.3e. **Do not implement an alternative SQL flow here** — both tasks share the single canonical helper at `lib/reports/submit.ts:expiredLeaseRetry`. The contract this task adds:
  - **Transaction boundary contract** — the retry path must use only single-statement transactions (Tx2/Tx3/Tx5 in the 8.3e pseudocode). NO `SELECT FOR UPDATE`. NO long-held row lock. GitHub I/O happens between transactions, never inside one.
  - **Lease-ownership contract** — every URL-writing tail UPDATE includes `AND lease_holder = $myToken`. This is the fence; it makes lease theft detectable by both the original worker and any retry.
  - **Recovery contract** — the only function that authorizes `createIssue` is the same `expiredLeaseRetry` helper, after `reconcileBeforeCreate` returns null AND the lease-claim UPDATE returns 1 row.

  These contracts are statically asserted by the test suite per the AC-8.11 / AC-8.13 requirements: test cases call `expiredLeaseRetry` and inspect both the SQL log (Postgres `auto_explain` or `pg-mem` query trace) and the GitHub mock invocation log to verify the contract holds.

- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(reports): 5xx retry — lock-free search-then-recover (AC-8.11)`.

### Task 8.3d: Unknown-outcome reconciliation — single authoritative lookup, fail-closed (AC-8.12)

**Files:** Modify: `lib/github/issues.ts`, `.env.local.example`. Test: `tests/reports/unknownOutcome.test.ts`, `tests/reports/lookupFailClosed.test.ts`.

**Recovery uses ONE lookup path, the list endpoint, and fails closed on any inconclusive result.**

- **GitHub Issues' code-search endpoint is NOT immediately consistent.** A query `q='"<key>" in:body'` for a freshly-created issue can return zero matches for tens of seconds while GitHub's search index catches up — exactly the path AC-8.12 must defend against. **Code search is eliminated from the recovery path entirely**.
- **Per-key labels are eliminated** — GitHub labels are repo-scoped objects that must exist before they can be applied to issues; one-label-per-report would accumulate hundreds of permanent repo labels per year.
- **Single recovery primitive: `findIssueByMarker`** — calls `octokit.rest.issues.listForRepo({ creator: BOT_LOGIN, since: <T-24h>, state: 'all', per_page: 100 })` and scans every page until natural exhaustion (i.e., until a page returns < 100 results), looking for the embedded `<!-- fxav-report-id: <key> -->` marker in the issue body. **Pagination is bounded by a 1000-page sanity cap** — exceeding it throws `LookupInconclusive('PAGINATION_BOUND')` and forbids `createIssue`. The list endpoint is immediately consistent with create writes; the `creator` + `since` filters bound the response.
- **Fail-closed contract**: `findIssueByMarker` returns one of three values:
  1. `{ url }` — issue found within the recovery window. Recovery proceeds.
  2. `null` — pagination completed cleanly AND no matching issue exists within the window. **This is the ONLY case where `createIssue` may be called.**
  3. throws `LookupInconclusive` — pagination errored, was rate-limited, returned an unexpected shape, or the configured `BOT_LOGIN` is missing. **Recovery returns 502 to the client and does NOT call `createIssue`**; the row stays in lease-expired state until the next retry (which will run lookup again). A bounded scan that hits an internal error must never be interpreted as proof that the issue doesn't exist.
- **Recovery horizon = 24 hours.** Reports whose lease expired more than 24h ago are out of scope for retry-driven recovery; the 8.3f reaper cron deletes their orphan rows. The reaper window is aligned with the recovery window so the contracts can't drift.
- **Required env var:** `GITHUB_BOT_LOGIN` — the GitHub username the PAT belongs to. Documented in `.env.local.example` and §14.3 (added to the env-var table). Without it, `findIssueByMarker` throws `LookupInconclusive` (the misconfiguration is loud, not silent).

- [x] **Step 1: Failing tests**
  - **AC-8.12 (recovered case)** — original GitHub `createIssue` succeeded with the body marker `<!-- fxav-report-id: <key> -->`; the response was dropped (timeout). DB row stays NULL. Retry after lease expiry calls `findIssueByMarker(key)` → list endpoint returns the recently-created issue → marker scan locates it → UPDATE row → 200. Exactly one issue ever exists.
  - **No labels created or required** — assert `octokit.rest.issues.create` is called with the static label set ONLY (`bug-report`, `reporter:admin`/`reporter:crew`, area labels). NEVER a `fxav-idem:*` per-key label.
  - **List endpoint authoritative within window** — synthesize an issue created 1 hour ago by the bot whose body carries the marker. `findIssueByMarker` returns it. Synthesize an issue created 25 hours ago (outside window) — `findIssueByMarker` returns null even though `since=<T-24h>` matched it on last-updated time. **There is no fallback search outside the window.**
  - **Created-time horizon strictly enforced:** synthesize an issue created 25 hours ago whose body was edited 1 hour ago (so it appears in `since` results because last-updated < 24h). The marker matches. `findIssueByMarker` MUST return null for this issue (created_at filter), and `expiredLeaseRetry` MUST return 410 `REPORT_HORIZON_EXPIRED` due to the row-age check.
  - **Row-age horizon enforced before any GitHub call:** synthesize a `reports` row with `created_at = now - interval '25 hours'`, lease expired, `github_issue_url IS NULL`. Call `expiredLeaseRetry(key)`. Assert: returns 410 `REPORT_HORIZON_EXPIRED`. Mock-verify NEITHER `findIssueByMarker` NOR `createIssue` was called. The row is left for the reaper.
  - **Fail-closed on pagination error:** mock `listForRepo` to throw a 500 on page 3 of 5. `findIssueByMarker` throws `LookupInconclusive`. `submit` catches and returns 502 to the client. **`createIssue` is NEVER called from this branch.** Assert exactly 0 `createIssue` invocations against the mock.
  - **Fail-closed on missing `BOT_LOGIN` config:** unset `GITHUB_BOT_LOGIN`. `findIssueByMarker` throws `LookupInconclusive` with `code: 'BOT_LOGIN_MISSING'` immediately (before any HTTP call). Retry returns 502. The misconfiguration writes an `admin_alerts` row coded **`GITHUB_BOT_LOGIN_MISSING`** (NOT the generic `REPORT_LOOKUP_INCONCLUSIVE`). Assert specifically: `SELECT code FROM admin_alerts WHERE resolved_at IS NULL ORDER BY raised_at DESC LIMIT 1` returns `'GITHUB_BOT_LOGIN_MISSING'`.
  - **Fail-closed on transient pagination error → generic alert:** `findIssueByMarker` throws with `code: 'PAGINATION_ERROR'`. The `admin_alerts` row that's written has `code = 'REPORT_LOOKUP_INCONCLUSIVE'` (the generic one). The two error classes route to different operator surfaces.
  - **Pagination exhaustion correctness:** populate the mock with 250 bot-created issues in the last 24h (3 pages of 100 + a 50-row last page); only the 240th has the matching marker. `findIssueByMarker` exhausts all pages and returns the match. Assert 3 `listForRepo` calls in the mock log.
  - **Orphan-cleanup-closed issue is NOT a recovery match:** seed the mock list endpoint with a closed issue whose body has the marker, `state='closed'`, `state_reason='not_planned'`, AND label `fxav-orphan-lost-lease` (modeling the orphan-cleanup branch's output). Synthesize a `reports` row for the same idempotency_key with `github_issue_url IS NULL` and lease expired. Run `expiredLeaseRetry`. Assert: `findIssueByMarker` returns null (the orphan is filtered out); the retry then claims the lease and creates a FRESH issue (the user's row binds to the new live issue, NOT the closed orphan). The closed orphan is left untouched.
  - **Mixed orphan + live in scan results:** seed the mock with TWO issues carrying the same marker — one closed-as-orphan (with label `fxav-orphan-lost-lease`) and one open (created later by a successful retry). `findIssueByMarker` skips the orphan and returns the open one.
  - **Two live matches → fail closed:** seed the mock with TWO open marker-bearing issues for the same idempotency_key (a should-be-impossible state caused by a hypothetical missed orphan-cleanup). `findIssueByMarker` MUST throw `LookupInconclusive` with `code: 'DUPLICATE_LIVE_MATCHES'`. The route returns 502 to the client. An `admin_alerts` row coded `REPORT_DUPLICATE_LIVE_MATCHES` is INSERTed carrying both issue URLs. **No automatic recovery** — Eric must investigate and resolve manually. The `reports` row stays unresolved until the admin alert is cleared and one of the issues is closed-as-orphan.
  - **Partial-cleanup orphan still skipped:** seed the mock with ONE issue carrying the marker, `state='closed'`, `state_reason='not_planned'`, but NO `fxav-orphan-lost-lease` label (modeling a hypothetical state where the close half of the cleanup landed but the label half didn't — even though the spec requires a single atomic call). `findIssueByMarker` MUST still skip it. Subsequent retry creates a fresh issue and binds the row to it. Without this fix, the user would be silently bound to the dead labeless orphan.
  - **Open-with-orphan-label fails closed:** seed the mock with an OPEN issue carrying the marker AND the orphan label (impossible state but defended). `findIssueByMarker` MUST throw `LookupInconclusive` with `code: 'OPEN_ISSUE_WITH_ORPHAN_LABEL'`. The route returns 502; an `admin_alerts` row coded `REPORT_OPEN_ORPHAN_LABEL` is INSERTed (UPSERT-with-ON-CONFLICT). `createIssue` is NEVER called from this branch — the prior draft silently skipped the open-orphan-labeled issue, which would let recovery fall through to a duplicate-creating create.
  - **Repeat orphan-cleanup is idempotent:** trigger two consecutive lost-lease events while the first `REPORT_ORPHANED_LOST_LEASE` admin_alerts row is still unresolved. The second cleanup's UPSERT MUST succeed without raising unique_violation; the existing alert row's `last_seen_at` advances and `occurrence_count` increments to 2 (per the §4.6 ON CONFLICT semantics). The orphan GH issue is still closed correctly. **Without the ON CONFLICT clause the second cleanup would 500 on unique_violation, masking the lost-lease state.**
  - **Per-show alert scoping:** trigger a `REPORT_OPEN_ORPHAN_LABEL` lookup-fault on Show A, then a separate `REPORT_OPEN_ORPHAN_LABEL` lookup-fault on Show B (different `reports.show_id`). Assert: TWO `admin_alerts` rows exist, one for each show — NOT a single global row whose `occurrence_count` increments to 2. The §4.6 partial unique index `(coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL` keys per-show on `show_id`, so two different show_ids produce two separate rows. **Without `show_id` in the INSERT, both incidents collapse into a single global row that hides the second show's failure from the dashboard router.**
  - **Context refresh on conflict:** trigger the same `REPORT_LOOKUP_INCONCLUSIVE` alert for the same show twice with DIFFERENT idempotency_keys / reasons. Assert: the unresolved alert row's `context` reflects the SECOND incident's payload (the latest `idempotency_key` and `reason`), not the first. Without `context = EXCLUDED.context` the row would point at stale forensic data while `occurrence_count` increments — operators would see the wrong report URL.
  - **Global vs per-show separation:** trigger a `GITHUB_BOT_LOGIN_MISSING` alert (truly global, `show_id IS NULL`). Then trigger a `REPORT_LOOKUP_INCONCLUSIVE` alert for Show A. Assert: TWO distinct rows. The global row has `show_id IS NULL`; the show-scoped row has `show_id = '<show-A-id>'`. Resolving one does not affect the other.
  - **expiredLeaseRetry routes LookupInconclusive through the inline catch:** call `expiredLeaseRetry(key)` with `findIssueByMarker` configured to throw `LookupInconclusive` (e.g., `code: 'PAGINATION_ERROR'`). Assert: route returns 502; an `admin_alerts` row coded `REPORT_LOOKUP_INCONCLUSIVE` is UPSERTed (with `show_id` populated from `reports.show_id`); `octokit.rest.issues.create` is NEVER called. Without this regression, an earlier draft's bare `await reconcileBeforeCreate(key)` would let pagination errors propagate as a 500 with no admin_alert.
  - **Recovered-path reaped-row guard:** synthesize the recovery happy path where `findIssueByMarker` returns an issue URL. Just before the conditional UPDATE, the reaper deletes the row (or another retry races and writes a URL). The UPDATE's `RETURNING id` matches 0 rows. Assert: route does NOT return 200 with the found URL — it re-SELECTs and dispatches: row missing → 410 `REPORT_HORIZON_EXPIRED`; row with URL → 200 with the row's URL; row still NULL → 409 `IDEMPOTENCY_IN_FLIGHT`. Without this guard, the route would return a 200 with a recovered URL while the underlying `reports` row no longer exists, breaking the spec's idempotency/traceability guarantees.
  - **Boundary-crossing LookupInconclusive:** synthesize the row at `created_at = now - interval '23 hours 59 minutes'`. Pass entry-time horizon check. `findIssueByMarker` is configured to throw `LookupInconclusive` (e.g., `code: 'PAGINATION_ERROR'`) AFTER a 90s delay. During that delay the wall clock crosses T+24h AND the reaper runs and deletes the row (lease was already expired). When the lookup throws, `expiredLeaseRetry`'s catch block re-checks the row's state: it's gone. Assert: route returns 410 `REPORT_HORIZON_EXPIRED`, NOT 502 `REPORT_LOOKUP_INCONCLUSIVE`. **No `admin_alerts` row is UPSERTed** (the row is gone — there's nothing for the operator to investigate). Without this fix, the prior draft would tell the client to retry while the underlying row is permanently gone.
  - **Past-horizon LookupInconclusive:** same setup but the row is NOT yet reaped — only its `created_at` has crossed T+24h. Lookup throws. Re-check finds the row alive but past horizon. Assert: 410 `REPORT_HORIZON_EXPIRED` returned; no admin_alerts UPSERT.
  - **Stale-tab retry after reaping:** synthesize a row that's been reaped (no row in `reports` for the idempotency_key). Client POSTs `/api/report` with that key (a stale browser tab attempting to resume). The route's `expiredLeaseRetry` entry-time row read returns null. Assert: route returns 410 `REPORT_HORIZON_EXPIRED` (NOT 404 `REPORT_NOT_FOUND` per the prior draft). The modal's terminal-success classification (Task 8.4: `body.ok === true && status >= 200 && status < 300`) does NOT trigger on 410, so the modal does NOT clear `sessionStorage` automatically — but the dedicated `REPORT_HORIZON_EXPIRED` user-facing message tells the user the attempt expired and offers a fresh-report flow that explicitly clears `sessionStorage` for the surface (per §12.4 message catalog entry behavior). The contract is now uniform: every reaped-row terminal path resolves to 410 `REPORT_HORIZON_EXPIRED`, regardless of whether the row was reaped at entry or during GH I/O.
  - **Original tail does NOT close the live recovered issue:** synthesize the interleaving where retry recovers FIRST. Original (lease A) creates issue X at GitHub but its tail UPDATE is stalled. Lease A expires. Retry runs `findIssueByMarker` → finds X via marker → recovered-path UPDATE writes `github_issue_url = X` (no lease_holder rotation on the recovered-path UPDATE). Then original's stalled tail finally lands. Tail UPDATE matches 0 rows because `github_issue_url` is now set. Original re-reads the row: stored URL equals MY URL (case A). **DO NOT close the issue** — return 200 with the same URL. Assert: GH still shows issue X as OPEN; `reports.github_issue_url = X`; NO `admin_alerts.REPORT_ORPHANED_LOST_LEASE` row was written; client gets 200. Without this fix, the original would close the live recovered issue and corrupt the row's pointer.
  - **Original tail closes a TRUE orphan:** synthesize the case where retry created a SEPARATE issue Y (lookup missed X due to indexing edge). Original's stalled tail lands; row has `github_issue_url = Y` (different from X). Tail re-read shows mismatch → run cleanup on X. Assert: GH shows X CLOSED with `state_reason='not_planned'` and `fxav-orphan-lost-lease` label; Y is OPEN; `reports.github_issue_url = Y`; admin_alerts has `REPORT_ORPHANED_LOST_LEASE`; client gets 200 with Y.
  - **Original tail with NULL row URL:** lease B retry holds the lease but hasn't created its issue yet. Original's tail lands; row's `github_issue_url IS NULL` and `lease_holder ≠ A`. Tail re-read shows NULL URL → run cleanup on X. Client gets 409 `IDEMPOTENCY_IN_FLIGHT`.
  - **DB-time horizon classification under clock skew:** synthesize an environment where the app server's clock is 5 minutes AHEAD of the database. Create a row at DB-time `now - interval '23 hours 58 minutes'` (within horizon by DB time). The app's `Date.now - Date.parse(created_at)` would compute ~24h 3m → past horizon → would have returned 410 in the prior draft. Assert: `expiredLeaseRetry` returns 502 `REPORT_LOOKUP_INCONCLUSIVE` (or proceeds to recovery), NOT 410. The `within_horizon` flag in the entry SELECT is computed via Postgres `now`, not `Date.now`. The lease-claim's `AND created_at >= now - interval '24 hours'` clause uses DB time. The reaper's `created_at < now - interval '24 hours'` uses DB time. Same shift in the opposite direction (app clock 5min behind DB) verifies the inverse case.
  - **Atomic post-lookup re-check + alert UPSERT:** synthesize the boundary race. Row at `created_at = now - interval '23 hours 59 minutes'`. `findIssueByMarker` configured to throw `LookupInconclusive` `code: 'PAGINATION_ERROR'`. **In a separate connection**, advance DB time past T+24h between when the catch block enters and when the state re-read runs (in the test, advance the row's `created_at` backward by 2 minutes via direct SQL during a deliberate sleep). The catch block's single state SELECT computes `within_horizon` at DB time and finds the row past horizon. Assert: route returns 410 `REPORT_HORIZON_EXPIRED`; NO `admin_alerts` row was written. **Without DB-time gating, the prior draft would have written an alert for a now-terminal row.**
  - **LookupInconclusive re-dispatch on resolved-by-other-worker:** synthesize the race where another worker writes `github_issue_url = X` between our entry-time read and our findIssueByMarker call, AND findIssueByMarker happens to throw `LookupInconclusive` (e.g., a transient pagination glitch) right after. Our catch's state re-read sees `github_issue_url` is set. Assert: route returns 200 with X (recovered status), NO admin_alerts row written, NO 502 emitted. The user gets a successful response even though our own lookup transiently failed.
  - **LookupInconclusive re-dispatch on live-lease-by-other-worker:** another worker reacquires the lease between our entry-time read and our findIssueByMarker call, AND our lookup throws `LookupInconclusive`. State re-read sees `processing_lease_until > now` (lease_live=true). Assert: route returns 409 `IDEMPOTENCY_IN_FLIGHT`, NO admin_alerts row, NO 502.
  - **LookupInconclusive genuinely-stuck path:** row is alive, in-horizon, lease expired, github_issue_url IS NULL, AND findIssueByMarker throws (e.g., PAGINATION_ERROR). State re-read confirms: alive, in-horizon, no URL, no live lease. Alert IS UPSERTed (with show_id from state.show_id ?? entryShowId), 502 returned. This is the only path that surfaces an admin_alert; all the other re-dispatch branches stay silent.
  - **LookupInconclusive state-gated UPSERT race:** simulate the race where another worker writes `github_issue_url = X` AFTER our state SELECT but BEFORE our state-gated alert UPSERT. The alert UPSERT's `INSERT .. SELECT .. WHERE github_issue_url IS NULL ...` evaluates the source row at write time and yields 0 rows. `alertResult.rowCount === 0` → re-dispatch path runs, finds `github_issue_url` set, returns 200 — NO false alert was written. Without the atomic gate, the prior draft's separate SELECT + UPSERT would have UPSERTed an alert AND returned 502 even though the report had succeeded.
  - **BOT_LOGIN_MISSING re-dispatch on resolved row:** another worker writes `github_issue_url = X`. Our findIssueByMarker throws `LookupInconclusive('BOT_LOGIN_MISSING')`. The state SELECT shows URL set. Assert: route returns 200 with X (recovered). **`GITHUB_BOT_LOGIN_MISSING` admin_alert IS WRITTEN — operator-config faults fire unconditionally on this discriminator regardless of per-request outcome**, because operators need the signal to fix the env var even when individual rows resolve. The per-row `REPORT_LOOKUP_INCONCLUSIVE` alert is NOT written (the row was resolved by another worker; nothing per-row to alert about). Net: ONE global alert, ZERO per-row alerts, client gets 200.
  - **Claim-failure case D' lease-just-expired:** synthesize the race where a competing worker held a lease at the moment of our claim UPDATE (so claim returns 0 rows) but the lease expires in the millisecond before our follow-up SELECT runs. The SELECT sees `lease_live = false`, no URL, in-horizon. **Recurse via `expiredLeaseRetry(key, depth + 1)`** rather than returning 409. The recursive call attempts the claim again and succeeds (no live lease blocks it). One issue is created. Without the , the prior draft would have returned 409 IDEMPOTENCY_IN_FLIGHT and left the row stuck.
  - **Lease-thrashing recursion bound:** synthesize an adversarial workload that thrashes leases — every time our claim attempts succeed, another worker steals the lease before our tail UPDATE; every time we fall into Case D', the workload re-thrashes. After 3 recursive depth attempts, `expiredLeaseRetry` returns 503 `REPORT_LEASE_THRASHING` and UPSERTs an admin_alert with that code. Client receives a service-level signal indicating sustained contention rather than spinning forever.
  - **Lease-thrashing depth-limit re-dispatches resolved row:** synthesize the case where `expiredLeaseRetry` recurses to `depth = 3`, but BEFORE the depth-limit branch's DB SELECT runs, another worker resolves the row (`github_issue_url = X`). The depth-limit branch's state read sees URL set. Assert: route returns 200 with X (recovered), NO `REPORT_LEASE_THRASHING` alert is written, NO 503. The user's report has actually succeeded; thrashing was a transient pattern that resolved.
  - **Lease-thrashing depth-limit re-dispatches reaped row:** same setup but the row is reaped between recursion. Depth-limit branch's state read returns null. Assert: route returns 410 `REPORT_HORIZON_EXPIRED`, NO `REPORT_LEASE_THRASHING` alert.
  - **Lease-thrashing depth-limit re-dispatches live-lease:** same setup but another worker reacquires a fresh lease between recursion. Depth-limit branch sees `lease_live = true`. Assert: route returns 409 `IDEMPOTENCY_IN_FLIGHT`, NO `REPORT_LEASE_THRASHING` alert.
  - **BOT_LOGIN_MISSING dual-alert:** synthesize the genuinely-stuck path with `LookupInconclusive('BOT_LOGIN_MISSING')`. State re-read shows row alive, in-horizon, no URL, expired lease. Assert TWO admin_alerts rows are written: (a) per-row `REPORT_LOOKUP_INCONCLUSIVE` keyed on the row's show_id; (b) global `GITHUB_BOT_LOGIN_MISSING` keyed on show_id=NULL. These serve operationally distinct purposes — operators see the global config issue clearly, AND per-show ops can see which reports were affected. Without 's separation, a single alert with `COALESCE(show_id, ...)` would have been written at the wrong scope.
  - **Lease-thrashing alert state-gated:** at depth=3, the dispatch SELECT shows the row stuck (no URL, lease expired, in-horizon). Between that SELECT and the alert UPSERT, another worker resolves the row by writing `github_issue_url = X`. The state-gated UPSERT's `INSERT .. SELECT FROM reports WHERE github_issue_url IS NULL ...` evaluates the source at write time and yields 0 rows. `thrashAlert.rowCount === 0` triggers re-dispatch; the re-state SELECT sees URL set and returns 200 with X. **NO `REPORT_LEASE_THRASHING` alert is written**; the user gets the actually-successful response. Without the atomic gate, the prior draft would have written a false thrashing alert AND returned 503 even though the report had succeeded.
  - **Lease-thrashing raced-back-to-stuck observability:** at depth=3, dispatch SELECT shows row stuck. Gated UPSERT runs and yields 0 rows (a competing worker briefly reacquired the lease in that window). `thrashAlert.rowCount === 0` triggers re-dispatch; the re-state SELECT shows the lease has now expired again — row is back to `github_issue_url IS NULL`, `lease_live = false`, `within_horizon = true`. Assert: route returns 503 `REPORT_LEASE_THRASHING` AND an `admin_alerts` row coded `REPORT_LEASE_THRASHING` with `context.raced_back = true` is written via the unconditional fallback UPSERT. **Without 's unconditional write, the user would see a 503 with no operator-visible signal in admin_alerts**, making the thrashing incident invisible to forensics.
  - **LookupInconclusive raced-back-to-stuck observability:** synthesize the LookupInconclusive path (e.g., `code: 'PAGINATION_ERROR'`). State dispatch shows row stuck. The state-gated per-row UPSERT yields 0 rows (briefly resolved by another worker that then immediately got reaped/reverted). The re-dispatch SELECT shows the row is back to stuck. The SECOND state-gated UPSERT succeeds and writes an alert with `context.raced_back = true`. Assert: route returns 502 AND an `admin_alerts` row coded `REPORT_LOOKUP_INCONCLUSIVE` with `context.raced_back = true` is written via the second-gate UPSERT. For the `BOT_LOGIN_MISSING` discriminator, BOTH the global `GITHUB_BOT_LOGIN_MISSING` (already written at top of catch) AND the per-row `REPORT_LOOKUP_INCONCLUSIVE` (written via the second-gate or fallback) are present.
  - **LookupInconclusive double-raced-back observability:** state flips twice — first gate misses, re-dispatch shows stuck, second gate ALSO misses, re-dispatch-2 still shows stuck. Now the unconditional fallback fires writing `context.raced_back_twice = true`. Assert: route returns 502; admin_alerts row carries the `raced_back_twice` discriminator so operators can distinguish high-frequency-flicker incidents from the more common single-flip case. Without 's second-gate attempt, the prior draft would have written an alert from a stale snapshot AFTER the first re-dispatch read, with no second confirmation that the row was still stuck at write time.
  - **LookupInconclusive double-raced-back terminal-after-second-dispatch:** same setup but in re-dispatch-2 after the second gate misses, another worker has now written `github_issue_url`. Assert: route returns 200 with that URL, NO alert is written by the unconditional fallback (the fallback only fires when re-dispatch-2 is still stuck). Confirms the second-gate path also fails-safe to a non-502 terminal when another worker resolves between gate attempts.
  - **findIssueByMarker only sees `fxav-app:report`-labeled issues:** seed the GH mock with two bot-authored issues both carrying the marker — one with `fxav-app:report` (a normal report from createIssue) and one without (synthesized as something a different automation might create using the same bot account, even with `bug-report` set). `findIssueByMarker`'s `listForRepo` call passes `labels: 'fxav-app:report'` so only the report-tagged issue is returned. Assert: lookup returns the report-tagged issue's URL; the other unrelated issue is invisible to recovery.
  - **findIssueByMarker filter survives malformed unrelated issue:** seed the GH mock with the report (well-formed, marker-bearing, `fxav-app:report`-labeled) and a separate unrelated bot-authored issue with `body: null` and NO `fxav-app:report` label (it might have `bug-report` from another automation). The reserved-label filter excludes the unrelated issue from the listForRepo response entirely. Assert: lookup returns the report's URL; NO `SHAPE_ERROR` thrown.
  - **Bug-report label is generic and not load-bearing for recovery:** seed the GH mock with our report carrying ONLY `bug-report` (NO `fxav-app:report`) — synthesized as a triager-edited or pre-amendment report. Recovery's `listForRepo({ labels: 'fxav-app:report' })` does NOT return this issue. Assert: lookup returns null; recovery proceeds to create a fresh issue (the prior one is treated as forensically present but not recoverable). Document operationally: removing the reserved label from a report is a recovery-breaking action. The runbook MUST tell operators not to remove it.
  - **Reserved label is added by createIssue alongside the static set:** assert `octokit.rest.issues.create` is called with a labels arg that contains BOTH `bug-report` (or whatever caller-specified labels) AND `fxav-app:report`. Without 's automatic reserved-label append in `createIssue`, recovery would have a 0% match rate on freshly-created reports.
  - **Claim-fail branch DB-time classification:** simulate app-clock-ahead-of-DB by 5 minutes. Synthesize a row at DB-time `created_at = now - interval '23h 58m'` (within DB horizon by 2 minutes), with another retry holding the lease (`processing_lease_until > now`). Our claim UPDATE matches 0 rows because of the lease-expired clause. Re-SELECT runs with the SQL-computed `within_horizon = (created_at >= now - interval '24 hours')` predicate. DB says: still within horizon. Assert: route returns 409 `IDEMPOTENCY_IN_FLIGHT` (case D contention), NOT 410 `REPORT_HORIZON_EXPIRED`. The prior `Date.now - Date.parse(row.created_at)` would have computed ~24h 3m and incorrectly returned 410.
  - **`findIssueByMarker` DB-derived cutoff:** simulate app-clock-ahead-of-DB by 5 minutes. Synthesize a recoverable GitHub issue at DB-time `created_at = now - interval '23h 58m'`. Caller passes `cutoffIso` derived from `SELECT (now - interval '24 hours')` (i.e., `T-24h` by DB clock). The list endpoint returns the issue (its `created_at` is within DB cutoff). The function's `Date.parse(issue.created_at) >= Date.parse(cutoffIso)` comparison uses the DB-derived cutoff — both sides come from the same DB clock, so the issue is correctly returned. Assert: recovery succeeds; row is rebound to the existing issue; NO duplicate is created. Without this fix, computing `cutoffMs` from `Date.now` would have made the cutoff 5 minutes too recent and missed this issue.
  - **Recovered-path post-lookup horizon check:** synthesize a row at `created_at = now - interval '23 hours 59 minutes'` (just within horizon). `findIssueByMarker` is configured to take ~2 minutes (a slow GitHub response). During the lookup the wall clock crosses T+24h. The lookup eventually returns a found URL. The recovered-path UPDATE has `AND created_at >= now - interval '24 hours'` in its WHERE — at execution time the row is now past horizon, so the UPDATE matches 0 rows. The 0-row branch re-SELECTs and returns 410 `REPORT_HORIZON_EXPIRED`. **Without the fix, the UPDATE would have matched on `idempotency_key` + `github_issue_url IS NULL` alone and bound the row to a recovered URL after the cutoff, making the 24h horizon nondeterministic.** Assert: client gets 410; row is left for the next reaper pass to clean up.
  - **`findIssueByMarker` SHAPE_ERROR on malformed `r.data`:** mock `octokit.rest.issues.listForRepo` to return `{ data: 'not-an-array' }` (or `{ data: null }`, or `{ data: { /* object instead of array */ } }`). `findIssueByMarker` MUST throw `LookupInconclusive` with `code: 'SHAPE_ERROR'`. Route returns 502 with `admin_alerts` coded `REPORT_LOOKUP_INCONCLUSIVE`. **`createIssue` is NEVER called.** Without this validation, a non-array response would be silently treated as zero matches, triggering a duplicate-creating createIssue path.
  - **`findIssueByMarker` SHAPE_ERROR on malformed candidate fields:** mock the response with a marker-bearing issue whose `html_url` is missing, OR `created_at` is unparseable, OR `state` is something other than `'open'`/`'closed'`, OR `labels` is not an array. `findIssueByMarker` MUST throw `SHAPE_ERROR` with a message naming the offending field. Route returns 502; `createIssue` is NEVER called.
  - **`findIssueByMarker` PAGINATION_BOUND coverage:** mock `listForRepo` to return 100 marker-less bot-created issues per page across 1001 pages (the 1001st page returns 100 more). `findIssueByMarker` exhausts up to 1000 pages, then throws `LookupInconclusive` with `code: 'PAGINATION_BOUND'`. Route returns 502; `createIssue` is NEVER called. Asserts the sanity bound is enforced and surfaces the right discriminator.
  - **Issues without the marker DO trigger SHAPE_ERROR if their body is unreadable AND in-window:** mock the response with one bot-authored issue whose `body` is `null` (or a non-string value) AND whose `created_at` is within the 24h window. `findIssueByMarker` MUST throw `LookupInconclusive` with `code: 'SHAPE_ERROR'` because we cannot determine whether the unreadable-body issue carries the marker. **The previous "cheap filter" was wrong** — under the bot-creator filter, every returned issue is ours, so a missing body is genuinely ambiguous. Route returns 502; `createIssue` is NEVER called.
  - **Out-of-window malformed body does NOT trigger SHAPE_ERROR:** mock the response with one bot-authored issue whose `body` is `null` AND whose `created_at` is 25 hours ago (last-updated within 24h, so it appears in the `since`-filtered list). `findIssueByMarker` MUST silently skip this issue (it's outside the recovery window) and continue scanning. Without the ordering fix, the malformed-body SHAPE_ERROR would fire BEFORE the created_at filter, poisoning every retry across the repo any time GitHub returned a malformed historical issue. Assert: `findIssueByMarker` returns null cleanly (no in-window match exists in this scenario); recovery proceeds to lease-claim + createIssue normally.
  - **Out-of-window malformed created_at IS still SHAPE_ERROR:** mock an issue with unparseable `created_at`. We can't apply the horizon filter without a parseable timestamp, so this MUST throw SHAPE_ERROR regardless of whether the rest of the row is in or out of window. (Step 1's `Date.parse` validation catches this; step 2's `createdMs < cutoffMs` check is what depends on it.) Verifies that the reordering still fails closed when the horizon filter itself can't be applied.
  - **Retry tail Case A:** simulate two retries R1 and R2 racing. R1 claims the lease, calls `createIssue`, which returns issue X. While R1 is between `createIssue` and its tail UPDATE, R2 starts a fresh retry. R2's lookup finds X via marker scan AND R2's recovered-path UPDATE writes `github_issue_url = X`. R1's tail UPDATE then runs: matches 0 rows (`lease_holder ≠ R1` and `github_issue_url IS NOT NULL`). R1's 0-row branch re-reads the row, sees `github_issue_url === X` (R1's own URL), returns 200 — **DOES NOT close X**. Assert: GH still shows X OPEN; `reports.github_issue_url = X`; NO `admin_alerts.REPORT_ORPHANED_LOST_LEASE` row written; both R1 and R2 return 200 with X. Without this fix, R1 would close the live recovered issue.
  - **Retry tail Case B (separate-issue orphan):** R1 creates X, lease stolen; R2 creates a SEPARATE issue Y (lookup returned null because GitHub list propagation lagged); R2's tail succeeds with Y. R1's stalled tail lands; row's URL is Y (≠ X). R1's 0-row branch re-reads, sees URL ≠ MY URL → cleanup branch → close X with `fxav-orphan-lost-lease`. Assert: X is CLOSED with the orphan label; Y is OPEN; `reports.github_issue_url = Y`; `admin_alerts.REPORT_ORPHANED_LOST_LEASE` UPSERTed; client R1 gets 200 with Y.
  - **Retry tail Case C (NULL URL):** R1 creates X, lease stolen; R2 holds the lease but hasn't created its issue yet. R1's tail lands, 0 rows. Re-read: URL is NULL. → cleanup on X. Client R1 gets 409 `IDEMPOTENCY_IN_FLIGHT`.
  - **Retry tail Case Reaped:** R1 creates X (we have its `htmlUrl` in `newIssue`), lease expires, lease_holder rotated by R2, then row crosses horizon AND R2's lease expires AND reaper deletes it. R1's tail's re-read returns null. **R1 still closes X** (the worker has `newIssue.htmlUrl` and `newIssue.issueNumber` in scope; closure does not depend on the row existing). UPSERT `admin_alerts.REPORT_ORPHANED_LOST_LEASE` with `show_id = entryShowId` and `context.row_reaped = true` as a discriminator. Return 410 `REPORT_HORIZON_EXPIRED`. Assert: GH has 1 closed-orphan X with `fxav-orphan-lost-lease`; `admin_alerts` has the per-show lost-lease entry with `row_reaped: true` in context; client gets 410. **No orphan ever leaks at GitHub** even when the DB row is gone.
  - **Cross-show reaped-row alerts stay per-show:** trigger Case Reaped on Show A's idempotency_key (entryShowId = `show-A`), then trigger Case Reaped on Show B's idempotency_key (entryShowId = `show-B`). Assert: TWO distinct unresolved `admin_alerts.REPORT_ORPHANED_LOST_LEASE` rows exist — one with `show_id = show-A`, one with `show_id = show-B`. **Without 's entry-time fallback, both incidents would have collapsed into a single global (NULL show_id) row under §4.6's partial unique index `(coalesce(show_id::text, ''), code)`**, hiding the second show's leak from the dashboard's per-show router.
  - **Original-worker Case Reaped uses request show_id:** simulate the original-worker tail (NOT a retry) hitting Case Reaped — i.e., a slow original creates issue X, its tail is delayed past 24h (highly pathological but defended), and the row crosses horizon AND lease expires AND reaper deletes it before the original tail re-reads. The original-worker invocation of `handleTailUpdateMiss` passes `fallbackShowId = request.body.show_id` (the show id from THIS request, in scope since the original worker just INSERTed the reservation row in this same request). Assert: orphan X is closed; `admin_alerts.REPORT_ORPHANED_LOST_LEASE` UPSERTed with `show_id = request.body.show_id` (NOT NULL); `context.row_reaped = true`; client gets 410. Now repeat for a different show (`show-C`); assert two distinct admin_alerts rows. **Without the fallbackShowId helper parameter, the original-worker path could only see `entryShowId` (an empty value, since it never ran the retry's entry SELECT) and would default to NULL, collapsing the alert globally.**
  - **Reaped-row with no entry-time show_id falls back to NULL:** synthesize the unlikely case where `expiredLeaseRetry`'s entry-time row read also returned null (the row was reaped BEFORE we could read it). The 410 `REPORT_HORIZON_EXPIRED` is returned at the entry check; the orphan-cleanup branch is never entered (we have no `newIssue` in this case — `createIssue` was never called). Confirms the `entryShowId` capture only matters for the post-createIssue tail-cleanup path.
  - **Normalized createIssue/findIssueByMarker shapes:** assert that the values bound to `reports.github_issue_url` are populated from the SAME field across both create and recovery paths. Specifically: after a brand-new createIssue, `reports.github_issue_url` equals `octokit.rest.issues.create response.data.html_url`. After a recovery via findIssueByMarker, `reports.github_issue_url` equals `octokit.rest.issues.listForRepo[i].html_url`. Case A's comparison `row.github_issue_url === newIssue.htmlUrl` is therefore well-defined regardless of which path wrote the URL. Without 's normalization, `newIssue.url` (undefined) would never match `row.github_issue_url` (the actual html_url), making Case A unreachable and treating every recovered live issue as an orphan to close.
  - **Recovered after lease expiry, before reaper:** synthesize the unknown-outcome path with the original GH call succeeding 23 hours ago; row still has `github_issue_url IS NULL`. Retry runs at T+23h, `findIssueByMarker` returns the issue (still within the 24h window), recovery succeeds. Then advance clock to T+25h and run the reaper — the row is now resolved (URL set), so the reaper does NOT delete it.
  - **Stale orphan past the horizon:** synthesize an unknown-outcome row at T-30h with `github_issue_url IS NULL` and lease expired. The reaper at T runs and DELETEs the row, logging `STALE_ORPHAN_REPORT`. The associated GitHub issue (if it exists) is left untouched; admin sees the audit log entry.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement.**
  - Modify `lib/github/issues.ts`:

    ```ts
    // createIssue returns a normalized shape so create-path and
    // recovery-path agree on field names everywhere (`htmlUrl`, `labels`,
    // `issueNumber`). The Octokit response uses `html_url` not `url`, so
    // downstream code that did `newIssue.url` would have read `undefined`.
    // findIssueByMarker also returns this shape. Both create and recovery write
    // `htmlUrl` into `reports.github_issue_url`, so Case A comparisons
    // (`row.github_issue_url === createdIssue.htmlUrl`) work correctly.
    export type CreatedIssue = {
      htmlUrl: string; // canonical URL stored in reports.github_issue_url
      labels: string[]; // existing labels (used by orphan-cleanup to preserve)
      issueNumber: number; // GH issue number (used by orphan-cleanup's issues.update)
    };

    // No per-key label. createIssue uses the static label set PLUS the
    // reserved provenance label `fxav-app:report` which
    // findIssueByMarker uses to bound the recovery scan. The reserved label
    // is operationally protected — operators must not add it to unrelated
    // issues or remove it from reports.
    export const FXAV_APP_REPORT_LABEL = 'fxav-app:report';
    export async function createIssue(opts: { title: string; body: string; labels: string[] }): Promise<CreatedIssue> {
      // body MUST already contain `<!-- fxav-report-id: <key> -->`; the caller in
      // lib/reports/submit.ts ensures this. We do NOT add a per-key label here.
      const labelsWithReserved = [...opts.labels, FXAV_APP_REPORT_LABEL];
      const r = await octokit.rest.issues.create({
        owner, repo, title: opts.title, body: opts.body, labels: labelsWithReserved,
      });
      // Defensive shape-check: if GitHub returns an unexpected payload, fail
      // loudly rather than silently produce a CreatedIssue with undefined fields.
      if (typeof r.data?.html_url !== 'string' || typeof r.data?.number !== 'number') {
        throw new Error(`createIssue: unexpected response shape (html_url=${typeof r.data?.html_url}, number=${typeof r.data?.number})`);
      }
      const labels = (r.data.labels ?? []).map((l: any) => typeof l === 'string' ? l : l?.name).filter(Boolean);
      return { htmlUrl: r.data.html_url, labels, issueNumber: r.data.number };
    }

    export type LookupInconclusiveCode =
      | 'BOT_LOGIN_MISSING' // GITHUB_BOT_LOGIN env var unset (operator-actionable, separate alert)
      | 'PAGINATION_ERROR' // listForRepo threw mid-pagination (transient, retry)
      | 'PAGINATION_BOUND' // exceeded the 1000-page sanity bound (pathological, investigate)
      | 'SHAPE_ERROR' // response body shape didn't match (likely API change)
      | 'DUPLICATE_LIVE_MATCHES' // : ≥2 non-orphan issues bear the same marker
      | 'OPEN_ISSUE_WITH_ORPHAN_LABEL'; // an open issue carries the orphan label (impossible state)
    export class LookupInconclusive extends Error {
      constructor(public code: LookupInconclusiveCode, public reason: string, public cause?: unknown) {
        super(`findIssueByMarker inconclusive (${code}): ${reason}`);
      }
    }

    // Immediately-consistent lookup via the list endpoint. Pagination runs to
    // natural exhaustion (page returns < per_page) but is bounded by a 1000-page
    // sanity cap — exceeding it throws PAGINATION_BOUND and fails closed
    // if pagination errors, returns unexpected shape, or BOT_LOGIN is misconfigured.
    // GitHub's `since` parameter filters by issue last-updated time, NOT
    // creation time. To enforce the 24h create-time horizon, we ALSO filter every
    // returned issue by `issue.created_at >= cutoff` client-side. An issue whose
    // body matches the marker but was created >24h ago does NOT qualify for retry-path
    // recovery (it's the reaper's responsibility).
    // orphan-cleanup-closed issues (the ones the lease-stolen branch
    // closed with state_reason='not_planned' and label 'fxav-orphan-lost-lease')
    // ALSO carry the marker, but they MUST NOT be returned as recovery matches —
    // doing so would rebind a `reports` row to a permanently-closed orphan and hide
    // the real recovery state. We exclude them client-side.
    const RECOVERY_WINDOW_HOURS = 24;
    const ORPHAN_LABEL = 'fxav-orphan-lost-lease';
    // collect ALL non-orphan marker matches in the window and
    // fail closed if more than one exists. Two live issues with the same
    // idempotency_key is a data-integrity fault, not a recoverable state.
    // #3: the recovery window is derived from Postgres `now`,
    // NOT from the app's `Date.now`. The caller passes a DB-computed cutoff
    // ISO string so app/DB clock skew cannot exclude an in-window GitHub issue
    // from the lookup (which would let recovery fall through to createIssue
    // and open a duplicate). The caller is `expiredLeaseRetry`, which performs
    // a SQL `SELECT (now - interval '24 hours')::timestamptz AT TIME ZONE 'UTC'`
    // (or equivalent) before calling this function.
    // returns the same normalized `CreatedIssue`-shaped value as
    // createIssue so Case A comparisons (`row.github_issue_url === found.htmlUrl`)
    // work uniformly. (issueNumber is omitted from the recovery return because
    // the recovered URL is what the row binds to; the issue itself is not
    // mutated by recovery.)
    export async function findIssueByMarker: Promise<{ htmlUrl: string } | null> {
      const botLogin = process.env.GITHUB_BOT_LOGIN;
      if (!botLogin) {
        // Operator-actionable: surface via the dedicated GITHUB_BOT_LOGIN_MISSING alert
        // (mapped by the caller using err.code).
        throw new LookupInconclusive('BOT_LOGIN_MISSING', 'GITHUB_BOT_LOGIN env var is unset');
      }
      // #3: cutoffIso is the DB-derived 24h cutoff passed in
      // by the caller. We DO NOT compute it from Date.now here.
      const cutoffMs = Date.parse(cutoffIso);
      if (Number.isNaN(cutoffMs)) {
        throw new LookupInconclusive('SHAPE_ERROR', `invalid cutoffIso: ${cutoffIso}`);
      }
      const marker = `<!-- fxav-report-id: ${idempotencyKey} -->`;
      const liveMatches: Array<{ htmlUrl: string; created_at: string }> = []; // collect, don't return-on-first; : normalized shape
      let page = 1;
      try {
        while (true) {
          const r = await octokit.rest.issues.listForRepo({
            // `since` is last-updated; it's a NECESSARY but not sufficient bound. We
            // still post-filter on issue.created_at below.
            // /40 fix: filter by a RESERVED, APP-SPECIFIC label
            // `fxav-app:report` (NOT the generic `bug-report`). Round 40
            // observed that `bug-report` is a generic mutable repo label —
            // any other automation could apply it; a triager could remove it
            // from a real report. Either case breaks recovery. The
            // `fxav-app:` prefix is operationally reserved to this app
            // (documented in §13.2 / spec): operators MUST NOT add or remove
            // it manually; doing so will cause recovery to miss or mis-bind.
            // createIssue (Task 8.3d) always attaches BOTH `bug-report` (for
            // human triage) AND `fxav-app:report` (for recovery provenance).
            // The recovery scan filters on the reserved label only.
            owner, repo, creator: botLogin, labels: 'fxav-app:report',
            since: cutoffIso, state: 'all', per_page: 100, page,
          });
          // #2: validate response payload shape before scanning.
          // GitHub schema drift / proxy-rewritten responses / undocumented edge
          // cases could ship a non-array `r.data`. Failing closed here prevents
          // a malformed response from being silently treated as "no issues found".
          if (!Array.isArray(r.data)) {
            throw new LookupInconclusive('SHAPE_ERROR', `listForRepo response.data is not an array: typeof=${typeof r.data}`);
          }
          for (const issue of r.data) {
            // #3: ORDER MATTERS. The `since` parameter on
            // listForRepo filters by last-updated time, so a 25-hour-old
            // issue edited within the last 24h still appears in the page.
            // If we throw SHAPE_ERROR on every malformed bot-authored issue
            // BEFORE checking created_at, one out-of-window malformed issue
            // poisons every retry across the repo.
            //
            // Order:
            // 1. Validate `created_at` parseability (cheap; required for
            // the horizon filter).
            // 2. Skip out-of-window issues silently (irrelevant to recovery).
            // 3. THEN validate body (only for in-window candidates — the
            // ones we actually need to determine marker presence on).
            // 4. Marker check.
            // 5. Validate the remaining candidate fields (html_url, state,
            // labels) only for marker-bearing issues, where we'll act
            // on them in the orphan-skip / live-match logic below.
            //
            // /28 contract preserved: any unreadable in-window
            // bot-authored issue's body is SHAPE_ERROR (we genuinely can't
            // tell whether it's our matching issue).
            if (typeof issue.created_at !== 'string') {
              throw new LookupInconclusive(
                'SHAPE_ERROR',
                `bot-authored issue ${issue.html_url ?? '(no html_url)'} missing created_at — cannot apply horizon filter`
              );
            }
            const createdMs = Date.parse(issue.created_at);
            if (Number.isNaN(createdMs)) {
              throw new LookupInconclusive(
                'SHAPE_ERROR',
                `bot-authored issue ${issue.html_url ?? '(no html_url)'} has unparseable created_at: ${issue.created_at}`
              );
            }
            if (createdMs < cutoffMs) continue; // out-of-window — silently skip
            // Step 3: in-window — validate body.
            if (issue.body == null || typeof issue.body !== 'string') {
              throw new LookupInconclusive(
                'SHAPE_ERROR',
                `in-window bot-authored issue ${issue.html_url ?? '(no html_url)'} has missing or non-string body — cannot determine marker presence`
              );
            }
            // Step 4: marker check.
            if (!issue.body.includes(marker)) continue;
            // Step 5: marker-bearing candidate — validate remaining fields.
            if (typeof issue.html_url !== 'string' || issue.html_url.length === 0) {
              throw new LookupInconclusive('SHAPE_ERROR', `marker-bearing issue missing html_url`);
            }
            if (issue.state !== 'open' && issue.state !== 'closed') {
              throw new LookupInconclusive('SHAPE_ERROR', `marker-bearing issue ${issue.html_url} has unexpected state: ${issue.state}`);
            }
            if (!Array.isArray(issue.labels)) {
              throw new LookupInconclusive('SHAPE_ERROR', `marker-bearing issue ${issue.html_url} labels is not an array`);
            }
            // /17 fix: skip orphan-cleanup-closed issues. They carry the marker
            // because they were minted by an earlier (lease-stolen) retry that
            // subsequently closed them. strengthening: orphan cleanup is
            // implemented as a SINGLE octokit.issues.update call that sets state +
            // state_reason + labels atomically (see Task 8.3b/8.3e). Even so, this
            // filter is defensive — it treats any marker-bearing `closed` issue with
            // state_reason='not_planned' as an orphan REGARDLESS of label presence.
            // That way a hypothetical partial-cleanup state (close succeeded, label
            // write skipped or rolled back) cannot rebind the row to a dead issue.
            // Label match remains a positive signal but is not required.
            const labels = (issue.labels ?? []).map((l: any) => typeof l === 'string' ? l : l?.name);
            const isClosedOrphan = issue.state === 'closed' &&
                                   (issue as any).state_reason === 'not_planned';
            if (isClosedOrphan) continue;
            // a marker-bearing OPEN issue with the orphan label is
            // an impossible state (orphan cleanup always closes; reopening it would
            // be a manual error). Earlier draft silently skipped, which is NOT
            // fail-closed: an operator who reopens an orphan, or a future API quirk
            // that leaves the label on a live issue, would let recovery fall through
            // to createIssue and create a duplicate. Treat as integrity fault.
            if (labels.includes(ORPHAN_LABEL)) {
              throw new LookupInconclusive(
                'OPEN_ISSUE_WITH_ORPHAN_LABEL',
                `issue ${issue.html_url} is open AND carries ${ORPHAN_LABEL} — should be impossible. Manual review required.`
              );
            }
            // collect, don't return-on-first. : normalized shape.
            liveMatches.push({ htmlUrl: issue.html_url, created_at: issue.created_at });
          }
          if (r.data.length < 100) break; // exhausted cleanly
          page++;
          // Defensive: 1000 pages = 100k issues in 24h; that's pathological and indicates
          // a misconfiguration. Throw to fail closed rather than spin forever.
          if (page > 1000) throw new LookupInconclusive('PAGINATION_BOUND', 'pagination exceeded sanity bound');
        }
      } catch (err) {
        if (err instanceof LookupInconclusive) throw err;
        throw new LookupInconclusive('PAGINATION_ERROR', 'listForRepo error during pagination', err);
      }
      // enforce uniqueness of live matches.
      if (liveMatches.length === 0) return null;
      if (liveMatches.length === 1) return { htmlUrl: liveMatches[0]!.htmlUrl };
      // Multiple live marker-bearing issues for one idempotency_key — data-
      // integrity fault. Recovery MUST NOT pick a winner; surface to admin
      // and fail closed. The caller treats this like any other LookupInconclusive
      // (502 to client, admin_alerts row written) — but with a distinct code so
      // Eric sees the right diagnosis.
      throw new LookupInconclusive(
        'DUPLICATE_LIVE_MATCHES',
        `${liveMatches.length} live marker-bearing issues found for idempotency_key=${idempotencyKey}: ${liveMatches.map(m => m.htmlUrl).join(', ')}`
      );
    }
    ```

  - Modify the recovery path in `lib/reports/submit.ts`:
    ```ts
    async function reconcileBeforeCreate(
      key: string,
      cutoffIso: string,
    ): Promise<{ htmlUrl: string } | null> {
      // Single authoritative lookup. cutoffIso is DB-derived —
      // computed by the caller via `SELECT (now - interval '24 hours')` so
      // app/DB clock skew cannot misclassify recoverable issues.
      // May throw LookupInconclusive — caller handles by returning 502 and
      // leaving the row unresolved.
      return await findIssueByMarker(key, cutoffIso);
    }
    ```
    The `expiredLeaseRetry` helper (Task 8.3e) wraps the call:
    ```ts
    let found: { htmlUrl: string } | null;
    try {
      found = await reconcileBeforeCreate(key, dbCutoffIso); // dbCutoffIso captured from the entry-time SQL query
    } catch (err) {
      if (err instanceof LookupInconclusive) {
        // /18/19 fix: route per-code to dedicated alert codes when the
        // condition is operator-actionable; otherwise generic.
        const alertCode =
          err.code === "BOT_LOGIN_MISSING"
            ? "GITHUB_BOT_LOGIN_MISSING"
            : err.code === "DUPLICATE_LIVE_MATCHES"
              ? "REPORT_DUPLICATE_LIVE_MATCHES"
              : err.code === "OPEN_ISSUE_WITH_ORPHAN_LABEL"
                ? "REPORT_OPEN_ORPHAN_LABEL"
                : "REPORT_LOOKUP_INCONCLUSIVE";
        // #1: scope per-report alerts to the affected show via
        // reports.show_id, so concurrent incidents on different shows raise
        // distinct rows instead of collapsing under §4.6's partial unique index
        // `(coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL`.
        // BOT_LOGIN_MISSING is the only truly global alert here — show_id stays NULL.
        const isGlobal = err.code === "BOT_LOGIN_MISSING";
        const reportRow = isGlobal
          ? null
          : await db.queryMaybeOne(`SELECT show_id FROM reports WHERE idempotency_key = $1`, [key]);
        const showIdForAlert = isGlobal ? null : (reportRow?.show_id ?? null);
        // #2: refresh context on conflict per §4.6's standard
        // unresolved-alert UPSERT shape — without `context = EXCLUDED.context`
        // the alert keeps the stale first-occurrence payload while occurrence_count
        // increments, hiding the current fault from operators.
        await db.query(
          `INSERT INTO admin_alerts (show_id, code, context) VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
            DO UPDATE SET
              last_seen_at = now,
              occurrence_count = admin_alerts.occurrence_count + 1,
              context = EXCLUDED.context`,
          [
            showIdForAlert,
            alertCode,
            JSON.stringify({ idempotency_key: key, reason: err.reason, code: err.code }),
          ],
        );
        // Both paths return the same client-facing 502 code so end users see a
        // consistent retry message; the differentiation matters for the operator
        // alert surface, not the requester.
        return badGateway502({ code: "REPORT_LOOKUP_INCONCLUSIVE" });
      }
      throw err;
    }
    if (found) {
      /* .. */
    }
    // Lease re-acquisition path follows; see Task 8.3e.
    ```
  - Add `GITHUB_BOT_LOGIN` to `.env.local.example` AND to the env-var table in §14.3 (Task 0.4 created the example file; this task extends it).
  - Add to the message catalog in `lib/messages/catalog.ts` (Task 9.4) and §12.4 reference:
    - `REPORT_LOOKUP_INCONCLUSIVE` — Doug-facing: "We couldn't confirm whether your previous report went through. Please try again in a few minutes." Crew-facing: same simplified copy.
    - `REPORT_HORIZON_EXPIRED` — Doug-facing: "This report attempt has expired (older than 24 hours). If the issue still applies, please file a fresh report." Crew-facing: "This report attempt has expired. Please open a fresh report if the issue still applies." Both surfaces clear the modal's `sessionStorage` so the next click starts clean.
    - `GITHUB_BOT_LOGIN_MISSING` — admin-only `admin_alerts` banner: "GITHUB_BOT_LOGIN env var is unset; bug-report retries cannot recover from unknown outcomes. Configure it and resolve this alert."
    - `REPORT_DUPLICATE_LIVE_MATCHES` — admin-only `admin_alerts` banner: "Multiple live GitHub issues found for one report submission. Recovery has been paused — please review and close any duplicates so the affected report can resolve." Context payload includes both issue URLs and the idempotency_key.
    - `REPORT_OPEN_ORPHAN_LABEL` — admin-only `admin_alerts` banner: "An open GitHub issue carries the orphan-cleanup label. This shouldn't happen — please review and either reclose the issue or remove the label." Context includes the issue URL.
    - `REPORT_LEASE_THRASHING` — admin-only `admin_alerts` banner: "A bug-report retry is repeatedly observing lease churn (>3 immediate-reclaim cycles in one request). Likely indicates a deeper concurrency issue or an adversarial pattern; please investigate." Surfaced when `expiredLeaseRetry` recurses past depth 3. Client receives 503 with this code.

- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(reports): single-path fail-closed recovery + bot-login env`.

### Task 8.3e: Concurrent-retry race (AC-8.13) + late-success guard

**Files:** Test: `tests/reports/concurrentRetry.test.ts`, `tests/reports/lateSuccess.test.ts`.

**This task uses the same `reconcileBeforeCreate` flow defined in Task 8.3d** — single-path `findIssueByMarker` against the immediately-consistent list endpoint, fail-closed on inconclusive results. The lease-claim UPDATE is the only serialized step. **`LookupInconclusive` errors NEVER authorize `createIssue`** — they return 502 to the client and leave the row unresolved for the next retry. closed the recovery design here: code search is no longer used; the 24h horizon is the single recovery contract.

- [x] **Step 1: Failing tests**
  - **AC-8.13: lease contention** — two concurrent retries of the same idempotency_key after lease expiry. The first acquires the lease via the conditional UPDATE; the second's UPDATE matches 0 rows and the route returns 409 `IDEMPOTENCY_IN_FLIGHT`. Exactly one issue ever exists.
  - **Late-success race:** simulate the following interleaving:
    1. Original submission charged quota, set lease, called GitHub. The HTTP response was lost (we didn't UPDATE the row with `github_issue_url`); GitHub created the issue.
    2. Time passes; the lease expires.
    3. Retry-A invokes the recovery path: calls `reconcileBeforeCreate(key)` → `findIssueByMarker` (per Task 8.3d). In this synthesized scenario, the lookup returns null (the test mock simulates the issue not being findable yet — e.g., it's outside the 24h window because the original was minted just over the boundary). Retry-A is about to attempt lease reacquisition.
    4. **Just before** Retry-A's UPDATE, the original submission's tail finally reaches the DB and runs `UPDATE reports SET github_issue_url = $url WHERE id = $row` (its tail finally landed despite the dropped client response). The row now has `github_issue_url` populated.
    5. Retry-A's UPDATE runs. **It MUST NOT match this row** because the URL is now set; otherwise Retry-A would proceed to call `createIssue` and open a duplicate.
       Assert: exactly one issue exists. Retry-A returns 200 with the URL the original tail wrote (not 201 with a fresh issue).
  - **Recovery via list-endpoint marker scan:** simulate the original `createIssue` succeeded with the body marker `<!-- fxav-report-id: <key> -->` (no per-key label) but the response was dropped and the original tail UPDATE never ran. Retry calls `reconcileBeforeCreate(key, dbCutoffIso)` → `findIssueByMarker` lists recent bot-created issues, scans bodies, finds the marker → returns `{ htmlUrl }` → conditional URL UPDATE writes `found.htmlUrl` to `reports.github_issue_url` → 200 with the URL. **`createIssue` is NEVER called from the retry.** Exactly one issue exists.
  - **Single-lookup contract:** the retry path's call site for the recovery lookup MUST be `reconcileBeforeCreate(key)`, which delegates exclusively to `findIssueByMarker`. A static-analysis test asserts `lib/reports/submit.ts` does NOT reference any code-search function (e.g., `octokit.rest.search.issuesAndPullRequests`) anywhere; the entire recovery path goes through the single list-endpoint helper.
  - **Lookup-inconclusive returns 502, never calls createIssue:** mock `findIssueByMarker` to throw `LookupInconclusive`. Retry returns 502; `octokit.rest.issues.create` is NEVER invoked; an `admin_alerts` row coded `REPORT_LOOKUP_INCONCLUSIVE` is INSERTed (or its occurrence_count incremented).
  - **Slow-original lease-stolen race:** simulate the worst-case interleaving:
    1. Original reserves the row at T0 with `lease_holder = A`. Calls `createIssue`. GH succeeds at T+5s but the response is hung in the original's TCP socket.
    2. T0+90s: lease expires.
    3. Retry's reconcileBeforeCreate runs. `findIssueByMarker` returns null in the test mock (synthetic scenario where the list endpoint response misses the issue, e.g., it was minted just outside the 24h horizon). Recovery proceeds toward lease reacquisition.
    4. Retry claims the lease (`lease_holder = B`).
    5. Retry calls `createIssue`. GH creates a SECOND issue. Retry's tail UPDATE checks `AND lease_holder = B` → 1 row → row's URL is set to retry's URL. Retry returns 201.
    6. Original's TCP socket finally un-hangs at T0+150s. Original tries its tail UPDATE with `WHERE lease_holder = A`. Matches 0 rows.
    7. Original detects 0 rows → enters the orphan-cleanup branch: closes the FIRST issue at GitHub via `octokit.issues.update({state: 'closed', state_reason: 'not_planned'})`, adds `fxav-orphan-lost-lease` label, INSERTs `admin_alerts` row coded `REPORT_ORPHANED_LOST_LEASE`. Original returns 200 with the row's now-populated URL (the retry's URL).
       Assert: GitHub has exactly 2 issues but ONE is closed-as-orphan with the cleanup label; the row's `github_issue_url` points to the retry's open issue; the admin_alerts entry surfaces the orphan to Eric for manual review. **The user-visible state is exactly one open issue per submission.**
  - **Symmetric retry-orphan test:** spawn two consecutive retries (R1 and R2) for the same expired-lease row. R1 claims with `lease_holder = X`, both lookups miss, R1 calls createIssue (succeeds at GH but hangs). R1's lease expires. R2 reclaims with `lease_holder = Y`, lookups miss, R2 creates a fresh issue, R2's tail succeeds. R1 finally un-hangs, tries to write its URL with `WHERE lease_holder = X` → 0 rows → orphan cleanup. Same invariant: one open issue, one closed-orphan, one admin_alerts row.
  - **Near-24h horizon race:** synthesize a `reports` row with `created_at = now - interval '23 hours 59 minutes'` (right before the boundary), `github_issue_url IS NULL`, lease expired. Start `expiredLeaseRetry(key)` — passes the entry-time horizon check. Inject a delay before the lease-claim UPDATE such that wall-clock advances past T+24h before the UPDATE runs. The lease-claim's `AND created_at >= now - interval '24 hours'` matches 0 rows → retry returns 410 `REPORT_HORIZON_EXPIRED` instead of calling createIssue. Assert: `octokit.rest.issues.create` was NEVER called.
  - **Reaper-vs-in-flight retry race:** synthesize a row at `created_at = now - interval '24 hours 5 minutes'`, lease expired. Start `expiredLeaseRetry` and let it pass entry check (since old plan: entry check uses ageRow.created_at which is past horizon — wait, this case wouldn't pass the entry check). Re-frame: synthesize at `created_at = now - interval '23 hours 30 minutes'`, lease expired. Retry passes entry check, claims lease (succeeds — lease-claim's `created_at >= now - 24h` matches), lease set to T+90s (which would push past 24h), createIssue runs (15s). Meanwhile reaper fires at T+5s — its WHERE clause includes `AND processing_lease_until < now` → 0 rows match (live lease). Reaper does NOT delete the row. Retry's tail UPDATE succeeds. Assert: row preserved; reaper's RETURNING list does NOT contain this idempotency_key; one issue created.
  - **Reaped-row tail-UPDATE handling:** synthesize the worst case where the row IS reaped while a retry's createIssue is in flight (e.g., the lease unexpectedly expired due to a clock skew or the test forces it). Retry's tail UPDATE matches 0 rows. Re-SELECT returns null. Retry returns 410 `REPORT_HORIZON_EXPIRED`. The orphan GH issue is still closed via the cleanup branch. Assert: GH has 1 closed issue with `fxav-orphan-lost-lease` label; admin_alerts has the `REPORT_ORPHANED_LOST_LEASE` entry; client got 410.
  - **Reaped-before-reselect classification:** synthesize a row at `created_at = now - interval '23 hours 59 minutes'` (passes entry check). Inject a delay before the lease-claim UPDATE that crosses both T+24h AND a reaper run that deletes the row. The lease-claim UPDATE matches 0 rows; the subsequent re-SELECT returns null. Assert: route returns 410 `REPORT_HORIZON_EXPIRED`, NOT 409 `IDEMPOTENCY_IN_FLIGHT`. `createIssue` was NEVER called.
  - **Past-horizon-after-claim-fail classification:** synthesize a row at `created_at = now - interval '23 hours 59 minutes'` whose lease IS held by another retry (live lease until T+30s, where T is our claim attempt). Wall-clock crosses T+24h between our entry check and our claim UPDATE. Our claim's `created_at >= now - 24h` clause now rejects us. Re-SELECT finds the row (not reaped — the live lease blocks the reaper) but `created_at` is past horizon. Assert: route returns 410 `REPORT_HORIZON_EXPIRED`, NOT 409. `createIssue` was NEVER called.
  - **Genuine contention classification:** synthesize a row at `created_at = now - interval '1 hour'` whose lease IS live (held by another retry). Our claim fails (lease-expired clause). Re-SELECT returns the row with NULL url and live lease. `created_at` is well within horizon. Assert: route returns 409 `IDEMPOTENCY_IN_FLIGHT`.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement** the lock-free retry flow per Task 8.3c's transaction boundaries, using `reconcileBeforeCreate` as the single recovery entry point. \*\*\*\* before any GitHub call, the retry consults the row's `created_at` and rejects if it falls outside the 24h horizon. Pseudocode (`db.query` is a generic Postgres client method like `pg.Pool.query`; substitute the actual library call at implementation time):

  ```ts
  async function expiredLeaseRetry(key: string, depth: number = 0): Promise<Response> {
    // bounded recursion for Case D' (lease expired between our
    // failed claim UPDATE and our re-read). : depth-limit alert
    // ONLY fires when the row is still in the stuck state — re-classify state
    // first so a row that was resolved/reaped/reclaimed by another worker in
    // the meantime returns the correct terminal/contention status instead of
    // a noisy false 503.
    if (depth >= 3) {
      // re-classify state before declaring thrashing.
      // state-gate the alert UPSERT atomically so a resolve/reclaim
      // between the dispatch SELECT and the alert INSERT cannot produce a false
      // 503. Same pattern as the LookupInconclusive state gate.
      const thrashRow = await db.queryMaybeOne(
        `SELECT show_id, github_issue_url,
                (processing_lease_until > now) AS lease_live,
                (created_at >= now - interval '24 hours') AS within_horizon
           FROM reports WHERE idempotency_key = $1`,
        [key],
      );
      if (!thrashRow || !thrashRow.within_horizon)
        return gone410({ code: "REPORT_HORIZON_EXPIRED" });
      if (thrashRow.github_issue_url) {
        return ok200({
          status: "recovered",
          github_issue_url: includeUrlForViewer(thrashRow.github_issue_url),
        });
      }
      if (thrashRow.lease_live) return conflict409({ code: "IDEMPOTENCY_IN_FLIGHT" });

      // State-gated UPSERT: write the alert only if the row is STILL in the
      // genuinely-stuck state at write time. If the row resolved/reaped/got a
      // fresh lease between the dispatch SELECT and this statement, the SELECT
      // yields 0 rows and we re-dispatch instead of emitting a false 503.
      const thrashAlert = await db.query(
        `INSERT INTO admin_alerts (show_id, code, context)
         SELECT r.show_id, 'REPORT_LEASE_THRASHING', $2::jsonb
           FROM reports r
          WHERE r.idempotency_key = $1
            AND r.github_issue_url IS NULL
            AND (r.processing_lease_until IS NULL OR r.processing_lease_until <= now)
            AND r.created_at >= now - interval '24 hours'
         ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
         DO UPDATE SET last_seen_at = now, occurrence_count = admin_alerts.occurrence_count + 1, context = EXCLUDED.context
         RETURNING id`,
        [key, JSON.stringify({ idempotency_key: key, depth })],
      );
      if (thrashAlert.rowCount === 0) {
        // State flipped between dispatch and UPSERT. Re-dispatch fresh.
        const restate = await db.queryMaybeOne(
          `SELECT show_id, github_issue_url,
                  (processing_lease_until > now) AS lease_live,
                  (created_at >= now - interval '24 hours') AS within_horizon
             FROM reports WHERE idempotency_key = $1`,
          [key],
        );
        if (!restate || !restate.within_horizon) return gone410({ code: "REPORT_HORIZON_EXPIRED" });
        if (restate.github_issue_url)
          return ok200({
            status: "recovered",
            github_issue_url: includeUrlForViewer(restate.github_issue_url),
          });
        if (restate.lease_live) return conflict409({ code: "IDEMPOTENCY_IN_FLIGHT" });
        // row raced back to stuck. We're going to return 503,
        // so write the alert UNCONDITIONALLY now — operators need to see
        // every 503 via admin_alerts. The state-gated UPSERT was the fast
        // path that AVOIDED writing alerts when the row resolved; the slow
        // path (re-dispatch + raced back to stuck) writes deliberately.
        await db.query(
          `INSERT INTO admin_alerts (show_id, code, context) VALUES ($1, 'REPORT_LEASE_THRASHING', $2::jsonb)
            ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
            DO UPDATE SET last_seen_at = now, occurrence_count = admin_alerts.occurrence_count + 1, context = EXCLUDED.context`,
          [
            restate.show_id ?? null,
            JSON.stringify({ idempotency_key: key, depth, raced_back: true }),
          ],
        );
      }
      return serviceUnavailable503({ code: "REPORT_LEASE_THRASHING" });
    }
    // capture show_id from the entry-time row read so the alert
    // UPSERT below has a stable per-show key even if the row is reaped during
    // GitHub I/O.
    // #2: every horizon decision uses Postgres `now` — NEVER
    // `Date.now`. App/DB clock skew at the boundary would otherwise produce
    // inconsistent 410-vs-502 verdicts (app ahead of DB → 410 for rows DB still
    // recovers; app behind → keeps recovering past DB-side cutoff). The single
    // SQL predicate `created_at >= now - interval '24 hours'` is the
    // authoritative horizon classifier across retry, lease-claim, and reaper.
    // #3: derive the GitHub-lookup cutoff from Postgres `now`
    // in the SAME query that classifies the row's horizon. Both classifiers
    // come from one DB-time snapshot, eliminating any chance that the row's
    // horizon and the GitHub recovery window disagree under clock skew.
    const ageRow = await db.queryMaybeOne(
      `SELECT show_id,
              (created_at >= now - interval '24 hours') AS within_horizon,
              to_char((now - interval '24 hours') AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cutoff_iso
         FROM reports WHERE idempotency_key = $1`,
      [key],
    );
    if (!ageRow) {
      return gone410({ code: "REPORT_HORIZON_EXPIRED" });
    }
    const entryShowId = ageRow.show_id ?? null;
    const dbCutoffIso: string = ageRow.cutoff_iso; // #3: DB-derived; passed to findIssueByMarker
    if (!ageRow.within_horizon) {
      return gone410({ code: "REPORT_HORIZON_EXPIRED" });
    }

    // Step A (lock-free, no transaction): single-path reconciliation lookup.
    // findIssueByMarker enforces the same 24h horizon on the GitHub side via
    // issue.created_at post-filter against the DB-derived cutoff.
    // The LookupInconclusive try/catch is INLINED here so that pagination
    // errors / missing config / DUPLICATE_LIVE_MATCHES / OPEN_ISSUE_WITH_ORPHAN_LABEL
    // all route through the per-code admin_alerts UPSERT.
    let found: { htmlUrl: string } | null;
    try {
      found = await reconcileBeforeCreate(key, dbCutoffIso);
    } catch (err) {
      if (err instanceof LookupInconclusive) {
        const alertCode =
          err.code === "BOT_LOGIN_MISSING"
            ? "GITHUB_BOT_LOGIN_MISSING"
            : err.code === "DUPLICATE_LIVE_MATCHES"
              ? "REPORT_DUPLICATE_LIVE_MATCHES"
              : err.code === "OPEN_ISSUE_WITH_ORPHAN_LABEL"
                ? "REPORT_OPEN_ORPHAN_LABEL"
                : "REPORT_LOOKUP_INCONCLUSIVE";
        const isGlobal = err.code === "BOT_LOGIN_MISSING";

        // BOT_LOGIN_MISSING is an OPERATOR-CONFIG fault that
        // affects EVERY future request — write the global alert UNCONDITIONALLY
        // up front, BEFORE dispatch. This is required by the spec amendment: the
        // global alert MUST fire even when the individual row resolves/reclaims/
        // ages out, because operators need the signal to fix the env var
        // regardless of any specific request's outcome. Per-row alerts remain
        // state-gated below (only fire when this specific row is genuinely stuck).
        if (isGlobal) {
          await db.query(
            `INSERT INTO admin_alerts (show_id, code, context) VALUES (NULL, 'GITHUB_BOT_LOGIN_MISSING', $1::jsonb)
              ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
              DO UPDATE SET last_seen_at = now, occurrence_count = admin_alerts.occurrence_count + 1, context = EXCLUDED.context`,
            [JSON.stringify({ idempotency_key: key, reason: err.reason, code: err.code })],
          );
        }

        // /35/36 fix: state re-dispatch FIRST for every code. A
        // misconfigured worker MUST NOT fail a request whose row another
        // worker has resolved or reclaimed.

        const state = await db.queryMaybeOne(
          `SELECT github_issue_url,
                  show_id,
                  (processing_lease_until > now) AS lease_live,
                  (created_at >= now - interval '24 hours') AS within_horizon
             FROM reports WHERE idempotency_key = $1`,
          [key],
        );
        // Terminal: row reaped OR past horizon → 410, no alert.
        if (!state) return gone410({ code: "REPORT_HORIZON_EXPIRED" });
        if (!state.within_horizon) return gone410({ code: "REPORT_HORIZON_EXPIRED" });
        // Resolved by another worker → 200 with their URL, no alert.
        if (state.github_issue_url) {
          return ok200({
            status: "recovered",
            github_issue_url: includeUrlForViewer(state.github_issue_url),
          });
        }
        // Another worker holds a live lease → 409, no alert.
        if (state.lease_live) return conflict409({ code: "IDEMPOTENCY_IN_FLIGHT" });

        // Row is alive, in-horizon, no URL, expired lease — genuinely stuck
        // on this lookup failure. Per-row alert via a state-gated UPSERT
        // strictly scoped to the target row (no `OR TRUE`, no COALESCE
        // injection of show_id from elsewhere).
        const perRowResult = await db.query(
          `INSERT INTO admin_alerts (show_id, code, context)
           SELECT r.show_id, $2, $3::jsonb
             FROM reports r
            WHERE r.idempotency_key = $1
              AND r.github_issue_url IS NULL
              AND (r.processing_lease_until IS NULL OR r.processing_lease_until <= now)
              AND r.created_at >= now - interval '24 hours'
           ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
           DO UPDATE SET
             last_seen_at = now,
             occurrence_count = admin_alerts.occurrence_count + 1,
             context = EXCLUDED.context
           RETURNING id`,
          [
            key,
            isGlobal ? "REPORT_LOOKUP_INCONCLUSIVE" : alertCode, // per-row alert is always the generic code
            JSON.stringify({ idempotency_key: key, reason: err.reason, code: err.code }),
          ],
        );

        if (perRowResult.rowCount === 0) {
          // State flipped between dispatch and UPSERT. Re-dispatch fresh.
          const restate = await db.queryMaybeOne(
            `SELECT show_id, github_issue_url,
                    (processing_lease_until > now) AS lease_live,
                    (created_at >= now - interval '24 hours') AS within_horizon
               FROM reports WHERE idempotency_key = $1`,
            [key],
          );
          if (!restate || !restate.within_horizon)
            return gone410({ code: "REPORT_HORIZON_EXPIRED" });
          if (restate.github_issue_url)
            return ok200({
              status: "recovered",
              github_issue_url: includeUrlForViewer(restate.github_issue_url),
            });
          if (restate.lease_live) return conflict409({ code: "IDEMPOTENCY_IN_FLIGHT" });

          // row raced back to stuck — try the state-gated UPSERT
          // ONE MORE TIME instead of writing unconditionally. This closes the
          // race where state could flip between `restate` and an
          // unconditional UPSERT. Bounded at one retry: if the second gate also
          // misses, the system is in pathological rapid lease churn, and the
          // alert MUST be written for operator visibility — at that point the
          // unconditional write is correct (operators get ONE alert per stuck-
          // detection cycle even if state continues to flip).
          const secondGate = await db.query(
            `INSERT INTO admin_alerts (show_id, code, context)
             SELECT r.show_id, $2, $3::jsonb
               FROM reports r
              WHERE r.idempotency_key = $1
                AND r.github_issue_url IS NULL
                AND (r.processing_lease_until IS NULL OR r.processing_lease_until <= now)
                AND r.created_at >= now - interval '24 hours'
             ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
             DO UPDATE SET last_seen_at = now, occurrence_count = admin_alerts.occurrence_count + 1, context = EXCLUDED.context
             RETURNING id`,
            [
              key,
              isGlobal ? "REPORT_LOOKUP_INCONCLUSIVE" : alertCode,
              JSON.stringify({
                idempotency_key: key,
                reason: err.reason,
                code: err.code,
                raced_back: true,
              }),
            ],
          );
          if (secondGate.rowCount === 0) {
            // Second gate also missed — re-dispatch ONE more time.
            const restate2 = await db.queryMaybeOne(
              `SELECT github_issue_url,
                      (processing_lease_until > now) AS lease_live,
                      (created_at >= now - interval '24 hours') AS within_horizon
                 FROM reports WHERE idempotency_key = $1`,
              [key],
            );
            if (!restate2 || !restate2.within_horizon)
              return gone410({ code: "REPORT_HORIZON_EXPIRED" });
            if (restate2.github_issue_url)
              return ok200({
                status: "recovered",
                github_issue_url: includeUrlForViewer(restate2.github_issue_url),
              });
            if (restate2.lease_live) return conflict409({ code: "IDEMPOTENCY_IN_FLIGHT" });
            // Two gate attempts both missed AND the row is still stuck on both
            // re-reads. This is pathological lease-churn at the alert-write
            // layer specifically. Write the alert UNCONDITIONALLY now —
            // operators MUST see this stuck-detection cycle. Mark with
            // `raced_back_twice: true` for forensic differentiation.
            await db.query(
              `INSERT INTO admin_alerts (show_id, code, context) VALUES ($1, $2, $3::jsonb)
                ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
                DO UPDATE SET last_seen_at = now, occurrence_count = admin_alerts.occurrence_count + 1, context = EXCLUDED.context`,
              [
                restate.show_id ?? entryShowId ?? null,
                isGlobal ? "REPORT_LOOKUP_INCONCLUSIVE" : alertCode,
                JSON.stringify({
                  idempotency_key: key,
                  reason: err.reason,
                  code: err.code,
                  raced_back_twice: true,
                }),
              ],
            );
          }
        }

        //
        return badGateway502({ code: "REPORT_LOOKUP_INCONCLUSIVE" });
      }
      throw err;
    }

    if (found) {
      // Single-statement Tx: write the discovered URL only if still NULL AND
      // still within the 24h horizon at DB time.
      // check rowCount via RETURNING. If 0 rows matched, the
      // row was reaped or no longer in NULL-url state.
      // #1: ALSO require `created_at >= now - interval '24 hours'`
      // in the WHERE clause so a row that crossed the horizon DURING the
      // GitHub lookup cannot be revived by the recovered-path UPDATE. Without
      // this, the 24h cutoff would become nondeterministic (a row with a
      // resolved URL is never reaped).
      const recovered = await db.query(
        `UPDATE reports SET github_issue_url = $1
          WHERE idempotency_key = $2
            AND github_issue_url IS NULL
            AND created_at >= now - interval '24 hours'
          RETURNING id`,
        [found.htmlUrl, key],
      );
      if (recovered.rowCount === 0) {
        // Row was reaped, another retry beat us to writing the URL, OR the
        // row crossed the 24h horizon during the lookup.
        // Re-SELECT both `github_issue_url` AND `within_horizon` (DB-time)
        // to disambiguate all four cases:
        // - row missing → 410 (reaped)
        // - URL set → 200 (another retry / late tail won)
        // - URL still NULL AND past horizon → 410 (boundary crossed during lookup)
        // - URL still NULL AND within horizon → 409 (genuine contention)
        const row = await db.queryMaybeOne(
          `SELECT github_issue_url,
                  (created_at >= now - interval '24 hours') AS within_horizon
             FROM reports WHERE idempotency_key = $1`,
          [key],
        );
        if (!row) return gone410({ code: "REPORT_HORIZON_EXPIRED" });
        if (row.github_issue_url)
          return ok200({
            status: "recovered",
            github_issue_url: includeUrlForViewer(row.github_issue_url),
          });
        if (!row.within_horizon) return gone410({ code: "REPORT_HORIZON_EXPIRED" });
        return conflict409({ code: "IDEMPOTENCY_IN_FLIGHT" });
      }
      return ok200({ status: "recovered", github_issue_url: includeUrlForViewer(found.htmlUrl) });
    }

    // Lease re-acquisition — single-statement Tx; the only serialized step.
    // The 'AND github_issue_url IS NULL' clause is the late-success guard.
    // The 'lease_holder = $myRetryLeaseHolder' rotation is the ownership guard:
    // it stamps the row with the retry's UUID so the original (if still alive but
    // slow) can detect on its tail UPDATE that its lease was stolen and clean up
    // any orphan GH issue it created.
    // the 'created_at >= now - interval 24 hours' predicate fences
    // the horizon at the serialized step. Combined with the reaper's
    // 'AND processing_lease_until < now' skip, this closes the race where a
    // retry that started just before T+24h would otherwise refresh the lease past
    // the boundary and become reapable mid-flight.
    const myRetryLeaseHolder = randomUUID;
    const claim = await db.query(
      `UPDATE reports
          SET processing_lease_until = now + interval '90 seconds',
              lease_holder = $2::uuid
        WHERE idempotency_key = $1
          AND processing_lease_until < now
          AND github_issue_url IS NULL
          AND created_at >= now - interval '24 hours'
        RETURNING id, lease_holder`,
      [key, myRetryLeaseHolder],
    );
    if (claim.rowCount === 0) {
      // The lease-claim UPDATE failed. Four possible causes — disambiguate
      // via a single DB-time SELECT that returns ALL the classifiers.
      // `within_horizon` is DB-time computed.
      // `lease_live` is also DB-time computed; treating an
      // expired competing lease as "in-flight" would falsely return 409 and
      // leave the row stuck waiting for a non-existent worker.
      const row = await db.queryMaybeOne(
        `SELECT github_issue_url,
                (processing_lease_until > now) AS lease_live,
                (created_at >= now - interval '24 hours') AS within_horizon
           FROM reports WHERE idempotency_key = $1`,
        [key],
      );
      // Case A: row was reaped between our entry-time check and the claim UPDATE.
      if (!row) return gone410({ code: "REPORT_HORIZON_EXPIRED" });
      // Case B: URL was populated since our reconcile (late completion of the
      // original or another retry). Terminal duplicate — return 200.
      if (row.github_issue_url) {
        return ok200({
          status: "recovered",
          github_issue_url: includeUrlForViewer(row.github_issue_url),
        });
      }
      // Case C: row crossed the 24h horizon — DB-time predicate.
      if (!row.within_horizon) return gone410({ code: "REPORT_HORIZON_EXPIRED" });
      // Case D: another worker actually holds a LIVE lease — genuine in-flight
      // contention. Return 409 only when lease_live is true.
      if (row.lease_live) return conflict409({ code: "IDEMPOTENCY_IN_FLIGHT" });
      // Case D': the lease expired between our failed claim UPDATE and this
      // SELECT (or the worker holding it died right at expiry). The row is
      // immediately reclaimable — recurse once into expiredLeaseRetry rather
      // than emitting a false 409. Recursion is bounded: we only fall through
      // to this branch when ALL of (row exists, in-horizon, URL null, lease
      // expired) hold simultaneously, and the next attempt will either claim
      // successfully OR find a different state. To prevent unbounded recursion
      // under pathological adversarial conditions, the helper takes a depth
      // counter that aborts after 3 retries with 503 `REPORT_LEASE_THRASHING`
      // (a new admin-alert code surfacing repeated rapid lease churn).
      return expiredLeaseRetry(key, depth + 1);
    }

    // We hold a fresh lease (lease_holder = myRetryLeaseHolder). Reconcile MISSED
    // both lookups; only now is it safe to call createIssue. Outside any transaction.
    const newIssue = await createIssue({
      /* static labels only; body carries the marker per 8.3d */
    });
    // Tail UPDATE — lease-ownership guard. If the original raced ahead
    // of us (its lease was stolen but its connection finally completed), it
    // cannot succeed because lease_holder won't match its token. Symmetrically,
    // if a NEWER retry stole this lease from US between our claim and our tail,
    // our 0-row result triggers the orphan-cleanup branch (close the issue we
    // just created, log REPORT_ORPHANED_LOST_LEASE).
    const tail = await db.query(
      `UPDATE reports
          SET github_issue_url = $1
        WHERE idempotency_key = $2
          AND github_issue_url IS NULL
          AND lease_holder = $3::uuid
        RETURNING id`,
      [newIssue.htmlUrl, key, myRetryLeaseHolder],
    );
    if (tail.rowCount === 0) {
      // do the SAME Case A/B/C disambiguation the spec requires
      // for the original-worker tail. A 0-row tail does NOT prove the issue
      // we just created is an orphan — a NEWER retry could have recovered our
      // issue via findIssueByMarker before our tail UPDATE landed (Case A).
      // Closing the issue in that case would corrupt a live recovered binding.
      const row = await db.queryMaybeOne(
        `SELECT github_issue_url, show_id FROM reports WHERE idempotency_key = $1`,
        [key],
      );
      // Case A: stored URL equals MY URL — a newer retry's findIssueByMarker
      // recovered MY issue. The issue is live and is the row's authoritative
      // URL. DO NOT close it. Return 200 with the same URL.
      if (row && row.github_issue_url === newIssue.htmlUrl) {
        return ok200({
          status: "recovered",
          github_issue_url: includeUrlForViewer(newIssue.htmlUrl),
        });
      }
      // the row may have been reaped (row === null). MY issue
      // still exists at GitHub regardless — it must be closed to prevent a
      // user-visible duplicate live issue. Capture show_id from the row when
      // available; on reaped rows the alert lands as global (show_id=NULL).
      // This is the unified reaped-or-not orphan-cleanup contract.
      // Case B (URL differs from mine), Case C (URL still NULL), AND
      // Case Reaped (row missing) all run cleanup on MY issue.
      // SINGLE atomic Octokit call so close + label write
      // cannot be partially applied.
      await octokit.rest.issues.update;
      // UPSERT under §4.6 unresolved-row uniqueness contract.
      // include `show_id` (per-show alert).
      // when the row was reaped, the post-tail re-read has no show_id.
      // prefer the entry-time captured show_id (`entryShowId` from
      // the entry-time row read at the top of expiredLeaseRetry) so reaped-row
      // alerts STILL surface per-show under the §4.6 partial unique index. Two
      // unresolved reaped lost-lease incidents on different shows produce two
      // distinct admin_alerts rows. Only fall back to NULL if no entry-time
      // show_id was captured (genuinely impossible to attribute).
      const orphanShowId = row?.show_id ?? entryShowId ?? null;
      await db.query(
        `INSERT INTO admin_alerts (show_id, code, context)
         VALUES ($1, 'REPORT_ORPHANED_LOST_LEASE', $2::jsonb)
         ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
         DO UPDATE SET
           last_seen_at = now,
           occurrence_count = admin_alerts.occurrence_count + 1,
           context = EXCLUDED.context`,
        [
          orphanShowId,
          JSON.stringify({
            idempotency_key: key,
            orphan_url: newIssue.htmlUrl,
            lease_holder: myRetryLeaseHolder,
            row_reaped: row === null,
          }),
        ],
      );
      // Dispatch using the row we already re-read at the top of this branch.
      // Case Reaped: row is gone — return 410. The orphan was closed above.
      if (!row) return gone410({ code: "REPORT_HORIZON_EXPIRED" });
      // Case B: the row's URL differs from MY URL — return that URL as the
      // authoritative recovery for the user.
      // Case C: row.github_issue_url IS NULL — another retry holds the lease
      // but hasn't finished writing its URL.
      if (row.github_issue_url)
        return ok200({
          status: "recovered",
          github_issue_url: includeUrlForViewer(row.github_issue_url),
        });
      return conflict409({ code: "IDEMPOTENCY_IN_FLIGHT" });
    }
    return created201({
      status: "created",
      github_issue_url: includeUrlForViewer(newIssue.htmlUrl),
    });
  }
  ```

  **There is no body-search fallback**. The single recovery path is `findIssueByMarker` against the immediately-consistent list endpoint, with fail-closed semantics on inconclusive results. That single contract closes AC-8.12 — eventually-consistent code search is no longer part of the design.

- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(reports): concurrent-retry race + late-success guard via unified reconcile (AC-8.13)`.

### Task 8.3f: Daily reaper cron for orphan rows — `created_at` horizon

**Files:** Create: `app/api/cron/report-reaper/route.ts`. Modify: `vercel.json`. Test: `tests/reports/reaper.test.ts`.

The reaper uses **`reports.created_at`** as the horizon, NOT `processing_lease_until`. observed that the prior draft's lease-based predicate misaligns with the row-age horizon enforced by `expiredLeaseRetry`. A retry that refreshes the lease 23 hours after creation could push `processing_lease_until` past the 24h mark, leaving the row alive for roughly another day under the lease-based predicate even though `expiredLeaseRetry` is already returning 410 `REPORT_HORIZON_EXPIRED`. Aligning both gates on the same `reports.created_at` cutoff makes the horizon enforceable end-to-end.

- [x] **Step 1: Failing tests**
  - **Live-lease row is PRESERVED:** synthesize a `reports` row with `github_issue_url IS NULL`, `created_at = now - interval '25 hours'`, AND `processing_lease_until = now + interval '5 minutes'` (a retry just refreshed the lease). Run the reaper. Assert the row IS NOT DELETEd — the `AND processing_lease_until < now` clause skips it. The retry holding this lease will eventually finish, advance state, or let the lease expire; only after the lease expires (and the row is still unresolved past the horizon) does the next reaper run delete it.
  - **Expired-lease, past-horizon row IS deleted:** synthesize `created_at = now - interval '25 hours'` AND `processing_lease_until = now - interval '10 minutes'` (lease expired). Run the reaper. Row IS DELETEd. `STALE_ORPHAN_REPORT` audit entry is written.
  - **No false delete on resolved row:** synthesize a row with `github_issue_url IS NOT NULL` and `created_at = now - interval '30 days'`. Reaper does NOT delete it (resolved rows are forensic data, kept indefinitely or per a separate retention policy out of v1 scope).
  - **Boundary checks (created_at side):** `created_at = now - interval '23 hours 30 minutes'` AND lease expired → row preserved. `created_at = now - interval '24 hours 1 minute'` AND lease expired → row deleted. The boundary is `now - interval '24 hours'` (strictly less than).
  - **Reaper / retry consistency:** for any row that's BOTH past-horizon AND lease-expired-and-unresolved, `expiredLeaseRetry` returns 410 `REPORT_HORIZON_EXPIRED` AND the reaper's predicate matches it on the same UTC timestamp. For any row that's past-horizon BUT lease-live, `expiredLeaseRetry` would also return 410 (entry-time `created_at` check) but the reaper does NOT match (live lease) — the divergence is intentional: the retry can't make progress and the reaper waits for the worker to release the row.
- [x] **Step 2: Implement** the daily cron (e.g. `0 6 * * *`) calling:

  ```sql
  DELETE FROM reports
   WHERE github_issue_url IS NULL
     AND created_at < now - interval '24 hours'
     AND processing_lease_until < now -- : never reap a row a retry actively holds
   RETURNING id, idempotency_key, created_at, lease_holder;
  ```

  The `AND processing_lease_until < now` clause is the race fix: it prevents the reaper from deleting a row whose lease is still held by an in-flight retry. Combined with `expiredLeaseRetry`'s lease-claim predicate (`AND created_at >= now - interval '24 hours'`), the horizon is enforced atomically at both ends — neither side can act on a row the other side is using.

  For each returned row, INSERT a structured audit log entry (e.g., a row in `sync_log` with `status = 'STALE_ORPHAN_REPORT'`, or a dedicated `admin_alerts` row coded `STALE_ORPHAN_REPORT` if Eric should be paged on this).

- [x] **Step 3: Run** — PASS.
- [x] **Step 4: Commit** `feat(reports): daily orphan reaper on created_at horizon`.

### Task 8.3g: Spec patch — sync §13.2.3 with plan amendments (recovery + reaper + lease_holder)

**STATUS: SPEC PATCH ALREADY APPLIED during the adversarial-review loop (rounds 24+).** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` §13.2.3 has been rewritten and §4.1 reports table now declares `lease_holder uuid`, `idempotency_key`, and `processing_lease_until` inline; §14.3 env-var table includes `GITHUB_BOT_LOGIN`. **This task is now verification-only:** Steps 1 and 2 below were performed during the loop; Steps 3a/3b (author + run `scripts/verify-spec-amendment-3.sh`) MUST run to confirm the patch satisfies every invariant before M8 implementation begins.

**Files:** Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` §13.2.3 (already done). Create: `scripts/verify-spec-amendment-3.sh` (still to do).

The plan ratifies **three** amendments to §13.2.3. All three must land together — the lease-ownership protocol, the reaper predicate, and the recovery contract — to avoid silent divergence between the per-row tail UPDATEs and the reaper's deletion criterion.

**Three concrete amendments to land:**

1. **Recovery path** — replace `searchIssuesByMarker` (eventually-consistent code search) with `findIssueByMarker` (immediately-consistent list endpoint, bounded by `since` + `creator` + client-side `created_at` post-filter; fail-closed on `LookupInconclusive`). Per "How to use this plan" amendment 1.
2. **Reaper predicate** — replace `processing_lease_until < now - interval '24 hours'` with the combined `created_at < now - interval '24 hours' AND processing_lease_until < now`. Per amendment 2 + the race fix.
3. **`lease_holder` ownership protocol** — the spec currently shows `UPDATE reports SET github_issue_url = $url WHERE id = $reportId` with no ownership token. The amendment requires:
   - Add `lease_holder uuid` column on `reports` (the §4 schema sketch and §13.2.3 ALTER TABLE list both must mention it).
   - Reservation INSERT writes `lease_holder` to a fresh `gen_random_uuid`.
   - Lease re-acquisition rotates `lease_holder` to a new UUID inside the same UPDATE that extends `processing_lease_until`.
   - **Every** URL-writing tail UPDATE (whether from the original worker or a retry) carries `AND lease_holder = $myToken`.
   - On 0-row tail UPDATE: orphan-cleanup branch closes the GH issue with state_reason `not_planned` and adds the `fxav-orphan-lost-lease` label, then INSERTs `admin_alerts` coded `REPORT_ORPHANED_LOST_LEASE`. : if the row was reaped between createIssue and the tail UPDATE, the re-SELECT returns null and the route returns 410 `REPORT_HORIZON_EXPIRED`.

- [ ] **Step 1: Read the existing §13.2.3 text** at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2050-2086` to confirm what's being replaced; also locate the `reports` table schema mention in §4 to confirm where the `lease_holder` column declaration lands.
- [ ] **Step 2: Author the spec patch** that incorporates all three amendments above. Add a sentence pointing back to the plan: "See `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/08-bug-report.md` Tasks 8.1, 8.3b, 8.3d, 8.3e, 8.3f for the full implementation contract and regression-test list."
- [ ] **Step 3a: Author the verification script** at `scripts/verify-spec-amendment-3.sh`. The script asserts each invariant below with EXACT match counts (not just "at least one"), exits non-zero if any assertion fails, and is wired into the project's CI as a `pnpm verify:spec-amendment` task. Concrete script body:

  ```bash
  #!/usr/bin/env bash
  # scripts/verify-spec-amendment-3.sh — gates the §13.2.3 spec patch (Task 8.3g).
  # : assertions are exact-count, not existence-only.
  # : section-scoped extracts so matches can't come from unrelated sections.
  # : TRUE multiline matching via `perl -0777` (slurps file as one string,
  # regex applies across newlines) AND per-section distribution assertions
  # (lease_holder uuid must appear in §4.1 AND §13.2.3 separately, not just
  # ≥2 times in the merged scope).
  set -euo pipefail
  SPEC=docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md

  # Extract a markdown section by heading regex. Extracts from start heading to
  # the next heading at the same or shallower depth.
  # : gensub is a gawk extension and is NOT available in BSD awk
  # (the macOS default). Use POSIX-compatible match + RLENGTH to compute the
  # heading depth so the verifier runs on Darwin.
  extract_section {
    local start_re="$1"
    awk -v start="$start_re" '
      function depth_of(line, n) {
        if (match(line, /^#+/)) return RLENGTH
        return 0
      }
      $0 ~ start { in_sec=1; print; depth=depth_of($0); next }
      in_sec && /^#+ / {
        d = depth_of($0)
        if (d <= depth) { in_sec=0; next }
      }
      in_sec { print }
    ' "$SPEC"
  }

  TMP=$(mktemp -d)
  extract_section '^### 13\.2\.3' > "$TMP/13.2.3.md"
  extract_section '^### 4\.1' > "$TMP/4.1.md"
  extract_section '^### 14\.3' > "$TMP/14.3.md"
  cat "$TMP/4.1.md" "$TMP/13.2.3.md" "$TMP/14.3.md" > "$TMP/scope.md"

  fail { echo "✗ $1"; exit 1; }
  pass { echo "✓ $1"; }

  # TRUE multi-line aware count via perl -0777 (slurp + regex across newlines).
  # Returns the number of NON-OVERLAPPING matches.
  count_multiline {
    local pat="$1"; local file="$2"
    perl -0777 -ne 'BEGIN{$c=0}while(/'"$pat"'/sg){$c++}END{print $c}' "$file"
  }

  must_be_zero_in {
    local file="$1"; local pat="$2"; local label="$3"
    local n; n=$(count_multiline "$pat" "$file")
    [[ "$n" == "0" ]] || fail "$label (expected 0 in $(basename "$file"), got $n)"
    pass "$label [$(basename "$file")]"
  }
  must_be_at_least_in {
    local file="$1"; local pat="$2"; local min="$3"; local label="$4"
    local n; n=$(count_multiline "$pat" "$file")
    (( n >= min )) || fail "$label (expected ≥$min in $(basename "$file"), got $n)"
    pass "$label [$(basename "$file")]"
  }

  # ----- Removed clauses — must be ABSENT from §13.2.3 -----
  must_be_zero_in "$TMP/13.2.3.md" 'searchIssuesByMarker' 'rejected: code-search recovery removed'
  must_be_zero_in "$TMP/13.2.3.md" "processing_lease_until\\s*<\\s*now\\(\\)\\s*-\\s*interval\\s*'24" 'rejected: lease-time reaper predicate removed'
  # Multi-line: the unfenced tail UPDATE may span lines.
  must_be_zero_in "$TMP/13.2.3.md" 'UPDATE\\s+reports\\s+SET\\s+github_issue_url\\s*=\\s*\\$url\\s+WHERE\\s+id\\s*=\\s*\\$reportId' 'rejected: unfenced tail UPDATE removed'

  # ----- Amendment 1 (recovery) — every clause must appear in §13.2.3 -----
  must_be_at_least_in "$TMP/13.2.3.md" 'findIssueByMarker' 1 'amendment 1: findIssueByMarker introduced'
  must_be_at_least_in "$TMP/13.2.3.md" 'GITHUB_BOT_LOGIN' 1 'amendment 1: bot-login env'
  must_be_at_least_in "$TMP/13.2.3.md" 'issue\\.created_at' 1 'amendment 1: client-side created_at post-filter'
  must_be_at_least_in "$TMP/13.2.3.md" 'LookupInconclusive' 1 'amendment 1: fail-closed sentinel'
  # Bot-login env-var declaration MUST also appear in §14.3 env-var table.
  must_be_at_least_in "$TMP/14.3.md" 'GITHUB_BOT_LOGIN' 1 'amendment 1: bot-login env declared in §14.3 env table'
  # : duplicate-live-matches fail-closed must be specified.
  must_be_at_least_in "$TMP/13.2.3.md" 'DUPLICATE_LIVE_MATCHES' 1 'amendment 1: duplicate-live-matches fail-closed'

  # ----- Amendment 2 (reaper combined predicate + retry horizon fence) -----
  must_be_at_least_in "$TMP/13.2.3.md" "created_at\\s*<\\s*now\\(\\)\\s*-\\s*interval\\s*'24\\s*hours'" 1 'amendment 2: reaper created_at cutoff'
  must_be_at_least_in "$TMP/13.2.3.md" "AND\\s+processing_lease_until\\s*<\\s*now\\(\\)" 1 'amendment 2: reaper live-lease skip'
  must_be_at_least_in "$TMP/13.2.3.md" "created_at\\s*>=\\s*now\\(\\)\\s*-\\s*interval\\s*'24\\s*hours'" 1 'amendment 2: retry lease-claim horizon fence'

  # ----- Amendment 3 (lease_holder ownership protocol) -----
  # : 'lease_holder uuid' must appear in EACH section separately,
  # not just ≥2 times in the merged scope. The schema sketch lives in §4.1; the
  # ALTER TABLE / runtime contract lives in §13.2.3. Both must reference it.
  must_be_at_least_in "$TMP/4.1.md" 'lease_holder\\s+uuid' 1 'amendment 3: lease_holder uuid in §4.1 schema sketch'
  must_be_at_least_in "$TMP/13.2.3.md" 'lease_holder\\s+uuid' 1 'amendment 3: lease_holder uuid in §13.2.3 runtime contract'
  # Reservation INSERT — extract ONLY the INSERT INTO reports
  # statement (from `INSERT INTO reports` up to the closing semicolon or RETURNING
  # clause) and verify both `processing_lease_until` AND `lease_holder` appear
  # INSIDE the column list / VALUES of that statement. The earlier permissive
  # regex `INSERT INTO reports[\s\S]*?lease_holder` falsely matched when
  # `lease_holder` only appeared in surrounding prose, NOT in the INSERT itself.
  must_be_at_least_in "$TMP/13.2.3.md" 'INSERT\\s+INTO\\s+reports[^;]*?\\([^)]*processing_lease_until[^)]*lease_holder[^)]*\\)' 1 'amendment 3: reservation INSERT column-list contains BOTH processing_lease_until AND lease_holder'
  # Reservation VALUES list must include `now + interval '90' / '90 seconds'`
  # for the lease and a UUID for the holder — assert the explicit time literal.
  must_be_at_least_in "$TMP/13.2.3.md" "VALUES\\s*\\([^)]*now\\(\\)\\s*\\+\\s*interval\\s*'90\\s*seconds'[^)]*::uuid[^)]*\\)" 1 'amendment 3: reservation VALUES sets lease window + lease_holder uuid'
  # Step 2a existing-row dispatch must distinguish live vs expired leases —
  # not just "URL is NULL → 409". The amendment requires checking
  # `processing_lease_until > now` for the live-lease case and routing the
  # expired-lease case to a separate retry path.
  must_be_at_least_in "$TMP/13.2.3.md" 'processing_lease_until\\s*>\\s*now\\(\\)' 1 'amendment 3: existing-row dispatch checks live lease'
  must_be_at_least_in "$TMP/13.2.3.md" 'processing_lease_until\\s*<=?\\s*now\\(\\)' 1 'amendment 3: existing-row dispatch checks expired lease'
  # Lease re-acquisition rotates lease_holder.
  must_be_at_least_in "$TMP/13.2.3.md" 'SET\\s+processing_lease_until[\\s\\S]*?lease_holder\\s*=' 1 'amendment 3: lease re-acquisition rotates lease_holder'
  # Tail UPDATE fences MUST appear ≥2 times in §13.2.3 (original-worker tail AND retry-worker tail).
  must_be_at_least_in "$TMP/13.2.3.md" 'AND\\s+lease_holder\\s*=' 2 'amendment 3: tail-UPDATE fences ≥2 (original + retry)'
  must_be_at_least_in "$TMP/13.2.3.md" 'fxav-orphan-lost-lease' 1 'amendment 3: orphan-cleanup label'
  must_be_at_least_in "$TMP/13.2.3.md" 'REPORT_ORPHANED_LOST_LEASE' 1 'amendment 3: orphan admin_alerts code'
  must_be_at_least_in "$TMP/13.2.3.md" 'REPORT_HORIZON_EXPIRED' 1 'amendment 3: reaped-row 410'

  echo
  echo "All §13.2.3 amendment-3 invariants present."
  ```

  Make the script executable (`chmod +x scripts/verify-spec-amendment-3.sh`) and add a `verify:spec-amendment` script in `package.json` that runs it. Wire into CI alongside `pnpm test`.

- [ ] **Step 3b: Run the verification script** against the patched spec:
  ```bash
  pnpm verify:spec-amendment
  ```
  Iterate on the spec patch until every `must_be_zero` and `must_be_at_least` assertion in `scripts/verify-spec-amendment-3.sh` passes. The script's exit code is the commit gate — Step 5's commit MUST fail if any assertion fails. The exact-count assertions (e.g. `lease_holder uuid` ≥2 matches; `AND lease_holder =` ≥2 matches) catch partial patches that mention an invariant in only one location.
- [ ] **Step 4: Update** the plan's "How to use this plan" amendment block to remove the "NOT yet patched into the spec" caveat and replace with "Patched into the spec by Task 8.3g."
- [ ] **Step 5: Commit** as `spec: align §13.2.3 with plan amendments 1+2+3`. This is a SPEC change; commit message reflects that. Land before any M8 task is merged.

### Task 8.4: Footer "Something looks wrong?" + admin "Report this" buttons (§13.1)

**Files:** Create: `components/shared/ReportButton.tsx`, `components/shared/ReportModal.tsx`. Modify: `components/layout/Footer.tsx`. Test: e2e.

**Idempotency-key lifecycle: one key per report attempt, reused across every retry — including cancel.** The modal must NOT regenerate the key on network retry, response timeout, 502/503 from the server, OR user-initiated dismiss/cancel. The threat model: an "unknown outcome" attempt may have already reserved the `reports` row OR even created the GH issue before the client lost the response. Because server-side dedupe is keyed only by `idempotency_key`, dismissing and later resubmitting with a new key can create a second `reports` row, charge quota again, and open a duplicate GH issue. Therefore cancel CANNOT rotate the key without an explicit user opt-in.

The key only rotates when:

1. The submission succeeds **terminally** — defined as **any 2xx response from `/api/report` whose body shape proves the report exists**: HTTP 201 (brand-new winner, freshly-created issue) OR HTTP 200 (idempotent retry that found an existing report — completed duplicate or recovery). Both forms are returned by the server's flow (Tasks 8.3b/c/d) when the report's `github_issue_url` is set or has just been resolved. **The earlier 201-only definition is wrong**: it would leave the modal stuck in `failed-retryable` state after a successful 200 retry/recovery, keeping the `sessionStorage` "Resume previous report" UI alive and dedup-collapsing the user's next distinct report onto the same key. The HTTP-status-based definition the modal applies is **`response.status >= 200 AND response.status < 300 AND body.ok === true`** — the server returns `{ ok: true, status: 'created' | 'duplicate' | 'recovered', github_issue_url?: string }` for every terminal success; the modal doesn't inspect the URL, only `body.ok` plus the status code, OR
2. The user clicks an explicit **"Start a new report anyway"** affordance that surfaces only after at least one nonterminal attempt has been made. The affordance carries a warning copy: "Your previous attempt may have already gone through. Starting fresh could create a duplicate." This is the only escape hatch for the user who genuinely wants to abandon dedup.

**Material draft changes do NOT auto-rotate the key.** The earlier draft included rotation on "user materially changes the draft message text after a previous attempt." Round 7's finding observed that this opens the same duplicate-issue hole: after a 502 / timeout / unknown-outcome the first attempt may already have created the GH issue. A user who tweaks wording and re-submits would mint a fresh key, bypass server dedup, and open a second issue. The corrected rule: after any nonterminal attempt, the existing key + draft are persisted; if the user edits the draft and re-submits, the modal sends the **edited** draft with the **same** idempotency_key. The server's idempotent dedup uses only the key, so the second submission resolves to the same `reports` row and the same GH issue (the edited body text simply doesn't get into the issue — the original body wins, since it was already posted). If the user actually wants to file a new report, they must click "Start a new report anyway" with the warning. Drafts may also be edited freely BEFORE the first submit attempt is made for that key; that path doesn't rotate either, since no submission has gone out yet.

In every other case — network error, 502 from `/api/report`, 409 `IDEMPOTENCY_IN_FLIGHT`, abort due to backgrounded tab, **plain "X" close on a retryable attempt, AND draft edits after a nonterminal attempt** — the modal MUST persist the key (and the latest draft text) so the next reopen offers a "Resume previous report" flow that POSTs with the same key.

**Persistence:** key + current draft text + status are stored in `sessionStorage` keyed by surface (`fxav-report-attempt-<surfaceId>`). The stored `draft` reflects the user's **latest edits** — every keystroke updates it. They survive accidental tab refresh and modal close. **Persisted state is cleared ONLY by:** (a) terminal success, OR (b) explicit "Start a new report anyway." That's it. Editing the draft after a nonterminal attempt does NOT clear and does NOT rotate — the latest text is just what the next "Resume" submission carries with the same key.

- [ ] **Step 1: Failing tests**
  - Happy path: render modal, type message, submit, observe 201 + GH URL toast (admin) / thanks toast (crew).
  - **Idempotency-key reuse on transient retry:** mock the first POST to return 502. Click "Retry" in the modal. Inspect the second POST body / `Idempotency-Key` header — assert the key matches the first attempt's key.
  - **Idempotency-key reuse on response timeout:** abort the first POST mid-flight (simulate window navigation). Reopen modal, click "Resume previous report." Second POST carries the same key.
  - **Idempotency-key reuse across modal close+reopen on retryable failure:** first POST 502. User clicks "X" to close the modal. Later reopens the report button. Modal offers "Resume previous report" with the latest persisted draft pre-filled. Submit. Second POST carries the same key.
  - **Edited-draft close+reopen preserves edits AND key:** first POST 502. User edits the draft adding "...also Y." (this updates `sessionStorage` in place — no clear, no rotation). User clicks "X" to close. Reopens later. Modal offers "Resume previous report" with the EDITED draft text pre-filled (not reverted to the originally-submitted text), and the SAME key. Submit. Second POST carries the same key with the edited body. (Server dedup will resolve to the existing row; if GH issue was already created, the edited body is dropped.)
  - **Edited-draft refresh preserves edits AND key:** first POST 502. User edits the draft. User refreshes the tab. Reopens the report button. Modal hydrates from `sessionStorage` with the edited draft AND the original key. Submit reuses the same key.
  - **Idempotency-key reuse across tab refresh:** first POST 502. User refreshes the page. Reopens report button. `sessionStorage` re-hydrates the same key + draft. Submit. Same key.
  - **Key rotation on terminal success (admin, 201):** first admin POST returns 201 with URL + `body.ok=true`. Open a fresh report. Second POST carries a NEW UUID.
  - **Key rotation on terminal success:** first crew POST returns 201 with NO `github_issue_url` in body but `body.ok=true` (privacy contract §13.2.3). Modal MUST treat as terminal success. Second POST carries a NEW UUID.
  - **Key rotation on terminal success:** simulate a retry whose first action lands on Task 8.3b's "github_issue_url IS NOT NULL" branch and returns `{ ok: true, status: 'duplicate', github_issue_url: '...' }` with HTTP 200. Modal MUST treat 200 + `body.ok=true` as terminal, clear sessionStorage, rotate key. Open a fresh report. Second POST carries a NEW UUID.
  - **Key rotation on terminal success:** simulate a retry whose first action lands on Task 8.3c's recovery path that finds the issue via `findIssueByMarker` (list-endpoint scan) and returns `{ ok: true, status: 'recovered', github_issue_url: '...' }` with HTTP 200. Same expectation as above.
  - **Crew 200 recovery rotation:** same as the 200-recovery case above but the response body has no `github_issue_url` (crew privacy). Modal still treats as terminal because `body.ok===true && status<300`.
  - **Material draft change does NOT auto-rotate:** first attempt drafted "X is broken" → 502. User edits draft to "X is broken AND Y" and clicks submit. The second POST carries the SAME idempotency_key (server-side dedup will resolve it to the original row; if GH issue was already created, the edited body is dropped — defensible: the user must click "Start a new report anyway" if they want a separate issue with the new body).
  - **Key rotation requires explicit opt-in**: first attempt 502s. User closes modal. Reopens. Modal offers "Resume previous report" by default. User clicks "Start a new report anyway" with the warning copy visible. New key.
  - **Plain cancel does NOT rotate**: first attempt 502s. User clicks "X" or hits Escape to close. Later reopens via the same Report button. The key is preserved; modal offers Resume.
- [ ] **Step 2: Implement.** Modal state holds:
  ```ts
  type ModalState = {
    idempotencyKey: string; // one per attempt; sticky across retries
    draft: string; // current message text — the SOLE source of truth for hydration
    //
    status: "composing" | "submitting" | "failed-retryable" | "succeeded";
    surfaceId: string; // identifies which surface produced the attempt
  };
  // Persisted to sessionStorage at every status transition AND every draft keystroke.
  // Key: `fxav-report-attempt-${surfaceId}`. Value: ModalState (JSON).
  // Cleared ONLY by: (a) terminal success, (b) explicit "Start a new report anyway".
  // Draft edits update the persisted state in place but never clear it.
  ```
  Key-rotation logic on every "Submit" click. **Terminal success is any 2xx response with `body.ok === true`** — covers HTTP 201 (`status: 'created'`), HTTP 200 (`status: 'duplicate' | 'recovered'`), with or without `github_issue_url` in the body (admin includes it; crew doesn't, per §13.2.3). The state machine sets `status='succeeded'` on any such response and clears `sessionStorage` for the surface.
  ```ts
  function isTerminalSuccess(response: Response, body: { ok: boolean }): boolean {
    return response.status >= 200 && response.status < 300 && body.ok === true;
  }
  function nextKey(state: ModalState, userClickedStartAnyway: boolean): string {
    // Terminal success (HTTP 2xx + body.ok=true; covers 201 created and 200 duplicate/recovered) → fresh key on next attempt
    if (state.status === "succeeded") return crypto.randomUUID;
    // Explicit user opt-in to abandon dedup — the only other rotation path
    if (userClickedStartAnyway) return crypto.randomUUID;
    // Every other path — including draft edits after a nonterminal attempt,
    // retryable failure, plain cancel/dismiss, tab refresh, timeout — REUSE.
    return state.idempotencyKey;
  }
  ```
  **Note:** there is intentionally no separate `lastSubmittedDraft` field. The `draft` field holds whatever the user has typed most recently and is the single source of truth for both the next submit's request body and the Resume UI's pre-fill. observed that an earlier draft of this task tracked a `lastSubmittedDraft` and the resume copy said "original draft pre-filled" — those two paths could disagree, hydrating from the stale submitted text and silently dropping later edits.
  Reopen logic: when the user clicks the Report button, check `sessionStorage` for an existing attempt for this surface. If found AND `status` is any nonterminal state → render the "Resume previous report" UI **pre-filled from the persisted `draft` field (the latest persisted text, not the last submitted text)**, with a "Resume" button (reuses the persisted key) and a "Start a new report anyway" button (rotates the key with the warning copy "Your previous attempt may have already gone through. Starting fresh could create a duplicate."). Otherwise render the normal compose UI with a fresh key. **The Resume textarea binds bidirectionally to the persisted `draft`** — every keystroke updates `sessionStorage`, so further edits during the Resume flow are also persisted.
  The Submit button autocaptures: `surface`, `crewPreview`, `fieldRef`, `parseWarnings`, `rawSnippet`, `viewerVisibleSection`, `userAgent`, `lastSyncTimestamp`, `staleTier`, `rightNowState`. Body and key are sent together; the server uses the key as the dedup primary.
- [ ] **Step 3: Commit** `feat(report): button + modal + key-lifecycle (cancel-preserves-key) (§13.1, AC-8.11..8.12)`.

### Task 8.5: Error-code catalog completeness (AC-8.8, overlap with AC-X.1)

**Files:** Test: `tests/messages/codes-coverage.test.ts`.

- [ ] **Step 1: Failing test (AC-8.8)** — every code that appears in the app's source code (e.g., a `code: 'LINK_EXPIRED'` literal, an admin-alert insert, a thrown error with a known code) must map to a row in `lib/messages/catalog.ts`. Two-way assertion: every code in code → in catalog; every code in catalog → emitted from at least one synthesizable scenario. Same test scope as AC-X.1; this task is the M8 deliverable that AC-X.1 will exercise more thoroughly in cross-cutting.
- [ ] **Step 2: Implement** by extending Task 9.4's catalog with the §12.4 codes, then running a static-analysis test that diffs the two sets. The catalog itself is the single source of truth (per §12.4 final paragraph).
- [ ] **Step 3: Commit** `test(messages): error-code catalog coverage (AC-8.8)`.

---
