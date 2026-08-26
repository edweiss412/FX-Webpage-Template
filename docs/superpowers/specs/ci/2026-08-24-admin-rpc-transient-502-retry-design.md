<!-- spec-lint: not-ui — no UI surface: the change touches lib/supabase, a new meta-test, and a CI workflow step. The app/ path cited below is a consumer census subject, not a deliverable. impeccable-gate: N/A — no UI surface. -->

# Absorbing the transient upstream 502 at the Supabase RPC boundary

Design spec for `BL-ADMIN-LOADER-CI-TRANSIENT`. Closes the row's first scheduled step, the threshold
decision, and specifies the repair it selects.

Evidence base: [`docs/superpowers/specs/ci/probes/2026-08-24-admin-loader-502-clustering.md`](./probes/2026-08-24-admin-loader-502-clustering.md).
Every measurement quoted below is sourced there and is not restated with fresh numbers here.

## 1. The problem, as measured rather than as filed

A required check on `main` (`app-e2e`) reds transiently, and the red is indistinguishable from a spec
defect. The ledger row's occurrence list is its count, and that list is the incident record. On
2026-08-24 the class nearly cost a shipped batch member and burned hours of re-rolling batch 2's AC-3 five-green loop.

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
| `notify-toggles` is not dropped: it is a member of batch 1 wired on `main`, and batch 2's AC-4 names artifacts a wiring arc does not own. | `BACKLOG.md`, search `AC-4 removes _a member_` |
| `admin-parse-panel`, `warning-panel-polish`, `telemetry-layout`, `published-show-attention` stay dropped for batch 2; restoration is batch 3's first question. | `BACKLOG.md`, search `stay dropped for batch 2` |
| Option (b), a targeted wait on the server-action settle, is dead by measurement, not by preference. | probe §Finding 6 |
| The `x-test-force-infra-fail` hook is deliberate test-only machinery and is not a defect. | `lib/auth/requireAdmin.ts`, search `maybeForceTestInfraFail` |
| This spec does not diagnose why the gateway resets the connection. It absorbs the fault and instruments the next occurrence so the cause becomes observable. | §7, §9 |
| Volatility alone is NOT the answer to the double-execution axis. It is one of two arms, and the reason is a probe, not a preference. Round 1 raised this and the spec had already reached the same place independently. | §4 |
| On exhaustion the wrapper replays the FIRST attempt's outcome, so the caller-visible failure is what it is today. This is the answer to the mixed-failure axis, not an omission of it. | §3.4 |
| Discovery matches string literals against the catalog's non-`VOLATILE` set; it does not recognize call sites. Two call-site rules failed one round apart. | §4.4 |
| Attribution is DESCOPED to `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY`. Three trigger designs each drew the next round's finding; the retry was cleared in round 4 and untouched since. | §7 |

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
construction rather than by enumeration. These six are what the evidence pass MEASURED; the derived
membership is thirteen (§4.4, §9), and the gap between those two numbers is the class sweep doing its
job rather than a discrepancy.

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

**The status set needs no measured population of its own, and the reason is structural.** Only 502 was
observed, so retrying 503 and 504 looks like the same unmeasured guess the GET clause is fenced as.
It is not: §4 already restricts every retryable request to a function the database has proven cannot
write, so a retry can only ever RE-EXECUTE A PROVEN READ, whatever status triggered it. That makes the
status set a latency decision bounded by §3.5's budget rather than a safety one. 504 is the case that
makes this worth stating: retrying a timeout is normally the dangerous one, because the original
request may still be running. Here what may still be running is a read.

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
- **Completeness.** Every string literal in the tree that matches a name the catalog reports as
  non-`VOLATILE` is EITHER in `RETRYABLE_RPCS` or in an explicit exclusion list carrying a reason.
  Discovery walks the filesystem repo-wide, so a name added later is covered by default rather than
  silently exempt.

**Discovery matches literals against the catalog; it does not recognize call sites.** Two attempts at
a call-site rule failed, one round apart, and the second is why this arm no longer tries.

Round 2 killed import scoping: the client travels as a value, so `listShowsForCrew`'s parameter-passed
client is invisible to an import-scoped walk (`lib/data/listShowsForCrew.ts`, search
`export async function listShowsForCrew`), while that same file names the factory in COMMENTS and so
matches a text scan. Under-inclusive and over-inclusive at once.

Keying on `.rpc("<name>")` fails one indirection further out. `lib/showLifecycle/_shared.ts` (search
`export const defaultRpc`) calls `supabase.rpc(fn, args)` with the name as a PARAMETER, and the names
arrive at a different call shape entirely (`lib/showLifecycle/archiveShow.ts`, search
`callLifecycleRpc`). Those four names are VOLATILE, so today's retry set is unaffected and the runtime
rule still decides correctly from the URL. But a future non-`VOLATILE` RPC through that helper would
be invisible to a `.rpc(`-keyed walk, which is round 2's failure shape repeated at a longer range.

So the arm stops recognizing the call and matches against a finite external list instead. The catalog
decides which names matter; the walk only has to find a MENTION of one. Over-inclusion is safe by
construction: a spurious match forces a name into "in the set or excluded with a reason" and can never
cause a retry on its own, so the arm's errors all point at more scrutiny rather than less.

This is the same move the volatility arm already makes, and it is deliberately not a smarter parser.
Each previous rule was a recognizer, and each round widened it; this one cannot be widened, because it
recognizes nothing.

**Documented limit, narrow and stated:** a name assembled by concatenation, or read from data at
runtime, is reachable by neither the catalog match nor any call-site rule. No such construction exists
in the tree today, and adding one would need a deliberate edit that this limit names in advance.

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

The emit is a SECONDARY signal for §7, not its trigger: it tells a reader of the artifact whether the
fault was absorbed. It is not an attribution mechanism: an emit exists only where the wrapper runs,
and the fault also occurs where it does not, which is one of the reasons attribution is descoped (§7).

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

## 7. Attribution is a separate subject, and it leaves this spec

The runs capture nothing from inside the containers, so the mechanism behind the reset is inferred
rather than observed. Three drafts of this section tried to fix that here, and all three were wrong in
a different way: keying on the retry emit missed every client the wrapper does not cover, keying on
the fault string missed every fault a retry absorbed, and the transport observer that replaced both
re-opened a recursion fence this same spec had written down one round earlier.

The pattern is the argument. Across review rounds 3, 4 and 5 this section drew twelve of eighteen
findings while the retry itself — §3.4's replay rule, §4's two-arm volatility rule, §3.2's status set,
AC-5's determinism — was cleared in round 4 and untouched in round 5. Each redesign introduced the next
round's defect, which is the spec-side three-round trigger for a design vector: stop patching prose,
and descope, prototype, or mark unratified.

**So attribution is descoped and filed as `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY`.** It is a
different subject from this row: the retry is a repair, attribution is diagnosis. It wants its own
evidence, its own acceptance, and its own review, and it will be strictly better specified after an arc
of its own than after a sixth round grafted onto this one.

The row carries what this arc learned, so none of it is re-derived: the log-LEVEL recursion fence
(`debug` cannot persist, by the `app_events` level CHECK), the capture mechanics (`pipefail` under
`shell: bash`, `2>&1` before the pipe, `if: always()`, an `id:`, and the arm that a planted failing run
must still red the job), the four transport states an observer must be planted against, and the walked
meta-test that makes a newly added bypassing client fail by default.

### 7.1 What still ships here, and what it does NOT claim

Four call boundaries drop an infra fault's message today: `lib/admin/loadAlertSummary.ts` and
`lib/admin/loadTelemetryStats.ts` log a code without the message, `lib/admin/loadRecentAutoApplied.ts`
returns the message inside `infra_error` and never logs it, and
`app/api/show/[slug]/version/route.ts` discards `error.message` and returns a bare 500.

Those four repairs stay in this PR. **They are invariant-9 defect repairs, not attribution coverage,
and the distinction is the whole reason they can ship here.** An infra fault that arrives and loses its
message is a defect on its own terms, at that boundary, whether or not any instrument ever reads it.
That claim is local and checkable.

What they explicitly do NOT claim is completeness. They are not a table of "every path where a 502 goes
unrecorded", and this spec makes no such enumeration: round 5 demonstrated that the class is larger
than any list drawn from the retry population, since it includes VOLATILE RPCs and plain table reads.
Framing these four as attribution coverage would re-import exactly the completeness question the
descope exists to shed, and would invite the same finding a sixth time.

The total solution is the filed row's job. Until it lands, faults on paths outside these four stay
dark, and §9 says so rather than leaving it implied.

## 8. Acceptance

- **AC-1. The recorded fault is absorbed.** With the wrapper installed and a stub fetch returning 502
  then 200, `requireAdmin` resolves normally. With `MAX_SUPABASE_RETRIES` at zero, the same stub still
  throws `AdminInfraError`. The second half is what makes the first non-tautological.

  **How this is discharged, recorded so a reviewer does not re-derive it.** No single test drives
  `requireAdmin` over a stubbed transport, and one was deliberately NOT written: reaching the gate
  that way means satisfying supabase-js's auth plumbing through a `fetch` stub, and the attempt
  produced a `NEXT_REDIRECT` rather than a gate decision — a test that fragile would pin the auth
  mock, not the retry. The claim is discharged by three pinned links plus the runner:

  1. `supabase.rpc("is_admin")` through the REAL wrapped client absorbs a 502 and the caller sees
     only the success (`tests/supabase/serverClientWiring.test.ts`).
  2. On exhaustion the consumer receives the FIRST attempt's error, not the last
     (`tests/supabase/retryingFetch.failureMode.test.ts`, all four sequences).
  3. A gate RPC returning `{ error }` makes `requireAdmin` throw `AdminInfraError`
     (`tests/auth/requireAdmin-infra-boundary.test.ts:52`, which predates this arc).
  4. AC-5 exercises the whole chain on the real runner, which is stronger evidence than any mock
     for the absorbing half — and cannot provide the negative half, since a runner has no switch
     to turn the retry off. That is what links 2 and 3 supply.
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
  produce the recorded mechanism on demand. This replaces waiting for a natural occurrence, which is
  not a reproducer and cannot be scheduled.

  **AMENDED 2026-08-25, on evidence, and the original wording is kept here because it was
  disproved rather than improved.** This AC first read "the page renders, and the run carries a
  `SUPABASE_UPSTREAM_RETRY` emit". Green run
  [32804414458](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32804414458) shows why
  that cannot settle it: the job carries NINE such emits and three are provably outside the forced
  test's window (two at 03:23:46 during `admin-changes-feed-layout`, one at 03:24:04 during
  `dev-capture`). A grep for the code is satisfied by background faults alone, so it would pass with
  the injector never firing — presence is not attribution.

  The criterion is now page-observable and attributable to the forced request: **forced faults are
  absorbed and the admin page renders, and a fault that outlasts the budget reaches the recorded
  failure surface** (`admin-layout-infra-error`, the layout's own catch of `AdminInfraError`).
  Absorbed or signaled, both halves observed through the page.

  It deliberately makes NO claim about the number of retries. The forced-fault injector's counter
  belongs to the CLIENT and is shared by every request that client issues, and the admin layout
  issues three in one `Promise.all`, so a per-request budget cannot be read from a page-level count
  (run 32806860141). `MAX_SUPABASE_RETRIES` is pinned in `tests/supabase/retryingFetch.test.ts`,
  with injected timers and exact call counts, which is where a count of that kind can be exact.
- **AC-6. No new flake class.** Five consecutive green `app-e2e` runs on the PR, stated in advance.
  These are a REGRESSION check, not the evidence for AC-5: at the measured red rate five greens are
  close to a coin flip, which is exactly why AC-5 is deterministic and this criterion is not asked to
  carry proof it cannot bear. The executed-count oracle (`scripts/check-app-e2e-executed.mjs`) is
  unchanged and green. A natural `SUPABASE_UPSTREAM_RETRY` emit during these runs is recorded when it
  appears and is NOT required; its absence is not evidence either way and blocks nothing.
- **AC-7. The four boundaries in §7.1 no longer drop the fault's message.** Executable per boundary
  with a stubbed client returning an upstream 502: the emitted log line contains the error message,
  and for the version route a log line exists at all. Scoped to those four by name; this AC asserts a
  local repair and makes no claim about any other path.
- **AC-8. Invariant 9 suites pass unmodified** (`tests/auth/_metaInfraContract.test.ts`,
  `tests/admin/_metaInfraContract.test.ts`).

## 9. Documented limits

- **The cause of the connection reset is not diagnosed, and this spec no longer tries.** It absorbs
  the fault; attribution is descoped to `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` (§7).

- **Faults outside §7.1's four boundaries stay dark until that row lands — but the dark set is
  SMALLER than this limit originally claimed, and the correction is measured.** As first written this
  said a 502 that a consumer swallows, on any path other than those four, "produces no record". That
  was true of the design it described; it is not true of what shipped. The transport emit (§6) fires
  on the wrapper itself, so ANY retried request leaves a `SUPABASE_UPSTREAM_RETRY` record naming the
  function, whatever its consumer does with the error. The probe record's addendum is the evidence:
  the first green run carrying the emit attributed background faults on `readfinalizeowned_b2`,
  `viewer_version_token` and plain table reads — none of which is one of the four boundaries, and none
  of which any consumer logged.

  What genuinely stays dark, stated as the residue rather than the whole class: a fault on a request
  the eligibility rule REFUSES (a write, or a `VOLATILE` RPC such as `get_bell_feed_rows` in
  `lib/admin/bellFeed.ts`) never reaches a retry and so never emits; and any client the wrapper does
  not cover — the service-role client (§6.1's recursion fence) and the browser client — is outside it
  entirely. Round 5 established that the swallowing class is larger than any list drawn from the retry
  population, and this spec still declines to enumerate it, because three rounds showed enumeration is
  the wrong shape for the question. The retry works on every path it covers; what is missing is the
  record on the paths it deliberately does not.
- **The per-attempt stall guard bounds the HEADER phase, not the body read.** The wrapper must return
  its `Response` for the caller to consume, so its timer is cleared when `fetch()` resolves. If headers
  arrive and the body then stalls, that read is unbounded and no retry fires. Bounding it would mean
  buffering the body and returning a reconstructed response, changing what every caller receives on a
  path whose measured fault is a 502 STATUS with no body stall ever observed. The sibling
  (`lib/drive/fetch.ts`) does not face this because it OWNS the body read and awaits it before clearing
  its own timer. Recorded rather than fixed, deliberately.

- **A 502 that outlasts the retry budget still reds.** The budget is bounded on purpose; an outage is
  supposed to surface, and by §3.4 it surfaces exactly as it does today.
- **Read-only execution proves it for the arguments exercised.** §4.3's arm runs each member inside a
  READ ONLY transaction with representative arguments. A write reachable only on an unexercised branch
  of a non-VOLATILE function with a volatile callee is covered by neither arm.

  Twelve of the thirteen members are `sql`-language functions with select-only bodies.
  `readfinalizeowned_b2` is `plpgsql`, which is the language the §4.2 escape is written in, so for
  that member the READ ONLY arm is load-bearing rather than belt-and-braces. An earlier draft of this
  section claimed every member was `sql`-language; that claim was false and is the reason this
  paragraph now states the split instead of a blanket.

- **The population is thirteen, out of forty-five runtime RPC names.** The count's scope is stated
  because round 3 found the earlier one unreproducible: 41 distinct names appear as literals in
  `.rpc("<name>")` across `app`, `components`, `lib`, `scripts` and `supabase`, and resolving the one
  computed call (`lib/showLifecycle/_shared.ts`, search `export const defaultRpc`) adds the four
  lifecycle names, giving 45 runtime names. An earlier draft said 46, having counted a test-only name.

  The catalog reports thirteen of the 45 as non-`VOLATILE`: `admin_alert_summary`,
  `admin_event_stats_24h`, `admin_read_share_token`, `auth_email_canonical`,
  `get_admin_show_review_snapshot`, `is_admin`, `is_developer`, `is_session_live`,
  `my_share_tokens_for_email`, `readfinalizeowned_b2`, `resolve_show_by_slug_and_token`,
  `roster_shift_counts`, `viewer_version_token`. The remaining 32 are VOLATILE and excluded by the
  rule.

  Six of the thirteen were the measured consumers. An earlier draft claimed eight, from an
  import-scoped text scan; that number missed five members and is corrected here rather than quietly
  restated.

- **Four of the thirteen are reached ONLY through the excluded service-role client**, and one more is
  reached BOTH ways. This bullet has now been wrong twice — round 4 caught it wrong in membership while
  right in count, and round 5 caught `auth_email_canonical` misclassified because the FILE constructs a
  service-role client at one point and the RPC is issued on a DIFFERENT client a few lines later
  (`lib/auth/picker/resolvePickerSelection.ts`, search `const authClient`). File-level attribution
  cannot answer a per-CALL question, which is the same shape as every other completeness error in this
  arc. Enumerated per call site:

  | RPC | reached through |
  | --- | --- |
  | `admin_alert_summary` | service-role only (`lib/admin/loadAlertSummary.ts`) |
  | `admin_event_stats_24h` | service-role only (`lib/admin/loadTelemetryStats.ts`) |
  | `auth_email_canonical` | WRAPPED only — issued on `authClient`, not on the service-role client the same file also builds (`lib/auth/picker/resolvePickerSelection.ts`, search `const authClient`) |
  | `resolve_show_by_slug_and_token` | service-role only (`lib/auth/picker/resolveShowPageAccess.ts`, `app/api/auth/picker-bootstrap/route.ts`) |
  | `roster_shift_counts` | service-role only (`lib/admin/loadRecentAutoApplied.ts`) |
  | `viewer_version_token` | BOTH — wrapped at `app/admin/_showReviewModal.tsx`, service-role at `app/api/show/[slug]/version/route.ts` and `lib/data/getShowForViewer.ts` |

  Not retrying the service-role paths is deliberate and unchanged: the measured incident is on the
  session client, and widening the wrapper across that client's many callers would buy retry coverage
  for paths that already degrade without failing anything. What the exclusion must NOT cost is
  attribution — and this spec does not pay that cost back, it files it (§7). The service-role paths
  keep their exclusion from the retry AND remain unattributed until the filed row lands.

- **Every client construction site, and its disposition.** Stated as a census rather than an adjective,
  because a reader can check a census:

  | site | disposition |
  | --- | --- |
  | `lib/supabase/server.ts`, search `createServerClient(` | WRAPPED. The factory this spec installs into. |
  | `lib/supabase/server.ts`, search `createSupabaseServiceRoleClient` | excluded. See the service-role limit above; §6.1's recursion fence also rests on it. |
  | `lib/supabase/browser.ts`, search `getSupabaseBrowserClient` | excluded, client-side. |
  | `app/api/test-auth/set-session/route.ts`, search `createServerClient(` | excluded. A second cookie-bound ssr client, `ENABLE_TEST_AUTH`-gated test infrastructure that never serves a crew or admin request. |
  | `app/api/test-auth/set-session/route.ts`, search `createClient(` | excluded. The same route's service-role client, same gate. |
  | `lib/dev/materialize/client.ts`, search `createClient(` | excluded. Dev-materialize tooling, not a request path. |

  Scope is stated because the previous census could not be reproduced: these are the SIX construction
  sites under `app/`, `components/` and `lib/`. Counting `scripts/`, `tests/` and `supabase/` as well
  gives 33. The last two rows are the ones round 3 found missing.

  There is no middleware.ts in this tree, which is worth stating positively: middleware is the usual
  second home for a cookie-bound client, and its absence is why this census is six rows.
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

The attribution instrument in every form this spec tried — a retry-emit trigger, a fault-string
trigger, and a transport observer — together with its capture mechanics, its four transport states,
and its construction-site meta-test. All of it is filed as
`BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` (§7). Re-proposing any of it here is a re-scope decision,
not a review finding.

Restoring the four members dropped from batch 2 (batch 3's question, §1.1). Changing batch 2's AC-3 five-green
bar or the batch-1 drop threshold. Promoting `app-e2e` into the required set on `main`. Any change to
the `x-test-force-infra-fail` hook's existing behavior. Diagnosing
`BL-CHANGES-FEED-MODAL-BATCH-FLAKE` beyond noting it is the same fault family.
