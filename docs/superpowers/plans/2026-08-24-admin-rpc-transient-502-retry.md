# Plan — absorbing the transient upstream 502 at the Supabase RPC boundary

Implements `docs/superpowers/specs/ci/2026-08-24-admin-rpc-transient-502-retry-design.md`.
Row: `BL-ADMIN-LOADER-CI-TRANSIENT`.

Every task is TDD: failing test first, minimal implementation, passing test, one commit.

**Before adding an artifact of a kind this repo already has, grep an existing instance and see
everywhere it appears.** Every fan-out this plan needed was found that way and none by recall. Three
of the nine tasks add such an artifact, and each turned out to have companion tables: a new app-e2e
spec touches FOUR registries (Task 7), a new mutation surface touches THREE (Task 6), and a new
forensic log code touches at least one (Task 3).

Fan-outs are themselves a class. When one registry in a diff proves to have satellite tables, every
other registry in that diff gets asked the same question, unprompted — this plan needed two review
rounds to learn that, having swept the fan-out it was shown and not the one it was not.

**A guard that validates DECLARED entries cannot catch an OMISSION. Where a task's risk is omission,
the task brings its own red.** Audited across every guard this plan leans on, after round 3 found two
that could not fail for absence:

| guard | discovers an omission? |
| --- | --- |
| `governanceViolations` (`tests/ci/_workflowCoverageScan.ts`) | PARTLY — derives its expected set from the SAME workflow, so a spec absent from the workflow is absent from both sides (round 4) |
| `tests/cross-cutting/app-e2e-ci-wiring.test.ts` | PARTLY — compares `REQUIRED` against the workflow's list, so it catches a MISMATCH but not a joint omission from both (round 4) |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | YES — filesystem-walked, so a new surface fails by default |
| Task 2's completeness arm | YES — by design, it walks the tree |
| `tests/mutation/_metaGuardSurfaceRegistry.test.ts` | NO — iterates `GUARD_SURFACES`; enrolment is opt-in |
| `tests/log/_metaAdminOutcomeContract.test.ts` | NO — checks only codes already registered |

The two that answer NO are why Task 6 carries its own presence red and why Task 3 ADDS its code rather
than deciding about it.

**"Red" means the AUTHORED test failing, never the missing-file state.** `vitest run` on a path that
does not exist exits 1 with "No test files found", which is indistinguishable by exit code from a real
red — so a task could otherwise be "satisfied" by never writing its test. Each red below is the state
after the test is authored and before the implementation exists. The order is
chosen so each red is REPRODUCING rather than aspirational: the predicate is red against the method
census before any wrapper exists, and the wrapper is red against a stub transport before it is
installed anywhere.

## Invariant disposition, decided rather than discovered

| invariant | disposition |
| --- | --- |
| 2, advisory locks | N/A. No sync path in the diff. |
| 8, impeccable pair | N/A — no UI surface, and checkable rather than asserted: the only `app/` path this plan edits is `app/api/show/[slug]/version/route.ts`, and the rule scopes a UI surface to `app/` EXCEPT `app/api/**`. No `components/` file changes. |
| 9, call-boundary discipline | The wrapper is transport, not an auth helper, so it takes no `_metaInfraContract` row and carries an inline `// not-subject-to-meta:` comment with its reason. Both contract suites must pass UNMODIFIED. |
| 10, mutation-surface observability | N/A. No new mutating route, no new server action. Verified by running the meta-test in Task 9, not assumed. |
| migration parity | N/A. No `supabase/migrations/**` change. |

<!-- tasks: depth=2 -->

## Task 1 — Eligibility predicate, as an importable module

<!-- task: red=`pnpm vitest run tests/supabase/retryEligibility.test.ts` ac=AC-3 -->

`lib/supabase/retryEligibility.ts (new)` exports the predicate deciding whether a request may be retried.
Authored as its own module from the start because it is enrolled in the source-mutation registry in
Task 6, and the runner can only overlay a target a suite imports.

Cases include RPC-by-GET in both directions, which the method census does not cover: PostgREST serves
`GET /rest/v1/rpc/<fn>` for non-volatile functions, and spec §4.2 holds RPC GETs to the SAME set
membership as RPC POSTs. So a retryable RPC by GET retries, and a VOLATILE RPC by GET is single-attempt
(spec AC-3 names that case). Without both, a predicate returning `true` for every GET passes, and so
does one rejecting every RPC GET — opposite bugs, same green.

Cases also come from every row of the spec's method census, plus the discrimination case that census
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

Anti-tautology: the task plants THREE failures before implementing, and the third is the one that
matters. A `VOLATILE` name added to the set must fail the safety arm; a non-`VOLATILE` call site
removed from the set must fail the completeness arm; and **a non-`VOLATILE` function that WRITES
through a volatile callee must fail the READ ONLY arm specifically.**

Without that third plant the arm is undetectable: every current member is genuinely read-only
(`readfinalizeowned_b2` included — its body is an `is_admin` check and two `exists(select ...)`), so
deleting the READ ONLY execution entirely would leave this task GREEN and silently reduce the safety
rule to the volatility-only rule §4.2 already rejected. The fixture is the spec's own §4.2 probe, a
`stable` function that writes through a `volatile` callee, created and rolled back inside the test. A guard that cannot be made to fail is not a guard. Premises are executable
(`tests/_shared/premise.ts`): the catalog query must return rows and the walk must find call sites.

## Task 3 — The wrapper, in the shape this codebase already uses

<!-- task: red=`pnpm vitest run tests/supabase/retryingFetch.test.ts` ac=AC-1 -->

`lib/supabase/retryingFetch.ts (new)` follows `withDriveRetry`: a named max-retries constant, exponential
backoff with jitter, `sleep` and `random` injectable so no test sleeps.

**A per-attempt stall guard, because backoff alone bounds nothing.** The sibling states the trap
directly (`lib/drive/fetch.ts`, search `Per-attempt wall-clock budget`): `withDriveRetry` "only
retries a *thrown* 429/5xx, and a silent socket stall never throws". The same is true here — this
wrapper retries a 5xx RESPONSE or a REJECTION, and a hung fetch produces neither. So without a
per-attempt timeout the wrapper does not help a stalled admin gate at all, and the latency has no
finite bound to state.

Each attempt therefore runs under an `AbortController` with a `PER_ATTEMPT_TIMEOUT_MS = 2000` budget,
the abort surfacing as a retryable transport failure exactly as the sibling surfaces its abort as a
transient `DriveFetchError(504)`. The timer is cleared in a `finally` and `unref`'d, so a resolved
request never holds the event loop open.

**The budget, computed in the sibling's own form** (`timeout * (1 + maxRetries) + backoff`):
`MAX_SUPABASE_RETRIES = 2` (the sibling's default is 3; two, because this path is a user-visible page
render rather than a background sync), backoff `250ms * 2^(n-1)` plus up to 250ms jitter, so delays of
at most 500ms and 750ms. **Worst case for the HEADER phase: 2000 * 3 + 1250 = 7250ms.**

That bound is honest about what it covers, because the sibling's situation differs in a way that
matters. `fetchXlsxExportBytes` awaits `response.arrayBuffer()` BEFORE clearing its timer, so its
budget covers the whole round trip. A fetch wrapper cannot: it must hand the `Response` back for
supabase-js to read, so its timer is necessarily cleared when `fetch()` resolves. If headers arrive
and the BODY then stalls, no rejection reaches the retry loop and that read is unbounded.

**Bounding the body is deliberately NOT done, and the reason is scope rather than difficulty.** It
would mean buffering the body in the wrapper and returning a reconstructed `Response`, which changes
what every caller receives on a path where the measured fault class is a 502 STATUS and no body stall
has ever been observed. The limit is recorded in spec §9 instead. Speculative hardening on an
unmeasured path is the failure mode this arc has been punished for repeatedly.

Both comparisons the spec asks for, against that number rather than against the backoff alone. Against
the admin gate: `requireAdmin` resolves `is_session_live` and `is_admin` in parallel, so 7250ms is the
ceiling added to one admin page render, and only on a request that was going to fail outright — today
the same stall is UNBOUNDED, so this is a strict improvement rather than a new cost. Against CI:
`.github/workflows/app-e2e.yml` sets `timeout-minutes: 30` on a job measured at 435s, so even a
pathological run cannot approach the job ceiling.

The emit's code needs a decision, not an assumption. Spec §6 says `SUPABASE_UPSTREAM_RETRY` needs no
§12.4 catalog row, which is true and incomplete: forensic-only codes are also tracked in
`NEW_FORENSIC_CODES` (`tests/log/_auditableMutations.ts`, search `export const NEW_FORENSIC_CODES`),
whose own comment reads "Every NEW forensic-only code this feature introduces" and which
`tests/log/_metaAdminOutcomeContract.test.ts` consumes. "No catalog row" and "no registry row at all"
are different claims. **This task ADDS `SUPABASE_UPSTREAM_RETRY` to `NEW_FORENSIC_CODES`, and asserts the membership in its
own red**, because changing the word "decide" to "ADD" does not make an omission fail. The existing
meta-test iterates `NEW_FORENSIC_CODES`, so an unregistered producer is invisible to it: an
implementation emitting the right code while skipping the row completes this task green unless the
task's own test demands the row. "Decide either way" was insufficient for the same reason as the enrolment red above:
`tests/log/_metaAdminOutcomeContract.test.ts` checks only codes already registered and has no
completeness arm, so an omission stays green forever. The list's own comment — "Every NEW
forensic-only code this feature introduces" — describes this code exactly, so the answer is not
actually open.

**The stall guard owes its own cases, or removing it entirely leaves this task green.** The sibling
carries persistent-stall, recovery-after-stall and `clearTimeout` cases
(`tests/drive/fetch.test.ts`, search `clearTimeoutSpy`); this task carries the same four: a fetch that
stays pending until aborted is retried with a fresh budget; a stall that persists across every attempt
exhausts and surfaces a typed failure; a stall on attempt one followed by a fast success resolves; and
the timer is cleared on the resolved path.

**Abort provenance is a case, not a comment.** The wrapper's own `timedOut` flag is the source of
truth, never the abort error's name — the sibling states exactly this reason
(`lib/drive/fetch.ts`, search `not the abort error's name`). So a CALLER-initiated abort via
`init.signal` is attempted ONCE and rethrown as itself, while a timeout abort is retried. The wrapper
also CHAINS `init.signal`, or a cancelled request outlives the caller that cancelled it and the
wrapper has made cancellation weaker than it was. Both directions get a red.

`RETRYABLE_STATUSES = {502, 503, 504}` is a named export, and this task's red pins the SET rather than
one member: 502, 503 and 504 each retry, and 500 and 429 do NOT. The sibling treats both as transient
for Drive, so that is a deliberate divergence this test RECORDS rather than inherits.

AC-1's second half is the anti-tautology arm and is written in the same task: with the cap at zero,
the same 502-then-200 stub must still surface the error. Without it, the first half passes for a
wrapper that never retried anything.

## Task 4 — On exhaustion, replay the first attempt

<!-- task: red=`pnpm vitest run tests/supabase/retryingFetch.failureMode.test.ts` ac=AC-2 -->

All four exhausted two-attempt sequences: 502 then 502, 502 then reject, reject then 502, reject then
reject. The 5xx member is varied across `RETRYABLE_STATUSES` rather than fixed at 502, so an
implementation that special-cases one status cannot pass.

The wrapper is not installed in the factory until Task 5, so this task reaches it the way this repo
already does: `vi.mock("@/lib/supabase/server", ...)` returning a client built with the wrapper (the
idiom in `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts` and others). Without
that, a consumer builds an UNWRAPPED client internally and the red fails for the wrong reason. A
reorder would also work and is worse: it would put installation before any test of the contract
installation is meant to preserve.

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

<!-- task: red=`pnpm vitest run tests/mutation/enrolmentPresence.test.ts` ac=AC-4 -->

**The red must fail for ABSENCE, and none of the existing guards does that.**
`_metaGuardSurfaceRegistry.test.ts` validates entries already present in `GUARD_SURFACES` and never
discovers unenrolled modules — the registry says enrolment is opt-in in as many words
(`tests/mutation/source/registry.ts`, search `Enrollment is opt-in`). So both new modules can exist
outside the registry with that suite green, and the companion parity suites can only fail AFTER rows
exist. Every guard here validates what is declared; none checks for what is missing.

The task therefore brings its own red: `tests/mutation/enrolmentPresence.test.ts (new file)` asserts that
`GUARD_SURFACES` contains both enrolled ids with the `sourcePath` each names. That fails before the rows
exist and passes after, which is what the other three cannot do.

**Enrolment has its OWN fan-out of THREE tables, and the earlier red pointed at a file that does not
exist** (`tests/mutation/source/registry.test.ts — no such file`), which made it the missing-file state this plan's
own preamble forbids. The real guard is `tests/mutation/_metaGuardSurfaceRegistry.test.ts`, and two
companion tables gate the same change:

| table | where | what a missing row does |
| --- | --- | --- |
| the guard-surface registry | `tests/mutation/source/registry.ts` | the surface is not scored at all |
| `EXPECTED_LEDGER_KINDS` | `tests/mutation/source/expectedLedgerKinds.ts` | `_metaLedgerKindsDeclarationParity` fails |
| `EXPECTED_ENV_TOUCHING` | `tests/mutation/_metaPremiseContract.test.ts`, search `EXPECTED_ENV_TOUCHING` | its keys are asserted EQUAL to the suite list, so a new deciding suite without a row fails |

Both enrolled surfaces need a registry row and an `EXPECTED_LEDGER_KINDS` row; only the volatility scan
is env-touching, so only it takes an `EXPECTED_ENV_TOUCHING` row. Adding the registry rows alone leaves
merge-gating contracts red.

**MEASURED CORRECTION, twice.** The first pass enumerated sites by reading the code and got two
things wrong. The counts below come from the harness's own enumerator (`enumerateSites` in
`tests/mutation/source/operators.ts`) run over each candidate, which is the only number that matches
what the runner will actually generate:

| surface | sites | by operator |
| --- | --- | --- |
| `lib/supabase/retryingFetch.ts` | **42** | statement-removal 14, integer-literal 16, equality-flip 7, logical-connector 4, relational-boundary 1 |
| `tests/supabase/retryableRpcVolatilityScan.ts` | **18** | statement-removal 13, equality-flip 2, logical-connector 2, integer-literal 1 |
| `lib/supabase/retryEligibility.ts` | **3** | statement-removal 1, equality-flip 1, integer-literal 1 |

The first error was the count: the wrapper was recorded at 24 sites against four declared operators,
and it is 26 against those four, 40 across all of them. It has since moved AGAIN, to 42, because the
describeTarget query-strip repair added two `[0]` index literals. A site count is a measurement of a
file, so it goes stale the moment the file changes — the third derived number on this arc to do so,
after the env-touching count and the AC-6 tally. The score's own total comes from the RUN, not from
this table, which is why the table being stale never reached a brief.

The second was the operator list. `statement-removal` was never declared and is the LARGEST operator
on both enrolled surfaces. A scoped subset leaves the excluded operators' sites unscored, and the
registry's own convention for guard-extractor rows is `operators: [...OPERATOR_NAMES]` — every one of
the nineteen `tests/` rows takes it. So both rows declare all operators, which is also the honest
reading of "declared per-surface honestly": the honest declaration here is not a shorter list.

The predicate's defect class is SET MEMBERSHIP and PATH SHAPE, which no operator reaches: three
sites in total, one of them a `!== null`. So the predicate is NOT enrolled, and its re-disposition is
recorded with the probe that shows why — the same move the step3 arc made when the registry could not
express a Playwright surface, rather than enrolling symbolically.

**The volatility guard IS enrolled, and it took an extraction to become enrollable.** It held its
decision logic inside a `.test.ts`, which the runner cannot overlay at all — it mutates a `sourcePath`
a suite IMPORTS. AGENTS.md requires such a surface to be authored as an importable module with a
referring suite from the start; that was applied to the predicate in Task 1 and missed for the guard
in Task 2. The logic now lives in `tests/supabase/retryableRpcVolatilityScan.ts` and the suite imports
it, all 9 tests passing unchanged.

Its 18 sites are what settle the re-disposition question in the other direction: the rule that
un-enrolled the predicate at 3 sites does not reach a surface at 18, so it is enrolled rather than
excused.

Enrolling it anyway would buy a near-empty surface whose score says almost nothing while LOOKING like
coverage, which is the exact shape of claim this arc spent five spec rounds removing from the design.

**So: two registry rows, and the predicate is not one of them.** The runner overlays exactly ONE `surface.sourcePath`
(`tests/mutation/source/runner.ts`, search `const target = resolve(root, surface.sourcePath)`), so one
row cannot reach arithmetic living in another module. The predicate (`equality-flip`,
`logical-connector`) and the wrapper's backoff arithmetic (`relational-boundary`, `integer-literal`)
are separate surfaces with separate rows, each with its own `control` and deciding suite. Declaring
four operators on one row would report them while scoring none of the backoff sites.

**The row's `suitePaths` must NAME its own deciding suite.** The runner overlays a target only when a Vitest
suite imports it, so a row pointing elsewhere yields a surface where every mutant survives for reasons
that have nothing to do with the guard's quality. Closing that loop at the row is the entire reason
Task 3 authors the wrapper as an importable module rather than inline.

Both rows take `operators: [...OPERATOR_NAMES]`, a `control` its own suite must notice, and
`suitePaths` naming its own deciding suite:

| row | sourcePath | suitePaths |
| --- | --- | --- |
| `supabaseRetryingFetch` | `lib/supabase/retryingFetch.ts` | `tests/supabase/retryingFetch.test.ts`, `tests/supabase/retryingFetch.failureMode.test.ts` |
| `retryableRpcVolatilityScan` | `tests/supabase/retryableRpcVolatilityScan.ts` | `tests/supabase/_metaRetryableRpcVolatility.test.ts` |

Only the second is env-touching (it queries the catalog), so only it takes an `EXPECTED_ENV_TOUCHING`
row.

**Cost, stated before the slot is taken rather than discovered inside it.** 60 mutants total, 42 plus
18. Each mutant runs its deciding suite in a fresh child; measured on this branch, the wrapper's two
suites report 356ms and the volatility suite 383ms, both about a second wall-clock including boot. So
the estimate is roughly two to four minutes of execution for both surfaces, not the tens of minutes a
browser-driving surface costs. Both are scored in ONE slot acquisition.

The volatility suite walks `app`, `lib` and `components` reading every `.ts` file, and that walk is
paid once per mutant — it is already inside the 383ms above, so it is priced, not hidden.

Enrolment PRECEDES the first diff dispatch. The score, the unaccepted-survivor set, and the
`OPERATORS:` tail go in the round-1 `GUARD SURFACE:` line. Score-run slot is requested from bl-orch,
not taken: one run fleet-wide at a time.

## Task 7 — The deterministic runner proof

<!-- task: red=`sh -c 'BASELINE_SERVER_ONLY=1 pnpm exec playwright test tests/e2e/admin-upstream-retry.spec.ts --project=desktop-chromium'` ac=AC-5 -->

**A new e2e member has a FOUR-registry fan-out; wiring comes FIRST in this task, or the red is
unreachable.**

| registry | governs | omission's symptom |
| --- | --- | --- |
| `playwright.config.ts` `testMatch` | selection | red reports "no selected tests", indistinguishable from a pass |
| `.github/workflows/app-e2e.yml` file list | execution | AC-5 never runs on any PR |
| `scripts/check-app-e2e-executed.mjs` `REQUIRED` | the per-spec executed floor | `tests/cross-cutting/app-e2e-ci-wiring.test.ts` fails, by design |
| `tests/ci/_workflowCoverageScan.ts` `governs` | which env pair covers the spec | the spec runs without its env; the scan flags EVERY governing row, not one |

**These four are checked against EACH OTHER, not against reality, so Task 7 brings its own presence
red.** `app-e2e-ci-wiring` compares `REQUIRED` against the specs the workflow names, and
`governanceViolations` derives its expected set from that same workflow. Omit the spec from the
workflow, `REQUIRED` and every `governs` row together and both guards stay in parity and green, while
only `testMatch` and the spec file exist — CI never runs AC-5 and nothing says so. The plan's own
discovery audit had this wrong: those guards discover a MISMATCH between declared sets, not a joint
omission.

So the task asserts, in its own test, that the spec's basename or path appears in all four: `testMatch`,
the workflow's file list, `REQUIRED`, and the governing `governs` rows.

The floor is `cases x resolving projects` (this spec resolves under `desktop-chromium` only, so `x 1`),
never a floor of 1 — the oracle refuses a floor that demands nothing. The `governs` addition goes in
every governing row, because this spec needs the whole app-e2e env contract, not one variable.
 A new spec file is selected by
nothing: `playwright.config.ts`'s `desktop-chromium` project matches an explicit basename allowlist,
and `.github/workflows/app-e2e.yml` runs an explicit file list. `admin-upstream-retry` appears in
NEITHER today (verified: zero occurrences in each). So the task adds the basename to the project's
`testMatch` and the path to the workflow's list BEFORE authoring the test — otherwise the red reports
no selected tests, which is indistinguishable from a passing run, and CI would never exercise AC-5 at
all.

A CI-only forced upstream fault, gated exactly as `x-test-force-infra-fail` is: `ENABLE_TEST_AUTH`,
the Bearer secret, and a request-scoped header. It cannot fire in production.

The injector WRAPS the real fetch and delegates after N. It must not short-circuit the wrapper, or
AC-5 could pass without a retry ever occurring.

**The evidence is the budget boundary, not a log grep.** The first draft of this task settled AC-5 by
grepping the run for a `SUPABASE_UPSTREAM_RETRY` emit, and the first green run carrying the emit
disproved that step: run `32804414458` holds nine records, three of them provably outside this spec's
window (probe record, addendum). A grep for the code is satisfied by background faults alone and
would pass with the injector never firing.

So the assertion is a differential across the budget instead, all of it page-observable: one forced
fault renders, two render (the last attempt the budget allows), three exhaust and reach the recorded
error boundary. A wrapper that never retried fails the absorbed cases; one that retried further fails
the exhausted case. The exhausted case also asserts the boundary copy is PRESENT, which is what keeps
the other two cases' `toHaveCount(0)` from passing against a misspelled selector.

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
its own terms. The red EXERCISES each boundary: it calls the function with a stubbed client returning an upstream
502 and inspects the EMITTED record. It does not scan source. A test that greps these four files for
`error.message` would pass while the runtime path never emits it, which is the tautology rule reaching
a logging change — source presence is not the property, emission is.

The version route gets the SAME assertion as the other three, not a weaker one: its emitted line must
CONTAIN the error message. An earlier draft asked only that a line exist there, which a code-only log
satisfies while still discarding `error.message` — the exact defect this task names. Both of that
route's branches, the returned error and the thrown one, discard it today.

The four are named rather than derived, and that is correct here rather than a drifting enumeration:
this task makes no completeness claim, so there is nothing for the list to stand proxy for. It
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

**AC-6's five consecutive green `app-e2e` runs are part of THIS task's completion, not a crosswalk
footnote.** The task's own red proves only that the backlog heading is gone, so without this stated
the task could close and commit before the regression evidence exists. The five runs are stated in
advance, counted on the PR, and recorded here before the marker comes off.

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
