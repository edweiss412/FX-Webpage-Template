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

### 2.0 Population and counting unit

**The population is COMPLETE: all ten run IDs the row cites, across all twelve job attempts.** There is no exclusion rule, because round 2 showed that any rule I could state was doing work the evidence should do: the first draft excluded four IDs as "unattributed" and one of them, `32557812890`, was a third occurrence of the very case the conclusion rested on.

**The counting rule is the committed probe's, adopted rather than reinvented.** `docs/superpowers/specs/ci/probes/2026-08-24-admin-loader-502-clustering.md:164` states it: a genuine 502 is a line containing `An invalid response was received from the upstream server`; events are keyed by **(timestamp-second, consumer)**, so one fault printing several lines counts once; and the consumer is read from the same line when it names an RPC, otherwise from the most recent preceding log-object header, otherwise `unattributed`.

The first draft keyed on the SECOND alone and matched only two message shapes. Round 3 showed what that cost: it collapsed distinct consumers sharing a second, and it missed every fault whose consumer is named by a log-object header rather than inline. Two log-object headers appear in these runs and both resolve to an RPC — `ADMIN_SHOW_VERSION_TOKEN_READ_FAILED` to `viewer_version_token` and `ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED` to `readfinalizeowned_b2`, both at `app/admin/_showReviewModal.tsx:142` and `app/admin/_showReviewModal.tsx:188`.

**What this measurement is NOT.** It observes faults that some consumer chose to LOG. It cannot see a fault a consumer swallowed, so it establishes a floor and nothing about the true distribution. That is not incidental to this arc: it is `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` restated as a number, and §5 removes it. §2.2 is careful about exactly this.

### 2.1 The complete table

Every attempt, its failing member, its 502 event count and every consumer named, under the rule above.

| Run | Failing member | 502 events | Consumers named |
|---|---|---|---|
| 32557812890 | `notify-toggles:168` | 2 | `is_session_live`, `viewer_version_token` |
| 32561531983 | `admin-parse-panel:245` | 4 | `is_session_live`, `viewer_version_token`, `readfinalizeowned_b2` |
| 32563705156 | `warning-panel-polish:275` | 2 | `is_admin`, `admin_read_share_token` |
| 32564772189 | `needs-attention-page:181` | 3 | `is_session_live`, `get_admin_show_review_snapshot` |
| 32571008405 | `published-show-attention:138`, `telemetry-layout:170` | 3 | `admin_read_share_token`, `get_admin_show_review_snapshot` |
| 32572200250 | `notify-toggles:168` | 3 | `is_admin`, `viewer_version_token`, `readfinalizeowned_b2` |
| 32573475808 | `telemetry-layout:170` | 4 | `admin_read_share_token`, `viewer_version_token`, `readfinalizeowned_b2` |
| 32587470121 | `notify-toggles:168` | 3 | `is_admin`, `admin_read_share_token`, `readfinalizeowned_b2` |
| 32763990640 a1 | `admin-settings-admins-refresh:91`, `needs-attention-page:223` | 2 | `is_admin`, `is_session_live` |
| 32763990640 a2 | `admin-changes-feed-layout:118` | 6 | `is_session_live`, `viewer_version_token`, `get_admin_show_review_snapshot` |
| 32786399563 a1 | `admin-settings-admins-refresh:91` | 2 | `is_admin`, `admin_read_share_token` |
| 32786399563 a2 | none (this attempt went GREEN) | 2 | `is_developer`, `viewer_version_token` |

**Thirty-six events across twelve attempts, naming SEVEN distinct functions, and every one of the seven is a member of `RETRYABLE_RPCS`** (`lib/supabase/retryEligibility.ts:25-40`): `is_admin`, `is_session_live`, `is_developer`, `admin_read_share_token`, `get_admin_show_review_snapshot`, `viewer_version_token`, `readfinalizeowned_b2`. Not one consumer falls outside the set `lib/supabase/retryingFetch.ts` absorbs.

Three corrections to the row's own text follow, and the first two are the reason this table exists:

- **The row calls three occurrences unattributed.** They are not. `32561531983`, `32563705156` and `32564772189` each name consumers in the log. What was true is that nobody had read the logs.
- **`telemetry-layout` is not undiagnosable.** Both its runs name consumers. Earlier drafts of this spec said otherwise, which was an artefact of a narrower extraction rule, not a property of the runs.
- **The last row is the useful one.** `32786399563` attempt 2 carried two 502 events and went GREEN. A fault is not a failure.

### 2.2 What the table does and does not license

**It does not establish causation, and this spec does not claim it.** The reason is in this arc's own §9.2: the `app_settings` UPDATE returns `{ ok: false }` without logging, and `components/admin/settings/NotifyToggle.tsx:99-102` ignores that result. A failed write is invisible, so "the log names only retryable RPCs" cannot exclude an unlogged write fault or another dark round-trip. No request identifier ties a logged consumer to a failed assertion, and the green attempt above shows a named fault need not correspond to any failure at all.

**What it does license** is the strongest statement the evidence supports: across two PRs, several branches and twelve attempts, **every consumer anyone can name for this class is a now-retryable RPC, and no attempt names a consumer outside that set.** That is a complete absence of evidence for a second mechanism, which is not the same as evidence of its absence, and §3 is built on the weaker of those two readings.

### 2.3 What the positions do and do not show

Faults surface throughout the runs rather than in a startup window, and 2 to 6 fault-seconds appear in every attempt measured, including attempts where the spec in question passed. So the fault is ambient.

The positions cannot be read as the fault DISTRIBUTION, and this spec does not read them that way. A fault enters this sample only when its consumer logged it, and the consumers that log are the admin loaders. The clustering is a property of which consumers speak.

### 2.4 What is not happening

Grepped across every attempt for `too many clients`, `remaining connection slots`, `connection pool`, `ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`, `socket hang up`, `JavaScript heap out of memory` and `FATAL`: zero hits. The only recurring lines are `destination stream closed early` (an aborted RSC stream, a symptom) and `upstream server`.

## 3. The decision

### 3.1 What round 1 refuted in the first draft, recorded so it is not re-derived

The first draft refuted bootstrap hardening on three grounds and all three were wrong or overstated. Recorded here rather than deleted, because a reader who re-derives them will reach the same wrong answer:

- **"The gateway served every migration and the seed before a test ran" is FALSE.** Neither traverses the gateway. Migrations are applied by `supabase migration up --include-all` (`scripts/ci/supabase-local-bootstrap.sh:111`) over a direct connection, and the seed shells out to `psql` against `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (`supabase/seed.ts:19` and `supabase/seed.ts:205`) — port 54322 is Postgres, not the API gateway on 54321. A green boot and a green seed say nothing about the PostgREST path the failures implicate.
- **"No degradation signature in any log" proves only that selected strings were absent from application output.** It measures no container restart, no resource pressure, no gateway or PostgREST state.
- **"No window of the run is clean" reuses the positional inference §2.3 retracts**, and a setup-time configuration change need not correspond to an early-or-late boundary anyway.

**So this spec does not claim bootstrap hardening is refuted.** It claims something narrower and better supported, below.

### 3.2 Why the row closes on its disposition rather than on a repair

Two facts, and the second is the one that decides it.

**Every consumer the class's complete evidence names is already absorbed.** Thirty-six 502 events across twelve attempts name seven distinct functions, and all seven are retryable (§2.1). Whatever else is true, the row's own evidence contains no consumer that #882's wrapper does not already cover.

**And no remaining member's failure can be ATTRIBUTED well enough to choose a repair.** §2.2 is explicit that the association is not causation, and §9.2 names the dark path that keeps it from being one. Taking the three remaining members in turn:

- **`notify-toggles`** has three occurrences across three branches, each naming only now-retryable consumers and nothing else. Whether any of them CAUSED the failures is exactly what nobody can currently establish, and §2.1 closes with an attempt that named two faults and went green.
- **`telemetry-layout`** and **`published-show-attention`** are dropped batch-2 members. Neither appears in any workflow, both are `UNSEEN` in `tests/ci/_metaE2eWorkflowCoverage.test.ts:186` and `tests/ci/_metaE2eWorkflowCoverage.test.ts:218`, and their restoration is batch 3's first question (`BACKLOG.md:623`), out of this arc's scope.

**A repair cannot be chosen for a failure whose mechanism nobody can name.** Extending the recovery and hardening the bootstrap are both answers to a question the evidence does not yet ask precisely enough: one presumes a page-segment boundary is where the failure lands, the other presumes the runner's setup is. Nothing in §2 distinguishes them, and §3.1 records why the first draft's attempt to distinguish them was wrong.

So the row closes on its DISPOSITION, and the disposition is that its remainder is unattributable on current evidence, with every named mechanism already absorbed. That is not a deferral: it is the answer §2 produced, and it differs from the answer the row anticipated because the row was written before #882 landed and before anyone had read the three logs it called unattributed.

**RATIFIED by the orchestrator, 2026-08-25**, in three parts:

1. `BL-ADMIN-LOADER-CI-TRANSIENT` closes by recorded disposition, not by a speculative recovery.
2. `telemetry-layout` and `published-show-attention` are recorded as a documented limit on the batch-2 spec's limits section, with their run ids, and NOT as a new ledger row (Eric's directive). That entry is at `docs/superpowers/specs/ci/2026-08-21-app-e2e-batch2-design.md` §9.
3. The two-way recovery choice is RETIRED as undecidable on current evidence, with §3.1's correction written in so nobody re-refutes bootstrap hardening on the boot-and-seed argument.

**RE-RATIFIED on the new basis**, verbatim, after §2.2 replaced the earlier and weaker justification that #882 had absorbed the remainder:

> `BL-ADMIN-LOADER-CI-TRANSIENT` closes because its remaining member is UNATTRIBUTABLE on current evidence (3-for-3 association with retryable RPCs across runs 32572200250, 32587470121, 32557812890, no causation, a dark `app_settings` path that logs nothing), not because #882 absorbed it; the two-way recovery choice retires as undecidable, and OBSERVABILITY is the precondition for ever attributing it.

The observability deliverable (§5, §6, §7) is unaffected and is what this arc ships.

### 3.3 What the next occurrence needs, which is what this arc builds

Every consumer in §2.1 is named only because some code path happened to log its error message, and §2.2 records what that cannot support. The gap is not that the logs are silent; it is that they are ARBITRARY. A consumer that logs appears, a consumer that swallows does not, and nothing distinguishes "this request did not fault" from "this request's fault was discarded". §9.1 and §9.2 name two swallowing paths that are live today.

That is the gap `BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY` names, and closing it is what makes the NEXT occurrence a reading rather than an inference. §5 through §7 are that work.

---

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

Two independent obstacles sit between an observation and a CI log, and round 2 found the second. Both are probed, not argued.

### 7.1 Playwright discards the web server's stdout

`playwright.config.ts` sets neither `stdout` nor `stderr` on any of its five `webServer` entries, and the installed plugin forwards each stream on different terms (playwright 1.59.1, its bundled web-server plugin, the two `launchedProcess` stream handlers):

```
stdout:  if (debugWebServer.enabled || this._options.stdout === "pipe")
stderr:  if (debugWebServer.enabled || (this._options.stderr === "pipe" || !this._options.stderr))
```

Stderr is forwarded when `stderr` is UNSET, because `!undefined` is true. Stdout is forwarded only on an explicit `"pipe"`. And `log.debug` reaches stdout (§9a), so **the observer's records are discarded inside Playwright before any outer capture could see them.** This also explains the runs in §2.1: every `[WebServer]` line there is `warn` or `error`, which is to say stderr.

The repair is `stdout: "pipe"` on the app-e2e `webServer` entry. It cannot be avoided by choosing a different log level: `warn` and `error` reach stderr but PERSIST, which is the recursion the §5.2 fence exists to prevent, and `info` persists whenever it carries a code, which this emit does. Debug is the only level that cannot persist, and debug is on stdout.

The cost, stated: piping stdout brings the rest of the server's stdout into the job output too. That is the price of capturing anything from it.

### 7.2 The capture cannot use a pipe, or a `shell:` key

`.github/workflows/app-e2e.yml:173-188` runs playwright as a single-line `run:` with no `shell:`, no pipe and no `id:`. The obvious capture — `2>&1 | tee` under `shell: bash`, which is what `BACKLOG.md:683-688` prescribes and what `.github/workflows/x-audits.yml` does at every one of its sites — **would make all twenty app-e2e specs read as covered by no workflow.**

`tests/ci/_workflowCoverageScan.ts` claims a spec only from a run step it can read as a command-position invocation. Probed directly against it, with the real spec path:

```
COVERED   inline, no pipe (today)
MISSED    inline + `set -o pipefail;` + pipe
MISSED    inline + pipe only
MISSED    block scalar, either line order
COVERED   inline + redirect to a file
MISSED    inline + redirect, WITH shell: bash
MISSED    + shell: bash on any LATER step in the job
```

Two independent breakers: **any pipe**, and **a `shell:` key on any step in the job**. The live workflow has zero `shell:` keys, which is why this has never been hit.

So the capture takes a REDIRECT, and that is strictly better than the design it replaces: with no pipeline, the step's exit status IS playwright's, so the hazard the pipefail mechanic defends against — a failing app-e2e reporting success — cannot arise at all. The mechanic is removed rather than mitigated.

Verified shape, `covered = true`:

```yaml
      - name: Run app-e2e (both projects; each project's testMatch claims its own subset)
        run: pnpm exec playwright test <unchanged file list and flags> > app-e2e.log 2>&1
      - name: Replay the app-e2e log into the job output
        if: always()
        run: cat app-e2e.log
      - name: Extract upstream-fault records
        id: upstream-faults
        if: always()
        run: |
          count=$(grep -c 'SUPABASE_UPSTREAM_FAULT' app-e2e.log || true)
          echo "count=${count:-0}" >> "$GITHUB_OUTPUT"
      - name: Dump upstream-fault records
        if: always() && steps.upstream-faults.outputs.count != '0'
        run: grep 'SUPABASE_UPSTREAM_FAULT' app-e2e.log
```

`|| true` on the `grep -c` is load-bearing under the default shell's `-e`: `grep -c` exits 1 on zero matches, the ordinary healthy case, and without it the extract step fails every green run.

## 8. Invariants

- **Invariant 9.** `observeTransport.ts` carries `// not-subject-to-meta:` with its ground: it reads no `{ data, error }` pair, because it never sees a Supabase result, only the HTTP exchange underneath one. Any consumer boundary the class sweep touches takes a registry row in the matching meta-test.
- **Invariant 10.** No mutation surface is added. `setAlertOnSyncProblems` already carries `logAdminOutcome` at `setAlertOnSyncProblems.ts:59-64`; if the arc touches it, its `AUDITABLE_MUTATIONS` row and success-branch proof are re-verified rather than assumed.
- **Invariant 2.** No advisory-lock surface is touched.
- **Invariant 8.** In force only if a `components/**` file is touched. §9.2 records the one candidate and why it is a documented limit instead.
- **Mutation registry.** `supabaseRetryingFetch` (`tests/mutation/source/registry.ts:3553`), `supabaseRetryEligibility` (`tests/mutation/source/registry.ts:3571`) and `retryableRpcVolatilityScan` (`tests/mutation/source/registry.ts:3585`) are already enrolled at `scoreFloor: 0.9`, `operators: [...OPERATOR_NAMES]`, `accepted: []`. `observeTransport.ts` is a guard-shaped importable module with referring suites, so it is enrolled and scored **before** the round-1 diff dispatch, and the measured score, the empty unaccepted-survivor set and the operator set go on the `GUARD SURFACE:` line.

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
- **AC-4.** The capture chain works END TO END, which means both halves: `stdout: "pipe"` on the app-e2e `webServer` entry so Playwright forwards the records at all, and the redirect-based workflow shape so the coverage scanner still claims all twenty specs. Both are asserted structurally, and the scanner assertion includes **no step in the app-e2e job carries a `shell:` key** — the breaker that is invisible from reading either file alone. That a record reaches the captured stream is proved LOCALLY against an injected fault; no CI assertion claims a given ambient record was the injected one, because §2.3 shows ambient faults appear in every attempt.
- **AC-5.** `describeTransportTarget` is the single describer for both emits, and no record carries a path identifier. Probed against the Storage shape, not asserted.
- **AC-6.** `observeTransport.ts` is enrolled in the mutation registry, scored before the round-1 diff dispatch, with zero unaccepted survivors.
- **AC-7.** Both rows graduate to `BACKLOG-archive.md` carrying §9 and §9a. No new `BL-`/`DEF-` row exists anywhere in the diff.
