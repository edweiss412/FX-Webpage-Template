# Supabase upstream fault class: observability at the transport, and the loader-class decision

<!-- spec-lint: not-ui — every `app/` and `components/` path here is cited as EVIDENCE, not changed. The one candidate UI change is declined in §9.2 and recorded as a documented limit, so no dimensional invariant or state transition exists to enumerate. -->

**Arc:** `fix/supabase-upstream-fault-class` · **Rows closed:** `BL-ADMIN-LOADER-CI-TRANSIENT`, `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` · **Date:** 2026-08-25

**Eric's directive, binding and stronger than the process mint freeze in `AGENTS.md`:** this arc files no new `BL-`/`DEF-` row of any facing. Anything it finds is repaired here under the class-sweep default, or written down as a documented limit on the owning surface with a re-file trigger. §9 is that record.

---

## 1. What this arc is for

Two rows, one mechanism. `BL-ADMIN-LOADER-CI-TRANSIENT` is a class of CI reds whose cause had to be inferred from app logs because nothing captured the gateway's own state. `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` is the reason it had to be inferred. PR #882 closed exactly one member of the first row, the `is_admin` RPC 502 on the admin gate, absorbed by `lib/supabase/retryingFetch.ts`, and repaired four consumer boundaries while explicitly claiming no completeness (`BACKLOG.md:660-662`). Everything else stayed dark.

This spec takes the measurement the first row's remaining decision needs, states what it settles, chooses, and builds the instrumentation that means the next occurrence is read rather than inferred.

---

## 1.1 Resolved scope, do not relitigate

Each of these is settled, with its ratification. Verify the citation; do not re-derive the decision.

| Decision | Ratified at |
|---|---|
| **No new `BL-`/`DEF-` row of any facing.** Not under `invariant`, not under `product-blocked`, not as a sibling-class split. Anything found is repaired here or written into §9. | Eric's directive, 2026-08-25, stated as stronger than the process mint freeze in `AGENTS.md` |
| **The open-time recovery's retry bound stays at ONE.** Widening it is not this arc's move, and §2.3 gives no evidence for it. | `tests/e2e/helpers/openShowReviewModal.ts:47-49` |
| **A write is never retried.** A 502 does not prove a request failed to commit, so retrying a mutation is double execution: nothing errors and the data is wrong. This is why `setAlertOnSyncProblems`' UPDATE cannot be absorbed and §3.3 does not propose absorbing it. | `lib/supabase/retryingFetch.ts` header, `lib/supabase/retryEligibility.ts` |
| **The service-role client is excluded from the RETRY wrapper and INCLUDED in the observer.** Two different decisions with two different reasons: the retry's exclusion is the durable sink's recursion fence; the observer's inclusion is safe because its fence is the log LEVEL (§5.2), not the client scope. | `lib/supabase/server.ts:90-98`, `tests/supabase/serverClientWiring.test.ts:80` |
| **The four batch-2 drops stay dropped.** Their restoration is batch 3's first question, not this arc's. | `BACKLOG.md:623` |
| **PR #882 repairs four consumer boundaries and claims no completeness.** That fence is deliberate. It is not a defect in #882 to be re-found here. | `BACKLOG.md:660-662` |
| **A per-spec red counter advances only on a red that REPRODUCES on the same bytes.** A non-reproducing red is an environment observation. | `BACKLOG.md:612`, ratified 2026-08-24 |
| **The design items at `BACKLOG.md:666-693` are settled inputs**, each having cost a review round on the previous arc: observe at the transport, fence on the log level, plant four states, capture in the workflow, enforce coverage by walking. §9.3 and §9.5 correct two factual sub-claims inside them without reopening any decision. | `BACKLOG.md:666-693` |
| **`telemetry-layout` and `published-show-attention` are out of scope**, being dropped batch-2 members whose restoration batch 3 owns. §4 states what the helper reaches anyway. | this arc's brief, and `BACKLOG.md:623` |

---

## 2. The measurement

The row's own first scheduled step (`BACKLOG.md:644`) poses a two-way choice: extend the ratified open-time recovery to a page-segment boundary, or harden the runner's Supabase bootstrap. The row's evidence is a list of CI runs. Nobody had read the runs for **when** inside the job each failure fired, and that is the number the choice turns on.

Taken against the eight app-e2e job logs the row cites, via `actions/runs/<id>/jobs` for step timings and `actions/jobs/<id>/logs` for the reporter output. Attempt is named where the row distinguishes attempts.

### 2.1 Where the failures land

| Run | Failing member | Position | Class |
|---|---|---|---|
| 32763990640 attempt 1 | `admin-settings-admins-refresh:91` | test 88 / 158 | `is_admin` 502, named in the server log |
| 32763990640 attempt 1 | `needs-attention-page:223` | test 109 / 158 | `is_admin` 502 |
| 32786399563 attempt 1 | `admin-settings-admins-refresh:91` | test 88 / 158 | `is_admin` 502 |
| 32763990640 attempt 2 | `admin-changes-feed-layout:118` | test 2 / 158 | sibling row, not held here |
| 32571008405 | `published-show-attention:138` | test 121 / 167 | recovery fired and still failed |
| 32571008405 | `telemetry-layout:170` | test 167 / 167 | loading shell, zero rects |
| 32573475808 | `telemetry-layout:170` | test 167 / 167 | loading shell, zero rects |
| 32572200250 | `notify-toggles:168` | test 119 / 167 | settle |
| 32587470121 | `notify-toggles:168` | test 119 / 158 | settle |

### 2.2 Where the stack is by then

From the step timings of run 32571008405, and the same shape holds in all four `2026-08-22` runs:

```
11:42:51  Boot local Supabase (guarded migrations)   started
11:44:02  Boot local Supabase                        SUCCESS   (71s)
11:44:06  Seed fixture shows                         SUCCESS   (gateway exercised, green)
11:44:38  Run app-e2e                                started
11:46:07  Running 167 tests using 1 worker
11:48:59  test 121 FAILS
11:49:27  test 167 FAILS
```

The gateway booted, served every migration and served the seed before the first test ran. The earliest test FAILURE in any of the eight runs is test 88, roughly five minutes downstream of a green `supabase start`.

### 2.3 The fault is ambient, and the sample of it is biased

Interleaving every `upstream server` line with the reporter's test indices, across all eight logs. Each entry is the test that was running when a fault surfaced:

```
32571008405       32  88  88 120                        (4)
32572200250      109 118 119                            (3)
32573475808       76  90  91  91 124                    (5)
32587470121       90  90 109 118                        (4)
32763990640 a1    87 108                                (2)
32763990640 a2     1  78  79  88  91 109                (6)
32786399563 a1    77  77  87                            (3)
32786399563 a2    79  88                                (2)
```

Two things follow, and the second is easy to get wrong.

**The fault is a constant of this runner.** Twenty-nine faults across eight runs, 2 to 6 per run, present in **every run measured** including runs where the spec in question passed. What separates a red run from a green one is not whether a fault occurred but whether one landed on a request some assertion depended on. In run 32571008405 a fault surfaced during test 120 and test 121 failed. That number, the ambient per-run fault count, is not written anywhere in the corpus and is this spec's main empirical contribution.

**The positions do NOT establish where faults occur, and this spec does not claim they do.** They cluster in the 76-to-124 band, which is tempting to read as late-run degradation. It cannot be read that way, because a fault appears in this sample only when the consumer that received it chose to log the message, and the consumers that log are the admin loaders, which are the specs running in that band. The sample is therefore a distribution of **consumer logging**, not of faults. That confound is not a limitation of this measurement to work around; it is `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` restated as a number, and the observer in §5 is what removes it. Until it lands, the honest statement about position is the weak one: faults surface as early as test 1 and test 32 and as late as test 124, so no window of the run is clean.

### 2.4 What is not happening

Grepped across all eight logs for `too many clients`, `remaining connection slots`, `connection pool`, `ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`, `socket hang up`, `JavaScript heap out of memory`, `FATAL`: **zero hits in every run.** The only recurring lines are `destination stream closed early` (19 to 48 per run, an aborted RSC stream, a symptom) and `upstream server`. There is no exhaustion signature, no memory signature, and no connection-level failure.

---

## 3. The decision

### 3.1 Bootstrap hardening is refuted

Three independent grounds, each measured above:

1. **There is no cold window to harden.** The boot step exits green, and the gateway then serves every migration and the seed before a single test runs (§2.2). `scripts/ci/supabase-local-bootstrap.sh:90-99` already wraps `supabase start` in an `until` loop of three attempts, and `supabase start` blocks on its own readiness. Whatever a readiness gate could add, it would have to add it to a gateway that has already answered every migration and the seed correctly.
2. **There is no degradation to harden against.** Grepped across all eight logs for exhaustion, memory and connection signatures: zero hits in every run (§2.4). Nothing about the runner's Supabase state measurably changes between the boot and the failure.
3. **No window of the run is clean.** Faults surface from test 1 through test 124 (§2.3). There is no early-versus-late boundary a setup change could sit on, and §2.3 is explicit that the sample cannot support a stronger positional claim in either direction.

A repair aimed at the bootstrap would change a step that is already green and leave the fault rate exactly where it is.

### 3.2 Chosen: extend the ratified open-time recovery to a page-segment boundary

This is the option the evidence supports, and the reason is §2.3: the fault is ambient and per-request, present in every run and absent from no part of one. A fault with that shape is a **boundary** problem, not a setup problem, and the only place to answer it is where the request lands.

**What "page-segment boundary" has to mean, settled by measurement rather than by prose.** The helper today recovers by clicking the product's own Retry control, `await page.locator(RETRY_SELECTOR).click()` at `tests/e2e/helpers/openShowReviewModal.ts:180`, so it reaches a segment only once that segment has MOUNTED its error boundary. Under an upstream fault the admin segment has a second terminal state and it is the one the row's snapshots actually show: `app/admin/layout.tsx:77-81` awaits `Promise.all([requireAdminIdentity, isCurrentUserDeveloper, fetchHealthRollup])`, then `readAppSettingsRow()` at `app/admin/layout.tsx:129`, then conditionally `readFinalizeCheckpoint(...)` at `app/admin/layout.tsx:134`. While those are in flight the segment renders `app/admin/loading.tsx:12` — `label="Loading your dashboard…"`, testid `admin-dashboard-loading`. That is exactly the observed `telemetry-layout` snapshot, and no error boundary is ever mounted on that path, so today's helper has nothing to click.

**The extension is to the segment's LOADING boundary, as one shared helper alongside the existing error-boundary recovery.**

**The retry bound is NOT widened.** `tests/e2e/helpers/openShowReviewModal.ts:47-49` states the bound and forbids widening it. §2.3 gives no reason to reconsider: against an ambient per-request fault a second retry buys one more independent draw, not a qualitatively better outcome. The `published-show-attention` occurrence the row cites as evidence that one retry is insufficient is a fault landing on a second independent request, not a fault surviving a reset.

### 3.3 `notify-toggles`: the recovery, not a targeted wait and not a known-flaky check

`notify-toggles` is the member no batch owns (`BACKLOG.md:594`), wired on `origin/main` since 2026-08-09, oracle row `"notify-toggles.spec.ts": 14` at `scripts/check-app-e2e-executed.mjs:85`. It is the only remaining member of this class that is live on a required check, which makes it the arc's real deliverable. See §4.

The three choices the row names, decided:

- **Accepting a known-flaky required check on `main`, rejected.** A guard rerun by habit stops being read, and a required check that is expected to be red sometimes is a check nobody can act on.
- **A targeted wait on that one server-action settle, rejected**, on §2.3. The failure is not a queue to wait out. Against a per-request fault a longer poll re-draws the same lottery, and it is per-spec whack-a-mole where the class-sweep default requires a derivation.
- **The recovery, chosen**, and it reaches this member for a reason the measurement makes concrete. The test's poll (`tests/e2e/notify-toggles.spec.ts:189-196`) waits on `aria-checked` flipping, which requires the whole round-trip to land: the action's `revalidatePath("/admin/settings")` at `app/admin/settings/_actions/setAlertOnSyncProblems.ts:57`, then the client's `router.refresh()` at `components/admin/settings/NotifyToggle.tsx:101`. **That refresh re-renders the admin segment, which re-runs every read in §3.2: three to five more independent draws against the ambient fault.** The settle the test is waiting on IS a page-segment render, so the page-segment recovery is the same mechanism, not a second one.

One helper, three boundaries, one shape. That is what makes this a derivation rather than a longer list.

---

## 4. Scope, stated honestly

`telemetry-layout` and `published-show-attention` are **both dropped batch-2 members**. Neither appears in any workflow (`grep -rn 'telemetry-layout\|published-show-attention' .github/workflows/` returns nothing), both are `UNSEEN` in `tests/ci/_metaE2eWorkflowCoverage.test.ts:186` and `tests/ci/_metaE2eWorkflowCoverage.test.ts:218`, and their restoration is batch 3's first question (`BACKLOG.md:623`), which this arc's brief puts explicitly out of scope.

So the loader class's live surface is `notify-toggles` alone. The helper built in §3.2 is authored so it covers the loading boundary generally, and it is APPLIED in this arc only where there is a live consumer. Building the two out-of-scope applications now would be speculative code with no consumer, which `subtract-before-you-add` and the process freeze both say not to do. §9 records the reach the helper has and where it is not yet wired, so batch 3 inherits a mechanism rather than a description.

---

## 5. The transport observer

### 5.1 Shape

`lib/supabase/observeTransport.ts`, already built as this arc's first scheduled step (see §6). A `fetch` wrapper installed on **both** server-side client factories, innermost, closest to the real transport, so it sees every attempt exactly once regardless of what any wrapper above it does.

`makeObservingFetch(inner, { baseUrl, onObserve })` records a `TransportObservation` when the inner fetch answers `>= 500` or rejects, and does nothing else on any path. Three transparency properties, each executable:

- `input` and `init` reach `inner` **by identity**, so no header is rebuilt away. `Content-Profile` is the only thing separating `dev.is_admin` from `public.is_admin` (`lib/supabase/retryingFetch.ts`, `contentProfileOf`).
- the `Response` comes back **by identity**, body neither read nor cloned.
- a rejection is rethrown **by identity**, so the caller's failure class is unchanged.

### 5.2 The recursion fence is the LOG LEVEL

The durable sink persists `warn`/`error` through `createSupabaseServiceRoleClient` (`lib/log/persist.ts:2`, `lib/log/persist.ts:25`, `lib/log/persist.ts:83`), so an observer on that client emitting at `warn` would observe its own persist write, without bound. The observer emits at `debug`, which can never persist: `shouldPersist` returns `false` for debug unconditionally (`lib/log/logger.ts:29`) because the `app_events` level CHECK admits only `info`/`warn`/`error` (`supabase/migrations/20260629000002_app_events.sql:6`), and `tests/log/logger.test.ts:91` pins that `persist: true` on a debug call is inert.

A property anchored in a database constraint survives a later scope change. A fence written about one client scope did not survive being restated about a sibling, which is the round the previous arc lost.

### 5.3 Deliberately wider than the retry wrapper

`retryingFetch` owns only 502/503/504 on requests the database proves cannot have written, because re-issuing anything else is double execution. The observer records **every** 5xx on **every** request, because recording is not re-issuing: the widest thing an observation can get wrong is one line of console output. This is what the row means by "the class is NOT bounded by the retry population" (`BACKLOG.md:656`).

### 5.4 The record carries no request data

`target` is an RPC function name or a bare path, never a URL. PostgREST carries filters in the query string (`?email=eq.<address>`) and this record reaches a log sink, so a raw URL here would write a crew member's email into it.

### 5.5 Coverage is enforced, not asserted

A walked meta-test over `app/`, `lib/`, `components/` makes a **new** directly-constructed server-side Supabase client fail by default, so the observer cannot be bypassed by adding a client. Three constructions are exempt on stated grounds: `app/api/test-auth/set-session/route.ts:193` and `app/api/test-auth/set-session/route.ts:229` (test-auth gated, never a production request path) and `lib/dev/materialize/client.ts:18` (a one-line indirection so tests can stub the module).

The walk uses the shared `walkSourceFiles` (`lib/messages/__internal__/walkSourceFiles.ts:8-11`) and the shared source-extension constant rather than a privately re-declared source-extension regex. `tests/supabase/retryableRpcVolatilityScan.ts:258-262` records a round-4 finding where a private regex let a `.mts` site through. It must also see the **dynamic** import form: `scripts/ci/realtime-relay-diagnostic.ts:15` constructs three clients behind `await import("@supabase/supabase-js")`, which a static import-binding walker fails open on. `scripts/` is excluded from the roots by an explicit stated ground, not by silent omission (§9.4).

---

## 6. The plant-four harness, built before this document

The row's second first-scheduled step (`BACKLOG.md:695`) requires the harness before the spec, because three prose designs in a row each introduced the next round's defect. It is committed at `29e30584e`, 14 cases green.

`tests/supabase/observeTransport.plantFour.test.ts` plants four transport states and names the failure each catches:

1. **5xx** records. Without it the fault is dark, which is the whole row.
2. **Success** is invisible and the Response comes back by identity. An observer that rebuilds a Response on the success path changes every green request in the app to prove something about the red ones.
3. **Rejection** rethrows the same object. An observer written around `response.status` reads `.status` off `undefined`, throws its own TypeError, and changes the caller's failure class, a symptom that looks like a product bug and nothing like a logging change.
4. **Body** never read, never cloned, pinned against a one-shot `ReadableStream` a string body would let pass.

`tests/supabase/observeTransport.recursionFence.test.ts` is the fifth plant. It exercises the **default** emit rather than an injected collector, because the injected form proves the observation's shape and proves nothing about the level, and the level is the fence. It asserts `persist === false` directly rather than inferring it from the level, since a later change to `shouldPersist` could make debug persist with the level assertion still passing, and that change is exactly the unbounded recursion.

---

## 7. The workflow capture step

Today `.github/workflows/app-e2e.yml:173-188` runs playwright as a single-line `run:` with no `shell:`, no pipe, no `tee` and no `id:`. The only capture in the file is the failure-conditional artifact upload at `.github/workflows/app-e2e.yml:196-205`. So the observer's records would reach the job log and nothing would extract them.

The capture step carries four mechanics, each with a failure mode worse than the one it prevents:

- `set -o pipefail` under `shell: bash`. Without it the step's status is `tee`'s, and **a failing app-e2e reports success**. A required check that cannot go red is worse than the flake it instruments.
- `2>&1` before the pipe, so both streams are captured.
- `if: always()` on the grep step, else it is skipped exactly when the run failed.
- an `id:`, because the dump's condition references `steps.<id>.outputs.<name>`.

`.github/workflows/x-audits.yml` is the template for the first three, at every site `rg -c "set -o pipefail"` reports in it, the first being `.github/workflows/x-audits.yml:64`. It is **not** a template for the fourth: no step in that workflow carries an `id:` (§9.3).

The grep target is `SUPABASE_UPSTREAM_FAULT`, which reaches the log through the console chokepoint at `lib/log/logger.ts:71` as `code: 'SUPABASE_UPSTREAM_FAULT'` inside the compact object.

---

## 8. Invariants

- **Invariant 9.** `observeTransport.ts` carries `// not-subject-to-meta:` with its ground: it reads no `{ data, error }` pair, because it never sees a Supabase result, only the HTTP exchange underneath one. Any consumer boundary the class sweep touches takes a registry row in the matching meta-test.
- **Invariant 10.** No mutation surface is added. `setAlertOnSyncProblems` already carries `logAdminOutcome` at `setAlertOnSyncProblems.ts:59-64`; if the arc touches it, its `AUDITABLE_MUTATIONS` row and success-branch proof are re-verified rather than assumed.
- **Invariant 2.** No advisory-lock surface is touched.
- **Invariant 8.** In force only if a `components/**` file is touched. §9.2 records the one candidate and why it is a documented limit instead.
- **Mutation registry.** `supabaseRetryingFetch` (`tests/mutation/source/registry.ts:3547`), `supabaseRetryEligibility` (`tests/mutation/source/registry.ts:3565`) and `retryableRpcVolatilityScan` (`tests/mutation/source/registry.ts:3579`) are already enrolled at `scoreFloor: 0.9`, `operators: [...OPERATOR_NAMES]`, `accepted: []`. `observeTransport.ts` is a guard-shaped importable module with referring suites, so it is enrolled and scored **before** the round-1 diff dispatch, and the measured score, the empty unaccepted-survivor set and the operator set go on the `GUARD SURFACE:` line.

---

## 9. Documented limits

Recorded here and carried into both archive entries. Each names its re-file trigger. None is filed as a row, per the directive.

### 9.1 The observer records; it does not make faults visible to users

`components/admin/Dashboard.tsx` maps both a returned error and a throw to "Held", and `lib/admin/bellFeed.ts` returns `infra_error` without logging. After this arc both still do. What changes is that the occurrence is now durably recorded at the transport, which is what the row asked for ("leaving the occurrence unattributable"). Distinguishing "held" from "we could not read this" for the admin is a UI question, and UI redesign of the admin surfaces is out of this arc's scope. **Re-file trigger:** an admin reports acting on a "Held" state that was actually an infra fault.

### 9.2 `NotifyToggle.tsx` does not surface a failed write

`components/admin/settings/NotifyToggle.tsx:99-102` is `const result = await action(!on); if (result.ok) router.refresh();` with no else branch. The action's own header at `app/admin/settings/_actions/setAlertOnSyncProblems.ts:12-14` promises the opposite: the UI is to keep its prior visual state and prompt a refresh, never showing a silent false success. The `${testId}-degraded` live region at `components/admin/settings/NotifyToggle.tsx:83-96` is driven by `initial.kind === "infra_error"`, the READ at page load, not by the write result. A failed write therefore shows the admin nothing.

Not repaired here: the region's copy is a read-failure message, so a write-failure signal needs new user-visible copy, which means a §12.4 catalog row, `pnpm gen:spec-codes`, a `lib/messages/catalog.ts` row and the invariant-8 impeccable dual gate on a `components/**` diff. That is a second arc's worth of tail on this one, and it is a product decision about what the admin should be told. **Re-file trigger:** the observer records a `SUPABASE_UPSTREAM_FAULT` on an `app_settings` UPDATE path, which converts this from a reachable-in-principle gap into a measured one.

### 9.3 The `id:` half of the capture pattern does not exist anywhere yet

`BACKLOG.md:683-688` states that `.github/workflows/x-audits.yml` "already does all of this in four places". Two corrections: there are **13** `set -o pipefail` sites, not four; and **none of them carries an `id:`**. The only `id:` keys in the workflow tree are in `mutation-harness.yml` and `screenshots-drift.yml:117`. The app-e2e capture step is the first site to carry all four mechanics together, so it is authored from the spec rather than copied. **Re-file trigger:** none needed; this is a correction to a settled design note, and §7 is now the accurate statement.

### 9.4 `scripts/` is outside the observer's coverage, deliberately

Six or more direct constructions live under `scripts/` (`validation-reseed.ts:134`, `validation-resolve-alias.ts:118`, `validation-report-fixtures.ts:697`, `validation-check-seed.ts:915`, `validation-smoke.ts:68`, and three behind a dynamic import in `scripts/ci/realtime-relay-diagnostic.ts:51`, `scripts/ci/realtime-relay-diagnostic.ts:114`, `scripts/ci/realtime-relay-diagnostic.ts:163`). None is a server request path. They are operator tools whose faults surface to the operator running them, on the terminal, immediately. Including them would put the observer's console output into every validation script's stdout for no attributable occurrence. The meta-test's roots exclude `scripts/` by this stated ground rather than by silent omission. **Re-file trigger:** a script grows a long-running server mode.

### 9.5 `log.debug` reaches stdout, not stderr

`BACKLOG.md:685` gives "the records travel on stderr" as the reason `2>&1` is needed. That is true for `warn` and `error` and false for `debug`: `console[record.level]` at `lib/log/logger.ts:71` resolves to `console.debug`, which Node aliases to `console.log` and therefore to **stdout**. The mechanic survives its wrong reason, since `2>&1 | tee` merges both streams and captures the records either way, but the stated ground was wrong and §7 now states the right one. **Re-file trigger:** none; corrected in place.

---

## 10. Acceptance criteria

- **AC-1.** `makeObservingFetch` is installed on both `createSupabaseServerClient` and `createSupabaseServiceRoleClient`, innermost. A test pins the composition order against the retrying fetch and the fault injector.
- **AC-2.** The plant-four harness and the recursion fence are green (already: 14 cases, `29e30584e`).
- **AC-3.** A walked meta-test fails when a fourth directly-constructed server-side client is added, proven by a synthetic fixture rather than by an enumerated list, and sees the dynamic-import form.
- **AC-4.** `app-e2e.yml` captures the run's output with all four mechanics, greps for `SUPABASE_UPSTREAM_FAULT`, and a deliberately-injected fault makes the record appear in the step's output. The step's status still reflects playwright's, proven by a failing-playwright case.
- **AC-5.** The page-segment settle helper waits out the loading boundary and recovers once from the error boundary, applied at `notify-toggles`' settle. The recovery bound stays at one.
- **AC-6.** `observeTransport.ts` is enrolled in the mutation registry, scored before the round-1 diff dispatch, with zero unaccepted survivors.
- **AC-7.** Both rows graduate to `BACKLOG-archive.md` carrying §9 verbatim. No new `BL-`/`DEF-` row exists anywhere in the diff.
