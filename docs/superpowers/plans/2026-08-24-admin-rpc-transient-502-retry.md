# Plan — absorbing the transient upstream 502 at the Supabase RPC boundary

Implements `docs/superpowers/specs/ci/2026-08-24-admin-rpc-transient-502-retry-design.md`.
Row: `BL-ADMIN-LOADER-CI-TRANSIENT`.

Every task is TDD: failing test first, minimal implementation, passing test, one commit. The order is
chosen so each red is REPRODUCING rather than aspirational: the predicate is red against the method
census before any wrapper exists, and the wrapper is red against a stub transport before it is
installed anywhere.

## Invariant disposition, decided rather than discovered

| invariant | disposition |
| --- | --- |
| 2, advisory locks | N/A. No sync path in the diff. |
| 8, impeccable pair | N/A — no UI surface. No file under `app/` or `components/` changes. |
| 9, call-boundary discipline | The wrapper is transport, not an auth helper, so it takes no `_metaInfraContract` row and carries an inline `// not-subject-to-meta:` comment with its reason. Both contract suites must pass UNMODIFIED. |
| 10, mutation-surface observability | N/A. No new mutating route, no new server action. Verified by running the meta-test in Task 9, not assumed. |
| migration parity | N/A. No `supabase/migrations/**` change. |

<!-- tasks: depth=2 -->

## Task 1 — Eligibility predicate, as an importable module

<!-- task: red=`pnpm vitest run tests/supabase/retryEligibility.test.ts` ac=AC-3 -->

`lib/supabase/retryEligibility.ts (new)` exports the predicate deciding whether a request may be retried.
Authored as its own module from the start because it is enrolled in the source-mutation registry in
Task 6, and the runner can only overlay a target a suite imports.

Cases come from the spec's method census, all seven rows, plus the discrimination case that census
exposed: an insert into a table NAMED after a retryable function must not be retried. That case is
what pins the rule to the full `/rest/v1/rpc/<fn>` shape rather than to a trailing segment.

## Task 2 — The retryable set, with both arms and both premises

<!-- task: red=`pnpm vitest run tests/supabase/_metaRetryableRpcVolatility.test.ts` ac=AC-4 -->

Safety arm: every name in `RETRYABLE_RPCS` is non-`VOLATILE` in the live catalog AND completes inside
a `READ ONLY` transaction. Completeness arm: every non-`VOLATILE` `.rpc()` name IN THE TREE is either
in the set or in the exclusion list with a reason.

Discovery is repo-wide by NAME and PARSES rather than line-greps. Both properties were bought by
round 2: an import-scoped text scan missed `readfinalizeowned_b2` and `my_share_tokens_for_email`
while matching a file that names the factory only in comments. The starting population is thirteen
non-`VOLATILE` names out of 46 distinct RPC names in the tree; the task re-derives that number rather
than hardcoding it, and a mismatch against the catalog is the test failing, not a constant to update.

`readfinalizeowned_b2` is the one `plpgsql` member, so it is the case that proves the READ ONLY arm
does work the volatility arm cannot.

All thirteen were probed under `begin; set transaction read only; ... rollback;` before this plan was
written and every one executes cleanly, so the arm is implementable as specified and the starting
exclusion list is EMPTY.

**The arm asserts THAT THE CALL DID NOT RAISE, never that it returned rows.** The probe's first shape
could not tell those apart: three set-returning members returned an empty set and looked like
failures. A row-count assertion would be tautological (zero rows passes trivially) and false-failing
(an unauthenticated `my_share_tokens_for_email` is CORRECTLY empty) at the same time, and fixture
state must never be able to move this verdict.

Anti-tautology: the task plants both failures before implementing. A `VOLATILE` name added to the set
must fail the safety arm, and a non-`VOLATILE` call site removed from the set must fail the
completeness arm. A guard that cannot be made to fail is not a guard. Premises are executable
(`tests/_shared/premise.ts`): the catalog query must return rows and the walk must find call sites.

## Task 3 — The wrapper, in the shape this codebase already uses

<!-- task: red=`pnpm vitest run tests/supabase/retryingFetch.test.ts` ac=AC-1 -->

`lib/supabase/retryingFetch.ts (new)` follows `withDriveRetry`: a named max-retries constant, exponential
backoff with jitter, `sleep` and `random` injectable so no test sleeps.

AC-1's second half is the anti-tautology arm and is written in the same task: with the cap at zero,
the same 502-then-200 stub must still surface the error. Without it, the first half passes for a
wrapper that never retried anything.

## Task 4 — On exhaustion, replay the first attempt

<!-- task: red=`pnpm vitest run tests/supabase/retryingFetch.failureMode.test.ts` ac=AC-2 -->

All four exhausted two-attempt sequences: 502 then 502, 502 then reject, reject then 502, reject then
reject.

The assertion is against the CONSUMER's emitted forensic code, not against the wrapper's return value.
A wrapper that returns a plausible shape for the wrong reason still fails this task. The ten branches
that distinguish returned-error from thrown are enumerated in spec §3.4 and were verified by hand.

## Task 5 — Install in the factory, and prove the emit cannot re-enter

<!-- task: red=`pnpm vitest run tests/supabase/serverClientWiring.test.ts` ac=AC-8 -->

Install the wrapper in `createSupabaseServerClient()` only. A test asserts a retry's own emit cannot
re-enter the wrapper, which holds on two independent grounds: the durable sink writes through
`createSupabaseServiceRoleClient`, which this wrapper does not cover, and its write is a
`.from().insert()`, a POST outside `/rest/v1/rpc/`, which the eligibility rule refuses anyway.

Both grounds are consequences of decisions taken for other reasons, so the test pins them rather than
trusting them — spec §9's exclusion of the service-role client is what holds the first, and widening
the wrapper to that client would re-open the recursion. Round 5 of spec review proved that is not
hypothetical: the descoped observer design did exactly that.

Both existing contract suites run here and must pass unmodified.

## Task 6 — Registry enrolment and the score run

<!-- task: red=`pnpm vitest run tests/mutation/source/registry.test.ts` ac=AC-4 -->

Enrol `lib/supabase/retryEligibility.ts (new)` with a `control` the suite must notice. Declared operators:
`equality-flip` and `logical-connector` for the predicate, `relational-boundary` and
`integer-literal` for the backoff arithmetic.

Enrolment PRECEDES the first diff dispatch. The score, the unaccepted-survivor set, and the
`OPERATORS:` tail go in the round-1 `GUARD SURFACE:` line. Score-run slot is requested from bl-orch,
not taken: one run fleet-wide at a time.

## Task 7 — The deterministic runner proof

<!-- task: red=`sh -c 'BASELINE_SERVER_ONLY=1 pnpm exec playwright test tests/e2e/admin-upstream-retry.spec.ts --project=desktop-chromium'` ac=AC-5 -->

A CI-only forced upstream fault, gated exactly as `x-test-force-infra-fail` is: `ENABLE_TEST_AUTH`,
the Bearer secret, and a request-scoped header. It cannot fire in production.

The injector WRAPS the real fetch and delegates after N. It must not short-circuit the wrapper, or
AC-5 could pass without a retry ever occurring. The assertion is: the page renders, the run carries a
`SUPABASE_UPSTREAM_RETRY` emit, and the emit's attempt number proves a second attempt happened.

## Task 8 — Four boundaries stop dropping the fault's message

<!-- task: red=`pnpm vitest run tests/admin/upstreamFaultMessageLogged.test.ts` ac=AC-7 -->

Four log-line repairs, one per boundary named in spec §7.1: the error message joins the two
`log.error` calls that carry only a code (`lib/admin/loadAlertSummary.ts`,
`lib/admin/loadTelemetryStats.ts`), `loadRecentAutoApplied`'s returned `infra_error` is logged rather
than only returned, and `app/api/show/[slug]/version/route.ts` gains a `log.error` before its bare 500
(the only one of the four that also needs a `log` import; follow
`app/api/auth/picker-bootstrap/route.ts`'s import shape).

**These are invariant-9 defect repairs, not attribution coverage, and the task must not drift into
claiming otherwise.** An infra fault that arrives and loses its message is a defect at that boundary on
its own terms. The red asserts, per boundary, that a stubbed client returning an upstream 502 produces
a log line containing the error message, and for the version route that a line exists at all. It
asserts nothing about any other path: the total solution is
`BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY`'s job, and spec §9 records that every other swallowing path
stays dark until then.

Two reflex-refusals worth stating so a later reader does not re-litigate them. Invariant 10 is NOT
triggered: the version route's only exported handler is `GET`, and invariant 10 covers
`POST`/`PUT`/`PATCH`/`DELETE` and server actions. And these must NOT route through `logAdminOutcome`,
which carries the admin-mutation registry contract; these are read-path infra faults, and using it
would drag four read paths into a mutation registry.

## Task 9 — Graduation, closeout, invariant sweep

<!-- task: red=`sh -c '! grep -q "^## BL-ADMIN-LOADER-CI-TRANSIENT" BACKLOG.md'` ac=AC-6 -->

Archive the row. Run `tests/log/_metaMutationSurfaceObservability.test.ts` to verify the invariant-10
N/A rather than assert it. The in-progress marker comes off in this commit, the PR's last before the
merge.

<!-- tasks: end -->

## Acceptance criteria (crosswalk to spec §8)

| AC | spec | task |
| --- | --- | --- |
| AC-1 | recorded fault absorbed, plus the zero-cap arm | 3 |
| AC-2 | failure category never moves, four sequences | 4 |
| AC-3 | nothing that can reach a write is retried | 1 |
| AC-4 | volatility guard both directions, premises live | 2, 6 |
| AC-5 | deterministic absorption on the real runner | 7 |
| AC-6 | no new flake class; five green runs as regression | 9 |
| AC-7 | four boundaries stop dropping the fault message | 8 |
| AC-8 | invariant-9 suites pass unmodified | 5 |

## 12 — closeout

impeccable-gate: N/A — no UI surface
