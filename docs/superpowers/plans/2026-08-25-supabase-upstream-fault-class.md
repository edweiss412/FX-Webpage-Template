# Plan — Supabase upstream fault class

Spec: `docs/superpowers/specs/2026-08-25-supabase-upstream-fault-class.md`. Branch `fix/supabase-upstream-fault-class`. One commit per task, red then green on the SAME command.

Two tasks are already committed, ahead of this plan, because the spec's own first scheduled step required the harness before the prose and because round 1 surfaced a live defect that could not wait:

- `29e30584e` — the plant-four harness and its recursion fence (14 cases).
- `567314667` — one bounded target describer for both transport emits, after round 1 probed a Storage identifier leak.

## 1. Meta-test inventory

- **ALREADY LANDED, ahead of this plan:** the two harnesses `tests/supabase/observeTransport.plantFour.test.ts` and `tests/supabase/observeTransport.recursionFence.test.ts` (new), and `tests/supabase/retryEligibility.test.ts` (extended with the shared describer's cases).
- **CREATES** a walked guard at tests/supabase/_metaServerClientObserverCoverage.test.ts (new in Task 2) — a walked guard making a NEW directly-constructed server-side Supabase client fail by default.
- **EXTENDS** `tests/supabase/serverClientWiring.test.ts` — the observer's install site and the REQUIRED composition order.
- **EXTENDS** `tests/ci/_metaE2eWorkflowCoverage.test.ts` — the capture chain's workflow half.
- **EXTENDS** `tests/mutation/source/registry.ts`, and `tests/mutation/_metaPremiseContract.test.ts` through its `EXPECTED_ENV_TOUCHING` table.
- **EXTENDS** `tests/mutation/enrolmentPresence.test.ts` — its `REQUIRED_ENROLMENTS` list. This is not bookkeeping: that list currently holds only `supabaseRetryingFetch`, `supabaseRetryEligibility` and `retryableRpcVolatilityScan`, so **without adding `observeTransport` to it FIRST, adding the registry row produces no red at all** and Task 5's whole red-then-green cycle is vacuous. The requirement is authored before the row.
- **EXTENDS** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — archive membership, documented-limit provenance, and the no-new-id arm (Task 6).
### 1a. Collection and CI wiring, for every file this arc touches

No file below needs a NEW `testMatch` entry, a path-filter change or a new job. This table records the contract each already resolves under, so the absence of wiring work is a finding rather than an oversight.

| File | New or extended | Project | Job |
|---|---|---|---|
| `tests/supabase/observeTransport.plantFour.test.ts` | new (landed) | serial, via `BASE_INCLUDE` | `unit-suite-db` |
| `tests/supabase/observeTransport.recursionFence.test.ts` | new (landed) | serial, via `BASE_INCLUDE` | `unit-suite-db` |
| the new walked server-client guard (Task 2) | new | serial, via `BASE_INCLUDE` | `unit-suite-db` |
| `tests/supabase/retryEligibility.test.ts` | extended (landed) | serial, via `BASE_INCLUDE` | `unit-suite-db` |
| `tests/supabase/serverClientWiring.test.ts` | extended (Task 1) | serial, via `BASE_INCLUDE` | `unit-suite-db` |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | extended (Task 3) | serial, via `BASE_INCLUDE` | `unit-suite-db` |
| `tests/mutation/enrolmentPresence.test.ts` | extended (Task 5) | parallel | `unit-suite-nodb` |
| `tests/mutation/_metaPremiseContract.test.ts` | extended via `EXPECTED_ENV_TOUCHING` (Task 5) | parallel | `unit-suite-nodb` |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | extended (Task 6) | parallel | `unit-suite-nodb` |

The split matters beyond bookkeeping for one reason: the parallel-project suites run in a depth-one checkout, which is what makes Task 6's no-new-id arm compare against `origin/main`'s tip rather than a merge base.

- **NOT extended:** the five `_metaInfraContract` siblings. `observeTransport.ts` carries `// not-subject-to-meta:` with its ground — it never sees a `{ data, error }` pair, only the HTTP exchange underneath one — the same disposition `lib/supabase/retryingFetch.ts` already holds. No `lib/admin/**` loader is touched.
- **NOT extended:** `tests/auth/advisoryLockRpcDeadlock.test.ts`. No `pg_advisory*` surface is touched.
- **NOT extended:** `tests/log/_metaMutationSurfaceObservability.test.ts`. No mutation surface is added; verified green against the current diff.

## 2. Advisory-lock holder topology

N/A. This plan edits no file containing `pg_advisory`.

## 3. Plan-time sweeps, run and pasted

### 3.1 Every Supabase client construction in the scanner's roots

```
$ grep -rn 'createClient(\|createServerClient(\|createBrowserClient(' app lib components | grep -v '\.test\.'
app/api/test-auth/set-session/route.ts:193   createClient
app/api/test-auth/set-session/route.ts:229   createServerClient
lib/supabase/server.ts:89                    createServerClient
lib/supabase/server.ts:142                   createClient
lib/observe/query/events.ts:64               (comment mention)
lib/supabase/browser.ts:45                   createBrowserClient
lib/dev/materialize/client.ts:18             createClient
lib/validation/reseedFixtures.ts:19          (comment mention)

$ grep -rn 'import(.*@supabase' app lib components
(no output)
```

| Hit | Disposition |
|---|---|
| `lib/supabase/server.ts:89` | SANCTIONED. Cookie-bound factory; Task 1 installs the observer. |
| `lib/supabase/server.ts:142` | SANCTIONED. Service-role factory; Task 1 installs the observer, late-bound. |
| `lib/supabase/browser.ts:45` | SANCTIONED, NOT observed. Browser-side; the record is a server log line. |
| `app/api/test-auth/set-session/route.ts:193` and `app/api/test-auth/set-session/route.ts:229` | EXEMPT. Test-auth gated, never a production request path. |
| `lib/dev/materialize/client.ts:18` | EXEMPT. A one-line indirection so tests can stub the module. |
| `lib/observe/query/events.ts:64`, `lib/validation/reseedFixtures.ts:19` | NEGATIVE CONTROLS. Comment mentions; the scanner must stay silent. |

No dynamic `await import("@supabase/…")` exists in the roots. The scanner handles the form anyway, covered by a SYNTHETIC fixture, and this plan says plainly that the live tree has no instance so nobody later reads that case as evidence one exists. The live dynamic constructions are all under `scripts/`, excluded on the stated ground in spec §9.3.

### 3.2 The scanner prototyped and controlled before implementation

Run against the live tree it finds exactly the six real constructions above and stays SILENT on both comment mentions. Controls in the same run:

| Fixture | Expected | Result |
|---|---|---|
| new static `createClient` import + call | FIRES (fail-by-default) | found |
| dynamic `const { createClient } = await import(…)` + call | FIRES | found |
| type-only `SupabaseClient` import + a comment naming `createClient()` | SILENT | silent |
| a STRING literal naming `createClient(` above a real call | fires on the CALL ONLY | correct |

The fourth is the discriminating one and the reason the scanner strips comments and string literals before matching: a bare grep flags the two live mentions and the string, so it would be noise from its first run and get suppressed rather than fixed.

### 3.3 Suites that would break on an eager `fetch` capture

```
$ for f in $(grep -rln 'globalThis.fetch\|vi.stubGlobal("fetch"' tests/); do grep -ql 'ServiceRole' "$f" && echo "$f"; done
tests/supabase/serverClientWiring.test.ts
tests/api/diagram-asset-route.test.ts
tests/onboarding/finalizeCasDougEditSelfHeal.db.test.ts
```

Two of the three are outside `tests/supabase/`, so a `tests/supabase`-scoped run would report green while they were broken. Task 1 runs all three by explicit file list.

## 4. Framework contracts this plan depends on

Every claim about framework behaviour carries its source, the way code claims carry `file:line`.

| Claim | Verified at |
|---|---|
| supabase-js resolves `fetch` per request when no `global.fetch` is supplied, and through the supplied one when it is | supabase-js 2.105.1, bundled CommonJS entry, `resolveFetch`, lines 96-99 |
| Playwright forwards a web server's stderr by default but its stdout only on an explicit `stdout: "pipe"` | playwright 1.59.1, bundled web-server plugin, the two `launchedProcess` stream handlers |
| `router.refresh()` merges the RSC payload without remounting, so no navigation loading boundary appears | Next docs shipped in the package, `use-router` reference |
| the loading file wraps the page and nested layouts but NOT the layout in its own segment, and a layout's runtime data access shows no fallback | Next docs shipped in the package, `loading` file-conventions reference |

The last two are recorded because they refuted a mechanism the spec's first draft proposed. Nothing in the shipped plan depends on them; they are here so the refutation is not re-derived.

## 4a. Acceptance criteria, and what proves each

Every task's `ac=` resolves here. The spec states the criteria; this table names the executable proof, so a task cannot claim an AC that nothing checks.

| AC | Proof |
|---|---|
| **AC-1** | Task 1's cases in `tests/supabase/serverClientWiring.test.ts`: a 502 observed AND retried on the cookie-bound client, a 502 observed on the service-role client, that observation not persisting through the real sink, and a `globalThis.fetch` swapped after construction still honoured. |
| **AC-2** | Already green at `29e30584e` and tightened at `e1c75e7bc`: fourteen plants plus four fence cases, with the clone-and-discard and rebuild-the-Request mutants each killing a case. |
| **AC-3** | Task 2's walked guard, proven fail-by-default against a synthetic fourth construction and silent against the two live comment mentions. |
| **AC-4** | Task 3, all three layers: a structural assertion that the baseline `webServer` sets `stdout: "pipe"`; structural assertions pinning the workflow's redirect, the absence of any `shell:` key, and the replay/extract/dump COMMANDS and conditions rather than merely their presence; and a one-time LOCAL run driving an injected fault through Playwright into the redirected log, pasted into the closeout, because no CI assertion can distinguish an injected record from the ambient ones §2 measures. Regression gate: `_metaE2eWorkflowCoverage` still reports all twenty specs covered. |
| **AC-5** | Two halves, because only one is behavioural. **Observer:** the Storage-path plants, which fail if its target carries an identifier. **Retry wrapper:** a STRUCTURAL assertion that `lib/supabase/retryingFetch.ts` imports `describeTransportTarget` and declares no local describer. §4b says why the second cannot be behavioural. |
| **AC-6** | Task 5's registry row, red-then-green on `tests/mutation/enrolmentPresence.test.ts` (the only suite that fails for ABSENCE), plus the re-measured `EXPECTED_ENV_TOUCHING` rows and a measured `pnpm heavy:mutation pnpm mutation:guards` score with zero unaccepted survivors. |
| **AC-7** | Task 6's extension to `_metaDeferralLedgerGraduation`: both ids resolve in the archive and in neither open ledger, each archived body carries its documented limits, and the diff introduces no new `BL-`/`DEF-` id. `_metaLedgerInProgress` alone cannot prove any of the three — it is green when both rows simply stay open. |

## 4b. Why AC-5's retry-wrapper half is structural, not behavioural

Round 4 probed the gap and it is real: restoring a private `?? path` describer inside `lib/supabase/retryingFetch.ts` violates AC-5 while every cited test stays green. Worth stating exactly why, because the structural check is not a weaker stand-in for a behavioural one that exists.

**The retry wrapper's emit population cannot distinguish the two describers.** It emits only for requests it OWNS, and ownership is `isRetryEligible`, which admits exactly two shapes: `<base>/rest/v1/rpc/<fn>`, where both describers return the bare function name, and `<base>/rest/v1/<table>` on an idempotent method, which is three segments and therefore identical under the shared describer's bound. No eligible request has a target the two spell differently. A behavioural test would have to construct an input the wrapper refuses to own, which proves nothing about the wrapper.

**That is the same coincidence spec §5.4 gives as the reason to share the describer at all.** The old copy leaked nothing only because `isRetryEligible` happened to admit nothing deeper — a property of a neighbouring function rather than a guarantee of this one, which would break silently the day eligibility widened. So the thing worth pinning is the STRUCTURE: that this module has no describer of its own to drift. A source-level assertion is the right instrument for a source-level claim.

**The assertion is on the ASSIGNMENT, not on the absence of a name.** `retryingFetch.ts` legitimately keeps `describeRequest` (`lib/supabase/retryingFetch.ts:78`), which parses url, method and schema and is unrelated; a check for "no local function whose name starts with describe" would trip on it and get loosened until it meant nothing. The check is that the module imports `describeTransportTarget` from `./retryEligibility` AND that the `RetryEmit`'s `fn:` is assigned directly from a call to it, which is exactly the property a restored private describer breaks.

The observer's half stays behavioural, because its population is every request and the Storage case is inside it.

**Documented limit, so nobody re-derives it:** widen `isRetryEligible` past three path segments and a behavioural parity case becomes constructible and should replace this. Re-file trigger: any change to `RETRYABLE_RPCS`' shape or to the PostgREST prefix rule that admits a deeper path.

## 5. Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1 — install the observer on both server-side factories
<!-- task: red=`pnpm vitest run tests/supabase/serverClientWiring.test.ts` red-state=authored red-target=`lib/supabase/server.ts:98` why=`this line composes makeRetryingFetch over the raw fetch with no observer between them, so every attempt the cookie-bound client makes is unobserved` ac=AC-1 -->

RED: new cases in the existing wiring suite. The cookie-bound client OBSERVES a 502 and still retries it (proving the observer is under the retry wrapper, so it sees every attempt rather than the replayed outcome); the service-role client OBSERVES a 502; the service-role client's observation does NOT persist, driven through the real sink; and a `globalThis.fetch` swapped AFTER construction is honoured.

GREEN, with the composition REQUIRED rather than merely pinned:

```
cookie-bound:  retry → observer → injector → real fetch
service-role:  observer → (late-bound) real fetch
```

The observer sits OUTSIDE the test injector deliberately. The injector short-circuits its inner fetch while faults remain, so an observer placed inside it would never see a forced 502 and AC-4's local proof would be impossible. "Innermost" therefore means innermost of the PRODUCTION wrappers.

The service-role install uses a late-binding thunk, `(input, init) => globalThis.fetch(input, init)`, reproducing today's per-request resolution exactly. An eager capture would pin the transport at factory-call time and break §3.3's suites.

**Relitigation pre-empt for the diff brief.** `serverClientWiring.test.ts` records that "a design that extended an observer to the service-role client re-opened exactly this recursion". That finding is what the ratified fence CORRECTS: the fence belongs on the log level, not the client scope. The old design emitted at a persisting level; this one emits at `debug`, which the `app_events` level CHECK makes unable to persist.

Regression gate: the three suites in §3.3, plus `tests/supabase/upstreamFaultInjectorContract.test.ts`.

### Task 2 — walked server-client coverage guard
<!-- task: red=`pnpm vitest run tests/supabase/_metaServerClientObserverCoverage.test.ts` red-state=authored red-target=`lib/supabase/server.ts:142` why=`this server-side construction is unguarded: a fourth one can be added beside it and no suite in the tree fails` ac=AC-3 -->

Walks `app`, `lib`, `components` with the shared `walkSourceFiles` and the shared source-extension constant rather than a privately re-declared regex — `tests/supabase/retryableRpcVolatilityScan.ts:101-105` records why the shared constant covers the whole JS/MDX family, including a round-5 probe where an MDX call site returned no literals and no violations while the compiler happily emitted the call. Strips comments and string literals before matching, per §3.2.

Premise, via `tests/_shared/premise.ts`: assert the walk found the three known factories BEFORE asserting anything about exemptions. Without it an empty walk — a wrong root, an extension miss — passes vacuously, which is the exact shape the cited finding records.

The four controls of §3.2 ship in the same commit as the scanner.

**Collection and CI wiring for the new guard:** `BASE_INCLUDE`, serial project, `unit-suite-db`. The full table for every file this arc creates or extends is in §1a — round 4 was right that stating it for one file and not the other eight is worse than not stating it at all, because it reads as though the others were considered.

### Task 3 — the capture chain, BOTH halves
<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` red-state=authored red-target=`.github/workflows/app-e2e.yml:188` why=`this run step redirects nowhere and no following step extracts anything, so a record that reached the job output would still not be surfaced` ac=AC-4 -->

**Half 1, `playwright.config.ts`:** `stdout: "pipe"` on the FIRST `webServer` entry, the port-3000 baseline server, which `app-e2e.yml` boots via `BASELINE_SERVER_ONLY`. Blast radius stated: `crew-e2e` boots the same entry via `CREW_E2E_ONLY`, so its logs also gain the server's stdout. More output, not different behaviour.

**Half 2, `.github/workflows/app-e2e.yml`:** the redirect shape from spec §7.2. Structural assertions, via the `yaml` parser the suite already imports:

- the invocation stays inline, carries NO pipe, and its redirect target is EXACTLY `app-e2e.log` — a redirect to any other file satisfies a "has a redirect" predicate while every later step reads a log that was never written;
- **no step in the app-e2e job carries a `shell:` key** — the breaker invisible from reading either file alone;
- the replay step carries `if: always()` and its `run:`, trimmed, EQUALS `cat app-e2e.log`;
- the extract step carries `id: upstream-faults` and `if: always()`, and its `run:`, trimmed, EQUALS the exact two lines below. Substring containment is not enough and round 3 probed why: it holds while the load-bearing `|| true` is deleted (so the step fails every green run, `grep -c` exiting 1 on zero matches) and while a second `echo "count=0" >> "$GITHUB_OUTPUT"` is appended AFTER the correct one, overwriting it;

  ```
  count=$(grep -c 'SUPABASE_UPSTREAM_FAULT' app-e2e.log || true)
  echo "count=${count:-0}" >> "$GITHUB_OUTPUT"
  ```

- the dump step's `run:`, trimmed, EQUALS `grep 'SUPABASE_UPSTREAM_FAULT' app-e2e.log`;
- the dump step's `if:`, normalised for whitespace, EQUALS `always() && steps.upstream-faults.outputs.count != '0'`.

**All four are string equalities on short fixed commands, deliberately, and rounds 2 and 3 are why.** The previous draft asserted shape — "names the log file", "greps the code and writes an output", "references `steps.<id>.outputs`" — and round 2 named four mutants that satisfy all of it: a replay step running `rm app-e2e.log`; an extract step grepping the code out of some other input and then writing a hardcoded `count=0`; a dump step whose `run:` nothing constrains at all; and a dump condition that references the output but reverses the comparison to `== '0'`, so records are dumped exactly when there are none. Every one of those ships a capture chain that produces nothing on a failed run while the suite stays green.

A shape predicate cannot separate those from the real thing, because what distinguishes them IS the exact text. These commands are four short lines that will not change without someone editing this workflow deliberately, so equality is the right predicate and its cost is a test edit on the day the command legitimately changes.

**Half 1 gets its own assertion, in the same suite.** Round 1's sharpest instance: every assertion above can pass while `playwright.config.ts` still lacks `stdout: "pipe"`, and then every record stays inside Playwright and the whole chain is decorative. So the suite also asserts that the baseline `webServer` entry sets `stdout: "pipe"`. A structural check on the config file, alongside the ones on the workflow, because the chain is only as real as its weaker half.

Regression gate: `_metaE2eWorkflowCoverage` must still report all twenty app-e2e specs covered. That is the check that would have caught the original design, and it costs one command.

**The end-to-end proof is a LOCAL run, and the plan says so rather than pretending CI can do it.** Spec AC-4 requires a record observed in the captured stream against an injected fault. No CI assertion can supply that: §2 of the spec measures 2 to 6 ambient faults per attempt, so a CI grep finding the code proves only that the gateway faulted, never that the injected request produced the record. So Task 3 ends with a one-time local verification, its command and output pasted into the closeout.

**It reuses the existing injector case rather than restating its recipe**, because round 2 showed the recipe was incomplete in a way that fails silently. `maybeForceUpstreamFaults` (`lib/supabase/server.ts:48-56`) gates on FOUR things, not two: `ENABLE_TEST_AUTH=true`, a `TEST_AUTH_SECRET` of at least sixteen characters, an `authorization` header matching that secret EXACTLY, and the `x-test-force-upstream-502` count header. Naming only the first and last is a recipe under which nothing is injected and the run then finds an ambient record and mistakes it for the proof — which is the one failure mode this step exists to rule out.

`tests/e2e/admin-upstream-retry.spec.ts:23-28` already carries the complete gate as `FORCE_HEADERS`, including `authorization: "Bearer fxav-m3-test-auth-2026-DO-NOT-SHIP"` matching the baseline server's inline `TEST_AUTH_SECRET`. The verification runs THAT spec against the redirected log:

```
pnpm exec playwright test tests/e2e/admin-upstream-retry.spec.ts --project=desktop-chromium --retries=0 > app-e2e.log 2>&1
grep -c 'SUPABASE_UPSTREAM_FAULT' app-e2e.log
```

The count must exceed what the same command yields with the injector's header removed. A bare non-zero count is not the proof; the DIFFERENCE is, for exactly the ambient-rate reason above. It crosses all three boundaries the structural assertions cannot — the Supabase client, Playwright's stream forwarding, and the workflow redirect — and it is the only step in this plan whose evidence is a transcript rather than an assertion.

**Task 4 is DROPPED by the ratified disposition.** The page-segment settle helper is not built. Named here, without a task heading, so the commit numbering below still matches this plan rather than silently renumbering.

### Task 5 — mutation enrollment and measured score (AFTER absorbing `origin/main`)
<!-- task: red=`pnpm vitest run tests/mutation/enrolmentPresence.test.ts` red-state=authored red-target=`lib/supabase/observeTransport.ts:108` why=`this module is guard-shaped with two referring suites and no registry row, so nothing measures whether its suites pin it` ac=AC-6 -->

One row: `id: "observeTransport"`, `sourcePath: "lib/supabase/observeTransport.ts"`, both harness files as `suitePaths`, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.9`, `accepted: []`, and a control the suites demonstrably notice. Candidate: `from: "return status >= 500;"` `to: "return status > 500;"`, which the "every 5xx records" plant kills. Verified `from` occurs in the source at plan time.

**Also owed, and measured rather than estimated.** Enrolment puts both harness suites under `tests/mutation/_metaPremiseContract.test.ts`, which walks enrolled suites. `classifyTests` against this tree:

```
tests/supabase/observeTransport.plantFour.test.ts:      total=14, all environment-touching, 1 with an exemption
tests/supabase/observeTransport.recursionFence.test.ts: total=4,  all environment-touching, 1 with an exemption
```

So `EXPECTED_ENV_TOUCHING` takes `14` and `4` — per suite, not a combined 18 — and **sixteen of the eighteen cases need their `no-premise:` exemption written**.

**These numbers are RE-MEASURED, and the first version of this plan had them wrong for an instructive reason.** It said 10 and 4, measured before rounds 3 and 4 added three plants and one transparency case. A count derived from a measurement goes stale the moment the measured thing changes, and here the measured thing was changed by the very review rounds that were hardening it. Re-run `classifyTests` at implementation time rather than trusting this paste; `EXPECTED_ENV_TOUCHING: 10` would have failed `_metaPremiseContract` and blocked the score run AC-6 depends on. The exemption is the honest form: the classifier reports a case as touching for what the wrapper CAN reach, not what the test does, and these drive an injected stub.

**Sequencing.** `#894` (merged `e381de76e`) added an accepted-row symbol-correspondence oracle under tests/mutation/, an oracle that WALKS registry rows. This task lands only after the branch absorbs `origin/main`, which happens on Eric's word because ledger merges are serialized.

`_metaGuardSurfaceRegistry` is NOT the red for this task and cannot be: it validates rows already present and never discovers an unenrolled module, which `tests/mutation/enrolmentPresence.test.ts:4` states in as many words. That suite is the one that fails for ABSENCE, so it is the red.

Then `pnpm heavy:mutation pnpm mutation:guards`, and the MEASURED score for every affected surface goes on the `GUARD SURFACE:` line of the round-1 diff brief. Re-derived, never quoted.

<!-- tasks: end -->

<!-- tasks: depth=3 -->

### Task 6 — graduate both rows (the PR's LAST commit)
<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` ac=AC-7 -->

The red command is `_metaDeferralLedgerGraduation`, not `_metaLedgerInProgress`, for the reason below: only the former can be made to fail while these two rows sit open. `_metaLedgerInProgress` still runs as part of the suite, but it is not the proof.

Task 6 sits in its OWN task region, without the `red-contract` attribute the region above carries. The reason is mechanical rather than a dodge: a `red-contract` marker requires a `red-target=` naming a production surface, and this task's defective surface is a root-level ledger file, which the marker grammar rejects as bare-filename shorthand. The red is still stated in prose below, and the same command still goes red then green.

Both rows move to `BACKLOG-archive.md` carrying spec §9 and §9a, and the IN PROGRESS markers come off in the SAME commit. The two cannot be split: archives categorically reject in-progress entries, so a commit that archives a row while its marker stands is red by construction.

**On "the PR's last commit", and how both rules hold.** Invariant 12 says the markers come off in the PR's LAST commit; the fleet's review rule says the diff the final review examined must be the diff that merges. They pull apart the moment the whole-diff review returns a finding, because the repair would then land after Task 6.

**The previous draft resolved this by reading the invariant's purpose and relaxing its letter. That was wrong, and round 3 was right to call it P0.** An invariant is not mine to weaken from the inside of a plan it governs; if it genuinely needed relaxing, that is an orchestrator decision, not a paragraph in this document. And the reading was convenient in the direction that saved me work, which is the tell.

Both rules hold under one ordering, at the cost of one cheap re-application:

1. every other task lands;
2. Task 6 lands — the archive move and the marker removal, together, because the archive rejects an in-progress entry;
3. the whole-diff review runs on that COMPLETE diff;
4. **if it returns anything**, the repair lands, and then Task 6 is RE-APPLIED as a fresh final commit: revert the ledger commit, land the repair, re-commit the identical ledger change. Task 6 is literally last again, and the reviewed diff is the merged diff.

Step 4 costs two extra commits on a docs-only change and it costs them only when the review is non-empty. That is a small price for not reinterpreting an invariant, and it is the whole reason the ordering is written out rather than left to judgement at the time.

**The task extends `tests/docs/_metaDeferralLedgerGraduation.test.ts`, because its own red command cannot prove AC-7.** Round 1 established the gap: `_metaLedgerInProgress` validates opted-in flight markers and forbids in-progress entries inside archives, and it is green when both rows simply stay OPEN with no markers at all. So the task could do nothing and its command would pass. The graduation suite is where archive membership and provenance already live, so this task adds to it:

- both ids resolve in `BACKLOG-archive.md` and in neither open ledger;
- each archived body carries the documented limits it graduated with, keyed on the section anchors rather than on prose;
- the diff introduces no new `BL-`/`DEF-` id anywhere, which is Eric's directive made checkable rather than remembered.

**The third arm needs a base and a positive control, and round 2 was right that it had neither.** This branch genuinely adds zero novel ids, so an implementation that always returns the empty set passes and nothing notices. Both are specified rather than left to the implementer:

- **Base: `origin/main`'s TIP, not the merge base.** Round 3 probed the reason and it is decisive: `tests/docs/**` runs in the parallel project, whose PR workflow checks out at depth one and then fetches `origin/main` with `--depth=1`, so the ancestry is grafted away and `git merge-base` cannot resolve in the checkout where this test actually runs. A test that computes correctly on a developer machine and cannot run at all in required CI is worse than no test, because it looks like coverage. Comparing id SETS against main's tip needs no ancestry — the tip blob is exactly what a depth-one fetch provides — and it answers the question the directive actually asks: does this branch introduce an id that is not already somewhere in the ledger corpus. The id sets come from the same one extractor §3 uses on both parents.
- **Positive control:** the check runs against a CONSTRUCTED pair of ledger texts, one carrying a novel `BL-` heading the other lacks, and must report exactly that id. That control lives in the test, not in a transcript, so it keeps discriminating after this arc.

Without the control the arm is a claim about this branch; with it, it is a check. The distinction matters because a directive nobody can verify is a directive that decays, and this one was given to an arc rather than to the repo.

`BACKLOG.md` conflict resolution, if any, by set arithmetic with one extractor on both parents: open = main's open minus rows this branch archived; archive == exact union; assert zero rows both open and archived and zero lost. Cut rows heading-to-any-next-heading.

<!-- tasks: end -->

## 6. Checklist

- [ ] Tasks 1-3 implemented TDD, one commit each
- [ ] Absorb `origin/main` on Eric's word
- [ ] Task 5: registry row, `EXPECTED_ENV_TOUCHING` re-measured, sixteen exemptions of eighteen, measured score
- [ ] Self-review
- [ ] Adversarial review (cross-model), plan stage, to APPROVE
- [ ] **Task 6 lands** — the ledger moves, the marker removal and the graduation-test extension, in one commit
- [ ] **Whole-diff cross-model review to APPROVE, AFTER Task 6**, so the reviewed diff is the diff that merges
- [ ] If that review returned anything: revert Task 6, land the repair, **re-apply Task 6 as the final commit** — so invariant 12 holds literally and the reviewed diff is still the merged one
- [ ] Twelve required checks green (GraphQL `statusCheckRollup`, 5-minute floor, one query per poll, RATE_LIMIT means no information)
- [ ] READINESS to bl-orch; do NOT merge

## 7. Working rules adopted mid-arc

- Stage explicit paths, never `git add -A`: `tests/specLint/cli.test.ts` writes scratch inside the tracked tree during a full run.
- Before every codex-guard dispatch, grep the brief and print counts for REVIEWER ONLY, the consequence bound, `PROBE DOMAIN:`, the threat fence, and the VERDICT/FINDINGS instruction. Every count must be 1.
- Run the guard that READS a surface before designing against it. Two review rounds here were spent on shapes an existing guard already rejected.

## 12. Closeout

impeccable-gate: N/A — no UI surface

The diff touches no file under `app/` outside `app/api/**`, nothing under `components/`, and neither `app/globals.css`, `DESIGN.md` nor a Tailwind config. `playwright.config.ts` and `.github/workflows/app-e2e.yml` are test and CI infrastructure, not UI surfaces under invariant 8's definition.

### AC-4's end-to-end capture proof, run 2026-08-26

The only claim in this arc whose evidence is a transcript rather than an assertion, because no CI assertion can supply it: the spec measures 2 to 6 ambient faults per attempt, so a CI grep finding the code proves the gateway faulted, never that the injected request produced the record. The proof is the DIFFERENCE between an injected run and a control.

**The control is the SAME spec with only the injector header removed**, which is what the plan requires. An earlier attempt used a different spec (`admin-layout`) and diff review round 2 was right to reject it: that exercises a different route and a different workload, so `10 versus 0` confounded injection with request volume and proved only that capture happens during an injection-bearing suite.

Removing the header is a three-place edit, not one: `FORCE_HEADERS` carries `"1"`, and two cases override it inline with `"2"` and `"50"`. Removing it from `FORCE_HEADERS` alone still yielded 19 records, because the other two cases still injected.

```
injected   tests/e2e/admin-upstream-retry.spec.ts, unmodified          → 10 records
control    the SAME spec, all three injector headers removed           →  0 records
```

Everything else identical: same command, same `BASELINE_SERVER_ONLY=1`, same DSNs, same project, same `--retries=0`, same redirected log. The spec was restored immediately and the tree verified clean.

Sample captured record, showing the whole chain intact — the observer's emit, through `log.debug` to the Next server's stdout, through Playwright's `stdout: "pipe"` forwarding, into the redirected log:

```
[WebServer]   code: 'SUPABASE_UPSTREAM_FAULT',
```

### One pre-existing failure, isolated against the FULL diff

Two cases in `tests/e2e/admin-upstream-retry.spec.ts` fail locally (`locator('main')` not visible on the admin page). They are NOT caused by this diff.

The first isolation reverted only `lib/supabase/server.ts`, and diff review round 2 was right that this establishes nothing categorical: it leaves `stdout: "pipe"` active, which changes the local runner's server-output handling and is a plausible timing route. Redone with the whole runtime diff out — `server.ts`, `retryEligibility.ts`, `retryingFetch.ts` and `playwright.config.ts` restored to `origin/main`, and `observeTransport.ts` removed entirely, so no observer exists and no stdout is piped:

```
full runtime reverted to origin/main → the SAME two cases fail, identically
```

Pinning both DSNs at the local stack did not change it either, so it is not the `TEST_DATABASE_URL` split the batch-2 spec records as a documented limit of local probing. Left as an observation about this local environment; the spec is a required app-e2e member and CI is the authority on it.
