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
| **The open-time recovery's retry bound stays at ONE**, and this arc does not touch the helper at all (§4). Proposing a widened bound as a repair is out of scope twice over. | `tests/e2e/helpers/openShowReviewModal.ts:47-49` |
| **A write is never retried.** A 502 does not prove a request failed to commit, so retrying a mutation is double execution: nothing errors and the data is wrong. This is why `setAlertOnSyncProblems`' UPDATE cannot be absorbed and §3.3 does not propose absorbing it. | `lib/supabase/retryingFetch.ts` header, `lib/supabase/retryEligibility.ts` |
| **The service-role client is excluded from the RETRY wrapper and INCLUDED in the observer.** Two different decisions with two different reasons: the retry's exclusion is the durable sink's recursion fence; the observer's inclusion is safe because its fence is the log LEVEL (§5.2), not the client scope. | `lib/supabase/server.ts:90-98`, `tests/supabase/serverClientWiring.test.ts:80` |
| **The four batch-2 drops stay dropped.** Their restoration is batch 3's first question, not this arc's. | `BACKLOG.md:623` |
| **PR #882 repairs four consumer boundaries and claims no completeness.** That fence is deliberate. It is not a defect in #882 to be re-found here. | `BACKLOG.md:660-662` |
| **A per-spec red counter advances only on a red that REPRODUCES on the same bytes.** A non-reproducing red is an environment observation. | `BACKLOG.md:612`, ratified 2026-08-24 |
| **The design items at `BACKLOG.md:666-693` are settled inputs**, each having cost a review round on the previous arc: observe at the transport, fence on the log level, plant four states, capture in the workflow, enforce coverage by walking. §9.3 and §9.5 correct two factual sub-claims inside them without reopening any decision. | `BACKLOG.md:666-693` |
| **`telemetry-layout` and `published-show-attention` are out of scope**, being dropped batch-2 members whose restoration batch 3 owns. §4 states what the helper reaches anyway. | this arc's brief, and `BACKLOG.md:623` |

---

## 2. The measurement

The row's first scheduled step (`BACKLOG.md:644`) poses a two-way choice: extend the ratified open-time recovery to a page-segment boundary, or harden the runner's Supabase bootstrap. Nobody had read the cited CI runs for what each failure was ATTRIBUTABLE TO, and that is what the choice turns on.

### 2.0 Population, counting unit, and what this measurement is not

Stated first, because round 1 established that the numbers are worthless without it.

**Population.** `BL-ADMIN-LOADER-CI-TRANSIENT` cites ten run IDs across twelve job attempts. This measurement covers **eight attempts of six IDs**: `32571008405`, `32572200250`, `32573475808`, `32587470121`, `32763990640` (attempts 1 and 2) and `32786399563` (attempts 1 and 2).

**Exclusion rule, stated rather than left implicit.** The four IDs not measured — `32557812890`, `32561531983`, `32563705156`, `32564772189` — are the occurrences the row itself records as UNATTRIBUTED: three were reproduced locally green under the CI posture and one carries no trace at all (`--retries=0`, `BACKLOG.md:590`). They contribute a failure with no named mechanism, which is exactly what this measurement cannot use. Excluding them WEAKENS the sample rather than flattering it, and any conclusion below is drawn only from the eight.

**Counting unit.** One Node error object prints across several lines (`message`, `stack`, a nested `error`, plus the reporter's own `⨯` line), so counting `upstream server` LINES overcounts faults. Deduplicating by timestamp second gives:

```
run                 raw lines   distinct seconds
32571008405              4            3
32572200250              3            3
32573475808              5            4
32587470121              4            3
32763990640 a1           2            2
32763990640 a2           6            6
32786399563 a1           3            2
32786399563 a2           2            2
TOTAL                   29           25
```

The right-hand column is the one to use, and it reconciles with the committed probe from `fix/admin-loader-ci-transient`, which reports 2 events for `32786399563` attempt 1 where a raw line count says 3.

**What this measurement is NOT.** It observes faults that some consumer chose to LOG. It cannot see a fault a consumer swallowed, so it establishes a floor on the fault rate and nothing about the true distribution. That limitation is not incidental to this arc; it is `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` restated as a number, and §5 is what removes it.

### 2.1 Where the failures land, and what each is attributable to

| Run | Failing member | Position | Mechanism NAMED in the job log |
|---|---|---|---|
| 32763990640 a1 | `admin-settings-admins-refresh:91` | test 88 / 158 | `requireAdmin: is_admin RPC failed` |
| 32763990640 a1 | `needs-attention-page:223` | test 109 / 158 | same run, same mechanism |
| 32786399563 a1 | `admin-settings-admins-refresh:91` | test 88 / 158 | `requireAdmin: is_admin RPC failed` |
| 32763990640 a2 | `admin-changes-feed-layout:118` | test 2 / 158 | sibling row, not held here |
| 32571008405 | `published-show-attention:138` | test 121 / 167 | open-time recovery fired and still failed |
| 32571008405 | `telemetry-layout:170` | test 167 / 167 | none named |
| 32573475808 | `telemetry-layout:170` | test 167 / 167 | none named |
| 32572200250 | `notify-toggles:168` | test 119 / 167 | `requireAdmin: is_admin RPC failed` |
| 32587470121 | `notify-toggles:168` | test 119 / 158 | `requireAdmin: is_admin RPC failed`, plus `admin_read_share_token returned error` |

### 2.2 The attribution that decides this arc

**Both `notify-toggles` failures name only RPCs that PR #882 now retries.** `is_admin` and `admin_read_share_token` are both members of `RETRYABLE_RPCS` (`lib/supabase/retryEligibility.ts:25-40`), so both are inside the eligibility bound `lib/supabase/retryingFetch.ts` absorbs. Every `upstream server` line in either run is one of those two:

```
32587470121:  requireAdmin: is_admin RPC failed: An invalid response was received from the upstream server
              admin_read_share_token returned error: An invalid response was received from the upstream server
32572200250:  requireAdmin: is_admin RPC failed: An invalid response was received from the upstream server
```

Both runs predate #882 (2026-08-22; #882 merged 2026-08-25 as `15e0b2d95`). **There is no post-#882 evidence that `notify-toggles` fails through any other request.** §3 is built on that sentence.

### 2.3 What the positions do and do not show

Faults surface at tests 1, 32, 76 through 91, 108 through 124 across the eight attempts, and 2 to 6 fault-seconds appear in every attempt measured, including ones where the spec in question passed. So the fault is present throughout rather than confined to a startup window.

The positions cannot be read as the fault DISTRIBUTION, and this spec does not read them that way. A fault enters this sample only when its consumer logged it, and the consumers that log are the admin loaders, which are the specs running in the 76-to-124 band. The clustering is a property of which consumers speak, not of when faults occur.

## 3. The decision

### 3.1 What round 1 refuted in the first draft, recorded so it is not re-derived

The first draft refuted bootstrap hardening on three grounds and all three were wrong or overstated. Recorded here rather than deleted, because a reader who re-derives them will reach the same wrong answer:

- **"The gateway served every migration and the seed before a test ran" is FALSE.** Neither traverses the gateway. Migrations are applied by `supabase migration up --include-all` (`scripts/ci/supabase-local-bootstrap.sh:111`) over a direct connection, and the seed shells out to `psql` against `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (`supabase/seed.ts:19` and `supabase/seed.ts:205`) — port 54322 is Postgres, not the API gateway on 54321. A green boot and a green seed say nothing about the PostgREST path the failures implicate.
- **"No degradation signature in any log" proves only that selected strings were absent from application output.** It measures no container restart, no resource pressure, no gateway or PostgREST state.
- **"No window of the run is clean" reuses the positional inference §2.3 retracts**, and a setup-time configuration change need not correspond to an early-or-late boundary anyway.

**So this spec does not claim bootstrap hardening is refuted.** It claims something narrower and better supported, below.

### 3.2 The row's remainder has no live member, and that is what settles it

Taking the three remaining members in turn:

- **`notify-toggles`** names only RPCs #882 now retries (§2.2), with no post-#882 counter-evidence. It is the member the row called "wired on `main` and owned by no batch", and on the evidence it is the member #882 closed.
- **`telemetry-layout`** and **`published-show-attention`** are dropped batch-2 members. Neither appears in any workflow, both are `UNSEEN` in `tests/ci/_metaE2eWorkflowCoverage.test.ts:186` and `tests/ci/_metaE2eWorkflowCoverage.test.ts:218`, and their restoration is batch 3's first question (`BACKLOG.md:623`), out of this arc's scope.

**Neither of the row's two candidate repairs has a live member to fix.** Extending the recovery would ship a mechanism for two specs that run in no workflow; hardening the bootstrap would change a step whose contribution to these failures is unmeasured and, per §2.2, whose implicated requests are already absorbed at a different layer.

The row therefore closes on its DISPOSITION rather than on a repair, and the disposition is the measurement: its remainder is absorbed by #882 or held by batch 3. That is not a deferral and not a product call. It is the answer §2 produced, and it differs from the answer the row anticipated because the row was written before #882 landed.

**RATIFIED by the orchestrator, 2026-08-25.** The ruling has three parts, recorded so none is re-derived:

1. `BL-ADMIN-LOADER-CI-TRANSIENT` closes by recorded disposition, not by a speculative recovery.
2. `telemetry-layout` and `published-show-attention` are recorded as a documented limit on the batch-2 spec's own limits section, with their run ids, and NOT as a new ledger row (Eric's directive). That entry is at `docs/superpowers/specs/ci/2026-08-21-app-e2e-batch2-design.md` §9.
3. **The two-way recovery choice is RETIRED as undecidable on current evidence**, with §3.1's correction written into the disposition so nobody re-refutes bootstrap hardening on the boot-and-seed argument.

The observability row's deliverable (§5, §6, §7) is unaffected and is what this arc ships.

### 3.3 What the next occurrence needs, which is what this arc builds

The reason the paragraph above took a full review round to reach is that every attribution in §2.1 came from a consumer that happened to print its error message, and three of the nine rows name no mechanism at all. Two of those three are `telemetry-layout`, whose loader produced no diagnostic whatsoever.

That is the gap `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` names, and closing it is what makes the NEXT occurrence a reading rather than an inference. §5 through §7 are that work.

## 4. What this arc ships, and what it does not

**Ships:** the transport observer and its install on both server-side factories (§5), the plant-four harness and its recursion fence (§6), the walked coverage guard (§5.5), the app-e2e capture step (§7), the shared bounded target describer (§5.4), and the graduation of both rows carrying §9 and §9a.

**Does not ship, by the ratified disposition in §3.2:** any page-segment recovery helper, any settle gate on `notify-toggles`, and any change to the runner's Supabase bootstrap. None has a live member to fix, and building a mechanism for two specs that run in no workflow is speculative code with no consumer.

**Was in the first draft and is deliberately gone:** a shared `awaitAdminSegmentSettled` helper keyed on the loading boundary. Round 1 established two things about it. It specified no recovery ACTION for a persisting loading shell, and there is no control to click, so "waits out" was a wait rather than a recovery. And its premise about which awaits that boundary covers was wrong. Next's own file-conventions reference for the loading file, shipped in the installed package under `next/dist/docs`, states that it wraps the page and any nested layouts in a Suspense boundary and does NOT wrap the layout in its own segment, and that a layout reading uncached or runtime data shows no fallback at all because navigation blocks until the layout finishes. So the fallback observed in the cited runs proves the admin layout had already resolved, which is the opposite of what the draft inferred from it. Removing it is the subtraction the evidence called for rather than a descope under pressure.

**Out of scope by prior ratification:** the batch-3 restoration question for the four dropped batch-2 members (`BACKLOG.md:623`), any UI redesign of the admin surfaces, and `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`.

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

`retryingFetch` owns a bounded population: requests the database proves cannot have written, failing with 502/503/504 **or rejecting at the transport** (`lib/supabase/retryingFetch.ts`, the `transient` expression, which is `error !== undefined || RETRYABLE_STATUSES.has(response.status)`). The observer is wider on three axes and rejections is not one of them: **every 5xx** rather than the gateway trio, **every request** rather than the retry-eligible ones, and **both server-side clients** rather than the cookie-bound one. Recording is not re-issuing, so the widest thing an observation can get wrong is one line of console output.

### 5.4 The record carries no request data, on any path shape

`target` is an RPC function name, or a path truncated to its first three segments with the truncation marked. It is never a URL and never a full path.

Round 1 probed why the query string is not enough, against ordinary service-role Storage traffic rather than a constructed URL. This observer runs on the service-role client, which uploads diagram snapshots, and Storage puts its identifiers in the PATH. The probed request:

```
/storage/v1/object/diagram-snapshots/show_123/rev_7/private-diagram.png?token=...
```

carries a show id, a revision and a private object key, none of which the query-string strip removes.

Three segments is derived, not chosen: the smallest bound that keeps `/rest/v1/<table>` intact, because a record that cannot say which table faulted is not worth writing. The mount prefix is stripped before counting, or a proxied deployment spends its whole budget on its own prefix.

**One describer, shared.** `describeTransportTarget` lives in `lib/supabase/retryEligibility.ts` beside the `rpcFunctionName` and `basePathOf` it is built from, and BOTH emits that name a target call it: the observer's `TransportObservation` and the retry wrapper's `RetryEmit`. The retry wrapper's copy had the same defect and is the more serious of the two, because its emit persists through `log.warn`. No live request reaches it today, but only because `isRetryEligible` happens to admit nothing deeper than `/rest/v1/<table>` — a coincidence rather than a guarantee, which would break silently the day eligibility widened. Sharing the describer makes the bound a property of the emit.

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

Each is a genuine limit under the consequence bound, and each names its re-file trigger.

### 9.1 The observer records; it does not make faults visible to users

`components/admin/Dashboard.tsx` maps both a returned error and a throw to "Held", and `lib/admin/bellFeed.ts` returns `infra_error` without logging. After this arc both still do. What changes is that the occurrence is durably recorded at the transport, which is what the row asked for. Distinguishing "held" from "we could not read this" for the admin is a UI question, and UI redesign of the admin surfaces is out of scope. **Re-file trigger:** an admin reports acting on a "Held" state that was actually an infra fault.

### 9.2 `NotifyToggle.tsx` does not surface a failed write

`components/admin/settings/NotifyToggle.tsx:99-102` is `const result = await action(!on); if (result.ok) router.refresh();` with no else branch. The action's own header at `app/admin/settings/_actions/setAlertOnSyncProblems.ts:12-14` promises the opposite: the UI is to keep its prior visual state and prompt a refresh, never showing a silent false success. The `${testId}-degraded` live region at `components/admin/settings/NotifyToggle.tsx:83-96` is driven by `initial.kind === "infra_error"`, the READ at page load, not by the write result. A failed write therefore shows the admin nothing.

Three distinct failure paths reach it and none calls `router.refresh()`: a thrown gate fault, a returned UPDATE error, and an RLS-denied zero-row update.

Not repaired here: the region's copy is a read-failure message, so a write-failure signal needs new user-visible copy, which means a §12.4 catalog row, `pnpm gen:spec-codes`, a `lib/messages/catalog.ts` row and the invariant-8 impeccable dual gate on a `components/**` diff. That is a second arc's worth of tail, and it is a product decision about what the admin should be told. **Re-file trigger:** the observer records a `SUPABASE_UPSTREAM_FAULT` on an `app_settings` UPDATE path, which converts this from reachable-in-principle to measured.

### 9.3 `scripts/` is outside the observer's coverage, deliberately

Six or more direct constructions live under `scripts/` (`scripts/validation-reseed.ts:134`, `scripts/validation-resolve-alias.ts:118`, `scripts/validation-report-fixtures.ts:697`, `scripts/validation-check-seed.ts:915`, `scripts/validation-smoke.ts:68`, and three behind a dynamic import in `scripts/ci/realtime-relay-diagnostic.ts:51`, `scripts/ci/realtime-relay-diagnostic.ts:114`, `scripts/ci/realtime-relay-diagnostic.ts:163`). None is a server request path. They are operator tools whose faults surface to the operator running them, immediately, on the terminal. Including them would put the observer's output into every validation script's stdout for no attributable occurrence. The meta-test's roots exclude `scripts/` by this stated ground rather than by silent omission. **Re-file trigger:** a script grows a long-running server mode.

## 9a. Two corrections to settled design notes

Not limits, and deliberately not filed as such: they carry no re-file trigger because nothing is left open. They are recorded because `BACKLOG.md` states each one the other way and a reader would otherwise re-derive the wrong version.

- **`BACKLOG.md:683-688` says `x-audits.yml` "already does all of this in four places".** There are 13 `set -o pipefail` sites in that file, not four, and **none carries an `id:`** — the only `id:` keys in the workflow tree are in `mutation-harness.yml` and `screenshots-drift.yml:117`. §7's capture step is the first site to carry all four mechanics together, so it is authored rather than copied.
- **`BACKLOG.md:685` gives "the records travel on stderr" as the reason `2>&1` is needed.** True for `warn` and `error`, false for `debug`: `console[record.level]` at `lib/log/logger.ts:71` resolves to `console.debug`, which Node aliases to `console.log` and therefore to stdout. The mechanic survives its wrong reason, since `2>&1 | tee` captures both streams either way.

## 10. Acceptance criteria

The consequence bound, restated as the criterion: every upstream fault is either absorbed by a bounded retry or recorded with a durable code. A conservative demote plus a surfaced signal is a documented limit, not a defect.

- **AC-1.** `makeObservingFetch` is installed on both `createSupabaseServerClient` and `createSupabaseServiceRoleClient`. The REQUIRED composition is stated, not merely pinned: on the cookie-bound client the stack is `retry → observer → injector → real fetch`, so the observer sees every attempt the retry makes AND sees the test injector's forced faults. The observer is therefore innermost of the PRODUCTION wrappers, with the injector deliberately inside it; §5.1 says that rather than "innermost". The service-role client's fetch stays late-bound, because supabase-js resolves `fetch` per request when none is supplied, and an eager capture would silently pin the transport at factory-call time. Verified in the vendored client: `resolveFetch` returns `(...args) => fetch(...args)` when no `customFetch` is given (supabase-js 2.105.1, its bundled CommonJS entry, lines 96 to 99).
- **AC-2.** The plant-four harness and the recursion fence are green.
- **AC-3.** A walked meta-test fails when a fourth directly-constructed server-side client is added, proven by a synthetic fixture rather than an enumerated list, and stays silent on the two live comment mentions in `lib/observe/query/events.ts:64` and `lib/validation/reseedFixtures.ts:19`.
- **AC-4.** `app-e2e.yml` captures the run's output with all four mechanics, and the step's status still reflects playwright's, proven by a structural assertion on the parsed workflow. That a record reaches the captured stream is proved LOCALLY against an injected fault; no CI assertion claims a given ambient record was the injected one, because §2.0 shows ambient faults appear in every run.
- **AC-5.** `describeTransportTarget` is the single describer for both emits, and no record carries a path identifier. Probed against the Storage shape, not asserted.
- **AC-6.** `observeTransport.ts` is enrolled in the mutation registry, scored before the round-1 diff dispatch, with zero unaccepted survivors.
- **AC-7.** Both rows graduate to `BACKLOG-archive.md` carrying §9 and §9a. No new `BL-`/`DEF-` row exists anywhere in the diff.
