<!-- spec-lint: not-ui — no UI surface: the change touches lib/supabase, a new meta-test, and a CI workflow step. The app/ path cited below is a consumer census subject, not a deliverable. impeccable-gate: N/A — no UI surface. -->

# Absorbing the transient upstream 502 at the Supabase RPC boundary

Design spec for `BL-ADMIN-LOADER-CI-TRANSIENT`. Closes the row's first scheduled step, the threshold
decision, and specifies the repair it selects.

Evidence base: [`docs/superpowers/specs/ci/probes/2026-08-24-admin-loader-502-clustering.md`](./probes/2026-08-24-admin-loader-502-clustering.md).
Every measurement quoted below is sourced there and is not restated with fresh numbers here.

## 1. The problem, as measured rather than as filed

A required check on `main` (`app-e2e`) reds transiently, and the red is indistinguishable from a spec
defect. The row records ten occurrences over four PRs in one week. On 2026-08-24 the class nearly cost
a shipped batch member and burned hours of AC-3 re-rolling.

The row reads the fault as an admin-loader fault, because every occurrence quotes
`AdminInfraError: requireAdmin: is_admin RPC failed: An invalid response was received from the upstream server`.
The evidence pass says that reading is too narrow in three ways (probe §Finding 1 through §Finding 4):

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
| The retry is scoped by Postgres volatility, decided in §4. That is the answer to the double-execution axis, not an oversight of it. | §4 |
| The `x-test-force-infra-fail` hook is deliberate test-only machinery and is not a defect. | `lib/auth/requireAdmin.ts`, search `maybeForceTestInfraFail` |
| This spec does not diagnose why the gateway resets the connection. It absorbs the fault and instruments the next occurrence so the cause becomes observable. See §7 and §9. | §9 |

## 2. Convergence criterion for review of this spec

- **Consequence bound.** Every request either completes, or fails with the same typed error the caller
  sees today, or is retried under §4's volatility rule. No request is retried whose function Postgres
  permits to write. A retry that exhausts its attempts and surfaces the original error is correct
  behavior, not a finding.
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
single call site. The class-sweep default (repair every instance of one shape in the same PR) is met
by construction rather than by enumeration.

### 3.2 Mechanism

`createSupabaseServerClient()` passes a `global.fetch` to `createServerClient`. Verified at
authoring time against the installed packages: supabase-js 2.105.1 declares an optional custom `fetch`
under `global` on `SupabaseClientOptions` (`src/lib/types.ts, line 140`), and ssr 0.10.2 spreads
`options.global` through untouched while adding only headers
(`dist/main/createServerClient.js, lines 19-22`), so a custom `fetch` reaches the transport.

The wrapper retries a request when ALL of the following hold:

1. The response status is 502, 503 or 504, OR the underlying `fetch` rejected.
2. The request is retry-eligible per §4.
3. Attempts so far are under the cap.

Everything else is returned or rethrown exactly as it is today. The wrapper never reads a body, never
converts a status into a different one, and never swallows a rejection.

### 3.3 Numbers, single-sourced

The retry policy's constants live in ONE exported declaration in the wrapper module, and every other
mention in this document refers to them by name rather than repeating a literal:

- `RETRY_MAX_ATTEMPTS` — total attempts including the first.
- `RETRY_BACKOFF_MS` — the delay before each retry, in order, so its length is the retry budget.
- `RETRYABLE_STATUSES` — the status set from §3.2 clause 1.

Worst-case added latency for a fully-failing request is the sum of `RETRY_BACKOFF_MS`. The plan states
that sum against the gate's own budget and against the workflow's `timeout-minutes`
(`.github/workflows/app-e2e.yml`, search `timeout-minutes`).

## 4. The double-execution axis, and why volatility answers it

A 502 does not prove the request failed to reach Postgres. The gateway reports that the upstream
connection did not produce a valid response, which is also what a committed write with a lost response
looks like. Retrying a mutation on a 502 is therefore double execution, and double execution is the
silent-wrong direction: no error, wrong data.

The repair does not assert idempotency. It borrows the database's own declaration.

`is_admin`, `is_session_live`, `is_developer`, `viewer_version_token`,
`get_admin_show_review_snapshot` and `admin_read_share_token` are all declared `STABLE` in the live
catalog:

```
psql -X -A -F$'\t' -t -c "select p.proname,
  case p.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' when 'v' then 'VOLATILE' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (...)"
```

Postgres refuses to execute a data-modifying statement inside a non-`VOLATILE` function at runtime.
So "this call cannot have committed a write" is enforced by the database rather than claimed by us,
and it stays enforced if the function's body changes later.

**The rule: a POST to `/rest/v1/rpc/<fn>` is retry-eligible only when `<fn>` is in `RETRYABLE_RPCS`,
and `RETRYABLE_RPCS` may contain only names the live catalog reports as non-`VOLATILE`.** A GET is
retry-eligible unconditionally, by HTTP's own idempotency contract. Everything else, including every
`.insert()`, `.update()`, `.delete()`, every volatile RPC, and every `/auth/v1/*` POST, is never
retried.

### 4.1 The set is checked in both directions, and derived rather than trusted

A new meta-test at `tests/supabase/_metaRetryableRpcVolatility.test.ts (new file)` reads the live catalog and
asserts:

- **Safety.** Every name in `RETRYABLE_RPCS` is non-`VOLATILE`. This is the direction that prevents
  double execution, so a name that cannot be resolved in the catalog fails rather than passes.
- **Completeness.** Every `.rpc("<name>")` call in a file that imports `createSupabaseServerClient`,
  whose function the catalog reports as non-`VOLATILE`, is in `RETRYABLE_RPCS`. Discovery walks the
  filesystem, so a call site added later is covered by default rather than silently exempt.

Both arms carry an executable premise (`tests/_shared/premise.ts`, search `export function premise`):
the catalog query must return rows and the walk must find call sites. A test that passes because it
found nothing is the failure mode this guard exists to prevent.

Two considered alternatives, rejected and fenced:

- **Retry everything at the fetch layer.** Covers the population in fewer lines and reintroduces the
  double-execution hazard the axis is about.
- **Reissue read RPCs as GET** (`.rpc(fn, args, { get: true })`), letting PostgREST enforce
  non-volatility by returning 405. Attractive, and rejected on two grounds: it moves arguments into a
  URL, and it changes these requests into a shape that a framework fetch cache may treat as cacheable,
  which for `is_admin` is an authorization hazard rather than a performance question.

## 5. Invariant 9

The wrapper sits below every Supabase call boundary and changes no boundary's contract. Callers still
destructure `{ data, error }`, returned and thrown errors stay distinguishable, and every existing
typed infra error still surfaces when the attempts are exhausted. No registry row changes meaning.

The plan verifies this rather than asserting it: the existing contract suites
(`tests/auth/_metaInfraContract.test.ts`, `tests/admin/_metaInfraContract.test.ts`) must pass
unmodified, and a modification to either is a signal that the boundary contract moved.

## 6. A retry is never silent

Each retry emits `log.warn` with `code: "SUPABASE_UPSTREAM_RETRY"`, plus the function name, the
status, and the attempt number. Never a body, never arguments, never a token.

This is a forensic log code, not a user-visible one. It does not enter master spec §12.4; it needs no catalog row. The sibling forensic code `ADMIN_SHOW_VERSION_TOKEN_READ_FAILED` appears in neither
`lib/messages/catalog.ts` nor the master spec, verified by grep at authoring time.

The emit is what makes §8's acceptance criterion evidence rather than luck: it proves the fault
occurred in a run and was absorbed, which silence cannot.

## 7. Making the next occurrence attributable

The runs capture nothing from inside the containers, so today's mechanism is inferred from the app's
own logs. `.github/workflows/app-e2e.yml` gains a failure-path step that dumps, for the Supabase
containers, the gateway and PostgREST logs plus each container's restart count, uploaded with the
existing artifact.

It runs under `if: failure()`, adds nothing to the green path, and answers the question this spec
cannot: whether the reset is a restart, an OOM kill, or connection churn.

## 8. Acceptance

- **AC-1.** A synthesized 502 on the admin gate no longer reds the page. Executable: with the wrapper
  installed and a transport stub returning 502 then 200, `requireAdmin` resolves normally; with the
  wrapper's cap set to a single attempt, the same stub still throws `AdminInfraError`. The second half
  is what makes the first non-tautological.
- **AC-2.** A mutating call is never retried. Executable: a stub that returns 502 for a `.update()`,
  for a volatile RPC, and for an `/auth/v1/token` POST is called exactly once in each case.
- **AC-3.** The volatility guard holds in both directions, with its premises live (§4.1).
- **AC-4.** Five consecutive green `app-e2e` runs on the PR, stated in advance, AND at least one of
  those runs' logs carrying a `SUPABASE_UPSTREAM_RETRY` emit. The second clause is load-bearing: at the
  measured red rate, five greens alone are close to a coin flip and prove nothing. If no emit appears
  in five runs, AC-4 is NOT met by that silence; the run count extends until one appears or the spec
  records that it could not be earned.
- **AC-5.** No new flake class. The full `app-e2e` membership passes, and the executed-count oracle
  (`scripts/check-app-e2e-executed.mjs`) is unchanged and green.
- **AC-6.** `tests/auth/_metaInfraContract.test.ts` and `tests/admin/_metaInfraContract.test.ts` pass
  unmodified (§5).

## 9. Documented limits

- **The cause of the connection reset is not diagnosed.** This spec absorbs the fault and instruments
  it (§7). If the dump later shows a container restart, that is a different repair on a different row.
- **A 502 that outlasts the retry budget still reds.** The budget is bounded on purpose; an outage is
  supposed to surface.
- **GET retry is unmeasured.** No measured event landed on a GET (probe §Finding 4). GETs are retried
  because HTTP's idempotency contract makes it unconditionally safe, not because evidence asked for it,
  and no claim in this spec rests on it.
- **Call-site counts are not request counts.** The population figures in the probe count call sites.
  A `.from()` fault that no consumer logs would be invisible to that grep.
- **The completeness arm is scoped to files importing `createSupabaseServerClient`.** An RPC reached
  through the service-role or browser client is out of scope, deliberately: those clients are not where
  the measured faults landed, and widening the wrapper to them is a separate decision.

## 10. Out of scope

Restoring the four members dropped from batch 2 (batch 3's question, §1.1). Changing AC-3's five-green bar
or the batch-1 drop threshold. Promoting `app-e2e` into the required set on `main`. Any change to the
`x-test-force-infra-fail` hook. Diagnosing `BL-CHANGES-FEED-MODAL-BATCH-FLAKE` beyond noting it is the
same fault family.
