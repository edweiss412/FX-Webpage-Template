<!-- spec-lint: not-ui — no UI surface: the change touches lib/supabase, a new meta-test, and a CI workflow step. The app/ path cited below is a consumer census subject, not a deliverable. impeccable-gate: N/A — no UI surface. -->

# Absorbing the transient upstream 502 at the Supabase RPC boundary

Design spec for `BL-ADMIN-LOADER-CI-TRANSIENT`. Closes the row's first scheduled step, the threshold
decision, and specifies the repair it selects.

Evidence base: [`docs/superpowers/specs/ci/probes/2026-08-24-admin-loader-502-clustering.md`](./probes/2026-08-24-admin-loader-502-clustering.md).
Every measurement quoted below is sourced there and is not restated with fresh numbers here.

## 1. The problem, as measured rather than as filed

A required check on `main` (`app-e2e`) reds transiently, and the red is indistinguishable from a spec
defect. The ledger row's occurrence list is its count, and that list is the incident record. On
2026-08-24 the class nearly cost a shipped batch member and burned hours of AC-3 re-rolling.

The row reads the fault as an admin-loader fault, because every occurrence quotes
`AdminInfraError: requireAdmin: is_admin RPC failed: An invalid response was received from the upstream server`.
The evidence pass says that reading is too narrow in four ways (probe §Finding 1 through §Finding 4):

1. `ADMIN_SESSION_LOOKUP_FAILED` is dominated by deliberate `test-forced infra fail` throws from
   `lib/auth/requireAdmin.ts` (search `maybeForceTestInfraFail`), so the code matches healthy runs.
   The discriminating string is Kong's 502 body, `An invalid response was received from the upstream server`.
2. A genuine 502 is background, not an event. Most sampled jobs carry one, and jobs carrying a
   gate-level one are more often green than red.
3. The admin gate takes under a third of the events. The rest land on `viewer_version_token`,
   `get_admin_show_review_snapshot` and `admin_read_share_token`, which degrade rather than throw.
4. Every measured event landed on a `supabase.rpc()` POST and none on a `.from()` GET, against a
   call-site population where GETs lead.

What decides whether a run reds is not whether a 502 happened. It is whether an assertion was watching
the request it landed on.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratified at |
| --- | --- |
| The occurrence list on the row IS its count. This spec appends no occurrences and restates no total. | `BACKLOG.md`, search `the list is the count` |
| The per-spec red counter advances only on a red that REPRODUCES on the same bytes. | `BACKLOG.md`, search `RATIFIED 2026-08-24` |
| `notify-toggles` is not dropped: it is a member of batch 1 wired on `main`, and AC-4 names artifacts a wiring arc does not own. | `BACKLOG.md`, search `AC-4 removes _a member_` |
| `admin-parse-panel`, `warning-panel-polish`, `telemetry-layout`, `published-show-attention` stay dropped for batch 2; restoration is batch 3's first question. | `BACKLOG.md`, search `stay dropped for batch 2` |
| Option (b), a targeted wait on the server-action settle, is dead by measurement, not by preference. | probe §Finding 6 |
| The `x-test-force-infra-fail` hook is deliberate test-only machinery and is not a defect. | `lib/auth/requireAdmin.ts`, search `maybeForceTestInfraFail` |
| This spec does not diagnose why the gateway resets the connection. It absorbs the fault and instruments the next occurrence so the cause becomes observable. | §7, §9 |
| Volatility alone is NOT the answer to the double-execution axis. It is one of two arms, and the reason is a probe, not a preference. Round 1 raised this and the spec had already reached the same place independently. | §4 |
| On exhaustion the wrapper replays the FIRST attempt's outcome, so the caller-visible failure is what it is today. This is the answer to the mixed-failure axis, not an omission of it. | §3.4 |

## 2. Convergence criterion for review of this spec

- **Consequence bound.** Every request either completes, or fails exactly as it fails today, or is
  retried under §4's two-arm rule. No request is retried whose function can reach a write. A retry that
  exhausts its attempts and replays the first attempt's failure is correct behavior, not a finding.
- **Probe domain.** The recorded failing runs listed on the row, the live `app-e2e` workflow, and the
  call paths in §3.1. A probe drawn from outside that set, or from a hypothetical gateway that behaves
  unlike the measured one, files to §9 rather than to a round.
- **Threat fence.** Environment transients on the CI runner and the equivalent transient in production.
  Adversarial traffic, a hostile gateway, and a compromised database are out of scope.

## 3. The repair

### 3.1 One factory, one place

All six measured consumers construct their client through `createSupabaseServerClient()`
(`lib/supabase/server.ts`, search `export async function createSupabaseServerClient`):

| consumer | file, searchable anchor |
| --- | --- |
| `is_session_live`, `is_admin` | `lib/auth/requireAdmin.ts`, search `supabase.rpc("is_admin")` |
| `is_session_live`, `is_developer` | `lib/auth/requireDeveloper.ts`, search `supabase.rpc("is_developer")` |
| `get_admin_show_review_snapshot` | `lib/admin/readShowReviewSnapshot.ts`, search `get_admin_show_review_snapshot` |
| `admin_read_share_token` | `lib/data/loadShowShareToken.ts`, search `admin_read_share_token` |
| `viewer_version_token` | `app/admin/_showReviewModal.tsx`, search `readBridgeVersionToken` |

So the repair lands in that one factory and covers the whole measured population without touching a
single call site. The class-sweep default (repair every instance of one shape in the same PR) is met by
construction rather than by enumeration, and the derived membership is eight rather than these six
(§4.4, §9).

### 3.2 Mechanism, verified rather than assumed

`createSupabaseServerClient()` passes a `global.fetch` to `createServerClient`. supabase-js 2.105.1
declares an optional custom `fetch` under `global` on `SupabaseClientOptions` (`src/lib/types.ts, line
140`), and ssr 0.10.2 spreads `options.global` through untouched while adding only headers
(`dist/main/createServerClient.js, lines 19-22`).

A probe against those installed packages settles what the design rests on, so none of it is inference:

```
custom fetch invoked: 2 times
    POST /rest/v1/rpc/is_admin
    GET  /rest/v1/shows?select=id&limit=1
rpc  -> error: An invalid response was received from the upstream server
from -> error: null
```

Three things at once. The hook point is reached for BOTH call shapes. `.rpc()` is a POST whose path
carries the function name exactly where §4's rule needs it. And a Kong 502 reaches the caller as a
RETURNED error whose message is byte-equal to the string the evidence pass grepped out of the runner
logs, which makes the measured class and the intercepted class one claim rather than two.

The wrapper retries a request when ALL of the following hold:

1. The response status is in `RETRYABLE_STATUSES`, OR the underlying `fetch` rejected.
2. The request is retry-eligible per §4.
3. Attempts so far are under `MAX_SUPABASE_RETRIES`.

Everything else is returned or rethrown exactly as it is today. The wrapper never reads a body, never
converts a status into a different one, and never swallows a rejection.

### 3.3 The `/rpc/` path segment is load-bearing

A full method census over the client's call shapes, with a stub fetch:

| call | request | eligible |
| --- | --- | --- |
| `.rpc("is_admin")` | `POST /rest/v1/rpc/is_admin` | yes, per §4 |
| `.rpc("rotate_show_share_token")` | `POST /rest/v1/rpc/rotate_show_share_token` | no, VOLATILE |
| `.from().select()` | `GET /rest/v1/shows?...` | yes, non-RPC GET |
| `.from().insert()` | `POST /rest/v1/shows` | no |
| `.from().update()` | `PATCH /rest/v1/shows?...` | no |
| `.from().delete()` | `DELETE /rest/v1/shows?...` | no |
| `auth.signInWithPassword` | `POST /auth/v1/token?grant_type=password` | no |

An insert is a POST to `/rest/v1/<table>`: the same method as an RPC, one segment shallower. So the
rule matches the full `/rest/v1/rpc/<fn>` shape and never a trailing segment, because a rule keyed on
the last segment would retry an insert into any table sharing a name with a retryable function. The
plan pins that case by name.

### 3.4 On exhaustion, replay the FIRST attempt

A retry loop that surfaces the LAST attempt can change the caller-visible failure CATEGORY, because
the attempts need not fail the same way. A 502 followed by a transport rejection would hand the caller
a throw where it sees a returned error today; a rejection followed by a 502 does the reverse.

That distinction is load-bearing at every consumer. Each one branches on it and emits a different
forensic code:

```
lib/auth/requireAdmin.ts:232          requireAdmin: session/admin RPC threw
lib/auth/requireAdmin.ts:248          requireAdmin: is_session_live RPC failed
lib/auth/requireDeveloper.ts:185      requireDeveloper: session/developer RPC threw
lib/auth/requireDeveloper.ts:195      requireDeveloper: is_session_live RPC failed
lib/admin/readShowReviewSnapshot.ts:67  show review snapshot read failed
lib/admin/readShowReviewSnapshot.ts:78  show review snapshot read threw
lib/data/loadShowShareToken.ts:25     admin_read_share_token threw
lib/data/loadShowShareToken.ts:30     admin_read_share_token returned error
app/admin/_showReviewModal.tsx:144    viewer version token read failed
app/admin/_showReviewModal.tsx:159    viewer version token read threw
```

**The rule: when every attempt fails, the wrapper reproduces the FIRST attempt's outcome.** A first
attempt that returned a response returns that same response object, unread; a first attempt that
rejected rethrows that same error. The failure path is therefore byte-identical to today's, whatever
the later attempts did, and §5's invariant-9 claim becomes provable rather than asserted: with retries
exhausted, the wrapper is a no-op.

This also fixes the direction of the guarantee. The question is not which failure is the most
informative one. It is which failure the caller would have seen without this change, and only the
first attempt answers that.

### 3.5 Numbers, single-sourced, in the shape this codebase already uses

The wrapper follows `withDriveRetry` (`lib/drive/fetch.ts`, search
`export async function withDriveRetry`) rather than inventing a second retry shape: a named
max-retries constant, exponential backoff with jitter, and `sleep` and `random` injectable through an
options object so tests are deterministic and no test sleeps.

The constants live in ONE exported declaration in the wrapper module, and every other mention in this
document refers to them by name rather than repeating a literal:

- `MAX_SUPABASE_RETRIES` — retries after the first attempt.
- `RETRYABLE_STATUSES` — the status set from §3.2 clause 1.
- the backoff schedule, computed from the attempt number in the `withDriveRetry` form.

`requireAdmin` resolves `is_session_live` and `is_admin` in PARALLEL on every admin render, so the
worst-case added latency lands on a user-visible page rather than on a background path. The plan
states that worst case as a number derived from the constants, against the gate's own budget and
against the workflow's `timeout-minutes` (`.github/workflows/app-e2e.yml`, search `timeout-minutes`).

## 4. The double-execution axis, and what actually answers it

A 502 does not prove the request failed to reach Postgres. The gateway reports that the upstream
connection did not produce a valid response, which is also what a committed write with a lost response
looks like. Retrying a mutation on a 502 is therefore double execution, and double execution is the
silent-wrong direction: no error, wrong data.

The repair does not assert idempotency. It takes it from the database, in two arms, because the first
arm alone is not enough and a probe is what established that.

### 4.1 Arm one: Postgres refuses DIRECT writes in a non-VOLATILE function

```
create function _probe_stable_write() returns void language plpgsql stable as $$
  begin insert into _probe_t values (1); end $$;
select _probe_stable_write();
ERROR:  INSERT is not allowed in a non-volatile function
CONTEXT:  SQL statement "insert into _probe_t values (1)"
```

Every member of the derived set (§4.4) is declared `STABLE` in the live catalog
(`pg_proc.provolatile`).

### 4.2 Arm one is NOT sufficient, and the probe says so

The refusal covers the function's own statements. It does not survive a volatile callee:

```
create function _probe_vol() returns void language plpgsql volatile as $$
  begin insert into _probe_t values (1); end $$;
create function _probe_stable_calls_vol() returns void language plpgsql stable as $$
  begin perform _probe_vol(); end $$;
select _probe_stable_calls_vol();
select count(*) from _probe_t;   -->  1
```

A `STABLE` function committed a row. So non-`VOLATILE` is NECESSARY and not sufficient, and a design
resting on it alone would have shipped the exact hazard this section exists to close. Volatility is a
promise to the planner, not an enforcement boundary.

**This defeats an unconditional GET clause too.** PostgREST serves `GET /rest/v1/rpc/<fn>` for
non-volatile functions, so an RPC reached by GET can delegate to a volatile writer by the same escape.
HTTP idempotency is a statement about the method, and the method is not what decides this. RPC GETs are
therefore held to the same eligibility rule as RPC POSTs; only non-RPC GETs are retried on the method
alone.

### 4.3 Arm two: a READ ONLY transaction, which Postgres enforces at any depth

```
begin;
set transaction read only;
select _probe_stable_calls_vol();
ERROR:  cannot execute INSERT in a read-only transaction
CONTEXT:  SQL statement "insert into _probe_t values (1)"
         PL/pgSQL function _probe_vol() line 1 at SQL statement
         SQL statement "SELECT _probe_vol()"
         PL/pgSQL function _probe_stable_calls_vol() line 1 at PERFORM
```

The error names the whole call chain, which is the point: read-only is checked where the write is
attempted, not where the function is declared. There is no spelling to beat and no nesting depth that
escapes it.

A static call-graph arm was considered and declined on evidence rather than taste. `pg_depend` records
ZERO function-to-function dependencies for these functions and `prosqlbody` is NULL, so their callees
were never parsed into the catalog; a static arm would have to parse function bodies itself, which is
the recognizer-growth direction the round-economy rules refuse. The dynamic arm is not a weaker
substitute for a static check. It is the only arm the database can actually back.

**The rule: a request to `/rest/v1/rpc/<fn>`, by any method, is retry-eligible only when `<fn>` is in
`RETRYABLE_RPCS`. A name may be in `RETRYABLE_RPCS` only if the live catalog reports it non-`VOLATILE`
AND it executes to completion inside a `READ ONLY` transaction with representative arguments.** A
non-RPC GET is retry-eligible by method. Everything else, including every `.insert()`, `.update()`,
`.delete()`, every volatile RPC, and every `/auth/v1/*` request, is never retried.

### 4.4 The set is checked in both directions, and derived rather than trusted

A meta-test at `tests/supabase/_metaRetryableRpcVolatility.test.ts (new file)` reads the live catalog
and asserts:

- **Safety.** Every name in `RETRYABLE_RPCS` is non-`VOLATILE` AND completes inside a `READ ONLY`
  transaction. This is the direction that prevents double execution, so a name that cannot be resolved
  in the catalog FAILS rather than being skipped.
- **Completeness.** Every `.rpc("<name>")` call in a file that imports `createSupabaseServerClient`,
  whose function the catalog reports as non-`VOLATILE`, is in `RETRYABLE_RPCS`. Discovery walks the
  filesystem, so a call site added later is covered by default rather than silently exempt.

Discovery PARSES rather than line-greps. A shell grep for `.rpc("` over these files produced a phantom
function name by running two lines together, which is the failure this clause exists to prevent.

Both arms carry an executable premise (`tests/_shared/premise.ts`, search `export function premise`):
the catalog query must return rows and the walk must find call sites. A test that passes because it
found nothing is the failure mode this guard exists to prevent.

Two considered alternatives, rejected and fenced:

- **Retry everything at the fetch layer.** Covers the population in fewer lines and reintroduces the
  double-execution hazard the axis is about.
- **Reissue read RPCs as GET** (`.rpc(fn, args, { get: true })`), letting PostgREST enforce
  non-volatility by returning 405. Rejected on three grounds: it moves arguments into a URL, it changes
  these requests into a shape a framework fetch cache may treat as cacheable (for `is_admin` an
  authorization hazard, not a performance question), and per §4.2 the 405 gate is the same
  necessary-not-sufficient check.

## 5. Invariant 9

The wrapper sits below every Supabase call boundary and changes no boundary's contract. Callers still
destructure `{ data, error }`, and by §3.4 a fully-failed request surfaces exactly the outcome it
surfaces today, so returned and thrown errors stay distinguishable by construction rather than by
promise.

The plan verifies this rather than asserting it: the existing contract suites
(`tests/auth/_metaInfraContract.test.ts`, `tests/admin/_metaInfraContract.test.ts`) must pass
unmodified, and AC-2 exercises the mixed sequences those suites do not cover.

## 6. A retry is never silent

Each retry emits `log.warn` with `code: "SUPABASE_UPSTREAM_RETRY"`, plus the function name, the
status, and the attempt number. Never a body, never arguments, never a token.

This is a forensic log code, not a user-visible one. It does not enter master spec §12.4; it needs no
catalog row. The sibling forensic code `ADMIN_SHOW_VERSION_TOKEN_READ_FAILED` appears in neither
`lib/messages/catalog.ts` nor the master spec, verified by grep at authoring time.

The emit is also what §7 triggers on, which is what makes the instrument reach the green path.

### 6.1 The emit cannot re-enter the wrapper

`lib/log/persist.ts` writes log records to Supabase, so an emit on every retry raises the obvious
question: what happens when the sink's own write is the thing that 502s? It cannot recurse, on two
independent grounds, and both are worth pinning because both are side effects of decisions taken for
other reasons.

First, the sink constructs `createSupabaseServiceRoleClient` (`lib/log/persist.ts`, search
`createSupabaseServiceRoleClient`), and the wrapper is installed only in `createSupabaseServerClient`
(§3.1). Second, the sink's write is `.from("app_events").insert(...)`, a POST outside `/rest/v1/rpc/`,
which §3.3's rule refuses on its own.

The §9 limit excluding the service-role client is therefore load-bearing rather than merely
conservative: widening the wrapper to that client re-opens the recursion. The plan carries a test that
a retry's own emit cannot re-enter the wrapper.

## 7. Making the next occurrence attributable

The runs capture nothing from inside the containers, so today's mechanism is inferred from the app's
own logs. `.github/workflows/app-e2e.yml` gains a step that dumps, for the Supabase containers, the
gateway and PostgREST logs plus each container's restart count and `OOMKilled` state, uploaded with the
existing artifact.

**It does not run only on failure, and that is the whole point.** Most 502-bearing jobs are already
green (probe §Finding 2), and a working retry moves still more occurrences onto the green path, so an
`if: failure()` trigger would go dark exactly as the repair starts working. The step runs when the run
FAILED **or** when the run's own output carries a `SUPABASE_UPSTREAM_RETRY` emit. A green run that
absorbed a 502 is the most informative artifact this class has ever produced, and it is precisely the
one a failure-only trigger discards.

A run with neither condition uploads nothing and pays nothing.

Verified commands, against a live local stack:

```
docker inspect --format 'status={{.State.Status}} oomkilled={{.State.OOMKilled}} restarts={{.RestartCount}}' <container>
docker logs --tail <n> <container>
```

`supabase_rest_*` runs with NO healthcheck, unlike every sibling in the stack, so a PostgREST restart
leaves no health transition anywhere and `RestartCount` is the only signal. PostgREST's own log carries
timestamped schema-cache lines, so a reload coinciding with the 502 window is visible on the first
captured run rather than after another inference round.

## 8. Acceptance

- **AC-1. The recorded fault is absorbed.** With the wrapper installed and a stub fetch returning 502
  then 200, `requireAdmin` resolves normally. With `MAX_SUPABASE_RETRIES` at zero, the same stub still
  throws `AdminInfraError`. The second half is what makes the first non-tautological.
- **AC-2. The caller-visible failure category never moves (§3.4).** All four exhausted two-attempt
  sequences are exercised against a consumer that branches on the distinction: 502 then 502, 502 then
  reject, reject then 502, reject then reject. In every case the consumer emits the code it emits today
  with no wrapper installed, and the assertion is against that code, not against the wrapper's internals.
- **AC-3. A request that can reach a write is never retried.** A stub returning 502 for `.insert()`,
  `.update()`, `.delete()`, a VOLATILE RPC by POST, a VOLATILE RPC by GET, and an `/auth/v1/token` POST
  is called exactly once in each case. Includes an insert into a table named after a retryable function
  (§3.3).
- **AC-4. The volatility guard holds in both directions, with its premises live (§4.4).** Includes a
  planted case: a name added to `RETRYABLE_RPCS` whose function is VOLATILE fails the safety arm, and a
  non-VOLATILE call site absent from the set fails the completeness arm.
- **AC-5. The absorption is demonstrated on the real runner, deterministically.** A CI-only forced
  upstream fault on the admin gate, gated exactly as `x-test-force-infra-fail` is
  (`ENABLE_TEST_AUTH` plus the Bearer secret, so it cannot fire in production), makes the runner
  produce the recorded mechanism on demand: the page renders, and the run carries a
  `SUPABASE_UPSTREAM_RETRY` emit. This replaces waiting for a natural occurrence, which is not a
  reproducer and cannot be scheduled.
- **AC-6. No new flake class.** Five consecutive green `app-e2e` runs on the PR, stated in advance.
  These are a REGRESSION check, not the evidence for AC-5: at the measured red rate five greens are
  close to a coin flip, which is exactly why AC-5 is deterministic and this criterion is not asked to
  carry proof it cannot bear. The executed-count oracle (`scripts/check-app-e2e-executed.mjs`) is
  unchanged and green. A natural `SUPABASE_UPSTREAM_RETRY` emit during these runs is recorded when it
  appears and is NOT required; its absence is not evidence either way and blocks nothing.
- **AC-7. Invariant 9 suites pass unmodified** (`tests/auth/_metaInfraContract.test.ts`,
  `tests/admin/_metaInfraContract.test.ts`).

## 9. Documented limits

- **The cause of the connection reset is not diagnosed.** This spec absorbs the fault and instruments
  it (§7). If the dump later shows a container restart, that is a different repair on a different row.
- **A 502 that outlasts the retry budget still reds.** The budget is bounded on purpose; an outage is
  supposed to surface, and by §3.4 it surfaces exactly as it does today.
- **Read-only execution proves it for the arguments exercised.** §4.3's arm runs each member inside a
  READ ONLY transaction with representative arguments. A write reachable only on an unexercised branch
  of a non-VOLATILE function with a volatile callee is covered by neither arm. All eight current members
  are `sql`-language functions with select-only bodies, verified at authoring time, so the residual is a
  future-membership risk rather than a live one.
- **The set is eight, not the six that were observed.** The derived sweep over files importing
  `createSupabaseServerClient`, classified against `pg_proc.provolatile`, returns eight non-VOLATILE
  names: the six measured consumers plus `auth_email_canonical`
  (`lib/auth/picker/resolvePickerSelection.ts`) and `my_share_tokens_for_email`
  (`lib/data/listShowsForCrew.ts`). Same shape, same PR, per the class-sweep default. Thirteen VOLATILE
  names on the same clients are excluded by the rule and stay excluded.
- **Non-RPC GET retry is unmeasured.** No measured event landed on a GET (probe §Finding 4). Non-RPC
  GETs are retried because HTTP's idempotency contract makes it safe for a table read, not because
  evidence asked for it, and no claim in this spec rests on it.
- **Call-site counts are not request counts.** The population figures in the probe count call sites. A
  `.from()` fault that no consumer logs would be invisible to that grep.
- **The wrapper is scoped to `createSupabaseServerClient`.** An RPC reached through the service-role or
  browser client is out of scope. This is not only a scoping preference: §6.1's recursion fence depends
  on it.
- **Revocation latency moves by at most the backoff budget.** `is_session_live` exists so a revoked
  session is cut off immediately rather than TTL-bounded (`lib/auth/requireAdmin.ts`, search
  `is_session_live`). On a 502 the retry delays that detection by at most the backoff budget from §3.5,
  and only for a request that was going to fail outright otherwise.
- **`viewer_version_token` fails OPEN by design.** Its consumer logs a forensic code and renders
  without the bridge (`app/admin/_showReviewModal.tsx`, search `readBridgeVersionToken`). Retrying
  delays reaching that fail-open path by the backoff budget; it does not change the posture.

## 10. Out of scope

Restoring the four members dropped from batch 2 (batch 3's question, §1.1). Changing AC-3's five-green
bar or the batch-1 drop threshold. Promoting `app-e2e` into the required set on `main`. Any change to
the `x-test-force-infra-fail` hook's existing behavior. Diagnosing
`BL-CHANGES-FEED-MODAL-BATCH-FLAKE` beyond noting it is the same fault family.
